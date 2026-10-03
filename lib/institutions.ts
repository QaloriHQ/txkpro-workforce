import "server-only";
import type { AccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OnboardingInstitution = {
  institution_id: string;
  name: string;
  city: string | null;
  state: string | null;
  authorized: boolean;
};

export function isPlatformSuperAdmin(account: AccountContext) {
  return account.userStatus.toLowerCase() === "active" && account.memberships.some(m =>
    m.role.toLowerCase() === "super_admin" && m.scope_type.toLowerCase() === "platform" && m.status.toLowerCase() === "active");
}

export async function onboardingInstitutions() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("onboarding_institutions_directory");
  if (error) throw new Error("Institution directory is unavailable. Please try again shortly.");
  return (data ?? []) as OnboardingInstitution[];
}
