"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EnvelopeOpenIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Card, StatusBadge } from "@/components/design-system";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { WorkforceInvitation } from "@/lib/invitations/types";

type State =
  | { kind: "checking" }
  | { kind: "signin" }
  | { kind: "ready"; invitation: WorkforceInvitation }
  | { kind: "busy"; invitation: WorkforceInvitation }
  | { kind: "error"; message: string; invitation?: WorkforceInvitation };

export function InvitationAcceptance({
  invitationId,
}: {
  invitationId: string;
}) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const loading = useRef(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;

    async function loadInvitation() {
      if (loading.current) return;
      loading.current = true;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!active) return;
        if (!session) {
          setState({ kind: "signin" });
          return;
        }

        const response = await fetch(
          `/api/invitations/accept?invitationId=${encodeURIComponent(invitationId)}`,
          { cache: "no-store" },
        );
        const body = await response.json();
        if (!active) return;
        if (!response.ok) {
          setState({
            kind: "error",
            message: body.error ?? "Unable to load this invitation.",
          });
          return;
        }
        setState({ kind: "ready", invitation: body.invitation });
      } finally {
        loading.current = false;
      }
    }

    void loadInvitation();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && active) {
        loading.current = false;
        void loadInvitation();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [invitationId]);

  async function accept(invitation: WorkforceInvitation) {
    setState({ kind: "busy", invitation });
    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setState({
        kind: "error",
        message: body.error ?? "Unable to accept this invitation.",
        invitation,
      });
      return;
    }
    window.location.replace(body.redirectTo ?? "/");
  }

  if (state.kind === "checking") {
    return (
      <Card>
        <p className="eyebrow">Secure invitation</p>
        <h1>Checking your invitation…</h1>
        <p className="muted">Confirming the signed-in account before any role or scope is activated.</p>
      </Card>
    );
  }

  if (state.kind === "signin") {
    return (
      <Card>
        <EnvelopeOpenIcon aria-hidden="true" className="txk-empty-icon" />
        <h1>Sign in to continue</h1>
        <p className="muted">
          Open the one-time link from your invitation email. If you are already
          a TXKPRO user, sign in with the invited email address and reopen the
          invitation.
        </p>
        <Link className="txk-button txk-button-primary txk-button-md" href="/login">
          Sign in
        </Link>
      </Card>
    );
  }

  const invitation =
    state.kind === "ready" || state.kind === "busy" || state.kind === "error"
      ? state.invitation
      : undefined;

  if (state.kind === "error" && !invitation) {
    return (
      <Card>
        <h1>Invitation unavailable</h1>
        <p className="muted">{state.message}</p>
        <Link className="txk-button txk-button-default txk-button-md" href="/">
          Return to TXKPRO
        </Link>
      </Card>
    );
  }

  if (!invitation) return null;

  return (
    <Card>
      <div className="institution-student-directory-head">
        <ShieldCheckIcon aria-hidden="true" />
        <div>
          <p className="eyebrow">TXKPRO Workforce invitation</p>
          <h1>Review your access</h1>
          <p className="muted">
            Access is granted only after this signed-in account matches the
            invited email and the server revalidates the requested scope.
          </p>
        </div>
        <StatusBadge
          tone={invitation.status === "pending" ? "warning" : invitation.status === "accepted" ? "success" : "neutral"}
        >
          {invitation.status}
        </StatusBadge>
      </div>

      <dl className="institution-detail-list">
        <div>
          <dt>Invited email</dt>
          <dd>{invitation.email}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{invitation.role.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>{invitation.scopeLabel ?? invitation.scopeId ?? invitation.scopeType}</dd>
        </div>
        {invitation.institutionName ? (
          <div>
            <dt>Institution</dt>
            <dd>{invitation.institutionName}</dd>
          </div>
        ) : null}
        {invitation.contractorName ? (
          <div>
            <dt>Employer</dt>
            <dd>{invitation.contractorName}</dd>
          </div>
        ) : null}
        <div>
          <dt>Expires</dt>
          <dd>{new Date(invitation.expiresAt).toLocaleString()}</dd>
        </div>
      </dl>

      {state.kind === "error" ? (
        <p className="form-error" role="alert">{state.message}</p>
      ) : null}

      {invitation.status === "pending" ? (
        <button
          className="txk-button txk-button-primary txk-button-md"
          type="button"
          disabled={state.kind === "busy"}
          onClick={() => void accept(invitation)}
        >
          {state.kind === "busy" ? "Accepting…" : "Accept invitation"}
        </button>
      ) : invitation.status === "accepted" ? (
        <button
          className="txk-button txk-button-primary txk-button-md"
          type="button"
          onClick={() => void accept(invitation)}
        >
          Continue
        </button>
      ) : (
        <p className="muted">
          This invitation cannot activate access. Ask the organization that
          invited you to send a new invitation.
        </p>
      )}
    </Card>
  );
}
