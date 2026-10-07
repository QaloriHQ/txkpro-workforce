"use client";
import {useState} from "react";
import dynamic from "next/dynamic";
import {loadStripe} from "@stripe/stripe-js";
import {ShieldCheckIcon} from "@heroicons/react/24/outline";
import {ActionModal} from "@/components/design-system/action-modal";
import {PURPOSES,consentAccepted,type CardWorkspace,type CardRequest,type PrivateDetails} from "@/lib/authcard/contracts";
const Checkout=dynamic(()=>import("@/components/screening/checkout").then(m=>m.ScreeningCheckout),{ssr:false});
const CANDIDATE_POLICY_URL="https://workforce.txkpro.com/CANDIDATE-BACKGROUND-SCREENING-POLICY";
function CandidatePolicyLink() {
  return <p className="card-sub"><a href={CANDIDATE_POLICY_URL} target="_blank" rel="noopener noreferrer">Candidate Background Screening Policy</a> (opens in a new tab)</p>;
}
type Session={clientSecret:string;publishableKey:string};
type Documents={message:string;invoiceUrl?:string;invoicePdfUrl?:string;receiptUrl?:string};
export function AuthCardWorkspace({initial,configured}:{initial:CardWorkspace;configured:boolean}) {
  const [data,setData]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[details,setDetails]=useState<Partial<PrivateDetails>>({}),[hasSSN,setHasSSN]=useState(false),[session,setSession]=useState<Session|null>(null),[docs,setDocs]=useState<Documents|null>(null),[adult,setAdult]=useState(false);
  async function api(op:string,extra:Record<string,unknown>={}) {const r=await fetch('/api/authcard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...extra})});const d=await r.json();if(!r.ok)throw Error(d.error||'Request unconfirmed. Resume the same request.');return d;}
  async function reload(){setData(await api('workspace'));}
  async function run(op:string,extra:Record<string,unknown>={}) {setBusy(true);setMessage('');try{const d=await api(op,extra);await reload();setMessage(d.message||'Saved.');return d;}catch(e){setMessage(e instanceof Error?e.message:'Request unconfirmed.');}finally{setBusy(false);}}
  async function pay(){const d=await run('payment');if(d?.clientSecret)setSession(d);}
  async function verify(){setBusy(true);setMessage('');try{const d=await api('identity',{adultConfirmed:adult});if(d.identitySecret){const stripe=await loadStripe(d.publishableKey);if(!stripe)throw Error('Secure verification unavailable.');const result=await stripe.verifyIdentity(d.identitySecret);if(result.error)throw Error(result.error.message||'Verification needs your input.');await api('refresh');}else setMessage(d.message);await reload();}catch(e){setMessage(e instanceof Error?e.message:'Verification unconfirmed. Refresh this same session.');}finally{setBusy(false);}}
  const verified=data.status==='verified' && data.paid;
  return <div className="screening-workspace">
    <section className="card screening-overview"><div><p className="eyebrow">Your identity. Your access.</p><h1>My AuthCard</h1><p>Prepare your information once, share selectively and authorize each order.</p></div><ShieldCheckIcon width={40} aria-hidden="true"/></section>
    <p className="funding-notice">Sandbox only. Use test details and Stripe test documents. No real person is screened. The $5 one-time KYU platform fee is a test payment. US minors cannot use identity verification. Points, training and career workflows remain available.</p>
    <CandidatePolicyLink/>
    {!configured?<p role="status">KYU sandbox configuration is unavailable. No payment has been taken.</p>:null}
    <article className="card"><h2>{data.name || 'Your AuthCard'}</h2><p><span className="pill">{verified?'TXKPRO identity verified (sandbox)':data.status.replaceAll('_',' ')}</span></p><p className="card-sub">Verified means the account meets TXKPRO platform identity requirements. Sandbox verification is simulated. It does not establish background clearance, skill verification or employment eligibility.</p><p>Private details: {data.ready?'Prepared':'Not prepared'} · One-time test fee: {data.paid?'Paid':'Not confirmed'}</p>
    <div className="screening-actions">
      <ActionModal title="Private screening information" triggerLabel="Prepare / edit information" busy={busy} onOpen={()=>{setDetails({});setMessage('');void run('edit').then(d=>{if(d){setDetails(d.details||{});setHasSSN(d.hasSSN);}});}}>
        <p className="funding-notice">Candidate-entered claims, stored encrypted. No SSN, DOB, address or ID image appears on your shared card. Stripe identity data is never forwarded. Authenticate mock checks never receive these details.</p>
        <form onSubmit={async e=>{e.preventDefault();await run('details',{details});}}>
          <div className="screening-gallery">{(['firstName','lastName','dob','address','city','state','postalCode','phone','ssn'] as const).map(key=><label className="screening-field" key={key}>{({firstName:'First name',lastName:'Last name',dob:'Date of birth',address:'Street address',city:'City',state:'State (2-letter code)',postalCode:'ZIP code',phone:'Phone (optional)',ssn:hasSSN?'SSN saved · leave blank to retain':'SSN (optional; 9 digits)'})[key]}<input autoComplete="off" type={key==='dob'?'date':key==='ssn'?'password':'text'} required={!['phone','ssn'].includes(key)} maxLength={key==='ssn'?9:200} value={details[key]||''} onChange={e=>setDetails({...details,[key]:key==='state'?e.target.value.toUpperCase():e.target.value})}/></label>)}</div>
          {(['education','employment','licenses'] as const).map(key=><label className="screening-field" key={key}>{key==='licenses'?'Licenses / driver details (optional)':`${key[0].toUpperCase()}${key.slice(1)} history (optional)`}<textarea maxLength={2000} value={details[key]||''} onChange={e=>setDetails({...details,[key]:e.target.value})}/></label>)}
          <button className="button button-dark" disabled={busy || !configured}>Save private information</button>
        </form>{message?<p role="status">{message}</p>:null}
      </ActionModal>
      <ActionModal title="KYU identity verification" triggerLabel="Verify my account" busy={busy} onOpen={()=>{setAdult(false);setSession(null);setDocs(null);setMessage('');}}>
        <p>1. Prepare your private information. 2. Pay the one-time $5 test fee. 3. Complete document and selfie verification. 4. Refresh your status.</p>
        <p className="card-sub">Documents are collected by Stripe’s secure component. Only your platform status and adult eligibility are retained here; raw Stripe identity data is never shared.</p>
        <div className="screening-actions"><button className="button" disabled={busy || !configured || !data.ready || data.paid} onClick={()=>void pay()}>Pay / resume $5 test fee</button><button className="button" disabled={busy || !configured} onClick={()=>void run('refresh')}>Refresh provider status</button></div>
        {session?<Checkout key={session.clientSecret} {...session} apiPath="/api/authcard" ownerType="" ownerId="" orderId="kyu" onBusy={setBusy} onDone={()=>void reload().catch(()=>setMessage('Refresh this same payment.'))} onResume={()=>void pay()}/>:null}
        <label><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/> I am an adult, at least 18 years old, and I am verifying my own TXKPRO account.</label>
        <button className="button button-dark" disabled={busy || !configured || !data.paid || !data.ready || !adult || verified || data.status==='revoked'} onClick={()=>void verify()}>Open / resume verification</button>
        {message?<p className="funding-notice" role="status">{message}</p>:null}
      </ActionModal>
      <ActionModal title="KYU invoice & receipt" triggerLabel="Invoice / receipt" busy={busy} onOpen={()=>{setDocs(null);void run('documents').then(d=>{if(d)setDocs(d);});}}>{docs?<><p>{docs.message}</p><div className="screening-actions">{[['Invoice',docs.invoiceUrl],['Invoice PDF',docs.invoicePdfUrl],['Receipt',docs.receiptUrl]].map(([label,url])=>url?<a key={label} className="button" href={url} target="_blank" rel="noopener noreferrer">{label}</a>:null)}</div></>:<p>{message||'Loading documents…'}</p>}</ActionModal>
      <ActionModal title="Deactivate AuthCard" triggerLabel="Deactivate card" busy={busy}><p>This blocks future sharing and orders. Previously submitted checks and retained authorization history cannot be recalled.</p><button className="button" disabled={busy} onClick={()=>void run('deactivate')}>Confirm deactivation</button>{message?<p role="status">{message}</p>:null}</ActionModal>
    </div></article>
    <div className="student-section-heading"><h2>Access & order requests</h2><button className="button" disabled={busy} onClick={()=>void run('workspace')}>Refresh requests</button></div>
    {!data.requests.length?<div className="card"><p>No requests yet. An authorized workspace member must select their intended use and certify before requesting your AuthCard.</p></div>:data.requests.map(r=><RequestCard key={r.id} request={r} verified={verified&&data.ready} busy={busy} message={message} run={run}/>)}
    {message?<p className="funding-notice" role="status">{message}</p>:null}
  </div>;
}
function RequestCard({request:r,verified,busy,message,run}:{request:CardRequest;verified:boolean;busy:boolean;message:string;run:(op:string,extra?:Record<string,unknown>)=>Promise<unknown>}) {
  const [accepted,setAccepted]=useState<string[]>([]);
  return <article className="card"><h3>{r.name}</h3><p>{PURPOSES.find(p=>p.id===r.purpose)?.label}</p>{r.description?<p>{r.description}</p>:null}<p>{r.products.join(' · ')} · {(r.totalCents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})} test total</p><p><span className="pill">Access: {r.status}</span> <span className="pill">Order: {r.consent}</span></p>
    <div className="screening-actions">
    {r.status==='pending'?<ActionModal title={`Share AuthCard with ${r.name}`} triggerLabel="Review sharing request" busy={busy}><p>Only your TXKPRO platform verification status is shared. Private details and Stripe data remain hidden. Sharing does not authorize a check.</p><CandidatePolicyLink/><button className="button button-dark" disabled={busy || !verified} onClick={()=>void run('share',{requestId:r.id})}>Share my AuthCard</button><button className="button" disabled={busy} onClick={()=>void run('decline',{requestId:r.id})}>Decline</button>{!verified?<p>Complete KYU verification and prepare your information first.</p>:null}{message?<p role="status">{message}</p>:null}</ActionModal>:null}
    {r.status==='shared'&&r.consent==='pending'?<ActionModal title="Authorize this order" triggerLabel="Review disclosures & authorize" busy={busy} onOpen={()=>setAccepted([])}>
      <p>{r.name} requests: {r.products.join(', ')}. Purpose: {PURPOSES.find(p=>p.id===r.purpose)?.label}. The authorization applies only to this order. No real check will run in sandbox.</p>
      <CandidatePolicyLink/>
      <div className="screening-actions"><button type="button" className="button" disabled={busy} onClick={()=>setAccepted(r.parties.map(p=>p.id))}>Check all</button><button type="button" className="button" disabled={busy} onClick={()=>setAccepted([])}>Uncheck all</button></div>
      {r.parties.map(p=><label key={p.id} className="card screening-consent"><input type="checkbox" checked={accepted.includes(p.id)} disabled={busy} onChange={e=>setAccepted(e.target.checked?[...accepted,p.id]:accepted.filter(id=>id!==p.id))}/><span><strong>{p.name}</strong><p>{p.text}</p>{p.url?<a href={p.url} target="_blank" rel="noopener noreferrer">Read provider disclosure</a>:null}</span></label>)}
      <button className="button button-dark" disabled={busy || !verified || !consentAccepted(accepted,r.parties)} onClick={()=>void run('authorize',{requestId:r.id,version:r.version,accepted})}>Authorize & continue</button>{message?<p role="status">{message}</p>:null}
    </ActionModal>:null}
    {r.consent==='changed'?<p>The consent requirements changed. Ask the workspace to create a new order for review.</p>:null}
    {r.status==='shared'?<ActionModal title="Revoke access" triggerLabel="Revoke access" busy={busy}><p>Future checks are blocked. Checks already submitted and historical authorizations cannot be recalled.</p><button className="button" disabled={busy} onClick={()=>void run('revoke',{requestId:r.id})}>Confirm revocation</button>{message?<p role="status">{message}</p>:null}</ActionModal>:null}
    </div></article>;
}
