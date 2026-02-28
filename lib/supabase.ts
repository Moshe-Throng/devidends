import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Client for browser-side operations (anon key, respects RLS)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (service role, bypasses RLS)
export function getSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
