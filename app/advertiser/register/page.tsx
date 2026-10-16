"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/site-url";

export default function AdvertiserRegisterPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: getAuthCallbackUrl("/advertiser/onboarding"), data: { requested_role: "advertiser", first_name: String(form.get("firstName") ?? ""), last_name: String(form.get("lastName") ?? "") } } });
    setBusy(false);
    if (error) return setMessage(error.message);
    if (data.session) window.location.replace("/advertiser/onboarding");
    else setMessage("Check your email to confirm your address, then finish setting up Ads Manager.");
  }
  return <main className="auth-wrap"><section className="auth-card advertiser-auth-card"><div className="auth-toolbar"><Brand/><ThemeToggle/></div><p className="eyebrow">TXKPRO advertising</p><h1>Create an advertiser account</h1><p>Sign up and use Ads Manager immediately. Every funded campaign is reviewed by platform Admin before it can publish or run.</p><form className="form-stack" onSubmit={submit}><div className="grid-2"><label><span>First name</span><input className="input" name="firstName" autoComplete="given-name" required/></label><label><span>Last name</span><input className="input" name="lastName" autoComplete="family-name" required/></label></div><label><span>Work email</span><input className="input" name="email" type="email" autoComplete="email" required/></label><label><span>Password</span><input className="input" name="password" type="password" minLength={8} autoComplete="new-password" required/></label><button className="button button-brand button-block" disabled={busy}>{busy?"Creating account…":"Create account"}</button></form>{message?<div className="alert" role="status">{message}</div>:null}<p className="footer-note">Already registered? <Link href="/login"><strong>Sign in</strong></Link>.</p></section></main>;
}
