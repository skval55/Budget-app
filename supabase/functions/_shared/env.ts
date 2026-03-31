export interface NotificationsEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  pushVapidPublicKey: string;
  pushVapidPrivateKey: string;
  pushVapidSubject: string;
}

const readEnvVar = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

export const readNotificationsEnv = (): NotificationsEnv => ({
  supabaseUrl: readEnvVar("SUPABASE_URL"),
  supabaseServiceRoleKey: readEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
  pushVapidPublicKey: readEnvVar("PUSH_VAPID_PUBLIC_KEY"),
  pushVapidPrivateKey: readEnvVar("PUSH_VAPID_PRIVATE_KEY"),
  pushVapidSubject: Deno.env.get("PUSH_VAPID_SUBJECT")?.trim() || "mailto:admin@example.com",
});

