import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { readNotificationsEnv } from "../_shared/env.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

interface UnsubscribeRequestBody {
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
    const body = (await request.json()) as UnsubscribeRequestBody;
    const subscriptionId = Number(body.subscription_id);
    if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
      return jsonResponse({ error: "subscription_id is required." }, 400);
    }

    const env = readNotificationsEnv();
    const supabaseAdmin = createAdminClient(env);

    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .update({
        status: "inactive",
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId);

    if (error) {
      return jsonResponse(
        { error: `Failed to remove subscription: ${error.message}` },
        500
      );
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      500
    );
  }
});

