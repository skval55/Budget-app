import webpush from "npm:web-push@3.6.7";
import type { NotificationsEnv } from "./env.ts";

export interface PushSubscriptionRecord {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
}

export const sendPushToSubscription = async (
  env: NotificationsEnv,
  subscription: PushSubscriptionRecord,
  payload: PushPayload
) => {
  webpush.setVapidDetails(
    env.pushVapidSubject,
    env.pushVapidPublicKey,
    env.pushVapidPrivateKey
  );

  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    JSON.stringify(payload)
  );
};

