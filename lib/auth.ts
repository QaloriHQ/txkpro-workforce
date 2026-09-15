import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

const ADMIN_ROLES = new Set(["super_admin", "admin", "platform_admin"]);
const EDUCATOR_ROLES = new Set(["instructor", "institution", "institution_admin"]);
const EMPLOYER_ROLES = new Set(["contractor_owner", "contractor_recruiter"]);

export type Membership = {
  role: string;
  status: string;
  scope_type: string;
  scope_id: string | null;
};

export type VerifiedIdentity = {
  authUserId: string;
  email: string | null;
};

export type AccountContext = VerifiedIdentity & {
  legacyUserId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  userStatus: string;
  memberships: Membership[];
  role: Role | null;
  onboarding: {
    selected_role: Role | null;
    status: "not_started" | "in_progress" | "pending_review" | "complete";
    current_step: number;
    profile_data: Record<string, unknown>;
  } | null;
};

export type AuthContext = AccountContext & {
  role: Role;
  profileId: string;
  userId: string;
};

export function normalizeRole(memberships: Membership[]): Role | null {
  const active = memberships.filter((membership) => membership.status.toLowerCase() === "active");
  if (active.some((membership) => ADMIN_ROLES.has(membership.role.toLowerCase()))) return "admin";
  if (active.some((membership) => EDUCATOR_ROLES.has(membership.role.toLowerCase()))) return "educator";
  if (active.some((membership) => EMPLOYER_ROLES.has(membership.role.toLowerCase()))) return "employer";
  if (active.some((membership) => membership.role.toLowerCase() === "student")) return "student";
  return null;
}

export async function getVerifiedIdentity(): Promise<VerifiedIdentity | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  return { authUserId: sub, email };
}

export async function getAccountContext(): Promise<AccountContext | null> {
  const identity = await getVerifiedIdentity();
  if (!identity) return null;

  const admin = createAdminClient();
  const { data: user, error: userError } = await admin
    .from("users")
    .select("user_id, first_name, last_name, phone, status")
    .eq("auth_user_id", identity.authUserId)
    .maybeSingle();

  if (userError || !user?.user_id) return null;

  const [{ data: memberships }, { data: onboarding }] = await Promise.all([
    admin
      .from("app_role_memberships")
      .select("role, status, scope_type, scope_id")
      .eq("auth_user_id", identity.authUserId),
    admin
      .from("wf_onboarding_accounts")
      .select("selected_role, status, current_step, profile_data")
      .eq("auth_user_id", identity.authUserId)
      .maybeSingle(),
  ]);

  const normalizedMemberships = (memberships ?? []) as Membership[];

  return {
    ...identity,
    legacyUserId: user.user_id,
    firstName: user.first_name ?? "",
    lastName: user.last_name ?? "",
    phone: user.phone ?? null,
    userStatus: user.status ?? "active",
    memberships: normalizedMemberships,
    role: normalizeRole(normalizedMemberships),
    onboarding: onboarding
      ? {
          selected_role: (onboarding.selected_role as Role | null) ?? null,
          status: onboarding.status,
          current_step: onboarding.current_step,
          profile_data: (onboarding.profile_data ?? {}) as Record<string, unknown>,
        }
      : null,
  };
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const account = await getAccountContext();
  if (!account || !account.role || account.userStatus === "disabled") return null;
  return {
    ...account,
    role: account.role,
    profileId: account.legacyUserId,
    userId: account.authUserId,
  };
}

export async function requireRole(roles: Role[]) {
  const auth = await getAuthContext();
  if (!auth) throw new Response("Unauthorized", { status: 401 });
  if (!roles.includes(auth.role)) throw new Response("Forbidden", { status: 403 });
  return auth;
}
