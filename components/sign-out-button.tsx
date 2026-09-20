"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton({
  className = "button button-dark button-small",
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // The server route below is the fallback for cookie/session cleanup.
    }

    try {
      await fetch("/auth/signout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // Navigation still proceeds so the user is never stranded on a POST/data page.
    }

    window.location.replace("/login?loggedOut=1");
  }

  return (
    <button
      className={className}
      type="button"
      onClick={signOut}
      disabled={busy}
    >
      {busy ? "Signing out…" : label}
    </button>
  );
}
