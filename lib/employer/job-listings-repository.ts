import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EmployerContext } from "@/lib/employer/types";
import {
  BLANK_JOB, canCreateJob, canEditJob, canManageJobStatus,
  jobToDatabase, mapJob, parseJobPatch,
  type JobEditableFields, type JobListing,
} from "@/lib/employer/job-listings";

const TABLE = "wf_ats_job_listings";

function forbidden(message: string): never {
  throw new Response(message, { status: 403 });
}
function conflict(message: string): never {
  throw new Response(message, { status: 409 });
}
function requireCreator(context: EmployerContext): void {
  if (!canCreateJob(context.role)) forbidden("This employer role cannot create job listings");
}

export async function listEmployerJobs(context: EmployerContext): Promise<JobListing[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from(TABLE).select("*")
    .eq("employer_id", context.employerId).order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => mapJob(row));
}

export async function getEmployerJob(context: EmployerContext, id: string): Promise<JobListing> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from(TABLE).select("*")
    .eq("employer_id", context.employerId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Response("Job listing not found", { status: 404 });
  return mapJob(data);
}

export async function createEmployerJob(
  context: EmployerContext, input: unknown,
): Promise<JobListing> {
  requireCreator(context);
  const patch = parseJobPatch(input);
  const fields: JobEditableFields = { ...BLANK_JOB, ...patch };
  if (fields.payMin != null && fields.payMax != null && fields.payMin > fields.payMax) {
    throw new Response("Minimum pay cannot exceed maximum pay", { status: 400 });
  }
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from(TABLE).insert({
    ...jobToDatabase(fields),
    employer_id: context.employerId,
    created_by_user_id: context.legacyUserId,
    status: "draft",
  }).select("*").single();
  if (error) throw error;
  return mapJob(data);
}

export async function updateEmployerJob(
  context: EmployerContext, id: string, revision: number, input: unknown,
): Promise<JobListing> {
  const original = await getEmployerJob(context, id);
  if (!canEditJob(context.role, context.legacyUserId, original.assignedHiringManagerUserId)) {
    forbidden("This employer role cannot edit the listing");
  }
  if (original.status !== "draft") conflict("Only draft listings can be edited");
  if (original.revision !== revision) conflict("This job was edited elsewhere. Reload before saving.");
  const patch = parseJobPatch(input);
  const fields = { ...original, ...patch };
  if (fields.payMin != null && fields.payMax != null && fields.payMin > fields.payMax) {
    throw new Response("Minimum pay cannot exceed maximum pay", { status: 400 });
  }
  const client = await createServerSupabaseClient();
  // The DB trigger owns revision increments. The compare-and-swap WHERE clause
  // prevents two editors from silently overwriting the same revision.
  const { data, error } = await client.from(TABLE).update(jobToDatabase(patch))
    .eq("employer_id", context.employerId).eq("id", id).eq("revision", revision)
    .select("*").maybeSingle();
  if (error) throw error;
  if (!data) conflict("This job changed while you were editing it. Reload before saving.");
  return mapJob(data);
}

export async function duplicateEmployerJob(
  context: EmployerContext, sourceId: string,
): Promise<JobListing> {
  requireCreator(context);
  const source = await getEmployerJob(context, sourceId);
  const title = source.title ? source.title.slice(0, 173) + " (copy)" : "";
  const fields: JobEditableFields = {
    title, summary: source.summary, description: source.description,
    locationCity: source.locationCity, locationState: source.locationState,
    remotePolicy: source.remotePolicy, employmentType: source.employmentType,
    payMin: source.payMin, payMax: source.payMax, payPeriod: source.payPeriod,
    shiftText: source.shiftText, requirements: source.requirements,
    benefits: source.benefits, skills: source.skills,
    applicationInstructions: source.applicationInstructions,
    isTemplate: source.isTemplate,
  };
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from(TABLE).insert({
    ...jobToDatabase(fields), employer_id: context.employerId,
    created_by_user_id: context.legacyUserId,
    source_job_listing_id: source.id,
    status: "draft",
    // Never copy an active pipeline binding or publication metadata.
  }).select("*").single();
  if (error) throw error;
  return mapJob(data);
}

export async function archiveEmployerJob(
  context: EmployerContext, id: string, revision: number,
): Promise<JobListing> {
  if (!canManageJobStatus(context.role)) forbidden("Only Employer Owner/Admin may archive a listing");
  const source = await getEmployerJob(context, id);
  if (source.revision !== revision) conflict("The listing changed. Reload before archiving.");
  if (source.status !== "draft") conflict("Only unpublished drafts may be archived in ATS-01");
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from(TABLE).update({ status: "archived" })
    .eq("employer_id", context.employerId).eq("id", id).eq("revision", revision)
    .select("*").maybeSingle();
  if (error) throw error;
  if (!data) conflict("The listing changed. Reload before archiving.");
  return mapJob(data);
}
