import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPublicAppOrigin } from "@/lib/site-url";
import type {
  WorkforceInvitation,
  WorkforceInvitationAcceptance,
  WorkforceInvitationCreateInput,
} from "@/lib/invitations/types";

const DEFAULT_INVITATION_TTL_HOURS = 168;
const MAX_INVITATION_TTL_HOURS = 720;

function invitationTtlHours() {
  const configured = Number(process.env.TXKPRO_INVITATION_TTL_HOURS);
  if (
    Number.isFinite(configured) &&
    configured >= 1 &&
    configured <= MAX_INVITATION_TTL_HOURS
  ) {
    return configured;
  }
  return DEFAULT_INVITATION_TTL_HOURS;
}

function invitationExpiresAt() {
  return new Date(
    Date.now() + invitationTtlHours() * 60 * 60 * 1000,
  ).toISOString();
}

function invitationError(error: { message?: string }) {
  const message = error.message ?? "Invitation request failed.";
  if (/denied|authorization|forbidden|membership required|scope/i.test(message)) {
    throw new Response(message, { status: 403 });
  }
  if (/not found/i.test(message)) {
    throw new Response(message, { status: 404 });
  }
  if (/already active|already accepted|no longer pending/i.test(message)) {
    throw new Response(message, { status: 409 });
  }
  if (/invalid|required|expiration|email|unsupported|revoked|cancelled/i.test(message)) {
    throw new Response(message, { status: 400 });
  }
  throw new Error(message);
}

async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) invitationError(error);
  return data as T;
}

async function serviceRpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function activationUrl(invitationId: string) {
  const url = new URL("/invitations/accept", getPublicAppOrigin());
  url.searchParams.set("id", invitationId);
  return url.toString();
}

async function markDelivery(
  invitationId: string,
  status: "sent" | "failed",
  error?: string | null,
) {
  try {
    await serviceRpc<WorkforceInvitation>("workforce_invitation_mark_delivery", {
      p_invitation_id: invitationId,
      p_status: status,
      p_error: error ?? null,
    });
  } catch (markError) {
    if (status === "sent") throw markError;
  }
}

async function deliverInvitation(invitation: WorkforceInvitation) {
  const admin = createAdminClient();
  const redirectTo = activationUrl(invitation.invitationId);

  try {
    const resolved = await serviceRpc<WorkforceInvitation>(
      "workforce_invitation_resolve_identity",
      { p_invitation_id: invitation.invitationId },
    );
    let authUserId = resolved.targetAuthUserId;

    if (authUserId) {
      const { error } = await admin.auth.signInWithOtp({
        email: invitation.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(
        invitation.email,
        {
          redirectTo,
          data: {
            invitation_id: invitation.invitationId,
            invitation_source: "txkpro_workforce",
          },
        },
      );
      if (error) throw error;
      authUserId = data.user?.id ?? null;
    }

    if (!authUserId) {
      throw new Error("Supabase Auth did not return an invited identity.");
    }

    const linked = await serviceRpc<WorkforceInvitation>(
      "workforce_invitation_link_identity",
      {
        p_invitation_id: invitation.invitationId,
        p_auth_user_id: authUserId,
      },
    );
    await markDelivery(invitation.invitationId, "sent");
    return { ...linked, deliveryStatus: "sent" as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invitation delivery failed.";
    await markDelivery(invitation.invitationId, "failed", message);
    throw new Response("Invitation was saved, but the email could not be sent.", {
      status: 502,
    });
  }
}

export async function createAndSendInvitation(
  input: WorkforceInvitationCreateInput,
) {
  const invitation = await rpc<WorkforceInvitation>(
    "workforce_invitation_create",
    {
      p_email: input.email,
      p_role: input.role,
      p_scope_type: input.scopeType,
      p_scope_id: input.scopeId ?? null,
      p_institution_id: input.institutionId ?? null,
      p_contractor_id: input.contractorId ?? null,
      p_expires_at: invitationExpiresAt(),
      p_source: input.source ?? "individual",
      p_metadata: input.metadata ?? {},
    },
  );
  return deliverInvitation(invitation);
}

export async function resendInvitation(invitationId: string) {
  const invitation = await rpc<WorkforceInvitation>(
    "workforce_invitation_action",
    {
      p_invitation_id: invitationId,
      p_action: "resend",
      p_expires_at: invitationExpiresAt(),
    },
  );
  return deliverInvitation(invitation);
}

export async function closeInvitation(
  invitationId: string,
  action: "revoke" | "cancel",
) {
  return rpc<WorkforceInvitation>("workforce_invitation_action", {
    p_invitation_id: invitationId,
    p_action: action,
    p_expires_at: null,
  });
}

export async function listManageableInvitations(filters: {
  institutionId?: string | null;
  contractorId?: string | null;
  status?: string | null;
} = {}) {
  return rpc<WorkforceInvitation[]>("workforce_invitations_list", {
    p_institution_id: filters.institutionId ?? null,
    p_contractor_id: filters.contractorId ?? null,
    p_status: filters.status ?? null,
  });
}

export async function expireManageableInvitations() {
  return rpc<number>("workforce_invitations_expire", {});
}

export async function getMyInvitation(invitationId: string) {
  return rpc<WorkforceInvitation>("workforce_my_invitation", {
    p_invitation_id: invitationId,
  });
}

export async function acceptMyInvitation(invitationId: string) {
  return rpc<WorkforceInvitationAcceptance>("workforce_invitation_accept", {
    p_invitation_id: invitationId,
  });
}
