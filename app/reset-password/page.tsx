"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import { createBrowserSupabaseClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [validRecoverySession, setValidRecoverySession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    async function verifyRecoverySession() {
      if (!hasSupabaseBrowserConfig()) {
        if (active) {
          setMessage("Supabase is not configured yet.");
          setChecking(false);
        }
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.getUser();
      if (active) {
        setValidRecoverySession(!error && Boolean(data.user));
        setChecking(false);
      }
    }
    void verifyRecoverySession();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    if (!validRecoverySession) {
      setMessage("This recovery link is invalid or has expired. Request a new reset link.");
      return;
    }

    setBusy(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) await supabase.auth.signOut();
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setComplete(true);
    setMessage("Your password has been updated. You can now sign in with your new password.");
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <Brand />
        <h1>Choose a new password</h1>
        <p>Create a new password for your TXKPRO Workforce account.</p>

        {checking ? <div className="alert">Checking recovery link…</div> : null}
        {!checking && !validRecoverySession && !complete ? (
          <div className="alert">
            This recovery link is invalid or has expired. <Link href="/forgot-password"><strong>Request a new link</strong></Link>.
          </div>
        ) : null}

        {!checking && validRecoverySession && !complete ? (
          <form className="form-stack" onSubmit={submit}>
            <label>
              <span>New password</span>
              <input className="input" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label>
              <span>Confirm new password</span>
              <input className="input" type="password" minLength={8} autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </label>
            <button className="button button-dark button-block" type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
          </form>
        ) : null}

        {message ? <div className="alert" style={{ marginTop: 14 }}>{message}</div> : null}
        <p className="footer-note"><Link href="/login"><strong>Back to sign in</strong></Link></p>
      </section>
    </main>
  );
}
