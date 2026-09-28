import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountContext } from "@/lib/auth";
import { getInstitutionContext, canManageInstitutionLearningAssignments } from "@/lib/institution/auth";
import { getEmployerContext, canManageCompany } from "@/lib/employer/auth";
import { getInstitutionEmployerLearningContext } from "@/lib/institution/learning-repository";
import type { InstitutionContext } from "@/lib/institution/types";
import { productionStatuses } from "@/lib/concierge-statuses";

export type ProductionStatus = (typeof productionStatuses)[number];
export type ProductionRequest = {
  production_request_id: string;
  employer_id: string;
  institution_id: string | null;
  cohort_id: string | null;
  program_name: string | null;
  field_gap: string;
  equipment_process: string | null;
  desired_outcome: string | null;
  status: ProductionStatus;
  target_launch_date: string | null;
  resulting_micro_cert_id: string | null;
  created_at: string;
  updated_at: string;
};

const admin = () => createAdminClient();
const select = "production_request_id,employer_id,institution_id,cohort_id,program_name,field_gap,equipment_process,desired_outcome,status,target_launch_date,resulting_micro_cert_id,created_at,updated_at";
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function institutionProductionEmployers(context: InstitutionContext) {
  const { data: scopes, error } = await admin().from("wf_employer_talent_scopes")
    .select("employer_id,cohort_id,program_name,starts_at")
    .eq("institution_id", context.institutionId).eq("active", true)
    .or("ends_at.is.null,ends_at.gte." + new Date().toISOString())
    .limit(250);
  if (error) throw error;
  const learning = await getInstitutionEmployerLearningContext(context);
  const authorizedCohorts = new Set(learning.cohorts.filter((c) => c.canAssign).map((c) => c.cohortId));
  const ids = new Set(
    (scopes ?? []).filter((scope) =>
      (!scope.starts_at || new Date(scope.starts_at) <= new Date()) &&
      (!scope.cohort_id || authorizedCohorts.has(scope.cohort_id)) &&
      (!scope.program_name || learning.cohorts.some((c) =>
        c.canAssign && c.programName === scope.program_name)))
      .map((scope) => scope.employer_id),
  );
  if (!ids.size) return [];
  const { data: employers, error: employerError } = await admin().from("contractors")
    .select("contractor_id,business_name").in("contractor_id", [...ids]);
  if (employerError) throw employerError;
  return (employers ?? []).map((e) => ({ id: e.contractor_id, name: e.business_name ?? e.contractor_id }));
}

export async function requirePlatformAdmin() {
  const account = await getAccountContext();
  if (!account || !account.memberships.some((m) =>
    m.status.toLowerCase() === "active" &&
    ["super_admin", "admin", "platform_admin"].includes(m.role.toLowerCase()) &&
    ["platform", "global", "system"].includes(m.scope_type.toLowerCase())
  )) throw new Response("Platform Admin required", { status: 403 });
  return account;
}

export async function listProductionRequests(view: "institution" | "employer" | "admin") {
  let query = admin().from("wf_employer_training_production_requests")
    .select(select).order("created_at", { ascending: false }).limit(100);
  if (view === "institution") {
    const context = await getInstitutionContext();
    if (!context) throw new Response("Institution membership required", { status: 403 });
    query = query.eq("institution_id", context.institutionId);
    // Narrow program/cohort memberships to their actual records.
    if (!context.scopes.some((s) => s.scopeType === "institution")) {
      const learning = await getInstitutionEmployerLearningContext(context);
      const cohorts = new Set(learning.cohorts.map((c) => c.cohortId));
      if (!cohorts.size) return [];
      query = query.in("cohort_id", [...cohorts]);
    }
  } else if (view === "employer") {
    const context = await getEmployerContext();
    if (!context) throw new Response("Employer membership required", { status: 403 });
    query = query.eq("employer_id", context.employerId);
  } else await requirePlatformAdmin();
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProductionRequest[];
}

export async function createProductionRequest(
  view: "institution" | "employer",
  payload: Record<string, unknown>,
) {
  const account = await getAccountContext();
  if (!account) throw new Response("Sign in required", { status: 401 });
  const employerId = clean(payload.employerId, 80);
  const fieldGap = clean(payload.fieldGap, 2000);
  const equipmentProcess = clean(payload.equipmentProcess, 2000);
  const desiredOutcome = clean(payload.desiredOutcome, 2000);
  const cohortId = clean(payload.cohortId, 80) || null;
  const programName = clean(payload.programName, 200) || null;
  const targetLaunchDate = clean(payload.targetLaunchDate, 10) || null;
  if (!employerId || !fieldGap || !desiredOutcome || (targetLaunchDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetLaunchDate)))
    throw new Response("Employer, field gap, desired outcome, or target date is invalid.", { status: 400 });

  let institutionId: string | null = null;
  if (view === "institution") {
    const context = await getInstitutionContext();
    if (!context || !canManageInstitutionLearningAssignments(context))
      throw new Response("Institution request management denied", { status: 403 });
    institutionId = context.institutionId;
    const [learning, employers] = await Promise.all([
      getInstitutionEmployerLearningContext(context), institutionProductionEmployers(context),
    ]);
    if (!employers.some((e) => e.id === employerId))
      throw new Response("Employer is outside your Institution training scope", { status: 403 });
    if (!cohortId || !learning.cohorts.some((cohort) => cohort.cohortId === cohortId && cohort.canAssign))
      throw new Response("Select an authorized cohort", { status: 403 });
    const cohort = learning.cohorts.find((item) => item.cohortId === cohortId)!;
    if (programName && programName !== cohort.programName)
      throw new Response("Program does not match cohort", { status: 400 });
    const { data: partnerScopes, error: scopeError } = await admin()
      .from("wf_employer_talent_scopes")
      .select("cohort_id,program_name,starts_at,ends_at")
      .eq("institution_id", institutionId).eq("employer_id", employerId).eq("active", true);
    if (scopeError) throw scopeError;
    if (!(partnerScopes ?? []).some((s) =>
      (!s.starts_at || new Date(s.starts_at) <= new Date()) &&
      (!s.ends_at || new Date(s.ends_at) >= new Date()) &&
      (!s.cohort_id || s.cohort_id === cohortId) &&
      (!s.program_name || s.program_name === cohort.programName)))
      throw new Response("Employer is outside the selected cohort partnership scope", { status: 403 });
  } else {
    const context = await getEmployerContext(employerId);
    if (!context || !canManageCompany(context.role) || context.approvalStatus !== "approved")
      throw new Response("Employer request management denied", { status: 403 });
    // Employers may request their own module; Institution and Cohort linkage
    // must be established by an authorized Institution user.
    if (cohortId || programName || payload.institutionId)
      throw new Response("Institution scope cannot be supplied by an Employer", { status: 400 });
  }

  const { data, error } = await admin().from("wf_employer_training_production_requests")
    .insert({
      employer_id: employerId, institution_id: institutionId, cohort_id: cohortId,
      program_name: programName, field_gap: fieldGap,
      equipment_process: equipmentProcess || null, desired_outcome: desiredOutcome,
      target_launch_date: targetLaunchDate, requested_by_user_id: account.legacyUserId,
      metadata: { last_actor_auth_user_id: account.authUserId },
    }).select(select).single();
  if (error) throw error;
  return data as ProductionRequest;
}

export async function transitionProductionRequest(
  id: string, status: ProductionStatus, note: string,
) {
  const actor = await requirePlatformAdmin();
  const { data: current, error: readError } = await admin()
    .from("wf_employer_training_production_requests")
    .select("status,metadata").eq("production_request_id", id).maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Response("Request not found", { status: 404 });
  const from = productionStatuses.indexOf(current.status as ProductionStatus);
  const to = productionStatuses.indexOf(status);
  if (to < 0 || to !== from + 1)
    throw new Response("Choose the next production stage", { status: 409 });
  const { data, error } = await admin().from("wf_employer_training_production_requests")
    .update({
      status,
      updated_at: new Date().toISOString(),
      metadata: { ...(current.metadata ?? {}), last_actor_auth_user_id: actor.authUserId, status_note: clean(note, 1000) },
    }).eq("production_request_id", id).eq("status", current.status).select(select).maybeSingle();
  if (error) throw error;
  if (!data) throw new Response("Request changed; refresh and retry", { status: 409 });
  return data as ProductionRequest;
}
