import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditResult } from "@/lib/audit";

export async function emitWorkforceEvent(input: {
  eventType: string;
  targetType: string;
  targetId?: string | null;
  employerId?: string | null;
  institutionId?: string | null;
  studentId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  result?: AuditResult;
  eventKey?: string | null;
  correlationId?: string | null;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("wf_emit_event", {
    p_event_type: input.eventType,
    p_target_type: input.targetType,
    p_target_id: input.targetId ?? null,
    p_employer_id: input.employerId ?? null,
    p_institution_id: input.institutionId ?? null,
    p_student_id: input.studentId ?? null,
    p_before: input.before ?? null,
    p_after: input.after ?? null,
    p_metadata: input.metadata ?? {},
    p_result: input.result ?? "success",
    p_event_key: input.eventKey ?? null,
    p_correlation_id: input.correlationId ?? null,
  });
  if (error) throw error;
  return data as string;
}
