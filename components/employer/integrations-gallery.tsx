"use client";
import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { CheckrConnection } from "@/components/employer/checkr-connection";
type Provider="checkr"|"twilio"|"sign"|"calendar";
const cards:{id:Provider;name:string;type:string;description:string}[]=[
 {id:"checkr",name:"Checkr",type:"Background screening",description:"Employer-owned account, invitations and screening status"},
 {id:"twilio",name:"Twilio Video",type:"Online interviews",description:"Remote interview sessions and pre-call video"},
 {id:"sign",name:"Dropbox Sign",type:"Electronic signatures",description:"Offer letters and signed agreements"},
 {id:"calendar",name:"Calendars",type:"Interview scheduling",description:"Google, Microsoft and Apple calendar invitations"},
];
export function EmployerIntegrationsGallery({employerId}:{employerId:string}){
 const [active,setActive]=useState<Provider|null>(null);
 const selected=cards.find(card=>card.id===active);
 return <>
  <div className="ats-integrations-grid">
   {cards.map(card=><article className="card ats-integration-card" key={card.id}>
      <div><p className="eyebrow">{card.type}</p><h2>{card.name}</h2>
        <p className="card-sub">{card.description}</p></div>
      <div className="ats-integration-actions">
        <span className="pill pill-neutral">{card.id==="checkr"?"Check connection":"Planned integration"}</span>
        <button className="button button-ghost" type="button" onClick={()=>setActive(card.id)}>Manage</button>
      </div>
    </article>)}
  </div>
  {selected?<div className="ats-pipeline-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setActive(null);}}>
    <div className="card ats-pipeline-modal ats-integration-modal" role="dialog" aria-modal="true" aria-labelledby="provider-dialog-title">
      <div className="ats-pipeline-modal-head"><div><p className="eyebrow">Integration configuration</p>
        <h2 id="provider-dialog-title">{selected.name}</h2></div>
        <button type="button" aria-label="Close integration" onClick={()=>setActive(null)}><XMarkIcon aria-hidden="true"/></button>
      </div>
      <p className="card-sub">{selected.description}</p>
      {selected.id==="checkr"?<CheckrConnection employerId={employerId}/>:
      <p className="card-sub" role="status">Provider connection is not enabled in this release. Configuration becomes available after the corresponding integration&apos;s approved implementation; no credentials can be submitted here.</p>}
      <p className="card-sub">After adding a provider component to a pipeline, open that component&apos;s settings to configure its workflow-specific behavior.</p>
      <button className="button button-dark" type="button" onClick={()=>setActive(null)}>Done</button>
    </div>
  </div>:null}
 </>;
}
