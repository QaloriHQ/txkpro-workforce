import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditResult = "success" | "denied" | "failed";

export async function audit(input: {
  actorProfileId?: string | null;
  actorAuthUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  employerId?: string | null;
  institutionId?: string | null;
  studentId?: string | null;
  result?: AuditResult;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  source?: string;
}) {
  const admin = createAdminClient();
  const payload: Record<string, unknown> = {
    actor_auth_user_id: input.actorAuthUserId ?? null,
    actor_user_id: input.actorProfileId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    employer_id: input.employerId ?? null,
    institution_id: input.institutionId ?? null,
    student_id: input.studentId ?? null,
    result: input.result ?? "success",
    before_json: input.oldValue ?? null,
    after_json: input.newValue ?? null,
    source: input.source ?? "workforce-web",
    metadata: input.metadata ?? {},
  };
  if (input.correlationId) payload.correlation_id = input.correlationId;

  const { error } = await admin.from("platform_audit_events").insert(payload);
  if (error) throw error;
}
