"use client";
import { useState } from "react";
import { ActionModal } from "@/components/design-system/action-modal";
import type { ClassRecord } from "@/lib/classes/server";
export type DirectoryData = { classes: ClassRecord[]; people: {userId:string;name:string;role:string;scopeType:string;scopeId:string;institutionId:string;institutionName:string;cohortId:string;cohortName:string;program:string|null}[]; assistance: {name:string;institutionId:string;requestedAt:string}[] };
const label = (value: string) => value.replaceAll("_", " ");
export function InstitutionDirectory({ data }: { data: DirectoryData }) {
  const [role,setRole] = useState(""); const [cohort,setCohort] = useState("");
  const people=data.people.filter(person=>(!role || person.role===role)&&(!cohort || person.cohortId===cohort));
  const institutions=[...new Set(people.map(person=>person.institutionId))];
  return <div className="form-stack"><p>Institution → program → cohort connections. A class can connect several cohorts. Only your authorized scope is shown; no student contact information is shared.</p>
    <ActionModal title="Filter institution directory" triggerLabel="Filter by role / cohort"><div className="form-stack"><label><span>Role</span><select className="select" value={role} onChange={event=>setRole(event.target.value)}><option value="">All roles</option>{[...new Set(data.people.map(person=>person.role))].sort().map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label><label><span>Cohort</span><select className="select" value={cohort} onChange={event=>setCohort(event.target.value)}><option value="">All authorized cohorts</option>{[...new Map(data.people.map(person=>[person.cohortId,person.cohortName])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><button className="button" onClick={()=>{setRole("");setCohort("");}}>Clear filters</button></div></ActionModal>
    {!people.length?<p className="card">No matching staff connections.</p>:null}
    {institutions.map(id=><section className="card" key={id}><h2>{people.find(person=>person.institutionId===id)?.institutionName}</h2>{[...new Set(people.filter(person=>person.institutionId===id).map(person=>person.program??"Program"))].map(program=><details key={program} open><summary>{program}</summary>{[...new Map(people.filter(person=>person.institutionId===id&&(person.program??"Program")===program).map(person=>[person.cohortId,person.cohortName])).entries()].map(([cohortId,name])=><details key={cohortId}><summary>{name}</summary><ul>{people.filter(person=>person.cohortId===cohortId).map(person=><li key={`${person.userId}:${person.role}:${person.scopeType}:${person.scopeId}`}>{person.name} · {label(person.role)}</li>)}</ul>{data.classes.filter(item=>item.cohorts.some(value=>value.cohortId===cohortId)).map(item=><p key={item.classId}>Class: {item.name} · {item.instructors?.map(person=>person.name).join(", ")}</p>)}</details>)}</details>)}</section>)}
    {data.assistance.length?<section className="card"><h2>Cohort assistance requests</h2>{data.assistance.map(request=><p key={`${request.name}:${request.institutionId}:${request.requestedAt}`}>{request.name} · {new Date(request.requestedAt).toLocaleString()}</p>)}</section>:null}
  </div>;
}
