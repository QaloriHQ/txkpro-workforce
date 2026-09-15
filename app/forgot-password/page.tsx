"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAuthCallbackUrl } from "@/lib/site-url";
import { createBrowserSupabaseClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const redirectTo = getAuthCallbackUrl("/reset-password");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.");
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="auth-toolbar"><Brand /><ThemeToggle /></div>
        <h1>Reset your password</h1>
        <p>Enter the email address connected to your TXKPRO Workforce account. We’ll send a secure recovery link back to this public app URL.</p>
        <form className="form-stack" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="button button-dark button-block" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>
        {message ? <div className="alert" style={{ marginTop: 14 }}>{message}</div> : null}
        <p className="footer-note"><Link href="/login"><strong>Back to sign in</strong></Link></p>
      </section>
    </main>
  );
}
