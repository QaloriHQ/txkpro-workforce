"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PipelineGraph } from "@/lib/employer/ats-pipelines";

/**
 * Copies a historical graph to the employer's *current draft* through the
 * existing scoped, compare-and-swap PATCH endpoint. It never updates the
 * immutable version row or reassigns published job bindings.
 */
export function RestorePipelineVersion({ pipelineId, employerId, revision, name, description,
  versionNumber, graph }: {
  pipelineId: string; employerId: string; revision: number; name: string;
  description: string; versionNumber: number; graph: PipelineGraph;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function restore() {
    if (busy) return;
    if (!window.confirm(
      "Restore published Version " + versionNumber + " to the current editable draft? " +
      "This replaces the draft workflow and creates a new draft revision. " +
      "Published versions and existing job/candidate assignments stay unchanged."
    )) return;
    setBusy(true);setMessage("");
    try {
      const response = await fetch(
        "/api/employer/pipelines/" + encodeURIComponent(pipelineId) +
        "?employerId=" + encodeURIComponent(employerId),
        { method:"PATCH", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({revision,fields:{name,description,graph}}) }
      );
      const body = await response.json() as {error?:string;pipeline?:{id:string}};
      if (!response.ok || !body.pipeline) {
        if(response.status===409)throw new Error("The draft has changed. Reload the page and review the latest revision before restoring.");
        throw new Error(body.error ?? "Could not restore this version");
      }
      router.replace("/employer/pipelines/" + encodeURIComponent(pipelineId) + "/edit");
      router.refresh();
    } catch(error) {
      setMessage(error instanceof Error ? error.message : "Could not restore version");
      setBusy(false);
    }
  }
  return <div className="ats-version-restore">
    <button type="button" className="button button-dark" disabled={busy}
      onClick={()=>void restore()}>{busy?"Restoring…":"Restore as editable draft"}</button>
    {message?<p role="alert" className="ats-pipeline-validation">{message}</p>:null}
  </div>;
}
