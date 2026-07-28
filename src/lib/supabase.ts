import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key. Every mobile-facing
 * API route runs on the server, so RLS is intentionally bypassed here rather
 * than threading a user session through — devices aren't authenticated
 * accounts, they're anonymous UUIDs the app generates on first launch.
 *
 * Returns null when the project isn't configured yet, so routes can degrade
 * to a clear 503 instead of crashing — same pattern as every other optional
 * integration in this app (terrain, vegetation, etc).
 */
let cached: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    cached = null;
    return null;
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function supabaseUnavailable() {
  return {
    error: "Supabase not configured",
    note: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, then run supabase/migrations/0001_init.sql against your project.",
  };
}
