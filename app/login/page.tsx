"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { createBrowserSupabaseClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");

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

  async function sendSignInCode() {
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
      },
    });
    setLinkBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setOtpSent(true);
    setMessage("A one-time sign-in code has been sent. Enter the code from your email below.");
  }

  async function verifySignInCode() {
    if (!email.trim() || !otp.trim()) {
      setMessage("Enter your email address and verification code.");
      return;
    }

    setLinkBusy(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.replace(/\s+/g, ""),
      type: "email",
    });
    setLinkBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.replace("/dashboard");
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
          onClick={sendSignInCode}
          style={{ marginTop: 10 }}
        >
          {linkBusy ? "Sending code…" : "Email me a one-time sign-in code"}
        </button>

        {otpSent ? (
          <div className="form-stack" style={{ marginTop: 12 }}>
            <label>
              <span>Verification code</span>
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="Enter code from email"
              />
            </label>
            <button
              className="button button-brand button-block"
              type="button"
              disabled={linkBusy || !otp.trim()}
              onClick={verifySignInCode}
            >
              {linkBusy ? "Verifying…" : "Verify code and sign in"}
            </button>
          </div>
        ) : null}
        {message ? <div className="alert" style={{ marginTop: 14 }}>{message}</div> : null}
        <p className="footer-note">New to TXKPRO Workforce? <Link href="/signup"><strong>Create an account</strong></Link>.</p>
      </section>
    </main>
  );
}
