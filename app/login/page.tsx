"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAuthCallbackUrl } from "@/lib/site-url";
import { createBrowserSupabaseClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Supabase is not configured yet. Add the environment variables from .env.example.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setMessage(
        error.code === "invalid_credentials"
          ? "Email or password is incorrect. Use Forgot password or request a one-time sign-in link below."
          : error.message,
      );
      return;
    }
    window.location.replace("/dashboard");
  }

  async function sendSignInLink() {
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Supabase is not configured yet. Add the environment variables from .env.example.");
      return;
    }
    if (!email.trim()) {
      setMessage("Enter your email address first.");
      return;
    }

    setLinkBusy(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: getAuthCallbackUrl("/dashboard"),
      },
    });
    setLinkBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("A one-time sign-in link has been sent. Check your inbox and spam folder.");
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="auth-toolbar"><Brand /><ThemeToggle /></div>
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
          <button className="button button-dark button-block" type="submit" disabled={busy || linkBusy}>{busy ? "Signing in…" : "Continue"}</button>
        </form>
        <button
          className="button button-ghost button-block"
          type="button"
          disabled={busy || linkBusy}
          onClick={sendSignInLink}
          style={{ marginTop: 10 }}
        >
          {linkBusy ? "Sending link…" : "Email me a one-time sign-in link"}
        </button>
        {message ? <div className="alert" style={{ marginTop: 14 }}>{message}</div> : null}
        <p className="footer-note">New to TXKPRO Workforce? <Link href="/signup"><strong>Create an account</strong></Link>.</p>
      </section>
    </main>
  );
}
