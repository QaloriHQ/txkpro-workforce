import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformMembership = {
  key: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  status: string;
  family: "workforce" | "advertiser";
};
export type PlatformAccount = {
  authUserId: string;
  email: string | null;
  name: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  memberships: PlatformMembership[];
};
export type PendingSupportInvitation = {
  invitationId: string;
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  expiresAt: string;
  deliveryStatus: string;
};

type ProfileRow = { auth_user_id: string | null; first_name: string | null; last_name: string | null; status: string | null };
type WorkforceRow = { id: string; auth_user_id: string | null; role: string; scope_type: string; scope_id: string | null; status: string };
type AdvertiserRow = { advertiser_membership_id: string; auth_user_id: string | null; role: string; advertiser_id: string; status: string };
type SupportInviteRow = { invitation_id: string; email: string; email_normalized: string | null; target_auth_user_id: string | null; role: string; scope_type: string; scope_id: string | null; expires_at: string; delivery_status: string; status: string };

function readableName(row?: ProfileRow) {
  const name = [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim();
  return name || "Name not provided";
}

function combineMemberships(workforce: WorkforceRow[], advertiser: AdvertiserRow[]): PlatformMembership[] {
  return [
    ...workforce.map(m => ({
      key: "workforce:" + m.id, role: m.role, scopeType: m.scope_type,
      scopeId: m.scope_id, status: m.status, family: "workforce" as const,
    })),
    ...advertiser.map(m => ({
      key: "advertiser:" + m.advertiser_membership_id, role: m.role,
      scopeType: "advertiser", scopeId: m.advertiser_id, status: m.status,
      family: "advertiser" as const,
    })),
  ];
}

async function contextForIds(ids: string[]) {
  if (!ids.length) return { profiles: [] as ProfileRow[], memberships: [] as WorkforceRow[], advertisers: [] as AdvertiserRow[] };
  const admin = createAdminClient();
  const [people, roles, ads] = await Promise.all([
    admin.from("users").select("auth_user_id,first_name,last_name,status").in("auth_user_id", ids),
    admin.from("app_role_memberships").select("id,auth_user_id,role,scope_type,scope_id,status").in("auth_user_id", ids),
    admin.from("wf_advertiser_memberships").select("advertiser_membership_id,auth_user_id,role,advertiser_id,status").in("auth_user_id", ids),
  ]);
  if (people.error || roles.error || ads.error) throw new Error("Platform account directory unavailable.");
  return {
    profiles: (people.data ?? []) as ProfileRow[],
    memberships: (roles.data ?? []) as WorkforceRow[],
    advertisers: (ads.data ?? []) as AdvertiserRow[],
  };
}

export async function listPlatformAccounts(page: number) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new Response("Invalid page", { status: 400 });
  const admin = createAdminClient();
  const perPage = 40;
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
  if (error) throw new Error("Platform account directory unavailable.");
  const users = data.users ?? [];
  const lookup = await contextForIds(users.map(u => u.id));
  const accounts: PlatformAccount[] = users.map(user => {
    const profile = lookup.profiles.find(p => p.auth_user_id === user.id);
    return {
      authUserId: user.id,
      email: user.email ?? null,
      name: readableName(profile),
      status: profile?.status ?? "Not linked",
      emailVerified: Boolean(user.email_confirmed_at),
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      memberships: combineMemberships(
        lookup.memberships.filter(m => m.auth_user_id === user.id),
        lookup.advertisers.filter(m => m.auth_user_id === user.id),
      ),
    };
  });
  return { accounts, page, hasNext: users.length === perPage };
}

export async function getPlatformAccount(authUserId: string): Promise<PlatformAccount | null> {
  if (!isUuid(authUserId)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error || !data.user) return null;
  const user = data.user;
  const lookup = await contextForIds([authUserId]);
  const profile = lookup.profiles.find(p => p.auth_user_id === authUserId);
  return {
    authUserId,
    email: user.email ?? null,
    name: readableName(profile),
    status: profile?.status ?? "Not linked",
    emailVerified: Boolean(user.email_confirmed_at),
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
    memberships: combineMemberships(lookup.memberships, lookup.advertisers),
  };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function listPendingSupportInvitations(account: PlatformAccount): Promise<PendingSupportInvitation[]> {
  if (!account.email) return [];
  const admin = createAdminClient();
  const email = account.email.toLowerCase();
  const { data, error } = await admin.from("wf_user_invitations")
    .select("invitation_id,email,email_normalized,target_auth_user_id,role,scope_type,scope_id,expires_at,delivery_status,status")
    .eq("email_normalized", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error("Pending account invitations unavailable.");
  const invites = (data ?? []) as SupportInviteRow[];
  return invites.filter(i =>
    i.email.toLowerCase() === email &&
    (!i.target_auth_user_id || i.target_auth_user_id === account.authUserId)
  ).map(i => ({
    invitationId: i.invitation_id, email: i.email, role: i.role,
    scopeType: i.scope_type, scopeId: i.scope_id,
    expiresAt: i.expires_at, deliveryStatus: i.delivery_status,
  }));
}

export async function getPendingTargetInvitation(account: PlatformAccount, invitationId: string) {
  if (!account.email || invitationId.length > 160 || !/^[a-zA-Z0-9_-]+$/.test(invitationId)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("wf_user_invitations")
    .select("invitation_id,email,email_normalized,target_auth_user_id,role,scope_type,scope_id,status,expires_at")
    .eq("invitation_id", invitationId)
    .eq("status", "pending")
    .maybeSingle();
  if (error || !data) return null;
  const invite = data as SupportInviteRow;
  if (invite.email.toLowerCase() !== account.email.toLowerCase()) return null;
  if (invite.target_auth_user_id && invite.target_auth_user_id !== account.authUserId) return null;
  return invite;
}

export function supportPreviewSections(membership: PlatformMembership) {
  const role = membership.role.toLowerCase();
  if (membership.family === "advertiser") {
    return ["Advertiser account", "Campaign workspace", "Creative management", "Analytics (role-scoped)"];
  }
  if (role === "student") return ["Student home", "My profile", "Training assignments", "Community"];
  if (role.includes("institution") || ["instructor","assistant_instructor","career_services","department_head","program_coordinator","educator"].includes(role)) {
    return ["Institution overview", "Programs and cohorts", "Authorized student directory", "Referrals and outcomes"];
  }
  if (role.startsWith("employer") || ["recruiter","hiring_manager","contractor_owner","contractor_recruiter"].includes(role)) {
    return ["Employer workspace", "Hiring pipeline", "Employer learning", "Authorized reporting"];
  }
  if (["super_admin","admin","platform_admin","support","read_only_analyst"].includes(role)) {
    return ["Platform overview", "Authorized operational queues", "Audit and reporting"];
  }
  return ["No preview navigation defined for this membership"];
}
