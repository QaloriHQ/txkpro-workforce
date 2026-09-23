import { getAccountContext } from "@/lib/auth";
import { nativeBridgeKey, nativeId } from "@/lib/native-id";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

const ALLOWED_ROLES = new Set<Role>(["student", "educator", "employer", "admin"]);
const EDUCATOR_ROLES = new Set(["instructor", "institution", "institution_admin"]);
const NATIVE_SOURCE = "txkpro_workforce_native";

type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stringList(value: unknown, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, maxItems);
}

function requestedRole(value: unknown): Role | null {
  return typeof value === "string" && ALLOWED_ROLES.has(value as Role) ? (value as Role) : null;
}

function safeProfileData(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 24_000) throw new Error("Onboarding data is too large.");
  return JSON.parse(serialized) as JsonObject;
}

async function ensureAppMembership(params: {
  admin: ReturnType<typeof createAdminClient>;
  authUserId: string;
  userId: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  status: "active" | "pending";
}) {
  const { admin, authUserId, userId, role, scopeType, scopeId, status } = params;
  let query = admin
    .from("app_role_memberships")
    .select("id, status")
    .eq("user_id", userId)
    .eq("role", role)
    .eq("scope_type", scopeType);
  query = scopeId ? query.eq("scope_id", scopeId) : query.is("scope_id", null);
  const { data: existing } = await query.maybeSingle();
  if (existing) {
    await admin.from("app_role_memberships").update({ auth_user_id: authUserId, updated_at: new Date().toISOString() }).eq("id", existing.id);
    return;
  }
  const scopePart = scopeId ?? "platform";
  const { error } = await admin.from("app_role_memberships").insert({
    membership_key: `native:${userId}:${role}:${scopeType}:${scopePart}`,
    auth_user_id: authUserId,
    user_id: userId,
    role,
    scope_type: scopeType,
    scope_id: scopeId,
    status,
    source: "workforce_onboarding",
  });
  if (error) throw error;
}

async function ensureWorkforceMembership(params: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  role: string;
  institutionId?: string | null;
  contractorId?: string | null;
  status: "active" | "pending";
}) {
  const { admin, userId, role, institutionId = null, contractorId = null, status } = params;
  let query = admin.from("wf_role_memberships").select("id").eq("user_id", userId).eq("role", role);
  query = institutionId ? query.eq("institution_id", institutionId) : query.is("institution_id", null);
  query = contractorId ? query.eq("contractor_id", contractorId) : query.is("contractor_id", null);
  const { data: existing } = await query.maybeSingle();
  if (existing) return;

  const membershipId = nativeId("WRM");
  const { error } = await admin.from("wf_role_memberships").insert({
    membership_id: membershipId,
    user_id: userId,
    role,
    institution_id: institutionId,
    contractor_id: contractorId,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    bridge_source_key: nativeBridgeKey("wf_role_membership", membershipId),
    bridge_source_sheet: NATIVE_SOURCE,
  });
  if (error) throw error;
}

async function provisionStudent(admin: ReturnType<typeof createAdminClient>, account: NonNullable<Awaited<ReturnType<typeof getAccountContext>>>, data: JsonObject) {
  const { data: existing } = await admin.from("wf_student_profiles").select("student_id").eq("user_id", account.legacyUserId).maybeSingle();
  const studentId = existing?.student_id ?? nativeId("STU");
  const primaryTrade = text(data.primaryTrade, 120) || null;
  const schoolId = text(data.schoolId, 120) || null;
  const payload = {
    user_id: account.legacyUserId,
    profile_status: "active",
    profile_visibility: data.discoverable === true ? "network" : "private",
    first_name_public: text(data.firstName, 100) || account.firstName,
    last_initial_public: (text(data.lastName, 100) || account.lastName).slice(0, 1).toUpperCase(),
    preferred_name: text(data.preferredName, 100) || null,
    program_type: text(data.programType, 120) || null,
    school_id: schoolId,
    graduation_year: text(data.graduationYear, 8) || null,
    graduation_date: text(data.graduationDate, 20) || null,
    zip_code: text(data.zipCode, 20) || null,
    city: text(data.city, 120) || null,
    state: text(data.state, 40) || null,
    primary_trade_id: primaryTrade,
    availability_status: text(data.availabilityStatus, 80) || "exploring",
    available_start_date: text(data.availableStartDate, 20) || null,
    employment_preferences_json: {
      shifts: stringList(data.shiftPreferences),
      workTypes: stringList(data.workPreferences),
      validDriversLicense: typeof data.validDriversLicense === "boolean" ? data.validDriversLicense : null,
      cleanDrivingRecordAttestation: typeof data.cleanDrivingRecord === "boolean" ? data.cleanDrivingRecord : null,
      willingBackgroundCheck: typeof data.willingBackgroundCheck === "boolean" ? data.willingBackgroundCheck : null,
      willingDrugScreen: typeof data.willingDrugScreen === "boolean" ? data.willingDrugScreen : null,
    },
    about: text(data.about, 2000) || null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await admin.from("wf_student_profiles").update(payload).eq("student_id", studentId);
    if (error) throw error;
  } else {
    const { error } = await admin.from("wf_student_profiles").insert({
      student_id: studentId,
      ...payload,
      created_at: new Date().toISOString(),
      bridge_source_key: nativeBridgeKey("student", studentId),
      bridge_source_sheet: NATIVE_SOURCE,
    });
    if (error) throw error;
  }

  await ensureAppMembership({ admin, authUserId: account.authUserId, userId: account.legacyUserId, role: "student", scopeType: "platform", scopeId: null, status: "active" });
  await ensureWorkforceMembership({ admin, userId: account.legacyUserId, role: "student", status: "active" });
  return { status: "complete" as const, entityId: studentId };
}

async function provisionEducator(admin: ReturnType<typeof createAdminClient>, account: NonNullable<Awaited<ReturnType<typeof getAccountContext>>>, data: JsonObject) {
  const institutionId = text(data.institutionId, 120);
  if (!institutionId) throw new Error("Choose the institution you teach with.");
  const { data: institution } = await admin.from("wf_institutions").select("institution_id").eq("institution_id", institutionId).eq("active", true).maybeSingle();
  if (!institution) throw new Error("That institution is not currently available for educator onboarding.");

  const alreadyApproved = account.memberships.some((membership) => membership.status.toLowerCase() === "active" && EDUCATOR_ROLES.has(membership.role.toLowerCase()));
  const membershipStatus = alreadyApproved ? "active" : "pending";

  const { data: seat } = await admin.from("wf_instructor_seats").select("seat_id").eq("institution_id", institutionId).eq("user_id", account.legacyUserId).maybeSingle();
  if (!seat) {
    const seatId = nativeId("INS");
    const { error } = await admin.from("wf_instructor_seats").insert({
      seat_id: seatId,
      institution_id: institutionId,
      user_id: account.legacyUserId,
      email: account.email,
      role: "instructor",
      status: membershipStatus,
      invited_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      bridge_source_key: nativeBridgeKey("instructor_seat", seatId),
      bridge_source_sheet: NATIVE_SOURCE,
    });
    if (error) throw error;
  }

  await ensureAppMembership({ admin, authUserId: account.authUserId, userId: account.legacyUserId, role: "instructor", scopeType: "institution", scopeId: institutionId, status: membershipStatus });
  await ensureWorkforceMembership({ admin, userId: account.legacyUserId, role: "instructor", institutionId, status: membershipStatus });
  return { status: alreadyApproved ? "complete" as const : "pending_review" as const, entityId: institutionId };
}

async function provisionEmployer(admin: ReturnType<typeof createAdminClient>, account: NonNullable<Awaited<ReturnType<typeof getAccountContext>>>, data: JsonObject) {
  const businessName = text(data.businessName, 200);
  if (!businessName) throw new Error("Business name is required.");
  const { data: existing } = await admin.from("contractors").select("contractor_id, approval_status").eq("owner_user_id", account.legacyUserId).maybeSingle();
  const contractorId = existing?.contractor_id ?? nativeId("CON");
  const now = new Date().toISOString();

  if (existing) {
    const { error } = await admin.from("contractors").update({
      business_name: businessName,
      business_phone: text(data.businessPhone, 60) || account.phone,
      business_email: account.email,
      website: text(data.website, 500) || null,
      description: text(data.businessDescription, 2000) || null,
      years_in_business: text(data.yearsInBusiness, 20) || null,
      updated_at: now,
    }).eq("contractor_id", contractorId);
    if (error) throw error;
  } else {
    const { error } = await admin.from("contractors").insert({
      contractor_id: contractorId,
      owner_user_id: account.legacyUserId,
      business_name: businessName,
      business_phone: text(data.businessPhone, 60) || account.phone,
      business_email: account.email,
      website: text(data.website, 500) || null,
      description: text(data.businessDescription, 2000) || null,
      years_in_business: text(data.yearsInBusiness, 20) || null,
      approval_status: "pending",
      account_status: "active",
      created_at: now,
      updated_at: now,
      bridge_source_key: nativeBridgeKey("contractor", contractorId),
      bridge_source_sheet: NATIVE_SOURCE,
    });
    if (error) throw error;
  }

  const { data: workforceProfile } = await admin.from("wf_contractor_profiles").select("id").eq("contractor_id", contractorId).maybeSingle();
  if (!workforceProfile) {
    const workforceContractorId = nativeId("WFC");
    const { error } = await admin.from("wf_contractor_profiles").insert({
      workforce_contractor_id: workforceContractorId,
      contractor_id: contractorId,
      primary_recruiter_user_id: account.legacyUserId,
      workforce_status: "pending",
      operating_base_zip: text(data.zipCode, 20) || null,
      city: text(data.city, 120) || null,
      state: text(data.state, 40) || null,
      trade_ids_json: stringList(data.tradesHiring),
      created_at: now,
      updated_at: now,
      bridge_source_key: nativeBridgeKey("workforce_contractor", workforceContractorId),
      bridge_source_sheet: NATIVE_SOURCE,
    });
    if (error) throw error;
  }

  await ensureAppMembership({ admin, authUserId: account.authUserId, userId: account.legacyUserId, role: "employer_owner", scopeType: "employer", scopeId: contractorId, status: "active" });
  await ensureWorkforceMembership({ admin, userId: account.legacyUserId, role: "employer_owner", contractorId, status: "active" });
  const employerApproved = existing?.approval_status?.toLowerCase() === "approved";
  return { status: employerApproved ? "complete" as const : "pending_review" as const, entityId: contractorId };
}

async function saveOnboarding(params: {
  admin: ReturnType<typeof createAdminClient>;
  account: NonNullable<Awaited<ReturnType<typeof getAccountContext>>>;
  role: Role;
  currentStep: number;
  profileData: JsonObject;
  status: "not_started" | "in_progress" | "pending_review" | "complete";
  submitted?: boolean;
  employerId?: string | null;
}) {
  const { admin, account, role, currentStep, profileData, status, submitted = false, employerId = null } = params;
  const now = new Date().toISOString();
  const { error } = await admin.from("wf_onboarding_accounts").upsert({
    auth_user_id: account.authUserId,
    user_id: account.legacyUserId,
    selected_role: role,
    status,
    current_step: currentStep,
    profile_data: profileData,
    employer_id: employerId,
    submitted_at: submitted ? now : account.onboarding?.status === "pending_review" ? now : null,
    completed_at: status === "complete" ? now : null,
    updated_at: now,
  }, { onConflict: "auth_user_id" });
  if (error) throw error;
}

async function auditOnboarding(admin: ReturnType<typeof createAdminClient>, account: NonNullable<Awaited<ReturnType<typeof getAccountContext>>>, action: string, role: Role, status: string, entityId?: string) {
  await admin.from("platform_audit_events").insert({
    actor_auth_user_id: account.authUserId,
    actor_user_id: account.legacyUserId,
    action,
    entity_type: "wf_onboarding",
    entity_id: entityId ?? account.legacyUserId,
    source: "workforce-web",
    metadata: { selectedRole: role, status },
  });
}

export async function GET() {
  const account = await getAccountContext();
  if (!account) return Response.json({ error: "Unauthorized or workforce account is not linked." }, { status: 401 });
  const supabase = await createServerSupabaseClient();
  const { data: institutions } = await supabase
    .from("wf_institutions")
    .select("institution_id, name, city, state")
    .eq("active", true)
    .order("name");
  return Response.json({ account, institutions: institutions ?? [] });
}

export async function PATCH(request: Request) {
  try {
    const account = await getAccountContext();
    if (!account) return Response.json({ error: "Unauthorized or workforce account is not linked." }, { status: 401 });
    const body = await request.json();
    const role = requestedRole(body.role) ?? account.onboarding?.selected_role ?? account.role;
    if (!role) return Response.json({ error: "Choose an account type." }, { status: 400 });
    if (account.role && role !== account.role) return Response.json({ error: "Your provisioned TXKPRO role cannot be changed through onboarding." }, { status: 403 });
    if (role === "admin" && account.role !== "admin") return Response.json({ error: "Administrator access must be provisioned by TXKPRO." }, { status: 403 });

    const incoming = safeProfileData(body.profileData);
    const profileData = { ...(account.onboarding?.profile_data ?? {}), ...incoming };
    const currentStep = Math.min(6, Math.max(1, Number(body.currentStep) || 1));

    if (role === "employer" || role === "student") {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.rpc(
        role === "employer"
          ? "save_employer_onboarding_step"
          : "save_student_onboarding_step",
        {
          p_current_step: currentStep,
          p_profile_data: profileData,
        },
      );
      if (error) throw error;
      return Response.json(data ?? { ok: true, role, currentStep, profileData });
    }

    const admin = createAdminClient();
    await saveOnboarding({ admin, account, role, currentStep, profileData, status: "in_progress" });
    return Response.json({ ok: true, role, currentStep, profileData });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save onboarding.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await getAccountContext();
    if (!account) return Response.json({ error: "Unauthorized or workforce account is not linked." }, { status: 401 });
    const body = await request.json();
    const role = requestedRole(body.role) ?? account.onboarding?.selected_role ?? account.role;
    if (!role) return Response.json({ error: "Choose an account type." }, { status: 400 });
    if (account.role && role !== account.role) return Response.json({ error: "Your provisioned TXKPRO role cannot be changed through onboarding." }, { status: 403 });
    if (role === "admin" && account.role !== "admin") return Response.json({ error: "Administrator access must be provisioned by TXKPRO." }, { status: 403 });

    const incoming = safeProfileData(body.profileData);
    const profileData = { ...(account.onboarding?.profile_data ?? {}), ...incoming };
    const firstName = text(profileData.firstName, 100) || account.firstName;
    const lastName = text(profileData.lastName, 100) || account.lastName;
    if (!firstName || !lastName) return Response.json({ error: "First and last name are required." }, { status: 400 });

    if (role === "employer" || role === "student") {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.rpc(
        role === "employer"
          ? "complete_employer_onboarding"
          : "complete_student_onboarding",
        { p_profile_data: profileData },
      );
      if (error) throw error;
      return Response.json(
        data ??
          (role === "employer"
            ? {
                ok: true,
                status: "pending_review",
                role: "employer",
                redirectTo: "/onboarding?pending=1",
              }
            : {
                ok: true,
                status: "complete",
                role: "student",
                redirectTo: "/dashboard",
              }),
      );
    }

    const admin = createAdminClient();
    const { error: userError } = await admin.from("users").update({
      first_name: firstName,
      last_name: lastName,
      phone: text(profileData.phone, 60) || null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", account.legacyUserId);
    if (userError) throw userError;

    let result: { status: "complete" | "pending_review"; entityId: string };
    if (role === "student") result = await provisionStudent(admin, account, profileData);
    else if (role === "educator") result = await provisionEducator(admin, account, profileData);
    else result = { status: "complete", entityId: account.legacyUserId };

    await saveOnboarding({ admin, account, role, currentStep: 6, profileData, status: result.status, submitted: true, employerId: null });
    await auditOnboarding(admin, account, "workforce.onboarding.completed", role, result.status, result.entityId);

    return Response.json({ ok: true, status: result.status, role, redirectTo: result.status === "complete" ? "/dashboard" : "/onboarding?pending=1" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete onboarding.";
    return Response.json({ error: message }, { status: 400 });
  }
}
