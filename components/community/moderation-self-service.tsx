"use client";
import { useState, type FormEvent } from "react";
import type { ModerationSelfCase } from "@/lib/community/moderation-types";

export function ModerationSelfService({ initial }: { initial: ModerationSelfCase[] }) {
  const [items, setItems] = useState(initial); const [active, setActive] = useState<ModerationSelfCase | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function appeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!active) return; setBusy(true); setMessage("");
    const statement = String(new FormData(event.currentTarget).get("statement") || "");
    try { const response = await fetch("/api/community/moderation/appeals", { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({caseId:active.caseId,statement}) });
      const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(typeof body.error==="string"?body.error:"The appeal could not be submitted.");
      setItems(current=>current.map(item=>item.caseId===active.caseId?{...item,status:"reviewing",appealStatus:"submitted"}:item));setActive(null);setMessage("Appeal submitted for independent review.");
    } catch(error){setMessage(error instanceof Error?error.message:"The appeal could not be submitted.");}finally{setBusy(false);}
  }
  return <section className="card moderation-self"><div className="card-header"><div><h2>Actions affecting your account</h2><p className="card-sub">Every removal or restriction includes a reason and may be appealed.</p></div><span className="pill">{items.length} records</span></div>
    {message?<div className="callout" role="status">{message}</div>:null}
    <div className="moderation-self-list">{items.length?items.map(item=><article key={item.caseId}><div><span className={`moderation-severity severity-${item.severity}`}>{item.severity}</span><strong>{item.outcome.replaceAll("_"," ")}</strong></div><p>{item.decisionSummary||"A policy action was recorded."}</p><small>Case {item.caseId}{item.actionExpiresAt?` · Ends ${new Date(item.actionExpiresAt).toLocaleString()}`:""}</small>{item.appealStatus?<span className="pill">Appeal {item.appealStatus}</span>:<button className="button button-ghost button-small" type="button" onClick={()=>setActive(item)}>Appeal action</button>}</article>):<div className="empty"><strong>No moderation actions</strong>You have no removals or restrictions to review.</div>}</div>
    {active?<div className="moderation-modal-backdrop"><form className="moderation-modal" role="dialog" aria-modal="true" aria-labelledby="appeal-title" onSubmit={appeal}><div className="card-header"><div><p className="eyebrow">Case {active.caseId}</p><h2 id="appeal-title">Appeal this action</h2></div><button className="button button-ghost button-small" type="button" onClick={()=>setActive(null)}>Close</button></div><label>Why should this decision be reconsidered?<textarea name="statement" required minLength={10} maxLength={4000} rows={6}/></label><p className="card-sub">Low-impact appeals are re-evaluated independently. Severe or disputed cases receive administrator review.</p><button className="button button-brand" disabled={busy}>{busy?"Submitting…":"Submit appeal"}</button></form></div>:null}
  </section>;
}
