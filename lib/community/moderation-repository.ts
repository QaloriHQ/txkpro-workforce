import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ModerationAction, ModerationSelfCase, ModerationSeverity, ModerationStatus, ModerationWorkspace } from "@/lib/community/moderation-types";

function failure(error: { message?: string } | null, fallback: string) {
  if (error?.message?.includes("MODERATION_ADMIN_REQUIRED")) return new Response("Platform moderation access is required.", { status: 403 });
  if (error?.message?.includes("RATIONALE_REQUIRED")) return new Response("Enter a clear decision reason (at least 8 characters).", { status: 400 });
  if (error?.message?.includes("TIMED_RESTRICTION_REQUIRED")) return new Response("Choose a duration for this restriction.", { status: 400 });
  return new Response(fallback, { status: 400 });
}

export async function moderationQueue(filters?: { status?: ModerationStatus; severity?: ModerationSeverity }) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_moderation_queue", {
    p_status: filters?.status ?? null, p_severity: filters?.severity ?? null, p_limit: 100,
  });
  if (error) throw failure(error, "The moderation queue could not be loaded.");
  return data as ModerationWorkspace;
}

export async function decideModerationCase(input: { caseId: string; action: ModerationAction; rationale: string; durationHours?: number | null }) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_moderation_decide", {
    p_case_id: input.caseId, p_action: input.action, p_rationale: input.rationale, p_duration_hours: input.durationHours ?? null,
  });
  if (error) throw failure(error, "The moderation action could not be completed.");
  return data as { ok: boolean; caseId: string; action: ModerationAction };
}

export async function submitCommunityReport(input: { targetType: "post" | "comment" | "user"; targetId: string; reason: string; details?: string }) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_report_submit", {
    p_target_type: input.targetType, p_target_id: input.targetId, p_reason: input.reason, p_details: input.details || null,
  });
  if (error) throw failure(error, "The report could not be submitted.");
  return data as { reported: boolean; reportId: string; caseId: string };
}

export async function setCommunityBlock(userId: string, mode: "mute" | "block" | "none") {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_block_set", { p_user_id: userId, p_mode: mode });
  if (error) throw failure(error, "The member preference could not be updated.");
  return data as { userId: string; mode: typeof mode };
}

export async function submitModerationAppeal(caseId: string, statement: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_moderation_appeal", { p_case_id: caseId, p_statement: statement });
  if (error) throw failure(error, "The appeal could not be submitted.");
  return data as { appealId: string; status: "submitted" };
}

export async function moderationSelfCases() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("community_moderation_self");
  if (error) throw failure(error, "Your moderation history could not be loaded.");
  return (data ?? []) as ModerationSelfCase[];
}
