import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Kind, Settings, Profile } from "./types";
export async function professionalSettings(kind: Kind, input: Record<string, unknown> | null = null, post = false): Promise<Settings> {
  const client = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Response("Sign in required.", { status: 401 });
  const { data, error } = await client.rpc(post ? "professional_post_save" : "professional_profile_settings", { p_kind: kind, p_input: input });
  if (error) throw new Response(error.code === "23505" ? "That profile URL is reserved. Choose another." : error.code === "42501" ? "Active professional membership and ownership required." : error.code === "22023" ? error.message : "Profile settings are temporarily unavailable.", { status: error.code === "23505" ? 409 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503 });
  return data as Settings;
}
export const publicProfessional = cache(async (path: string): Promise<Profile | { found: false }> => {
  const { data, error } = await createAdminClient().rpc("professional_public_read", { p_path: path });
  if (error) throw new Error("Professional profile is temporarily unavailable.");
  return data ?? { found: false };
});
export async function professionalSitemap(): Promise<Array<{ path: string; updatedAt: string }>> {
  const { data, error } = await createAdminClient().rpc("professional_public_sitemap");
  if (error) throw new Error("Professional sitemap is temporarily unavailable.");
  return data ?? [];
}
