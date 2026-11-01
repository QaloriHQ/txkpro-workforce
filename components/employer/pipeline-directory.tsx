"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVerticalIcon, MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
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
  const latestVersions=useMemo(()=>new Map(versions.slice().sort((a,b)=>a.versionNumber-b.versionNumber)
    .map(version=>[version.templateId,version] as const)),[versions]);
  const counts=useMemo(()=>({all:pipelines.length,published:pipelines.filter(p=>published.has(p.id)).length,
    draft:pipelines.filter(p=>!published.has(p.id)).length}),[pipelines,published]);
  const displayed=useMemo(()=>pipelines.filter(p=>(filter==="all" || (filter==="published" ? published.has(p.id):!published.has(p.id)))
    && (p.name+" "+p.description).toLowerCase().includes(query.trim().toLowerCase())),[pipelines,filter,query,published]);
  useEffect(()=>{
    if(!menu)return;
    const close=(event:KeyboardEvent|PointerEvent)=>{
      if(event instanceof KeyboardEvent && event.key!=="Escape")return;
      if(event instanceof PointerEvent && (event.target as HTMLElement).closest(`[data-pipeline-menu="${menu}"]`))return;
      setMenu(null);
    };
    document.addEventListener("keydown",close);
    document.addEventListener("pointerdown",close);
    return ()=>{document.removeEventListener("keydown",close);document.removeEventListener("pointerdown",close);};
  },[menu]);
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
      <label className="ats-directory-search"><span>Search pipelines</span><div><MagnifyingGlassIcon aria-hidden="true"/>
        <input className="input" type="search" placeholder="Search by name or description"
          value={query} onChange={e=>setQuery(e.target.value)}/></div></label>
      {isPipelineConfigurator(role)?<Link className="button button-brand ats-directory-create" href="/employer/pipelines/new">
        <PlusIcon aria-hidden="true"/> Create pipeline</Link>:null}
      <div className="ats-directory-tabs" role="group" aria-label="Filter by pipeline status">
        {(["all","published","draft"] as const).map(s=><button key={s} type="button"
          aria-pressed={filter===s} className={filter===s?"is-active":""}
          onClick={()=>setFilter(s)}><span>{s==="all"?"All":s==="published"?"Published":"Drafts"}</span><strong>{counts[s]}</strong></button>)}
      </div>
    </div>
    {message?<p className="ats-pipeline-validation" role="alert">{message}</p>:null}
    <div className="ats-directory-result-heading" aria-live="polite">
      <strong>{displayed.length} {displayed.length===1?"pipeline":"pipelines"}</strong>
      <span>{filter==="all"?"Reusable hiring workflows":filter==="published"?"With at least one published version":"Not yet published"}</span>
    </div>
    <div className="ats-directory-results">
      {displayed.map(p=>{
        const isPublished=published.has(p.id);
        const latest=latestVersions.get(p.id);
        const componentCount=(latest?.graph??p.graph).nodes.length;
        return <article className="card ats-directory-card" key={p.id}>
          <div className="ats-directory-details">
            <div className="ats-directory-title-line"><h2><Link href={`/employer/pipelines/${p.id}`}>{p.name}</Link></h2>
              <span className={"pill "+(isPublished?"pill-success":"pill-neutral")}>{isPublished?"Published":"Draft"}</span>
            </div>
            <p className="card-sub ats-directory-description">{p.description||"Reusable employer hiring workflow."}</p>
            <dl className="ats-directory-facts">
              <div><dt>Published version</dt><dd>{latest?`Version ${latest.versionNumber}`:"None"}</dd></div>
              <div><dt>Components</dt><dd>{componentCount}</dd></div>
              <div><dt>Draft revision</dt><dd>{p.revision}</dd></div>
              <div><dt>Last updated</dt><dd>{new Date(p.updatedAt).toLocaleDateString()}</dd></div>
            </dl>
          </div>
          <div className="ats-directory-card-actions">
            <Link className="button button-brand" href={`/employer/pipelines/${p.id}`}>Open pipeline</Link>
            <div className="ats-directory-more" data-pipeline-menu={p.id}>
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
        <p className="card-sub">Try another search or status filter.</p>
        {query||filter!=="all"?<button className="button button-ghost" type="button" onClick={()=>{setQuery("");setFilter("all");}}>Clear filters</button>:null}</div>:null}
    </div>
  </section>;
}
