import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { readNotificationsEnv } from "../_shared/env.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

interface SubscribeRequestBody {
  device_label?: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = (await request.json()) as SubscribeRequestBody;
    const deviceLabel = String(body.device_label || "").trim();
    const endpoint = String(body.endpoint || "").trim();
    const p256dh = String(body.p256dh || "").trim();
    const auth = String(body.auth || "").trim();

    if (!deviceLabel) {
      return jsonResponse({ error: "device_label is required." }, 400);
    }
    if (!endpoint || !p256dh || !auth) {
      return jsonResponse(
        { error: "endpoint, p256dh, and auth are required." },
        400
      );
    }

    const env = readNotificationsEnv();
    const supabaseAdmin = createAdminClient(env);

    const { data: subscription, error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        [
          {
            device_label: deviceLabel,
            endpoint,
            p256dh,
            auth,
            status: "active",
            last_seen_at: new Date().toISOString(),
          },
        ],
        {
          onConflict: "endpoint",
        }
      )
      .select("*")
      .single();

    if (error || !subscription) {
      return jsonResponse(
        { error: `Failed to register subscription: ${error?.message || "Unknown error"}` },
        500
      );
    }

    return jsonResponse({ subscription }, 200);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      500
    );
  }
});

