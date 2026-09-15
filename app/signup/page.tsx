"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";
import { createBrowserSupabaseClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

const publicRoles: Array<{ value: Exclude<Role, "admin">; title: string; copy: string }> = [
  { value: "student", title: "Student", copy: "Build a verified skills profile and connect with local employers." },
  { value: "educator", title: "Educator", copy: "Verify student skills, refer talent, and support placement outcomes." },
  { value: "employer", title: "Employer", copy: "Create a hiring profile and find job-ready local talent." },
];

export default function SignupPage() {
  const [role, setRole] = useState<Exclude<Role, "admin">>("student");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Supabase is not configured. Add the values from .env.example first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(`/onboarding?role=${role}`)}`,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          requested_role: role,
        },
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data.session) {
      window.location.href = `/onboarding?role=${role}`;
      return;
    }
    setMessage("Check your email to confirm your account. After confirmation, TXKPRO will continue your onboarding.");
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card auth-card-wide">
        <Brand />
        <h1>Create your account</h1>
        <p>Choose the TXKPRO Workforce experience that matches how you participate in the local skilled-trades network.</p>

        <form className="form-stack" onSubmit={submit}>
          <div className="role-grid" role="radiogroup" aria-label="Account type">
            {publicRoles.map((item) => (
              <button
                className={role === item.value ? "role-option selected" : "role-option"}
                key={item.value}
                onClick={() => setRole(item.value)}
                type="button"
                aria-pressed={role === item.value}
              >
                <strong>{item.title}</strong>
                <span>{item.copy}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-2">
            <label><span>First name</span><input className="input" required value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
            <label><span>Last name</span><input className="input" required value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
          </div>
          <label><span>Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label><span>Password</span><input className="input" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="button button-dark button-block" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
        </form>
        {message ? <div className="alert" style={{ marginTop: 14 }}>{message}</div> : null}
        <p className="footer-note">Already have an account? <Link href="/login"><strong>Sign in</strong></Link>. TXKPRO administrator accounts are provisioned internally and are not available through public registration.</p>
      </section>
    </main>
  );
}
