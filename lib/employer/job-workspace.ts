import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type JobWorkspacePerson = { userId: string; name: string; role: string };
export type JobWorkspaceCrew = { id: string; name: string; description: string | null; memberCount: number };
export type JobWorkspaceAssignments = {
  canManageAssignments: boolean;
  people: JobWorkspacePerson[];
  hiringTeamUserIds: string[];
  crews: JobWorkspaceCrew[];
  crewIds: string[];
};

function normalize(value: unknown): JobWorkspaceAssignments {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    canManageAssignments: input.canManageAssignments === true,
    people: Array.isArray(input.people) ? input.people as JobWorkspacePerson[] : [],
    hiringTeamUserIds: Array.isArray(input.hiringTeamUserIds) ? input.hiringTeamUserIds.filter((id): id is string => typeof id === "string") : [],
    crews: Array.isArray(input.crews) ? input.crews as JobWorkspaceCrew[] : [],
    crewIds: Array.isArray(input.crewIds) ? input.crewIds.filter((id): id is string => typeof id === "string") : [],
  };
}

export async function getJobWorkspaceAssignments(employerId: string, jobId: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("wf_ats_job_workspace", { p_employer: employerId, p_job: jobId });
  if (error) throw error;
  return normalize(data);
}

export async function replaceJobWorkspaceAssignments(input: {
  employerId: string;
  jobId: string;
  hiringTeamUserIds: string[];
  crewIds: string[];
}) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("wf_ats_job_assignment_action", {
    p_input: { op: "replace", ...input },
  });
  if (error) {
    if (error.code === "42501") throw new Response("Job assignment scope denied", { status: 403 });
    throw error;
  }
  return normalize(data);
}
