import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EmployerContext } from "@/lib/employer/types";
import {
  STARTER_PIPELINE, isPipelineConfigurator, isPipelinePublisher,
  validatePipelineGraph, validatePipelineName,
  type PipelineGraph, type PipelineTemplateSummary, type PipelineVersionSummary,
} from "@/lib/employer/ats-pipelines";

const TEMPLATES = "wf_ats_pipeline_templates";
const VERSIONS = "wf_ats_pipeline_versions";
function denied(message: string): never { throw new Response(message, { status: 403 }); }
function missing(): never { throw new Response("Pipeline not found", { status: 404 }); }
function conflict(message: string): never { throw new Response(message, { status: 409 }); }
function requireEditor(context: EmployerContext) {
  if (!isPipelineConfigurator(context.role)) denied("Pipeline configuration requires Employer Owner, Admin or Recruiter");
}
function inputObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Pipeline request must be an object");
  return input as Record<string, unknown>;
}
function parseFields(input: unknown): { name: string; description: string; graph: PipelineGraph } {
  const v = inputObject(input);
  if (Object.keys(v).some((key) => !["name", "description", "graph"].includes(key))) {
    throw new Error("Unsupported pipeline field");
  }
  const name = validatePipelineName(v.name);
  const description = typeof v.description === "string" && v.description.length <= 600 ? v.description.trim() : "";
  const graph = validatePipelineGraph(v.graph ?? STARTER_PIPELINE, false);
  return { name, description, graph };
}
function mapTemplate(row: Record<string, unknown>, versions: PipelineVersionSummary[] = []): PipelineTemplateSummary {
  return {
    id: String(row.id), employerId: String(row.employer_id),
    name: String(row.name), description: String(row.description ?? ""),
    graph: row.graph_json as PipelineGraph, revision: Number(row.revision),
    latestVersion: versions.filter((v) => v.templateId === row.id).reduce((n, v) => Math.max(n, v.versionNumber), 0),
    updatedAt: String(row.updated_at), createdAt: String(row.created_at),
  };
}
function mapVersion(row: Record<string, unknown>): PipelineVersionSummary {
  return { id: String(row.id), employerId: String(row.employer_id), templateId: String(row.template_id),
    versionNumber: Number(row.version_number), graph: row.graph_json as PipelineGraph,
    publishedAt: String(row.published_at) };
}
export async function listEmployerPipelines(context: EmployerContext) {
  const client = await createServerSupabaseClient();
  const [{ data: rows, error }, { data: versions, error: versionsError }] = await Promise.all([
    client.from(TEMPLATES).select("*").eq("employer_id", context.employerId)
      .order("updated_at", { ascending: false }).limit(100),
    client.from(VERSIONS).select("*").eq("employer_id", context.employerId)
      .order("published_at", { ascending: false }).limit(200),
  ]);
  if (error) throw error;
  if (versionsError) throw versionsError;
  const mappedVersions = (versions ?? []).map((r) => mapVersion(r));
  return {
    pipelines: (rows ?? []).map((r) => mapTemplate(r, mappedVersions)),
    versions: mappedVersions,
  };
}
export async function getEmployerPipeline(context: EmployerContext, id: string): Promise<PipelineTemplateSummary> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from(TEMPLATES).select("*")
    .eq("employer_id", context.employerId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) missing();
  return mapTemplate(data);
}
export async function createEmployerPipeline(context: EmployerContext, input: unknown) {
  requireEditor(context);
  const v = parseFields(input);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from(TEMPLATES).insert({
    employer_id: context.employerId, created_by_user_id: context.legacyUserId,
    name: v.name, description: v.description, graph_json: v.graph,
  }).select("*").single();
  if (error) throw error;
  return mapTemplate(data);
}
export async function saveEmployerPipeline(context: EmployerContext, id: string, revision: number, input: unknown) {
  requireEditor(context);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Valid expected revision required");
  const v = parseFields(input);
  const original = await getEmployerPipeline(context, id);
  if (original.revision !== revision) conflict("Pipeline changed elsewhere. Reload before saving.");
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from(TEMPLATES).update({
    name: v.name, description: v.description, graph_json: v.graph,
  }).eq("id", id).eq("employer_id", context.employerId).eq("revision", revision)
    .select("*").maybeSingle();
  if (error) throw error;
  if (!data) conflict("Pipeline changed while saving. Reload before editing.");
  return mapTemplate(data);
}
export async function duplicateEmployerPipeline(context: EmployerContext, id: string) {
  requireEditor(context);
  const src = await getEmployerPipeline(context, id);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from(TEMPLATES).insert({
    employer_id: context.employerId, created_by_user_id: context.legacyUserId,
    name: (src.name.slice(0, 133) + " (copy)"), description: src.description,
    graph_json: src.graph, source_template_id: src.id,
  }).select("*").single();
  if (error) throw error;
  // Published versions, job assignments, applicants, tasks and integration data
  // are never copied by this operation.
  return mapTemplate(data);
}
export async function publishEmployerPipeline(context: EmployerContext, id: string, revision: number) {
  if (!isPipelinePublisher(context.role)) denied("Only Employer Owner/Admin may publish pipeline versions");
  const src = await getEmployerPipeline(context, id);
  if (src.revision !== revision) conflict("Pipeline changed elsewhere. Reload before publishing.");
  // Validate exact persisted graph with the same rules as the editor before
  // the independently guarded SQL publication transaction.
  validatePipelineGraph(src.graph, true);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("wf_ats_publish_pipeline", {
    p_employer_id: context.employerId, p_template_id: id, p_revision: revision,
  });
  if (error) {
    if (error.code === "40001" || error.code === "23505") conflict("Pipeline version already published or changed. Reload.");
    throw error;
  }
  if (!data) throw new Error("Pipeline publication returned no version");
  return mapVersion(data as Record<string, unknown>);
}
