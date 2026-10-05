"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceForm, ActionModal } from "@/components/design-system/action-modal";
import type { ClassRecord, CohortOption } from "@/lib/classes/server";
import type { DirectoryData } from "@/components/classes/directory";
async function update(body: unknown) { const response=await fetch("/api/classes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}); if(!response.ok) {const result=await response.json().catch(()=>({})); throw new Error(result.error??"Update failed");} }
export function ClassInstructors({item,people}:{item:ClassRecord;people:DirectoryData["people"]}) {
  const router=useRouter(); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const candidates=[...new Map(people.filter(person=>person.role==="instructor"&&person.institutionId===item.institutionId&&item.cohorts.every(cohort=>people.some(other=>other.userId===person.userId&&other.role==="instructor"&&other.cohortId===cohort.cohortId))).map(person=>[person.userId,person])).values()];
  async function assign(userId:string,remove=false) {setBusy(true);try{await update({action:"instructor",classId:item.classId,userId,remove});setMessage("Assignment updated.");router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"Update failed");}finally{setBusy(false);}}
  return <ActionModal title="Class instructors" triggerLabel="Manage instructors" busy={busy}><p>Instructors must already have authorized access to every linked cohort. Assignment does not grant new institutional permissions.</p>{item.instructors?.map(person=><p key={person.userId}>{person.name} <button className="button" disabled={busy} onClick={()=>assign(person.userId,true)}>Remove assignment</button></p>)}{candidates.filter(person=>!item.instructors?.some(current=>current.userId===person.userId)).map(person=><p key={person.userId}>{person.name} <button className="button" disabled={busy} onClick={()=>assign(person.userId)}>Assign instructor</button></p>)}<p role="status">{message}</p></ActionModal>;
}
export function CohortDates({cohorts}:{cohorts:CohortOption[]}) {
  const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  return <WorkspaceForm modalTitle="Cohort start dates" busy={busy} className="form-stack" onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);try{await update({action:"cohortDate",cohortId:form.get("cohortId"),startDate:form.get("startDate")});setMessage("Start date saved.");router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"Update failed");}finally{setBusy(false);}}}><p>Only staff with existing cohort-management permission may change start dates. Leave the date empty to clear it.</p><label><span>Cohort</span><select className="select" name="cohortId" required>{cohorts.map(cohort=><option key={cohort.cohortId} value={cohort.cohortId}>{cohort.name} · {cohort.startDate??"No start date"}</option>)}</select></label><label><span>Program start date</span><input className="input" name="startDate" type="date"/></label><button className="button" disabled={busy}>Save date</button><p role="status">{message}</p></WorkspaceForm>;
}
