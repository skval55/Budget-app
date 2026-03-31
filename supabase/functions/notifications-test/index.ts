import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { readNotificationsEnv } from "../_shared/env.ts";
import { sendPushToSubscription } from "../_shared/push.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

interface TestRequestBody {
  subscription_id?: number;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = (await request.json()) as TestRequestBody;
    const subscriptionId = Number(body.subscription_id);
    if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
      return jsonResponse({ error: "subscription_id is required." }, 400);
    }

    const env = readNotificationsEnv();
    const supabaseAdmin = createAdminClient(env);

    const { data: subscription, error: fetchError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, status")
      .eq("id", subscriptionId)
      .single();

    if (fetchError || !subscription) {
      return jsonResponse(
        { error: `Failed to fetch subscription: ${fetchError?.message || "Not found"}` },
        404
      );
    }

    if (subscription.status !== "active") {
      return jsonResponse(
        { error: "This device is inactive. Re-enable notifications on that phone." },
        400
      );
    }

    try {
      await sendPushToSubscription(env, subscription, {
        title: "Budget Tracker",
        body: "Test notification successful. This phone is ready for reminders.",
        tag: "budget-test-notification",
        url: "/",
      });

      await supabaseAdmin
        .from("push_subscriptions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", subscription.id);

      return jsonResponse({ success: true }, 200);
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await supabaseAdmin
          .from("push_subscriptions")
          .update({ status: "inactive" })
          .eq("id", subscription.id);
      }

      return jsonResponse(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to send test notification.",
        },
        500
      );
    }
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      500
    );
  }
});

