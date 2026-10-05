import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicStudentPage, StudentPublicSettings } from "./types";

export async function studentPublicSettings(input: Record<string, unknown> | null = null): Promise<StudentPublicSettings> {
  const client = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Response("Sign in required.", { status: 401 });
  const { data, error } = await client.rpc("student_public_profile_settings", { p_input: input });
  if (error) throw new Response(error.code === "23505" ? "That profile URL is reserved. Choose another." : error.code === "42501" ? "Active Student self membership required." : error.code === "22023" ? error.message : "Profile settings are temporarily unavailable.", { status: error.code === "23505" ? 409 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503 });
  return data as StudentPublicSettings;
}
// React cache deduplicates only within this request. Publication is checked on every request.
export const publicStudentPage = cache(async (path: string): Promise<PublicStudentPage> => {
  const { data, error } = await createAdminClient().rpc("student_portfolio_public", { p_path: path });
  if (error) throw new Error("Public profile is temporarily unavailable.");
  return data ?? { found: false };
});
export async function studentPublicSitemap(): Promise<Array<{ path: string; updatedAt: string }>> {
  const { data, error } = await createAdminClient().rpc("student_public_profile_sitemap");
  if (error) throw new Error("Student sitemap is temporarily unavailable.");
  return data ?? [];
}
