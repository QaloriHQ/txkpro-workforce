"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { createBrowserSupabaseClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Supabase is not configured yet. Use a demo workspace or add the environment variables from .env.example.");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
        <p>Access your student, educator, employer, or TXKPRO operations workspace.</p>
        <form className="form-stack" onSubmit={submit}>
          <label><span>Email</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label><span>Password</span><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="button button-dark button-block" type="submit">Continue</button>
        </form>
        {message ? <div className="alert" style={{ marginTop: 14 }}>{message}</div> : null}
        <p className="footer-note">No backend yet? Preview <Link href="/demo/student"><strong>Student</strong></Link>, <Link href="/demo/educator"><strong>Educator</strong></Link>, <Link href="/demo/employer"><strong>Employer</strong></Link>, or <Link href="/demo/admin"><strong>Admin</strong></Link>.</p>
      </section>
    </main>
  );
}
