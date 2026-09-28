import "server-only";
import { createClient } from "@supabase/supabase-js";
import { normalizeServerSecret } from "@/lib/supabase/server-secret";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = normalizeServerSecret(
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!url) throw new Error("Supabase server URL configuration is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
