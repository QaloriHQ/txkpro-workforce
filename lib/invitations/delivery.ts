import "server-only";

import type { InvitationCreateResult } from "@/lib/invitations/types";
import { getAuthCallbackUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "delivery_failed";
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    name?: unknown;
  };
  if (typeof candidate.code === "string" && candidate.code.trim()) {
    return candidate.code.trim().slice(0, 120);
  }
  if (typeof candidate.status === "number") {
    return `http_${candidate.status}`;
  }
  if (typeof candidate.name === "string" && candidate.name.trim()) {
    return candidate.name.trim().slice(0, 120);
  }
  return "delivery_failed";
}

async function markDelivery(
  invitationId: string,
  status: "sent" | "failed",
  error?: string | null,
) {
  const admin = createAdminClient();
  const { error: rpcError } = await admin.rpc("invitation_mark_delivery", {
    p_invitation_id: invitationId,
    p_status: status,
    p_error: error ?? null,
  });
  if (rpcError) throw rpcError;
}

async function sendExistingAccountLink(email: string, redirectTo: string) {
  const admin = createAdminClient();
  const { error } = await admin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });
  if (error) throw error;
}

export async function deliverInvitation(
  result: InvitationCreateResult,
): Promise<InvitationCreateResult> {
  if (
    !result.invitationId ||
    !result.email ||
    !result.activationToken ||
    !result.activationPath
  ) {
    return result;
  }

  const callback = getAuthCallbackUrl(result.activationPath);
  const admin = createAdminClient();

  try {
    const { data: user, error: userError } = await admin
      .from("users")
      .select("auth_user_id")
      .eq("email", result.email.toLowerCase())
      .maybeSingle();
    if (userError) throw userError;

    if (user?.auth_user_id) {
      await sendExistingAccountLink(result.email, callback);
    } else {
      const { error } = await admin.auth.admin.inviteUserByEmail(
        result.email,
        {
          redirectTo: callback,
          data: {
            txkpro_invitation_id: result.invitationId,
          },
        },
      );

      if (error) {
        const code =
          typeof error.code === "string" ? error.code.toLowerCase() : "";
        const alreadyExists =
          code === "email_exists" ||
          code === "user_already_exists" ||
          /already.+(?:registered|exists)/i.test(error.message);

        if (!alreadyExists) throw error;
        await sendExistingAccountLink(result.email, callback);
      }
    }

    await markDelivery(result.invitationId, "sent");
    return {
      ...result,
      deliveryStatus: "sent",
      deliveryError: null,
    };
  } catch (error) {
    const code = errorCode(error);
    try {
      await markDelivery(result.invitationId, "failed", code);
    } catch {
      // Keep the original delivery failure as the user-facing result. The
      // server log/check layer will still surface a failed delivery mutation.
    }
    return {
      ...result,
      deliveryStatus: "failed",
      deliveryError: code,
    };
  }
}
