"use client";
import { FormEvent,useState } from "react";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/site-url";

export function ExternalApplicantAccess({next}:{next:string}){const[email,setEmail]=useState("");const[message,setMessage]=useState<string|null>(null);const[busy,setBusy]=useState(false);
async function submit(event:FormEvent){event.preventDefault();setBusy(true);setMessage(null);const supabase=createBrowserSupabaseClient();const{error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:true,emailRedirectTo:getAuthCallbackUrl(next)}});setBusy(false);setMessage(error?error.message:"Check your email for a secure sign-in link. It returns you to this application and does not create an employer or Student membership.");}
return <form className="card form-stack" onSubmit={submit}><EnvelopeIcon width={28} aria-hidden="true"/><h2>Verify your email to apply</h2><p className="card-sub">Students can use their TXKPRO email. External applicants receive limited access to their own application only.</p><label><span>Email address</span><input className="input" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event)=>setEmail(event.target.value)}/></label><button className="button button-brand" disabled={busy}>{busy?"Sending secure link…":"Email me a secure link"}</button>{message?<div className="alert" role="status">{message}</div>:null}</form>}
