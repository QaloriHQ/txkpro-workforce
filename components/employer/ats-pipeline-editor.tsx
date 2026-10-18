"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, DocumentDuplicateIcon,
  PlusIcon, TrashIcon, CheckCircleIcon, ExclamationTriangleIcon, MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@heroicons/react/24/outline";
import {
  ATS_NODE_KINDS, ATS_PROVIDER_KINDS, STARTER_PIPELINE,
  isPipelineConfigurator, isPipelinePublisher, validatePipelineGraph,
  type ATSNodeKind, type PipelineGraph, type PipelineNode,
  type PipelineTemplateSummary, type PipelineVersionSummary, type PipelineField,
} from "@/lib/employer/ats-pipelines";
import type { EmployerRole } from "@/lib/employer/types";

const LABELS: Record<ATSNodeKind, string> = {
  start: "Start", end: "End", application_form: "Application / form", assessment: "Assessment",
  video: "Video", consent: "Consent", contract_signature: "Electronic signature",
  interview_in_person: "In-person interview", interview_online: "Online interview",
  background_check: "Background check", fingerprinting: "Fingerprinting",
  drug_test: "Drug testing", manual_review: "Human review",
  decision: "Yes / no decision", notification: "Notification",
};
function clone<T>(value: T): T { return structuredClone(value); }
function createId(prefix: string) { return prefix + "_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12); }
function initialNode(kind: ATSNodeKind, x: number, y: number): PipelineNode {
  return { id: createId("step"), kind, label: LABELS[kind], x, y, required: true,
    candidateVisible: !["start", "manual_review", "decision", "notification"].includes(kind),
    config: kind === "consent" ? { disclosure: "" } : kind === "application_form" ? { fields: [] } : {} };
}
function getMessage(response: Response): Promise<string> {
  return response.clone().json().then((v: { error?: string }) => v.error ?? "Request failed").catch(() => Promise.resolve("Request failed"));
}
const defaultFields = (fields: PipelineField[] | undefined) => (fields ?? []).map((v) =>
  [v.id, v.label, v.type, v.required ? "required" : "optional", ...(v.type === "select" ? [(v.options ?? []).join(",")] : [])].join("|")).join("\n");
function parseFields(value: string): PipelineField[] {
  return value.split("\n").map((s) => s.trim()).filter(Boolean).map((row, i) => {
    const [id, label, type, required, options] = row.split("|").map((part) => part.trim());
    if (!id || !label || !["text","textarea","email","number","select","checkbox"].includes(type)) {
      throw new Error("Invalid form field on line " + (i + 1));
    }
    return { id, label, type: type as PipelineField["type"], required: required !== "optional",
      ...(type === "select" ? { options: (options ?? "").split(",").map((s) => s.trim()).filter(Boolean) } : {}) };
  });
}

export function ATSPipelineEditor({ initialPipelines, initialVersions, employerId, role }: {
  initialPipelines: PipelineTemplateSummary[]; initialVersions: PipelineVersionSummary[];
  employerId: string; role: EmployerRole;
}) {
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [versions, setVersions] = useState(initialVersions);
  const [selectedId, setSelectedId] = useState<string | null>(initialPipelines[0]?.id ?? null);
  const initial = initialPipelines[0];
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [graph, setGraph] = useState<PipelineGraph>(clone(initial?.graph ?? STARTER_PIPELINE));
  const [revision, setRevision] = useState(initial?.revision ?? 1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<PipelineGraph[]>([]);
  const [future, setFuture] = useState<PipelineGraph[]>([]);
  const [preview, setPreview] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const editor = isPipelineConfigurator(role);
  const publisher = isPipelinePublisher(role);
  const selected = pipelines.find((p) => p.id === selectedId);
  const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const currentVersions = versions.filter((v) => v.templateId === selectedId).sort((a,b) => b.versionNumber - a.versionNumber);
  const endpoint = "?employerId=" + encodeURIComponent(employerId);
  const check = useMemo(() => {
    try { validatePipelineGraph(graph, true); return ""; }
    catch (err) { return err instanceof Error ? err.message : "Invalid graph"; }
  }, [graph]);
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) { if (dirty) { e.preventDefault(); e.returnValue = ""; } }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  function change(next: PipelineGraph) {
    if (!editor) return;
    setHistory((h) => [...h.slice(-49), clone(graph)]); setFuture([]);
    setGraph(next); setDirty(true); setError(""); setMessage("");
  }
  function setNode(node: PipelineNode) {
    change({ ...graph, nodes: graph.nodes.map((item) => item.id === node.id ? node : item) });
  }
  function choosePipeline(p: PipelineTemplateSummary) {
    if (dirty && !window.confirm("Discard unsaved pipeline changes?")) return;
    setSelectedId(p.id); setName(p.name); setDescription(p.description);
    setGraph(clone(p.graph)); setRevision(p.revision);
    setDirty(false); setError(""); setMessage(""); setSelectedNodeId(null);
    setHistory([]); setFuture([]); setPreview(false);
  }
  function undo() {
    if (!history.length) return;
    setFuture((h) => [clone(graph), ...h].slice(0, 50));
    setGraph(history[history.length - 1]); setHistory((h) => h.slice(0,-1)); setDirty(true);
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, clone(graph)]);
    setGraph(future[0]); setFuture((h) => h.slice(1)); setDirty(true);
  }
  function add(kind: ATSNodeKind, x = 200 + graph.nodes.length * 70, y = 200) {
    if (!editor || kind === "start" || (kind === "end" && graph.nodes.some((n) => n.kind === "end"))) return;
    const node = initialNode(kind, x, y);
    change({ ...graph, nodes: [...graph.nodes, node] });
    setSelectedNodeId(node.id);
  }
  function removeNode() {
    if (!selectedNode || selectedNode.kind === "start" || selectedNode.kind === "end") return;
    change({ ...graph, nodes: graph.nodes.filter((n) => n.id !== selectedNode.id),
      edges: graph.edges.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id) });
    setSelectedNodeId(null);
  }
  function connect(source: string, target: string, outcome?: "yes" | "no") {
    const current = graph.nodes.find((n) => n.id === source);
    if (!current || !target || target === source || !graph.nodes.some((n) => n.id === target)) return;
    const matches = (e: PipelineGraph["edges"][number]) => e.source === source && (current.kind !== "decision" || e.outcome === outcome);
    const edges = graph.edges.filter((e) => !matches(e));
    edges.push({ id: createId("edge"), source, target, ...(outcome ? { outcome } : {}) });
    change({ ...graph, edges });
  }
  async function create() {
    if (!editor) return;
    if (dirty && !window.confirm("Discard unsaved pipeline changes?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/employer/pipelines" + endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New hiring pipeline", description: "", graph: STARTER_PIPELINE }),
      });
      if (!response.ok) throw new Error(await getMessage(response));
      const { pipeline } = await response.json() as { pipeline: PipelineTemplateSummary };
      setPipelines((p) => [pipeline, ...p]); choosePipeline(pipeline);
    } catch (e) { setError(e instanceof Error ? e.message : "Create failed"); }
    finally { setBusy(false); }
  }
  async function save(): Promise<boolean> {
    if (!selectedId || !editor || busy) return false;
    setBusy(true); setError("");
    try {
      // Save incomplete drafts; publish validates the complete connected DAG.
      validatePipelineGraph(graph, false);
      const response = await fetch("/api/employer/pipelines/" + selectedId + endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, fields: { name, description, graph } }),
      });
      if (!response.ok) throw new Error(await getMessage(response));
      const { pipeline } = await response.json() as { pipeline: PipelineTemplateSummary };
      setPipelines((p) => p.map((row) => row.id === selectedId ? pipeline : row));
      setRevision(pipeline.revision); setDirty(false); setMessage("Saved draft revision " + pipeline.revision);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); return false; }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!selectedId || !publisher || busy) return;
    if (check) { setError("Fix workflow before publishing: " + check); return; }
    let nextRevision = revision;
    if (dirty) {
      const ok = await save();
      if (!ok) return;
      nextRevision += 1;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/employer/pipelines/" + selectedId + "/publish" + endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: nextRevision }),
      });
      if (!response.ok) throw new Error(await getMessage(response));
      const { version } = await response.json() as { version: PipelineVersionSummary };
      setVersions((items) => [version, ...items]);
      setPipelines((items) => items.map((p) => p.id === selectedId ? { ...p, latestVersion: version.versionNumber } : p));
      setMessage("Immutable pipeline version " + version.versionNumber + " published. Existing candidates remain on their prior version.");
    } catch (e) { setError(e instanceof Error ? e.message : "Publish failed"); }
    finally { setBusy(false); }
  }
  async function duplicate() {
    if (!selectedId || !editor || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/employer/pipelines/" + selectedId + "/duplicate" + endpoint, { method: "POST" });
      if (!response.ok) throw new Error(await getMessage(response));
      const { pipeline } = await response.json() as { pipeline: PipelineTemplateSummary };
      setPipelines((items) => [pipeline, ...items]); choosePipeline(pipeline);
      setMessage("Pipeline copied as a new draft. Versions and applicants were not copied.");
    } catch (e) { setError(e instanceof Error ? e.message : "Duplicate failed"); }
    finally { setBusy(false); }
  }
  const onCanvasDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!editor) return;
    const kind = event.dataTransfer.getData("application/x-txk-ats-kind") as ATSNodeKind;
    if (!ATS_NODE_KINDS.includes(kind)) return;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    add(kind, Math.round((event.clientX - box.left) / zoom), Math.round((event.clientY - box.top) / zoom));
  // onDrop uses current editor state to insert one node.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, editor, zoom]);
  function moveNodeFromDrop(event: React.DragEvent<HTMLDivElement>, nodeId: string) {
    event.preventDefault();
    const box = canvasRef.current?.getBoundingClientRect();
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!box || !node) return;
    setNode({ ...node, x: Math.round((event.clientX - box.left) / zoom), y: Math.round((event.clientY - box.top) / zoom) });
  }
  return <div className="ats-pipeline-layout">
    <aside className="card ats-pipeline-sidebar" aria-label="Pipeline templates">
      <div className="card-header"><h2>My pipelines</h2><button type="button" className="button button-small button-dark" onClick={() => void create()} disabled={!editor || busy}><PlusIcon aria-hidden="true" /> New</button></div>
      <div className="grid">{pipelines.map((p) =>
        <button type="button" key={p.id} className={"ats-pipeline-list-item " + (p.id === selectedId ? "is-selected" : "")}
          aria-current={p.id === selectedId ? "true" : undefined} onClick={() => choosePipeline(p)}>
          <strong>{p.name}</strong><small>Draft r{p.revision} · {p.latestVersion ? "Published v" + p.latestVersion : "Not published"}</small>
        </button>)}
        {!pipelines.length ? <p className="card-sub">Create your first reusable hiring pipeline.</p> : null}
      </div>
      <h3>Component library</h3>
      <p className="card-sub">Drag a component onto the canvas, or select Add. Use the inspector to connect its next step.</p>
      <div className="ats-pipeline-palette">{ATS_NODE_KINDS.filter((kind) => kind !== "start" && kind !== "end").map((kind) =>
        <button type="button" className="ats-pipeline-palette-item" key={kind} draggable={editor}
          disabled={!editor || !selectedId}
          onDragStart={(e) => e.dataTransfer.setData("application/x-txk-ats-kind", kind)}
          onClick={() => add(kind)}>
          <PlusIcon aria-hidden="true" /><span>{LABELS[kind]}</span>{ATS_PROVIDER_KINDS.has(kind) ? <small>Integration later</small> : null}
        </button>)}</div>
    </aside>
    <section className="ats-pipeline-workspace" aria-label="Pipeline editor">
      {!selected ? <div className="card"><h2>Pipeline editor</h2><p>Create a pipeline to get started.</p></div> : <>
        <div className="card ats-pipeline-toolbar">
          <div className="ats-pipeline-fields">
            <label>Pipeline name<input className="input" value={name} disabled={!editor} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></label>
            <label>Description<input className="input" value={description} disabled={!editor} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} /></label>
          </div>
          <div className="ats-pipeline-actions">
            <button type="button" className="button button-small button-ghost" disabled={!history.length || !editor} onClick={undo} title="Undo"><ArrowUturnLeftIcon aria-hidden="true" /> Undo</button>
            <button type="button" className="button button-small button-ghost" disabled={!future.length || !editor} onClick={redo} title="Redo"><ArrowUturnRightIcon aria-hidden="true" /> Redo</button>
            <button type="button" className="button button-small button-ghost" disabled={zoom <= .4} onClick={() => setZoom((v) => Math.max(.4,+(v-.1).toFixed(2)))}><MagnifyingGlassMinusIcon aria-hidden="true" /> Zoom out</button>
            <button type="button" className="button button-small button-ghost" disabled={zoom >= 1.6} onClick={() => setZoom((v) => Math.min(1.6,+(v+.1).toFixed(2)))}><MagnifyingGlassPlusIcon aria-hidden="true" /> Zoom in</button>
            <button type="button" className="button button-small button-ghost" onClick={() => setPreview(!preview)} aria-pressed={preview}>{preview ? "Show canvas" : "Candidate preview"}</button>
            <button type="button" className="button button-small button-ghost" disabled={!editor || busy} onClick={() => void duplicate()}><DocumentDuplicateIcon aria-hidden="true" /> Duplicate</button>
            <button type="button" className="button button-small button-ghost" disabled={!dirty || !editor || busy} onClick={() => void save()}>{busy ? "Working…" : "Save draft"}</button>
            <button type="button" className="button button-small button-dark" disabled={!publisher || busy || Boolean(check)}
              title={check || "Publish an immutable version"} onClick={() => void publish()}><CheckCircleIcon aria-hidden="true" /> Publish version</button>
          </div>
          <p className="card-sub" role="status">{dirty ? "Unsaved draft changes" : "Saved draft"} · Revision {revision} · {currentVersions.length ? "Latest v" + currentVersions[0].versionNumber : "No published version"}</p>
          {check ? <p className="ats-pipeline-validation" role="status"><ExclamationTriangleIcon aria-hidden="true" /> Publish blocked: {check}</p> :
            <p className="ats-pipeline-valid"><CheckCircleIcon aria-hidden="true" /> Graph passes structural validation</p>}
          {message ? <p role="status">{message}</p> : null}
          {error ? <p role="alert" className="ats-pipeline-validation">{error}{error.toLowerCase().includes("revision") ? <button className="button button-small button-ghost" type="button" onClick={() => location.reload()}><ArrowPathIcon aria-hidden="true" /> Reload</button> : null}</p> : null}
        </div>
        {preview ? <div className="card" aria-label="Applicant progress preview">
          <h2>Candidate-visible steps (preview)</h2>
          <p className="card-sub">Only public instructions are displayed. This is a preview, not a candidate application.</p>
          <ol>{graph.nodes.filter((n) => n.candidateVisible && n.kind !== "start").map((n) => <li key={n.id}><strong>{n.label}</strong> {n.required ? "(Required)" : "(Optional)"}<p>{n.config.instructions}</p></li>)}</ol>
        </div> : <>
          <div className="ats-pipeline-canvas-wrap">
            <div className="ats-pipeline-canvas" ref={canvasRef} onDragOver={(e) => e.preventDefault()} onDrop={onCanvasDrop}
              role="region" aria-label="Interactive hiring workflow canvas" tabIndex={0}>
              <div className="ats-pipeline-canvas-content" style={{ transform: `scale(${zoom})` }}>
                <svg viewBox="0 0 1800 1100" width="1800" height="1100" aria-hidden="true" className="ats-pipeline-wires">
                  {graph.edges.map((edge) => {
                    const a=graph.nodes.find((n) => n.id===edge.source), b=graph.nodes.find((n) => n.id===edge.target);
                    if (!a || !b) return null;
                    return <g key={edge.id}><path d={`M${a.x+210} ${a.y+40} C${a.x+250} ${a.y+40}, ${b.x-40} ${b.y+40}, ${b.x} ${b.y+40}`} stroke="currentColor" strokeWidth="2" fill="none" opacity=".65" />
                      {edge.outcome ? <text x={(a.x+b.x)/2+110} y={(a.y+b.y)/2+20} fontSize="15" fill="currentColor">{edge.outcome}</text> : null}</g>;
                  })}
                </svg>
                {graph.nodes.map((node) => <button key={node.id} type="button"
                  className={"ats-pipeline-node " + (node.id === selectedNodeId ? "is-selected" : "")}
                  style={{ left: node.x, top: node.y }} draggable={editor}
                  onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("application/x-txk-ats-node", node.id); }}
                  onDrop={(e) => { const id=e.dataTransfer.getData("application/x-txk-ats-node"); if (id) { e.stopPropagation(); moveNodeFromDrop(e,id); }}}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => setSelectedNodeId(node.id)}
                  onKeyDown={(e) => {
                    if (!editor || !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) return;
                    e.preventDefault(); const delta=e.shiftKey ? 40 : 10;
                    setNode({ ...node, x: node.x + (e.key==="ArrowLeft"?-delta:e.key==="ArrowRight"?delta:0),
                      y: node.y + (e.key==="ArrowUp"?-delta:e.key==="ArrowDown"?delta:0) });
                  }} aria-pressed={node.id === selectedNodeId}>
                  <strong>{node.label}</strong><small>{node.kind.replaceAll("_"," ")}{ATS_PROVIDER_KINDS.has(node.kind) ? " · Not connected" : ""}</small>
                </button>)}
              </div>
              <div className="ats-pipeline-canvas-hint">Select a node to configure it. Arrow keys move selected nodes; Shift+arrow moves farther. Drag from the library to add steps.</div>
            </div>
          </div>
          <div className="card ats-pipeline-inspector">
            <h2>Component settings</h2>
            {!selectedNode ? <p className="card-sub">Select a workflow component to edit its content, connections, or candidate visibility.</p> : <div className="grid">
              <p className="eyebrow">{LABELS[selectedNode.kind]}</p>
              <label>Step title<input className="input" value={selectedNode.label} disabled={!editor} onChange={(e) => setNode({ ...selectedNode, label: e.target.value })} /></label>
              <div className="form-grid">
                <label><input type="checkbox" checked={selectedNode.required} disabled={!editor || selectedNode.kind==="start"} onChange={(e) => setNode({ ...selectedNode, required: e.target.checked })} /> Required</label>
                <label><input type="checkbox" checked={selectedNode.candidateVisible} disabled={!editor} onChange={(e) => setNode({ ...selectedNode, candidateVisible: e.target.checked })} /> Candidate-visible</label>
              </div>
              <label>Instructions<textarea className="textarea" rows={3} value={selectedNode.config.instructions ?? ""} disabled={!editor} onChange={(e) => setNode({ ...selectedNode, config: { ...selectedNode.config, instructions: e.target.value } })} /></label>
              {selectedNode.kind === "consent" ? <label>Required disclosure<textarea className="textarea" rows={3} value={selectedNode.config.disclosure ?? ""} disabled={!editor} onChange={(e) => setNode({ ...selectedNode, config: { ...selectedNode.config, disclosure: e.target.value } })} /></label> : null}
              {["video","assessment"].includes(selectedNode.kind) ? <label>Public HTTPS media URL<input className="input" type="url" value={selectedNode.config.url ?? ""} disabled={!editor} onChange={(e) => setNode({ ...selectedNode, config: { ...selectedNode.config, url: e.target.value } })} /></label> : null}
              {selectedNode.kind === "application_form" ? <label>Form template fields (one per line: id|label|type|required|choices)
                <textarea className="textarea" rows={6} defaultValue={defaultFields(selectedNode.config.fields)} key={selectedNode.id}
                  disabled={!editor} onBlur={(e) => {
                    try { const fields = parseFields(e.target.value); if (JSON.stringify(fields) !== JSON.stringify(selectedNode.config.fields ?? [])) setNode({ ...selectedNode, config: { ...selectedNode.config, fields } }); }
                    catch (err) { setError(err instanceof Error ? err.message : "Invalid fields"); }
                  }} /></label> : null}
              {selectedNode.kind !== "end" ? <fieldset className="ats-pipeline-connections"><legend>Connect next step</legend>
                {(selectedNode.kind === "decision" ? ["yes","no"] : ["next"]).map((outcome) => {
                  const assigned = graph.edges.find((e) => e.source===selectedNode.id && (outcome==="next" || e.outcome===outcome));
                  return <label key={outcome}>{outcome==="next"?"Next":outcome.toUpperCase()}
                    <select className="select" disabled={!editor} value={assigned?.target ?? ""} onChange={(e) => connect(selectedNode.id, e.target.value, outcome==="next"?undefined:outcome as "yes"|"no")}>
                      <option value="">Choose a component</option>
                      {graph.nodes.filter((n) => n.id !== selectedNode.id && n.kind !== "start").map((n) => <option value={n.id} key={n.id}>{n.label}</option>)}
                    </select>
                  </label>;
                })}</fieldset> : null}
              {selectedNode.kind !== "start" && selectedNode.kind !== "end" ? <button type="button" className="button button-ghost" disabled={!editor} onClick={removeNode}><TrashIcon aria-hidden="true" /> Remove step</button> : null}
              {ATS_PROVIDER_KINDS.has(selectedNode.kind) ? <p className="card-sub">Provider workflow execution is not enabled in ATS-02. This node configures a future manual/integration requirement only.</p> : null}
            </div>}
          </div>
        </>}
        {currentVersions.length ? <div className="card"><h2>Published versions</h2><p className="card-sub">Published snapshots are immutable. Editing this draft and publishing again creates a new version.</p>
          <div className="grid">{currentVersions.map((v) => <div className="ats-pipeline-version" key={v.id}><strong>Version {v.versionNumber}</strong><small>{new Date(v.publishedAt).toLocaleString()}</small><small>{v.graph.nodes.length} steps</small></div>)}</div>
        </div> : null}
      </>}
    </section>
  </div>;
}
