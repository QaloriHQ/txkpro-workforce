import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export type AuthContext = {
  userId: string;
  role: Role;
  profileId: string;
  firstName: string;
  lastName: string;
};

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, first_name, last_name, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") return null;
  return {
    userId: user.id,
    role: profile.role as Role,
    profileId: profile.id,
    firstName: profile.first_name,
    lastName: profile.last_name,
  };
}

export async function requireRole(roles: Role[]) {
  const auth = await getAuthContext();
  if (!auth) throw new Response("Unauthorized", { status: 401 });
  if (!roles.includes(auth.role)) throw new Response("Forbidden", { status: 403 });
  return auth;
}
