"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVerticalIcon, PlusIcon } from "@heroicons/react/24/outline";
import { isPipelineConfigurator, type PipelineTemplateSummary, type PipelineVersionSummary } from "@/lib/employer/ats-pipelines";
import type { EmployerRole } from "@/lib/employer/types";

export function PipelineDirectory({ initialPipelines, versions, employerId, role }: {
  initialPipelines: PipelineTemplateSummary[]; versions: PipelineVersionSummary[];
  employerId:string; role:EmployerRole;
}) {
  const router=useRouter();
  const [pipelines,setPipelines]=useState(initialPipelines);
  const [filter,setFilter]=useState<"all"|"draft"|"published">("all");
  const [query,setQuery]=useState("");
  const [menu,setMenu]=useState<string|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const published=useMemo(()=>new Set(versions.map(v=>v.templateId)),[versions]);
  const displayed=useMemo(()=>pipelines.filter(p=>(filter==="all" || (filter==="published" ? published.has(p.id):!published.has(p.id)))
    && (p.name+" "+p.description).toLowerCase().includes(query.trim().toLowerCase())),[pipelines,filter,query,published]);
  async function duplicate(id:string) {
    setBusy(id);setMessage("");
    try {
      const response=await fetch(`/api/employer/pipelines/${id}/duplicate?employerId=${encodeURIComponent(employerId)}`,{method:"POST"});
      if(!response.ok){const json=await response.json() as {error?:string};throw new Error(json.error??"Could not duplicate");}
      const json=await response.json() as {pipeline:PipelineTemplateSummary};
      setPipelines(rows=>[json.pipeline,...rows]);
      router.push(`/employer/pipelines/${json.pipeline.id}/edit`);
    }catch(e){setMessage(e instanceof Error?e.message:"Could not duplicate");}
    finally {setBusy(null);setMenu(null);}
  }
  return <section className="ats-directory">
    <div className="card ats-directory-filters">
      <input className="input" type="search" aria-label="Search pipelines" placeholder="Search pipelines…"
        value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="ats-directory-tabs" role="group" aria-label="Pipeline status">
        {(["all","published","draft"] as const).map(s=><button key={s} type="button"
          aria-pressed={filter===s} className={"button button-small "+(filter===s?"button-dark":"button-ghost")}
          onClick={()=>setFilter(s)}>{s==="all"?"All":s==="published"?"Published":"Drafts"}</button>)}
      </div>
      {isPipelineConfigurator(role)?<Link className="button button-dark" href="/employer/pipelines/new">
        <PlusIcon aria-hidden="true"/> Create pipeline</Link>:null}
    </div>
    {message?<p className="ats-pipeline-validation" role="alert">{message}</p>:null}
    <div className="ats-directory-results">
      {displayed.map(p=>{
        const isPublished=published.has(p.id);
        const latest=versions.filter(v=>v.templateId===p.id).sort((a,b)=>b.versionNumber-a.versionNumber)[0];
        return <article className="card ats-directory-card" key={p.id}>
          <div className="ats-directory-details">
            <div className="ats-directory-title-line"><h2>{p.name}</h2>
              <span className={"pill "+(isPublished?"pill-success":"pill-neutral")}>{isPublished?"Published":"Draft"}</span>
            </div>
            {p.description?<p className="card-sub">{p.description}</p>:null}
            <div className="ats-directory-meta">
              <span>{latest?"Version "+latest.versionNumber:"Unpublished"}</span>
              <span>{(latest?.graph??p.graph).nodes.length} components</span>
              <span>Draft revision {p.revision}</span>
              <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="ats-directory-card-actions">
            <Link className="button button-dark" href={`/employer/pipelines/${p.id}`}>Open</Link>
            <div className="ats-directory-more">
              <button type="button" className="button button-ghost" title="More pipeline actions"
                aria-label={"More actions for "+p.name} aria-expanded={menu===p.id}
                onClick={()=>setMenu(open=>open===p.id?null:p.id)}><EllipsisVerticalIcon aria-hidden="true"/></button>
              {menu===p.id?<div className="ats-directory-menu" role="group" aria-label={"Actions for "+p.name}>
                <Link href={`/employer/pipelines/${p.id}`} onClick={()=>setMenu(null)}>Open pipeline</Link>
                {isPipelineConfigurator(role)?<>
                  <Link href={`/employer/pipelines/${p.id}/edit`} onClick={()=>setMenu(null)}>Edit draft</Link>
                  <button disabled={busy===p.id} type="button" onClick={()=>void duplicate(p.id)}>Duplicate pipeline</button>
                </>:null}
                {latest?<Link href={`/employer/pipelines/${p.id}/versions/${latest.versionNumber}`} onClick={()=>setMenu(null)}>View published version</Link>:null}
                <small>Invitations and lifecycle actions will be available with ATS-03.</small>
              </div>:null}
            </div>
          </div>
        </article>;
      })}
      {!displayed.length?<div className="card ats-directory-empty"><h2>No matching pipelines</h2>
        <p className="card-sub">Adjust your search or create a reusable hiring workflow.</p></div>:null}
    </div>
  </section>;
}
