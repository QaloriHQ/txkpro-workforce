import "server-only";

import { getAuthCallbackUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UserInvitationCreateInput = {
  email: string;
  role: string;
  scopeType: string;
  scopeId?: string | null;
  institutionId?: string | null;
  employerId?: string | null;
  idempotencyKey?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type UserInvitationCreateResult = {
  created: boolean;
  invitationId: string;
  status: string;
  deliveryStatus: string;
  expiresAt: string;
  activationPolicy: "auto_activate" | "approval_required";
  recipientExistingIdentity: boolean;
};

export type UserInvitationSummary = {
  invitationId: string;
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  institutionId: string | null;
  employerId: string | null;
  status: string;
  activationPolicy: "auto_activate" | "approval_required";
  expiresAt: string;
  recipientExistingIdentity: boolean;
  deliveryStatus: string;
  deliveryAttemptedAt: string | null;
  lastSentAt: string | null;
  sendCount: number;
  createdAt: string;
  updatedAt: string;
};

export type UserInvitationRecipient = {
  invitationId: string;
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  institutionId: string | null;
  employerId: string | null;
  organizationName: string;
  status: string;
  activationPolicy: "auto_activate" | "approval_required";
  expiresAt: string;
  recipientExistingIdentity: boolean;
};

const DEFAULT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cleanText(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function deliveryErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "delivery_failed";
  const candidate = error as { code?: unknown; status?: unknown; name?: unknown };
  if (typeof candidate.code === "string" && candidate.code.trim()) {
    return candidate.code.trim().slice(0, 120);
  }
  if (typeof candidate.status === "number") return `http_${candidate.status}`;
  if (typeof candidate.name === "string" && candidate.name.trim()) {
    return candidate.name.trim().slice(0, 120);
  }
  return "delivery_failed";
}

async function invitationRow(invitationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wf_user_invitations")
    .select("invitation_id,email,status,expires_at,recipient_existing_identity")
    .eq("invitation_id", invitationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Invitation not found.");

  const { data: user, error: userError } = await admin
    .from("users")
    .select("auth_user_id")
    .ilike("email", data.email)
    .maybeSingle();

  if (userError) throw userError;

  return {
    invitationId: data.invitation_id as string,
    email: data.email as string,
    status: data.status as string,
    expiresAt: data.expires_at as string,
    recipientExistingIdentity: Boolean(data.recipient_existing_identity),
    hasCurrentAuthIdentity: Boolean(user?.auth_user_id),
  };
}

async function recordDelivery(
  invitationId: string,
  success: boolean,
  errorCode?: string | null,
) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("user_invitation_record_delivery", {
    p_invitation_id: invitationId,
    p_success: success,
    p_error_code: errorCode ?? null,
  });
  if (error) throw error;
}

export async function deliverUserInvitation(invitationId: string) {
  const invitation = await invitationRow(invitationId);
  if (invitation.status !== "pending") {
    throw new Error("Only pending invitations can be delivered.");
  }
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    throw new Error("Invitation expired.");
  }

  const callback = getAuthCallbackUrl(
    `/invitations/activate?id=${encodeURIComponent(invitation.invitationId)}`,
  );
  const admin = createAdminClient();

  try {
    if (invitation.hasCurrentAuthIdentity) {
      const { error } = await admin.auth.signInWithOtp({
        email: invitation.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: callback,
        },
      });
      if (error) throw error;
    } else {
      const { error } = await admin.auth.admin.inviteUserByEmail(
        invitation.email,
        {
          redirectTo: callback,
          data: {
            txkpro_invitation_id: invitation.invitationId,
          },
        },
      );
      if (error) throw error;
    }

    await recordDelivery(invitation.invitationId, true);
    return { delivered: true as const };
  } catch (error) {
    const code = deliveryErrorCode(error);
    await recordDelivery(invitation.invitationId, false, code);
    return { delivered: false as const, errorCode: code };
  }
}

export async function createUserInvitation(input: UserInvitationCreateInput) {
  const email = cleanText(input.email, 320).toLowerCase();
  const role = cleanText(input.role, 80).toLowerCase();
  const scopeType = cleanText(input.scopeType, 40).toLowerCase();
  const scopeId = cleanText(input.scopeId, 160) || null;
  const institutionId = cleanText(input.institutionId, 160) || null;
  const employerId = cleanText(input.employerId, 160) || null;
  const idempotencyKey = cleanText(input.idempotencyKey, 240) || null;
  if (!email || !role || !scopeType) {
    throw new Response("email, role, and scopeType are required.", { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const expiresAt = new Date(Date.now() + DEFAULT_INVITATION_TTL_MS).toISOString();
  const { data, error } = await supabase.rpc("user_invitation_create", {
    p_email: email,
    p_role: role,
    p_scope_type: scopeType,
    p_scope_id: scopeId,
    p_institution_id: institutionId,
    p_employer_id: employerId,
    p_expires_at: expiresAt,
    p_idempotency_key: idempotencyKey,
    p_metadata: {
      firstName: cleanText(input.firstName, 100) || null,
      lastName: cleanText(input.lastName, 100) || null,
    },
  });

  if (error) {
    if (/denied|scope|membership/i.test(error.message)) {
      throw new Response(error.message, { status: 403 });
    }
    if (/already active/i.test(error.message)) {
      throw new Response(error.message, { status: 409 });
    }
    if (/required|valid|expiration|maximum/i.test(error.message)) {
      throw new Response(error.message, { status: 400 });
    }
    throw error;
  }

  return data as UserInvitationCreateResult;
}

export async function createAndDeliverUserInvitation(
  input: UserInvitationCreateInput,
) {
  const invitation = await createUserInvitation(input);
  if (!invitation.created) {
    return { invitation, delivery: null };
  }
  const delivery = await deliverUserInvitation(invitation.invitationId);
  return { invitation, delivery };
}

export async function listUserInvitations(filters: {
  institutionId?: string | null;
  employerId?: string | null;
  status?: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("user_invitations_list", {
    p_institution_id: cleanText(filters.institutionId, 160) || null,
    p_employer_id: cleanText(filters.employerId, 160) || null,
    p_status: cleanText(filters.status, 40) || null,
  });
  if (error) {
    if (/denied|scope|membership/i.test(error.message)) {
      throw new Response(error.message, { status: 403 });
    }
    throw error;
  }
  return (data ?? []) as UserInvitationSummary[];
}

export async function getRecipientInvitation(invitationId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("user_invitation_for_recipient", {
    p_invitation_id: cleanText(invitationId, 160),
  });
  if (error) {
    if (/recipient|required|mismatch/i.test(error.message)) {
      throw new Response(error.message, { status: 403 });
    }
    if (/not found/i.test(error.message)) {
      throw new Response(error.message, { status: 404 });
    }
    throw error;
  }
  return data as UserInvitationRecipient;
}

export async function prepareUserInvitationResend(invitationId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("user_invitation_prepare_resend", {
    p_invitation_id: cleanText(invitationId, 160),
  });
  if (error) {
    if (/denied|scope/i.test(error.message)) {
      throw new Response(error.message, { status: 403 });
    }
    if (/only pending|expired/i.test(error.message)) {
      throw new Response(error.message, { status: 409 });
    }
    if (/not found/i.test(error.message)) {
      throw new Response(error.message, { status: 404 });
    }
    throw error;
  }
  return data as { invitationId: string; status: string; expiresAt: string };
}

export async function revokeUserInvitation(
  invitationId: string,
  mode: "revoked" | "cancelled" = "revoked",
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("user_invitation_revoke", {
    p_invitation_id: cleanText(invitationId, 160),
    p_status: mode,
  });
  if (error) {
    if (/denied|scope/i.test(error.message)) {
      throw new Response(error.message, { status: 403 });
    }
    if (/only pending/i.test(error.message)) {
      throw new Response(error.message, { status: 409 });
    }
    if (/not found/i.test(error.message)) {
      throw new Response(error.message, { status: 404 });
    }
    throw error;
  }
  return data as { invitationId: string; status: string };
}

export async function acceptUserInvitation(invitationId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("user_invitation_accept", {
    p_invitation_id: cleanText(invitationId, 160),
  });
  if (error) {
    if (/recipient|required|mismatch/i.test(error.message)) {
      throw new Response(error.message, { status: 403 });
    }
    if (/not active|expired|already accepted/i.test(error.message)) {
      throw new Response(error.message, { status: 409 });
    }
    if (/not found/i.test(error.message)) {
      throw new Response(error.message, { status: 404 });
    }
    throw error;
  }
  return data as {
    invitationId: string;
    status: "accepted";
    role: string;
    scopeType: string;
    scopeId: string | null;
    redirectTo: string;
    idempotent: boolean;
  };
}
