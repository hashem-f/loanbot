import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service role key. Never import this from a
// client component or expose the key with a NEXT_PUBLIC_ prefix.
//
// Lazily initialized behind a Proxy so importing this module never throws —
// only calling it does. Next's build step imports every route module to
// inspect it, without invoking anything, so a top-level throw here would
// fail `next build` even when the real env vars are only set in Vercel.
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.local.example to .env.local and fill them in."
    );
  }

  client = createClient(url, serviceKey, { auth: { persistSession: false } });
  return client;
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
