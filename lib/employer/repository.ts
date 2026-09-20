import "server-only";

import { canCreateHiringNeed, canManageCompany } from "@/lib/employer/auth";
import type {
  EmployerCompanyProfile,
  EmployerCompanyProfilePatch,
  EmployerContext,
  HiringNeed,
  HiringNeedInput,
  HiringNeedStatus,
  HiringNeedVisibility,
} from "@/lib/employer/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function nullableText(value: unknown, max = 2_000): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().slice(0, max);
  return text || null;
}

function mapHiringNeed(row: Record<string, unknown>): HiringNeed {
  return {
    id: String(row.id),
    hiringNeedId: String(row.hiring_need_id),
    employerId: String(row.employer_id),
    createdByUserId: nullableText(row.created_by_user_id, 160),
    assignedRecruiterUserId: nullableText(row.assigned_recruiter_user_id, 160),
    assignedHiringManagerUserId: nullableText(
      row.assigned_hiring_manager_user_id,
      160,
    ),
    title: String(row.title ?? ""),
    tradeId: nullableText(row.trade_id, 160),
    roleType: nullableText(row.role_type, 160),
    targetHires: Number(row.target_hires ?? 1),
    targetHireDate: nullableText(row.target_hire_date, 20),
    serviceArea: objectValue(row.service_area_json),
    workTypes: stringArray(row.work_types_json),
    shifts: stringArray(row.shifts_json),
    programEligibility: stringArray(row.program_eligibility_json),
    graduationTiming: nullableText(row.graduation_timing, 160),
    requiredVerifiedSkills: stringArray(row.required_verified_skills_json),
    optionalVerifiedSkills: stringArray(row.optional_verified_skills_json),
    minimumVerifiedSkillCount: Number(row.minimum_verified_skill_count ?? 0),
    requiresDriversLicense: Boolean(row.requires_drivers_license),
    requiresDrivingRecordAttestation: Boolean(
      row.requires_driving_record_attestation,
    ),
    requiresBackgroundWillingness: Boolean(
      row.requires_background_willingness,
    ),
    requiresDrugScreenWillingness: Boolean(
      row.requires_drug_screen_willingness,
    ),
    sharedNotes: nullableText(row.shared_notes, 4_000),
    status: String(row.status ?? "draft") as HiringNeedStatus,
    visibility: String(
      row.visibility ?? "employer_private",
    ) as HiringNeedVisibility,
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function getEmployerCompanyProfile(
  context: EmployerContext,
): Promise<EmployerCompanyProfile> {
  const supabase = await createServerSupabaseClient();
  const [{ data: employer, error: employerError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase
        .from("contractors")
        .select(
          "contractor_id, business_name, business_phone, business_email, website, description, years_in_business, approval_status, account_status",
        )
        .eq("contractor_id", context.employerId)
        .single(),
      supabase
        .from("wf_contractor_profiles")
        .select(
          "workforce_status, operating_base_zip, city, state, county, service_area_json, trade_ids_json, hiring_roles_json, annual_hiring_volume, hiring_horizon, workforce_description, profile_metadata, profile_version",
        )
        .eq("contractor_id", context.employerId)
        .maybeSingle(),
    ]);

  if (employerError) throw employerError;
  if (profileError) throw profileError;

  return {
    employerId: context.employerId,
    businessName: employer.business_name ?? context.employerName,
    businessPhone: employer.business_phone ?? null,
    businessEmail: employer.business_email ?? context.email,
    website: employer.website ?? null,
    description: employer.description ?? null,
    yearsInBusiness: employer.years_in_business ?? null,
    approvalStatus: context.approvalStatus,
    accountStatus: employer.account_status ?? context.accountStatus,
    workforceStatus: profile?.workforce_status ?? context.workforceStatus,
    operatingBaseZip: profile?.operating_base_zip ?? null,
    city: profile?.city ?? null,
    state: profile?.state ?? null,
    county: profile?.county ?? null,
    serviceArea: objectValue(profile?.service_area_json),
    tradeIds: stringArray(profile?.trade_ids_json),
    hiringRoles: stringArray(profile?.hiring_roles_json),
    annualHiringVolume:
      profile?.annual_hiring_volume === null ||
      profile?.annual_hiring_volume === undefined
        ? null
        : Number(profile.annual_hiring_volume),
    hiringHorizon: profile?.hiring_horizon ?? null,
    workforceDescription: profile?.workforce_description ?? null,
    profileMetadata: objectValue(profile?.profile_metadata),
    profileVersion: Number(profile?.profile_version ?? 1),
  };
}

export async function updateEmployerCompanyProfile(
  context: EmployerContext,
  patch: EmployerCompanyProfilePatch,
) {
  if (!canManageCompany(context.role)) {
    throw new Response("Company Profile is read-only for this Employer role", {
      status: 403,
    });
  }

  const supabase = await createServerSupabaseClient();
  const current = await getEmployerCompanyProfile(context);

  const companyPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.businessName !== undefined) {
    const value = nullableText(patch.businessName, 200);
    if (!value) throw new Error("Business name is required.");
    companyPatch.business_name = value;
  }
  if (patch.businessPhone !== undefined)
    companyPatch.business_phone = nullableText(patch.businessPhone, 60);
  if (patch.website !== undefined)
    companyPatch.website = nullableText(patch.website, 500);
  if (patch.description !== undefined)
    companyPatch.description = nullableText(patch.description, 2_000);
  if (patch.yearsInBusiness !== undefined)
    companyPatch.years_in_business = nullableText(patch.yearsInBusiness, 20);

  const { error: companyError } = await supabase
    .from("contractors")
    .update(companyPatch)
    .eq("contractor_id", context.employerId);
  if (companyError) throw companyError;

  const profilePatch: Record<string, unknown> = {
    contractor_id: context.employerId,
    updated_by_user_id: context.legacyUserId,
    updated_at: new Date().toISOString(),
    profile_version: current.profileVersion + 1,
  };
  if (patch.operatingBaseZip !== undefined)
    profilePatch.operating_base_zip = nullableText(patch.operatingBaseZip, 20);
  if (patch.city !== undefined) profilePatch.city = nullableText(patch.city, 120);
  if (patch.state !== undefined)
    profilePatch.state = nullableText(patch.state, 40);
  if (patch.county !== undefined)
    profilePatch.county = nullableText(patch.county, 120);
  if (patch.serviceArea !== undefined)
    profilePatch.service_area_json = patch.serviceArea;
  if (patch.tradeIds !== undefined)
    profilePatch.trade_ids_json = patch.tradeIds.slice(0, 50);
  if (patch.hiringRoles !== undefined)
    profilePatch.hiring_roles_json = patch.hiringRoles.slice(0, 50);
  if (patch.annualHiringVolume !== undefined) {
    if (
      patch.annualHiringVolume !== null &&
      (!Number.isInteger(patch.annualHiringVolume) || patch.annualHiringVolume < 0)
    ) {
      throw new Error("Annual hiring volume must be a non-negative integer.");
    }
    profilePatch.annual_hiring_volume = patch.annualHiringVolume;
  }
  if (patch.hiringHorizon !== undefined)
    profilePatch.hiring_horizon = nullableText(patch.hiringHorizon, 160);
  if (patch.workforceDescription !== undefined)
    profilePatch.workforce_description = nullableText(
      patch.workforceDescription,
      2_000,
    );
  if (patch.profileMetadata !== undefined)
    profilePatch.profile_metadata = patch.profileMetadata;

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("wf_contractor_profiles")
    .select("id")
    .eq("contractor_id", context.employerId)
    .maybeSingle();
  if (existingProfileError) throw existingProfileError;

  if (existingProfile) {
    const { error } = await supabase
      .from("wf_contractor_profiles")
      .update(profilePatch)
      .eq("contractor_id", context.employerId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("wf_contractor_profiles").insert({
      ...profilePatch,
      workforce_contractor_id: `WFC-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      primary_recruiter_user_id: context.legacyUserId,
      workforce_status: "pending",
      created_at: new Date().toISOString(),
      bridge_source_key: `txkpro_workforce_native:employer:${context.employerId}`,
      bridge_source_sheet: "txkpro_workforce_native",
    });
    if (error) throw error;
  }

  return getEmployerCompanyProfile(context);
}

export async function listHiringNeeds(
  context: EmployerContext,
): Promise<HiringNeed[]> {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("wf_hiring_needs")
    .select("*")
    .eq("employer_id", context.employerId)
    .order("updated_at", { ascending: false });

  if (context.role === "hiring_manager") {
    query = query.eq("assigned_hiring_manager_user_id", context.legacyUserId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapHiringNeed(row as Record<string, unknown>));
}

function hiringNeedPayload(context: EmployerContext, input: HiringNeedInput) {
  const title = nullableText(input.title, 200);
  if (!title) throw new Error("Hiring Need title is required.");

  const targetHires = input.targetHires ?? 1;
  if (!Number.isInteger(targetHires) || targetHires < 1 || targetHires > 10_000) {
    throw new Error("Target hires must be a positive integer.");
  }

  const minimumVerifiedSkillCount = input.minimumVerifiedSkillCount ?? 0;
  if (
    !Number.isInteger(minimumVerifiedSkillCount) ||
    minimumVerifiedSkillCount < 0
  ) {
    throw new Error("Minimum verified-skill count must be non-negative.");
  }

  return {
    employer_id: context.employerId,
    title,
    trade_id: nullableText(input.tradeId, 160),
    role_type: nullableText(input.roleType, 160),
    target_hires: targetHires,
    target_hire_date: nullableText(input.targetHireDate, 20),
    service_area_json: input.serviceArea ?? {},
    work_types_json: (input.workTypes ?? []).slice(0, 30),
    shifts_json: (input.shifts ?? []).slice(0, 30),
    program_eligibility_json: (input.programEligibility ?? []).slice(0, 50),
    graduation_timing: nullableText(input.graduationTiming, 160),
    required_verified_skills_json: (input.requiredVerifiedSkills ?? []).slice(
      0,
      100,
    ),
    optional_verified_skills_json: (input.optionalVerifiedSkills ?? []).slice(
      0,
      100,
    ),
    minimum_verified_skill_count: minimumVerifiedSkillCount,
    requires_drivers_license: input.requiresDriversLicense ?? false,
    requires_driving_record_attestation:
      input.requiresDrivingRecordAttestation ?? false,
    requires_background_willingness:
      input.requiresBackgroundWillingness ?? false,
    requires_drug_screen_willingness:
      input.requiresDrugScreenWillingness ?? false,
    shared_notes: nullableText(input.sharedNotes, 4_000),
    assigned_recruiter_user_id: nullableText(
      input.assignedRecruiterUserId,
      160,
    ),
    assigned_hiring_manager_user_id: nullableText(
      input.assignedHiringManagerUserId,
      160,
    ),
    status: input.status ?? "draft",
    visibility: input.visibility ?? "employer_private",
  };
}

export async function createHiringNeed(
  context: EmployerContext,
  input: HiringNeedInput,
): Promise<HiringNeed> {
  if (context.approvalStatus !== "approved") {
    throw new Response("Employer approval is required to create Hiring Needs", {
      status: 403,
    });
  }
  if (!canCreateHiringNeed(context.role)) {
    throw new Response("Current Employer role cannot create Hiring Needs", {
      status: 403,
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("wf_hiring_needs")
    .insert({
      ...hiringNeedPayload(context, input),
      created_by_user_id: context.legacyUserId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapHiringNeed(data as Record<string, unknown>);
}

export async function updateHiringNeed(
  context: EmployerContext,
  hiringNeedId: string,
  input: HiringNeedInput,
  expectedVersion?: number,
): Promise<HiringNeed> {
  if (context.approvalStatus !== "approved") {
    throw new Response("Employer approval is required to update Hiring Needs", {
      status: 403,
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("wf_hiring_needs")
    .select("*")
    .eq("employer_id", context.employerId)
    .eq("hiring_need_id", hiringNeedId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Response("Hiring Need not found", { status: 404 });

  if (
    context.role === "employer_read_only" ||
    (context.role === "hiring_manager" &&
      existing.assigned_hiring_manager_user_id !== context.legacyUserId)
  ) {
    throw new Response("Hiring Need is outside the current role/scope", {
      status: 403,
    });
  }

  if (
    expectedVersion !== undefined &&
    Number(existing.version) !== expectedVersion
  ) {
    throw new Response(
      "Hiring Need changed since it was loaded. Refresh before saving.",
      { status: 409 },
    );
  }

  let query = supabase
    .from("wf_hiring_needs")
    .update(hiringNeedPayload(context, input))
    .eq("employer_id", context.employerId)
    .eq("hiring_need_id", hiringNeedId);

  if (expectedVersion !== undefined) {
    query = query.eq("version", expectedVersion);
  }

  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return mapHiringNeed(data as Record<string, unknown>);
}
