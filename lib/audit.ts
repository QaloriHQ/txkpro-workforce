import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function audit(input: {
  actorProfileId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  source?: string;
}) {
  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_profile_id: input.actorProfileId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    old_value_json: input.oldValue ?? null,
    new_value_json: input.newValue ?? null,
    source_app: input.source ?? "workforce-web",
  });
}
