"use client";
import { useEffect, useRef, useState } from "react";
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
 const dialogRef=useRef<HTMLDivElement>(null);
 const [checkrStatus,setCheckrStatus]=useState<"checking"|"connected"|"pending"|"not-connected"|"unavailable">("checking");
 useEffect(()=>{
   const controller=new AbortController();
   fetch("/api/checkr",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({op:"workspace",employerId}),signal:controller.signal})
     .then(async response=>{
       if(!response.ok)throw new Error("Checkr status unavailable");
       return response.json() as Promise<{connected:boolean;credentialed:boolean}>;
     }).then(result=>{
       setCheckrStatus(result.connected?(result.credentialed?"connected":"pending"):"not-connected");
     }).catch(()=>{if(!controller.signal.aborted)setCheckrStatus("unavailable");});
   return()=>controller.abort();
 },[employerId]);
 useEffect(()=>{
   if(!active)return;
   const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
   const overflow=document.body.style.overflow;
   document.body.style.overflow="hidden";
   const frame=window.requestAnimationFrame(()=>dialogRef.current?.focus());
   function onKeyDown(event:KeyboardEvent){
     if(event.key==="Escape"){event.preventDefault();setActive(null);}
     if(event.key==="Tab"&&dialogRef.current){
       const controls=Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled])'));
       const first=controls[0],last=controls[controls.length-1];
       if(first&&last){
         if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
         else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
       }
     }
   }
   document.addEventListener("keydown",onKeyDown);
   return()=>{
     window.cancelAnimationFrame(frame);
     document.body.style.overflow=overflow;
     document.removeEventListener("keydown",onKeyDown);
     previous?.focus();
   };
 },[active]);
 const selected=cards.find(card=>card.id===active);
 const checkrLabel={
   checking:"Checking connection",connected:"Connected",
   pending:"Awaiting credentialing","not-connected":"Not connected",unavailable:"Status unavailable",
 }[checkrStatus];
 return <>
  <div className="ats-integrations-grid">
   {cards.map(card=><article className="card ats-integration-card" key={card.id}>
      <div><p className="eyebrow">{card.type}</p><h2>{card.name}</h2>
        <p className="card-sub">{card.description}</p></div>
      <div className="ats-integration-actions">
        <span className="pill pill-neutral">{card.id==="checkr"?checkrLabel:"Planned integration"}</span>
        <button className="button button-ghost" type="button" onClick={()=>setActive(card.id)}>Manage</button>
      </div>
    </article>)}
  </div>
  {selected?<div className="ats-pipeline-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setActive(null);}}>
    <div className="card ats-pipeline-modal ats-integration-modal" role="dialog" aria-modal="true" aria-labelledby="provider-dialog-title" tabIndex={-1} ref={dialogRef}>
      <div className="ats-pipeline-modal-head"><div><p className="eyebrow">Integration configuration</p>
        <h2 id="provider-dialog-title">{selected.name}</h2></div>
        <button type="button" aria-label="Close integration" onClick={()=>setActive(null)}><XMarkIcon aria-hidden="true"/></button>
      </div>
      <p className="card-sub">{selected.description}</p>
      {selected.id==="checkr"?<CheckrConnection employerId={employerId} embedded/>:
      <p className="card-sub" role="status">Provider connection is not enabled in this release. Configuration becomes available after the corresponding integration&apos;s approved implementation; no credentials can be submitted here.</p>}
      <p className="card-sub">After adding a provider component to a pipeline, open that component&apos;s settings to configure its workflow-specific behavior.</p>
      <button className="button button-dark" type="button" onClick={()=>setActive(null)}>Done</button>
    </div>
  </div>:null}
 </>;
}
