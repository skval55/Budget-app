import { DateTime } from "npm:luxon@3.6.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { readNotificationsEnv } from "../_shared/env.ts";
import { sendPushToSubscription } from "../_shared/push.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

type ReminderType = "nightly" | "weekly";

interface NotificationSettingsRow {
  id: number;
  nightly_enabled: boolean;
  nightly_time: string;
  weekly_enabled: boolean;
  weekly_day_of_week: number;
  weekly_time: string;
  timezone: string;
}

interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface DueReminder {
  type: ReminderType;
  scheduledForLocal: DateTime;
  scheduledForUtc: DateTime;
}

const parseTime = (timeValue: string) => {
  const [hourRaw, minuteRaw] = String(timeValue || "00:00").split(":");
  const hour = Math.max(0, Math.min(23, Number(hourRaw) || 0));
  const minute = Math.max(0, Math.min(59, Number(minuteRaw) || 0));
  return { hour, minute };
};

const jsDayToLuxonWeekday = (jsDay: number): number => {
  const normalized = Number.isInteger(jsDay) ? jsDay : 0;
  if (normalized === 0) return 7;
  return Math.max(1, Math.min(6, normalized));
};

const isDueInWindow = (
  scheduled: DateTime,
  windowStartLocal: DateTime,
  nowLocal: DateTime
) => scheduled > windowStartLocal && scheduled <= nowLocal;

const getDueNightlyReminder = (
  settings: NotificationSettingsRow,
  windowStartLocal: DateTime,
  nowLocal: DateTime
): DueReminder | null => {
  const { hour, minute } = parseTime(settings.nightly_time);
  const scheduledToday = nowLocal.startOf("day").set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });
  const scheduledYesterday = scheduledToday.minus({ days: 1 });
  const candidate = scheduledToday <= nowLocal ? scheduledToday : scheduledYesterday;

  if (!isDueInWindow(candidate, windowStartLocal, nowLocal)) return null;
  return {
    type: "nightly",
    scheduledForLocal: candidate,
    scheduledForUtc: candidate.toUTC(),
  };
};

const getDueWeeklyReminder = (
  settings: NotificationSettingsRow,
  windowStartLocal: DateTime,
  nowLocal: DateTime
): DueReminder | null => {
  const targetWeekday = jsDayToLuxonWeekday(settings.weekly_day_of_week);
  const { hour, minute } = parseTime(settings.weekly_time);

  let candidate = nowLocal.startOf("day").set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });

  for (let offset = 0; offset < 7; offset += 1) {
    const candidateForDay = candidate.minus({ days: offset });
    if (
      candidateForDay.weekday === targetWeekday &&
      candidateForDay <= nowLocal
    ) {
      candidate = candidateForDay;
      break;
    }
  }

  if (!isDueInWindow(candidate, windowStartLocal, nowLocal)) return null;
  return {
    type: "weekly",
    scheduledForLocal: candidate,
    scheduledForUtc: candidate.toUTC(),
  };
};

const getWeeklyStats = async (
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  nowLocal: DateTime
) => {
  const weekStart = nowLocal
    .startOf("day")
    .minus({ days: nowLocal.weekday % 7 });
  const weekEnd = weekStart.plus({ days: 6 });
  const weekStartDate = weekStart.toISODate() || "";
  const weekEndDate = weekEnd.toISODate() || "";

  const { data: variableExpenses, error } = await supabaseAdmin
    .from("expenses")
    .select("amount")
    .eq("entry_type", "variable")
    .gte("expense_date", weekStartDate)
    .lte("expense_date", weekEndDate);

  if (error) {
    throw new Error(`Failed to load weekly stats: ${error.message}`);
  }

  const count = (variableExpenses || []).length;
  const total = (variableExpenses || []).reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  return {
    count,
    total,
  };
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST" && request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const env = readNotificationsEnv();
    const supabaseAdmin = createAdminClient(env);

    const { data: settingsRow, error: settingsError } = await supabaseAdmin
      .from("notification_settings")
      .select(
        "id, nightly_enabled, nightly_time, weekly_enabled, weekly_day_of_week, weekly_time, timezone"
      )
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      throw new Error(`Failed to fetch notification settings: ${settingsError.message}`);
    }

    if (!settingsRow) {
      return jsonResponse({
        success: true,
        processed: 0,
        message: "No notification settings configured yet.",
      });
    }

    const timezone = String(settingsRow.timezone || "UTC").trim() || "UTC";
    const nowLocal = DateTime.utc().setZone(timezone);
    const windowStartLocal = nowLocal.minus({ minutes: 16 });

    const dueReminders: DueReminder[] = [];
    if (settingsRow.nightly_enabled) {
      const nightlyDue = getDueNightlyReminder(
        settingsRow as NotificationSettingsRow,
        windowStartLocal,
        nowLocal
      );
      if (nightlyDue) dueReminders.push(nightlyDue);
    }
    if (settingsRow.weekly_enabled) {
      const weeklyDue = getDueWeeklyReminder(
        settingsRow as NotificationSettingsRow,
        windowStartLocal,
        nowLocal
      );
      if (weeklyDue) dueReminders.push(weeklyDue);
    }

    if (dueReminders.length === 0) {
      return jsonResponse({
        success: true,
        processed: 0,
        message: "No reminders are due in this dispatch window.",
      });
    }

    const { data: activeSubscriptions, error: subscriptionsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("status", "active");

    if (subscriptionsError) {
      throw new Error(`Failed to fetch push subscriptions: ${subscriptionsError.message}`);
    }

    if (!activeSubscriptions || activeSubscriptions.length === 0) {
      return jsonResponse({
        success: true,
        processed: 0,
        message: "No active device subscriptions.",
      });
    }

    const weeklyStats =
      dueReminders.some((reminder) => reminder.type === "weekly")
        ? await getWeeklyStats(supabaseAdmin, nowLocal)
        : null;

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const reminder of dueReminders) {
      const payload =
        reminder.type === "nightly"
          ? {
              title: "Budget Tracker",
              body: "Nightly reminder: add today's expenses in Budget Tracker.",
              tag: "budget-nightly-reminder",
              url: "/",
            }
          : {
              title: "Budget Tracker Weekly Check-in",
              body: `This week: ${formatCurrency(weeklyStats?.total || 0)} across ${
                weeklyStats?.count || 0
              } entries.`,
              tag: "budget-weekly-reminder",
              url: "/",
            };

      for (const subscription of activeSubscriptions as PushSubscriptionRow[]) {
        const scheduledForIso = reminder.scheduledForUtc.toISO() || new Date().toISOString();
        const { data: logRow, error: claimError } = await supabaseAdmin
          .from("notification_dispatch_logs")
          .insert([
            {
              subscription_id: subscription.id,
              reminder_type: reminder.type,
              scheduled_for: scheduledForIso,
              status: "pending",
            },
          ])
          .select("id")
          .single();

        if (claimError) {
          if (claimError.code === "23505") {
            skippedCount += 1;
            continue;
          }
          throw new Error(`Failed to create dispatch log: ${claimError.message}`);
        }

        try {
          await sendPushToSubscription(env, subscription, payload);
          await supabaseAdmin
            .from("notification_dispatch_logs")
            .update({
              status: "sent",
              error: null,
            })
            .eq("id", logRow.id);
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", subscription.id);
          sentCount += 1;
        } catch (error) {
          const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await supabaseAdmin
              .from("push_subscriptions")
              .update({ status: "inactive" })
              .eq("id", subscription.id);
          }

          await supabaseAdmin
            .from("notification_dispatch_logs")
            .update({
              status: "failed",
              error:
                error instanceof Error
                  ? error.message.slice(0, 1000)
                  : "Failed to send push notification.",
            })
            .eq("id", logRow.id);
          failedCount += 1;
        }
      }
    }

    return jsonResponse({
      success: true,
      sent: sentCount,
      skipped: skippedCount,
      failed: failedCount,
      due_reminders: dueReminders.map((reminder) => ({
        type: reminder.type,
        scheduled_for_local: reminder.scheduledForLocal.toISO(),
      })),
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      500
    );
  }
});
