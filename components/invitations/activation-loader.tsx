"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { InvitationActivationCard } from "@/components/invitation-activation-card";
import type { UserInvitationRecipient } from "@/lib/invitations/service";

export function ActivationLoader({ invitationId }: { invitationId: string }) {
  const [invitation, setInvitation] = useState<UserInvitationRecipient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootstrap = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        bootstrap.current ??= (async () => {
        const client = createBrowserSupabaseClient();
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const query = new URLSearchParams(window.location.search);
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const tokenHash = query.get("token_hash");
        const type = query.get("type");
        // Remove credentials from the address bar before any further request.
        window.history.replaceState(null, "", `/invitations/activate?id=${encodeURIComponent(invitationId)}`);
        if (hash.has("error") || query.has("error")) throw new Error("This email link has expired or is invalid. Request a resend.");
        if (accessToken && refreshToken) {
          const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw new Error("This email link has expired or is invalid. Request a resend.");
        } else if (tokenHash && (type === "invite" || type === "email")) {
          const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw new Error("This email link has expired or is invalid. Request a resend.");
        }
        })();
        await bootstrap.current;
        const response = await fetch(`/api/invitations/${encodeURIComponent(invitationId)}/accept`, { cache: "no-store" });
        const payload = await response.json();
        if (response.status === 401) {
          window.location.replace(`/login?next=${encodeURIComponent(`/invitations/activate?id=${invitationId}`)}`);
          return;
        }
        if (!response.ok) throw new Error("This invitation is unavailable for the signed-in account. Sign in with the invited email or ask your administrator for help.");
        if (!cancelled) setInvitation(payload.data);
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "Unable to load invitation.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [invitationId]);
  if (error) return <p className="alert" role="alert">{error}</p>;
  if (!invitation) return <p role="status">Checking your invitation…</p>;
  return <InvitationActivationCard {...invitation} />;
}
