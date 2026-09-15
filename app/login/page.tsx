"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { createBrowserSupabaseClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Supabase is not configured yet. Add the environment variables from .env.example.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <Brand />
        <h1>Sign in</h1>
        <p>Access your TXKPRO Workforce account, onboarding, and role-specific workspace.</p>
        <form className="form-stack" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span>Password</span>
              <Link href="/forgot-password" style={{ fontSize: 13, fontWeight: 700 }}>Forgot password?</Link>
            </span>
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="button button-dark button-block" type="submit" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
        </form>
        {message ? <div className="alert" style={{ marginTop: 14 }}>{message}</div> : null}
        <p className="footer-note">New to TXKPRO Workforce? <Link href="/signup"><strong>Create an account</strong></Link>.</p>
      </section>
    </main>
  );
}
