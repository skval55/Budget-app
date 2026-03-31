import { supabase } from "./supabaseClient";

export type PushSubscriptionStatus = "active" | "inactive";

export interface NotificationSettings {
  id: number;
  nightly_enabled: boolean;
  nightly_time: string;
  weekly_enabled: boolean;
  weekly_day_of_week: number;
  weekly_time: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateNotificationSettingsData {
  nightly_enabled?: boolean;
  nightly_time?: string;
  weekly_enabled?: boolean;
  weekly_day_of_week?: number;
  weekly_time?: string;
  timezone?: string;
}

export interface PushSubscriptionRecord {
  id: number;
  device_label: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  status: PushSubscriptionStatus;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscribeDeviceData {
  device_label: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const DEFAULT_NIGHTLY_TIME = "20:00:00";
const DEFAULT_WEEKLY_TIME = "18:00:00";
const DEFAULT_WEEKLY_DAY = 0;

const normalizeTimezone = (timezone: string | null | undefined): string => {
  const trimmed = String(timezone || "").trim();
  if (!trimmed) return "UTC";
  return trimmed;
};

const normalizeTimeForDb = (timeValue: string | null | undefined): string => {
  const normalized = String(timeValue || "").trim();
  if (/^\d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }
  return normalized;
};

export class NotificationsService {
  static async getOrCreateSettings(
    preferredTimezone: string
  ): Promise<NotificationSettings> {
    const { data: existingSettings, error: fetchError } = await supabase
      .from("notification_settings")
      .select("*")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to fetch notification settings: ${fetchError.message}`);
    }

    if (existingSettings) {
      return existingSettings as NotificationSettings;
    }

    const { data: createdSettings, error: createError } = await supabase
      .from("notification_settings")
      .insert([
        {
          nightly_enabled: true,
          nightly_time: DEFAULT_NIGHTLY_TIME,
          weekly_enabled: true,
          weekly_day_of_week: DEFAULT_WEEKLY_DAY,
          weekly_time: DEFAULT_WEEKLY_TIME,
          timezone: normalizeTimezone(preferredTimezone),
        },
      ])
      .select("*")
      .single();

    if (createError || !createdSettings) {
      throw new Error(
        `Failed to create notification settings: ${createError?.message || "Unknown error"}`
      );
    }

    return createdSettings as NotificationSettings;
  }

  static async updateSettings(
    settingsId: number,
    data: UpdateNotificationSettingsData
  ): Promise<NotificationSettings> {
    const payload: UpdateNotificationSettingsData = { ...data };
    if (payload.nightly_time) {
      payload.nightly_time = normalizeTimeForDb(payload.nightly_time);
    }
    if (payload.weekly_time) {
      payload.weekly_time = normalizeTimeForDb(payload.weekly_time);
    }
    if (payload.timezone) {
      payload.timezone = normalizeTimezone(payload.timezone);
    }

    const { data: updatedSettings, error: updateError } = await supabase
      .from("notification_settings")
      .update(payload)
      .eq("id", settingsId)
      .select("*")
      .single();

    if (updateError || !updatedSettings) {
      throw new Error(
        `Failed to update notification settings: ${updateError?.message || "Unknown error"}`
      );
    }

    return updatedSettings as NotificationSettings;
  }

  static async getPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch push subscriptions: ${error.message}`);
    }

    return (subscriptions || []) as PushSubscriptionRecord[];
  }

  static async subscribeDevice(
    payload: SubscribeDeviceData
  ): Promise<PushSubscriptionRecord> {
    const { data, error } = await supabase.functions.invoke(
      "notifications-subscribe",
      {
        body: payload,
      }
    );

    if (error) {
      throw new Error(`Failed to register this device: ${error.message}`);
    }

    if (!data?.subscription) {
      throw new Error("Failed to register this device: missing response payload.");
    }

    return data.subscription as PushSubscriptionRecord;
  }

  static async unsubscribeDevice(subscriptionId: number): Promise<void> {
    const { error } = await supabase.functions.invoke("notifications-unsubscribe", {
      body: {
        subscription_id: subscriptionId,
      },
    });

    if (error) {
      throw new Error(`Failed to remove device: ${error.message}`);
    }
  }

  static async sendTestNotification(subscriptionId: number): Promise<void> {
    const { error } = await supabase.functions.invoke("notifications-test", {
      body: {
        subscription_id: subscriptionId,
      },
    });

    if (error) {
      throw new Error(`Failed to send test notification: ${error.message}`);
    }
  }
}

