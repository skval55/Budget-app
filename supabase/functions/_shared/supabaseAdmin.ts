import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import type { NotificationsEnv } from "./env.ts";

export const createAdminClient = (env: NotificationsEnv) =>
  createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

