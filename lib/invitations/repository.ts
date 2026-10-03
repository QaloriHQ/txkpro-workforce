import "server-only";

import { getPublicAppOrigin } from "@/lib/site-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  InvitationAcceptResult,
  InvitationCreateInput,
  InvitationCreateResult,
  InvitationRecord,
} from "@/lib/invitations/types";

function invitationError(error: { message?: string }) {
  const message = error.message ?? "Invitation request failed.";
  if (/denied|permission|forbidden|scope|membership/i.test(message)) {
    throw new Response(message, { status: 403 });
  }
  if (/not found/i.test(message)) {
    throw new Response(message, { status: 404 });
  }
  if (/no longer active|expired|revoked|cancelled|only pending/i.test(message)) {
    throw new Response(message, { status: 409 });
  }
  if (/required|invalid|must|email does not match/i.test(message)) {
    throw new Response(message, { status: 400 });
  }
  throw new Error(message);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) invitationError(error);
  return data as T;
}

function withActivationUrl(result: InvitationCreateResult) {
  if (!result.activationPath) return result;
  return {
    ...result,
    activationUrl: `${getPublicAppOrigin()}${result.activationPath}`,
  };
}

export async function createInvitation(input: InvitationCreateInput) {
  const result = await rpc<InvitationCreateResult>("invitation_create", {
    p_email: input.email,
    p_role: input.role,
    p_scope_type: input.scopeType,
    p_scope_id: input.scopeId ?? null,
    p_metadata: input.metadata ?? {},
    p_expires_hours: input.expiresHours ?? 168,
  });
  return withActivationUrl(result);
}

export async function createBulkInvitations(inputs: InvitationCreateInput[]) {
  const result = await rpc<{ ok: boolean; results: InvitationCreateResult[] }>(
    "invitation_bulk_create",
    {
      p_invitations: inputs.map((input) => ({
        email: input.email,
        role: input.role,
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? null,
        metadata: input.metadata ?? {},
        expiresHours: input.expiresHours ?? 168,
      })),
    },
  );
  return {
    ...result,
    results: result.results.map(withActivationUrl),
  };
}

export async function listInvitations(filters: {
  scopeType?: string | null;
  scopeId?: string | null;
  status?: string | null;
  query?: string | null;
} = {}) {
  return rpc<InvitationRecord[]>("invitation_list", {
    p_scope_type: filters.scopeType ?? null,
    p_scope_id: filters.scopeId ?? null,
    p_status: filters.status ?? null,
    p_query: filters.query ?? null,
  });
}

export async function resendInvitation(invitationId: string) {
  const result = await rpc<InvitationCreateResult>("invitation_resend", {
    p_invitation_id: invitationId,
  });
  return withActivationUrl(result);
}

export async function revokeInvitation(invitationId: string, reason?: string | null) {
  return rpc<{ ok: boolean; invitationId: string; status: string }>(
    "invitation_revoke",
    {
      p_invitation_id: invitationId,
      p_reason: reason ?? null,
    },
  );
}

export async function acceptInvitation(token: string) {
  return rpc<InvitationAcceptResult>("invitation_accept", { p_token: token });
}
