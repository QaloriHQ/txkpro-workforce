"use client";
import { FormEvent, useState } from "react";

export function AdvertiserOnboardingForm({email}:{email:string}) {
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState<string|null>(null);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage(null); const f=new FormData(e.currentTarget);
    const r=await fetch("/api/advertiser",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation:"register",displayName:f.get("displayName"),legalName:f.get("legalName"),websiteUrl:f.get("websiteUrl"),contactEmail:f.get("contactEmail")})});
    const data=await r.json(); setBusy(false);
    if(!r.ok) return setMessage(data.error??"Ads Manager setup could not be completed.");
    window.location.replace("/advertiser");
  }
  return <form className="card form-stack" onSubmit={submit}><label><span>Business display name</span><input className="input" name="displayName" required minLength={2} maxLength={120}/></label><label><span>Legal name <small>(optional)</small></span><input className="input" name="legalName" maxLength={160}/></label><label><span>Website <small>(HTTPS)</small></span><input className="input" name="websiteUrl" type="url" pattern="https://.*" placeholder="https://example.com"/></label><label><span>Contact email</span><input className="input" name="contactEmail" type="email" defaultValue={email} required/></label><div className="callout"><strong>Immediate advertiser access</strong><br/>Your Ads Manager workspace opens now. Campaigns must be fully funded and approved by platform Admin before publishing. Advertiser access does not grant Workforce, employer, institution, student, or community-authoring access.</div><button className="button button-brand" disabled={busy}>{busy?"Creating workspace…":"Open Ads Manager"}</button>{message?<div className="alert" role="alert">{message}</div>:null}</form>;
}
