"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, DocumentDuplicateIcon,
  PlusIcon, TrashIcon, CheckCircleIcon, ExclamationTriangleIcon, MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon, QuestionMarkCircleIcon, XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon,
} from "@heroicons/react/24/outline";
import {
  ATS_NODE_KINDS, ATS_PROVIDER_KINDS, STARTER_PIPELINE, DEFAULT_STAGE_COLORS, toStageGraph,
  isPipelineConfigurator, isPipelinePublisher, validatePipelineGraph, upsertPipelineConnection, removePipelineConnection,
  type ATSNodeKind, type PipelineGraph, type PipelineNode,
  type PipelineTemplateSummary, type PipelineVersionSummary, type PipelineField,
} from "@/lib/employer/ats-pipelines";
import type { EmployerRole } from "@/lib/employer/types";
import { autoLayoutPipeline, inspectPipelineGraph, simulateCandidateJourney } from "@/lib/employer/pipeline-experience";
import { CheckrConnection } from "@/components/employer/checkr-connection";
import { CandidateJourneyLivePreview } from "@/components/employer/candidate-journey-live-preview";

const LABELS: Record<ATSNodeKind, string> = {
  start: "Start", end: "End", application_form: "Application / form", assessment: "Assessment",
  video: "Video", consent: "Consent", contract_signature: "Electronic signature",
  interview_in_person: "In-person interview", interview_online: "Online interview",
  background_check: "Background check", fingerprinting: "Fingerprinting",
  drug_test: "Drug testing", manual_review: "Human review",
  decision: "Yes / no decision", notification: "Notification",
};
const DESCRIPTIONS: Record<ATSNodeKind,string> = {
  start:"The entry point of the candidate journey.",
  end:"Marks the end of a hiring workflow path.",
  application_form:"Collect applicant answers with a configurable form template.",
  assessment:"Request a skills assessment or structured exercise.",
  video:"Show an introductory or instructional video to candidates.",
  consent:"Require an explicit Boolean consent with a clear disclosure.",
  contract_signature:"Send a document for electronic signature (provider setup required).",
  interview_in_person:"Arrange an in-person interview or appointment.",
  interview_online:"Plan a video interview (provider setup required).",
  background_check:"Request provider-managed background screening and consent.",
  fingerprinting:"Coordinate an authorized local fingerprint appointment.",
  drug_test:"Coordinate a provider-managed drug test.",
  manual_review:"Route an application to an authorized human reviewer.",
  decision:"Split the workflow into Yes and No branches, without automatic candidate rejection.",
  notification:"Show or send a workflow notification when integrations are enabled.",
};
function Help({ text, label }: { text:string; label:string }) {
  return <details className="ats-pipeline-help">
    <summary aria-label={"Help: "+label} title={"Help: "+label}><QuestionMarkCircleIcon aria-hidden="true"/></summary>
    <span className="ats-pipeline-help-popover">{text}</span>
  </details>;
}
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

export function ATSPipelineEditor({ initialPipelines, initialVersions, employerId, role, dedicated = false }: {
  initialPipelines: PipelineTemplateSummary[]; initialVersions: PipelineVersionSummary[];
  employerId: string; role: EmployerRole; dedicated?: boolean;
}) {
  const router = useRouter();
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linking, setLinking] = useState<{source:string;outcome?:"yes"|"no"} | null>(null);
  const [pointer, setPointer] = useState<{x:number;y:number} | null>(null);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [componentQuery, setComponentQuery] = useState("");
  const [stagesOpen,setStagesOpen] = useState(false);
  const [componentSource, setComponentSource] = useState<{id:string;outcome?:"yes"|"no"}|null>(null);
  const [branchChoices, setBranchChoices] = useState<Record<string, "yes" | "no">>({});
  const [recovery, setRecovery] = useState<{ name: string; description: string; graph: PipelineGraph; revision: number } | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState("Autosave enabled");
  const [scrollPosition, setScrollPosition] = useState({ left: 0, top: 0 });
  const [viewportSize, setViewportSize] = useState({width:950,height:500});
  const latestDraft = useRef("");
  const panRef = useRef<{ clientX: number; clientY: number; left: number; top: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const stagesRef = useRef<HTMLDivElement>(null);
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
  const diagnostics = useMemo(() => inspectPipelineGraph(graph), [graph]);
  const journey = useMemo(() => simulateCandidateJourney(graph, branchChoices), [graph, branchChoices]);
  const draftKey = selectedId ? "txkpro:ats-draft:" + employerId + ":" + selectedId : "";
  useEffect(() => {
    latestDraft.current = JSON.stringify({ name, description, graph });
    if (!dirty || !draftKey || !editor) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({
        savedAt: Date.now(), revision, name, description, graph,
      }));
    } catch { /* The server remains the durable save target. */ }
  }, [name, description, graph, dirty, draftKey, editor, revision]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!draftKey || !editor) { setRecovery(null); return; }
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (!raw || raw.length > 150000) { setRecovery(null); return; }
        const candidate = JSON.parse(raw) as { savedAt: number; revision: number; name: string; description: string; graph: PipelineGraph };
        if (Date.now() - candidate.savedAt > 7 * 86400000 || candidate.revision !== revision) {
          setRecovery(null); return;
        }
        const validated = validatePipelineGraph(candidate.graph, false);
        if (typeof candidate.name !== "string" || typeof candidate.description !== "string") return;
        if (JSON.stringify({name:candidate.name,description:candidate.description,graph:validated}) ===
            JSON.stringify({name,description,graph})) { setRecovery(null); return; }
        setRecovery({ name: candidate.name, description: candidate.description, graph: validated, revision });
      } catch { setRecovery(null); }
    }, 0);
    return () => window.clearTimeout(timeout);
    // Inspect recovery on pipeline selection, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, editor]);
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) { if (dirty) { e.preventDefault(); e.returnValue = ""; } }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    const element=viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer=new ResizeObserver(() => setViewportSize({width:element.clientWidth,height:element.clientHeight}));
    observer.observe(element);
    return () => observer.disconnect();
  }, [preview, selectedId]);
  useEffect(() => {
    if (!settingsOpen) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setSettingsOpen(false); }
      if (event.key === "Tab" && modalRef.current) {
        const controls = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary'));
        if (!controls.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); prior?.focus(); };
  }, [settingsOpen]);
  function change(next: PipelineGraph) {
    if (!editor) return;
    setHistory((h) => [...h.slice(-49), clone(graph)]); setFuture([]);
    setGraph(next); setDirty(true); setError(""); setMessage("");
  }
  useEffect(()=>{
    if(!stagesOpen)return;
    const prior=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    stagesRef.current?.focus();
    function keydown(e:KeyboardEvent){
      if(e.key==="Escape"){e.preventDefault();setStagesOpen(false);}
      if(e.key==="Tab"&&stagesRef.current){
        const controls=Array.from(stagesRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])'));
        const first=controls[0],last=controls[controls.length-1];
        if(!first||!last)return;
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
    document.addEventListener("keydown",keydown);
    return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",keydown);prior?.focus();};
  },[stagesOpen]);
  function addStage() {
    const staged=toStageGraph(graph);
    const entries=staged.stages??[];
    if(entries.length>=30){setError("At most 30 stages are supported");return;}
    const position=entries.length;
    change({...staged,stages:[...entries,{
      id:createId("stage"),name:"New stage "+(position+1),
      color:DEFAULT_STAGE_COLORS[position%DEFAULT_STAGE_COLORS.length],
      sortOrder:position,candidateVisible:true,completionRule:"all_required",
    }]});
  }
  function editStage(stageId:string,update:{name?:string;color?:string;candidateVisible?:boolean;completionRule?:"all_required"|"manual"}){
    change({...graph,stages:(graph.stages??[]).map(stage=>stage.id===stageId?{...stage,...update}:stage)});
  }
  function deleteStage(stageId:string){
    const remaining=(graph.stages??[]).filter(stage=>stage.id!==stageId)
      .map((stage,sortOrder)=>({...stage,sortOrder}));
    if(!remaining.length){setError("At least one stage must remain");return;}
    change({...graph,stages:remaining,
      nodes:graph.nodes.map(node=>node.stageId===stageId?{...node,stageId:remaining[0].id}:node)});
  }
  function setNode(node: PipelineNode) {
    change({ ...graph, nodes: graph.nodes.map((item) => item.id === node.id ? node : item) });
  }
  function choosePipeline(p: PipelineTemplateSummary) {
    if (dirty && !window.confirm("Discard unsaved pipeline changes?")) return;
    setSelectedId(p.id); setName(p.name); setDescription(p.description); setAutosaveStatus("Autosave enabled");
    setGraph(clone(p.graph)); setRevision(p.revision);
    setDirty(false); setError(""); setMessage(""); setSelectedNodeId(null);
    setHistory([]); setFuture([]); setPreview(false); setSettingsOpen(false); setLinking(null); setPointer(null); setBranchChoices({}); setRecovery(null);
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
    if(graph.schemaVersion===2)node.stageId=graph.stages?.[0]?.id;
    change({ ...graph, nodes: [...graph.nodes, node] });
    setSelectedNodeId(node.id); setSettingsOpen(true);
  }
  function openContextLibrary(id:string,outcome?:"yes"|"no"){
    if(!editor) return;
    setSettingsOpen(false);setComponentSource({id,outcome});setComponentQuery("");setLibraryOpen(true);
  }
  function insertComponent(kind:ATSNodeKind){
    if(!editor||!componentSource||kind==="start"||kind==="end")return;
    const source=graph.nodes.find(n=>n.id===componentSource.id);
    if(!source || source.kind==="end")return;
    const node=initialNode(kind,source.x+310,source.y+45);
    if(graph.schemaVersion===2)node.stageId=source.stageId??graph.stages?.[0]?.id;
    const old=graph.edges.find(e=>e.source===source.id &&
      (source.kind==="decision"?e.outcome===componentSource.outcome:!e.outcome));
    try{
      let newGraph:PipelineGraph={...graph,nodes:[...graph.nodes,node]};
      newGraph=upsertPipelineConnection(newGraph,source.id,node.id,componentSource.outcome);
      if(old&&kind!=="decision")newGraph=upsertPipelineConnection(newGraph,node.id,old.target);
      change(newGraph);
      setSelectedNodeId(node.id);
      setLibraryOpen(false);setComponentSource(null);setSettingsOpen(true);
    }catch(e){setError(e instanceof Error?e.message:"Could not add component");}
  }
  useEffect(()=>{
    if(!libraryOpen)return;
    const prior=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    libraryRef.current?.focus();
    function keydown(e:KeyboardEvent){
      if(e.key==="Escape"){e.preventDefault();setLibraryOpen(false);}
      if(e.key==="Tab"&&libraryRef.current){
        const elements=Array.from(libraryRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])'));
        const first=elements[0],last=elements[elements.length-1];
        if(!first||!last)return;
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
    document.addEventListener("keydown",keydown);
    return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",keydown);prior?.focus();};
  },[libraryOpen]);
  function removeNode() {
    if (!selectedNode || selectedNode.kind === "start" || selectedNode.kind === "end") return;
    change({ ...graph, nodes: graph.nodes.filter((n) => n.id !== selectedNode.id),
      edges: graph.edges.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id) });
    setSelectedNodeId(null); setSettingsOpen(false); setLinking(null);
  }
  function connect(source: string, target: string, outcome?: "yes" | "no") {
    if (!editor) return;
    try {
      change(target ? upsertPipelineConnection(graph, source, target, outcome) :
        removePipelineConnection(graph, source, outcome));
      setLinking(null); setPointer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to connect components");
      setLinking(null); setPointer(null);
    }
  }
  function beginLink(source: string, outcome?: "yes" | "no") {
    if (!editor) return;
    setLinking({ source, outcome }); setPointer(null); setError("");
  }
  function finishLink(target: string) {
    if (linking) connect(linking.source, target, linking.outcome);
  }
  function recoverDraft() {
    if (!recovery) return;
    try { validatePipelineGraph(recovery.graph, false); }
    catch { setRecovery(null); setError("Recovery copy is invalid"); return; }
    if (recovery.revision !== revision) { setRecovery(null); setError("Pipeline revision changed. Reload before restoring."); return; }
    change(clone(recovery.graph)); setName(recovery.name); setDescription(recovery.description);
    setRecovery(null); setAutosaveStatus("Recovered draft — saving");
  }
  function discardRecovery() {
    if (draftKey) try { window.localStorage.removeItem(draftKey); } catch { /* storage may be disabled */ }
    setRecovery(null);
  }
  function centerOnNode(node: PipelineNode) {
    const view = viewportRef.current;
    if (!view) return;
    view.scrollTo({ left: Math.max(0,(node.x+105)*zoom-view.clientWidth/2),
      top: Math.max(0,(node.y+40)*zoom-view.clientHeight/2), behavior: "smooth" });
  }
  function panToMapPoint(event: React.MouseEvent<HTMLButtonElement>) {
    const view = viewportRef.current;
    if (!view) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX-rect.left)/rect.width*3000;
    const y = (event.clientY-rect.top)/rect.height*2400;
    view.scrollTo({ left: Math.max(0,x*zoom-view.clientWidth/2),
      top: Math.max(0,y*zoom-view.clientHeight/2), behavior: "smooth" });
  }
  function editNode(id: string) {
    if (linking) { finishLink(id); return; }
    setSelectedNodeId(id); setSettingsOpen(true);
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
    const snapshot = JSON.stringify({ name, description, graph });
    setBusy(true); setError(""); setAutosaveStatus("Saving…");
    try {
      validatePipelineGraph(graph, false);
      const response = await fetch("/api/employer/pipelines/" + selectedId + endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, fields: { name, description, graph } }),
      });
      if (!response.ok) throw new Error(await getMessage(response));
      const { pipeline } = await response.json() as { pipeline: PipelineTemplateSummary };
      setPipelines((p) => p.map((row) => row.id === selectedId ? pipeline : row));
      setRevision(pipeline.revision);
      if (latestDraft.current === snapshot) {
        setDirty(false); setAutosaveStatus("All changes saved");
        setMessage("Saved draft revision " + pipeline.revision);
        try { window.localStorage.removeItem("txkpro:ats-draft:" + employerId + ":" + selectedId); } catch { /* optional offline recovery */ }
        return true;
      }
      setDirty(true); setAutosaveStatus("New edits pending");
      return false;
    } catch (e) {
      setAutosaveStatus("Autosave paused — retry Save draft");
      setError(e instanceof Error ? e.message : "Save failed"); return false;
    } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!dirty || busy || !editor || !selectedId || recovery || autosaveStatus === "Autosave paused — retry Save draft") return;
    const timer = window.setTimeout(() => { void save(); }, 1800);
    return () => window.clearTimeout(timer);
    // debounce; save captures revision and full draft snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, busy, graph, name, description, selectedId, revision, recovery, autosaveStatus, editor]);
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
      if(dedicated){router.push("/employer/pipelines/"+pipeline.id+"/edit");return;}
      setPipelines((items) => [pipeline, ...items]); choosePipeline(pipeline);
      setMessage("Pipeline copied as a new draft. Versions and applicants were not copied.");
    } catch (e) { setError(e instanceof Error ? e.message : "Duplicate failed"); }
    finally { setBusy(false); }
  }
  const onCanvasDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!editor) return;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = Math.round((event.clientX - box.left) / zoom);
    const y = Math.round((event.clientY - box.top) / zoom);
    const existingId = event.dataTransfer.getData("application/x-txk-ats-node");
    const existingNode = graph.nodes.find((n) => n.id === existingId);
    if (existingNode) {
      setNode({ ...existingNode, x, y });
      return;
    }
    const kind = event.dataTransfer.getData("application/x-txk-ats-kind") as ATSNodeKind;
    if (!ATS_NODE_KINDS.includes(kind)) return;
    add(kind, x, y);
  // onDrop uses current editor state to insert one node.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, editor, zoom]);
  function moveNodeFromDrop(event: React.DragEvent<HTMLElement>, nodeId: string) {
    event.preventDefault();
    const box = canvasRef.current?.getBoundingClientRect();
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!box || !node) return;
    setNode({ ...node, x: Math.round((event.clientX - box.left) / zoom), y: Math.round((event.clientY - box.top) / zoom) });
  }
  return <div className={"ats-pipeline-layout " + (dedicated ? "is-dedicated " : "") + (libraryCollapsed ? "is-library-collapsed" : "")}>
    {!dedicated ? <aside className={"card ats-pipeline-sidebar " + (libraryCollapsed ? "is-collapsed" : "")} aria-label="Pipeline templates">
      <div className="card-header ats-pipeline-sidehead">
        <h2>{libraryCollapsed ? "Library" : "My pipelines"}</h2>
        <button type="button" className="button button-small button-ghost" onClick={() => setLibraryCollapsed((value) => !value)}
          aria-expanded={!libraryCollapsed} aria-label={libraryCollapsed ? "Expand component library" : "Collapse component library"}
          title={libraryCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {libraryCollapsed ? "Expand" : "Collapse"}
        </button>
        {!libraryCollapsed ? <button type="button" className="button button-small button-dark" onClick={() => void create()} disabled={!editor || busy}><PlusIcon aria-hidden="true" /> New</button> : null}
      </div>
      <div className="ats-pipeline-sidebar-body">
      <div className="grid">{pipelines.map((p) =>
        <button type="button" key={p.id} className={"ats-pipeline-list-item " + (p.id === selectedId ? "is-selected" : "")}
          aria-current={p.id === selectedId ? "true" : undefined} onClick={() => choosePipeline(p)}>
          <strong>{p.name}</strong><small>Draft r{p.revision} · {p.latestVersion ? "Published v" + p.latestVersion : "Not published"}</small>
        </button>)}
        {!pipelines.length ? <p className="card-sub">Create your first reusable hiring pipeline.</p> : null}
      </div>
      <h3>Component library</h3>
      <p className="card-sub">Drag or add components, then connect the circular ports directly on the canvas. Select any node to configure.</p>
      <div className="ats-pipeline-palette">{ATS_NODE_KINDS.filter((kind) => kind !== "start" && kind !== "end").map((kind) =>
        <div className="ats-pipeline-palette-row" key={kind}>
          <button type="button" className="ats-pipeline-palette-item" draggable={editor}
            disabled={!editor || !selectedId}
            onDragStart={(e) => e.dataTransfer.setData("application/x-txk-ats-kind", kind)}
            onClick={() => add(kind)}>
            <PlusIcon aria-hidden="true" /><span>{LABELS[kind]}</span>{ATS_PROVIDER_KINDS.has(kind) ? <small>{kind === "background_check" ? "Checkr sandbox" : "Integration later"}</small> : null}
          </button>
          <Help label={LABELS[kind]} text={DESCRIPTIONS[kind]} />
          {kind === "background_check" ? <div className="ats-checkr-palette-action"><CheckrConnection employerId={employerId} /></div> : null}
        </div>)}</div>
      </div>
    </aside> : null}
    <section className="ats-pipeline-workspace" aria-label="Pipeline editor">
      {!selected ? <div className="card"><h2>Pipeline editor</h2><p>Create a pipeline to get started.</p></div> : <>
        <div className="card ats-pipeline-toolbar">
          <div className="ats-pipeline-fields">
            <label>Pipeline name<input className="input" value={name} disabled={!editor} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></label>
            <label>Description<input className="input" value={description} disabled={!editor} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} /></label>
          </div>
          <div className="ats-pipeline-actions">

            <button type="button" className="button button-small button-ghost" onClick={() => setPreview(!preview)} aria-pressed={preview}>{preview ? "Hide live preview" : "Live candidate preview"}</button>
            {dedicated?<button type="button" className="button button-small button-ghost" disabled={!editor} onClick={()=>setStagesOpen(true)}>Manage stages</button>:null}
            <button type="button" className="button button-small button-ghost" disabled={!editor || busy} onClick={() => void duplicate()}><DocumentDuplicateIcon aria-hidden="true" /> Duplicate</button>
            <button type="button" className="button button-small button-ghost" disabled={!dirty || !editor || busy} onClick={() => void save()}>{busy ? "Working…" : "Save draft"}</button>
            <button type="button" className="button button-small button-dark" disabled={!publisher || busy || Boolean(check)}
              title={check || "Publish an immutable version"} onClick={() => void publish()}><CheckCircleIcon aria-hidden="true" /> Publish version</button>
          </div>
          <p className="card-sub" role="status">{autosaveStatus} · {dirty ? "Unsaved changes" : "Saved draft"} · Revision {revision} · {currentVersions.length ? "Latest v" + currentVersions[0].versionNumber : "No published version"}</p>
          {recovery ? <div className="ats-pipeline-recovery" role="alert">
            <strong>Recover local draft?</strong> Unsaved edits from this browser are available for this pipeline.
            <button type="button" className="button button-small button-dark" onClick={recoverDraft}>Restore draft</button>
            <button type="button" className="button button-small button-ghost" onClick={discardRecovery}>Discard copy</button>
          </div> : null}
          {check ? <p className="ats-pipeline-validation" role="status"><ExclamationTriangleIcon aria-hidden="true" /> Publish blocked: {check} · {diagnostics.filter(i=>i.severity==="error").length} highlighted issue(s)</p> :
            <p className="ats-pipeline-valid"><CheckCircleIcon aria-hidden="true" /> Graph passes structural validation</p>}
          {message ? <p role="status">{message}</p> : null}
          {error ? <p role="alert" className="ats-pipeline-validation">{error}{error.toLowerCase().includes("revision") ? <button className="button button-small button-ghost" type="button" onClick={() => location.reload()}><ArrowPathIcon aria-hidden="true" /> Reload</button> : null}</p> : null}
        </div>
        <>
          <div className={"ats-pipeline-design-surface "+(preview?"is-preview-open":"")}>
          <div className="ats-pipeline-canvas-area">
            <div className="ats-pipeline-canvas-wrap" ref={viewportRef}
              onScroll={e=>setScrollPosition({left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop})}>
              <div className="ats-pipeline-canvas" ref={canvasRef}
                style={{width:3000*zoom,height:2400*zoom}}
                onPointerDown={e=>{
                  if (e.button!==0 || linking || (e.target as HTMLElement).closest("[data-pipeline-node]") ||
                      (e.target as HTMLElement).closest(".ats-pipeline-canvas-hint")) return;
                  const view=viewportRef.current;
                  if (!view) return;
                  panRef.current={clientX:e.clientX,clientY:e.clientY,left:view.scrollLeft,top:view.scrollTop};
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerUp={e=>{
                  if (!panRef.current) return;
                  panRef.current=null;
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onPointerCancel={()=>{panRef.current=null;}}
                onDragOver={(e) => e.preventDefault()} onDrop={onCanvasDrop}
                onPointerMove={(e) => {
                  if (panRef.current && viewportRef.current) {
                    viewportRef.current.scrollLeft=panRef.current.left-(e.clientX-panRef.current.clientX);
                    viewportRef.current.scrollTop=panRef.current.top-(e.clientY-panRef.current.clientY);
                  }
                  if (!linking) return;
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (rect) setPointer({ x: (e.clientX-rect.left)/zoom, y:(e.clientY-rect.top)/zoom });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && linking) { setLinking(null); setPointer(null); }
                }}
                role="region" aria-label="Interactive hiring workflow canvas" tabIndex={0}>
                <div className="ats-pipeline-canvas-content" style={{ width:3000,height:2400,transform: `scale(${zoom})` }}>
                  <svg viewBox="0 0 3000 2400" width="3000" height="2400" aria-hidden="true" className="ats-pipeline-wires">
                    <defs><marker id="ats-pipeline-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="currentColor" /></marker></defs>
                    {graph.edges.map((edge) => {
                      const a=graph.nodes.find((n) => n.id===edge.source), b=graph.nodes.find((n) => n.id===edge.target);
                      if (!a || !b) return null;
                      const y=a.y+(a.kind==="decision"?(edge.outcome==="yes"?27:59):40);
                      return <g key={edge.id}><path d={`M${a.x+214} ${y} C${a.x+270} ${y}, ${b.x-55} ${b.y+40}, ${b.x} ${b.y+40}`}
                        markerEnd="url(#ats-pipeline-arrow)" stroke="currentColor" strokeWidth="2" fill="none" opacity=".85" />
                        {edge.outcome ? <text x={(a.x+b.x)/2+110} y={(y+b.y+40)/2-10} fontSize="15" fill="currentColor">{edge.outcome}</text> : null}</g>;
                    })}
                    {linking && pointer ? (() => {
                      const from = graph.nodes.find((node) => node.id === linking.source);
                      if (!from) return null;
                      const y=from.y+(from.kind==="decision"?(linking.outcome==="yes"?27:59):40);
                      return <path d={`M${from.x+214} ${y} L${pointer.x} ${pointer.y}`} stroke="currentColor" strokeWidth="3" strokeDasharray="9 6" fill="none" opacity=".8"/>;
                    })() : null}
                  </svg>
                  {graph.nodes.map((node) => <div key={node.id} data-pipeline-node={node.id}
                    className={"ats-pipeline-node " + (node.id === selectedNodeId ? "is-selected " : "") + (linking ? "is-linking" : "")}
                    style={{ left:node.x,top:node.y, borderColor:graph.stages?.find(stage=>stage.id===node.stageId)?.color }}>
                    {diagnostics.some(issue=>issue.nodeId===node.id) ? <span className="ats-pipeline-node-issue" role="status"
                      title={diagnostics.filter(issue=>issue.nodeId===node.id).map(issue=>issue.message).join("; ")}>
                      <ExclamationTriangleIcon aria-hidden="true"/><span className="sr-only">{diagnostics.filter(issue=>issue.nodeId===node.id).map(issue=>issue.message).join("; ")}</span>
                    </span> : null}
                    {node.kind !== "start" ? <button type="button"
                      className="ats-pipeline-port ats-pipeline-port-input"
                      title={linking ? "Connect to "+node.label : "Incoming connections to "+node.label}
                      aria-label={linking ? "Connect to "+node.label : "Input port for "+node.label}
                      disabled={!editor || !linking}
                      onPointerUp={(e) => { e.stopPropagation(); finishLink(node.id); }}
                      onClick={(e) => { e.stopPropagation(); finishLink(node.id); }} /> : null}
                    <button type="button" className="ats-pipeline-node-main"
                      draggable={editor}
                      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("application/x-txk-ats-node", node.id); }}
                      onDrop={(e) => { const id=e.dataTransfer.getData("application/x-txk-ats-node"); if (id) { e.stopPropagation(); moveNodeFromDrop(e,id); }}}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => editNode(node.id)}
                      onKeyDown={(e) => {
                        if (!editor || !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) return;
                        e.preventDefault(); const delta=e.shiftKey ? 40 : 10;
                        setNode({ ...node, x: node.x + (e.key==="ArrowLeft"?-delta:e.key==="ArrowRight"?delta:0),
                          y: node.y + (e.key==="ArrowUp"?-delta:e.key==="ArrowDown"?delta:0) });
                      }} aria-pressed={node.id === selectedNodeId}>
                      <strong>{node.label}</strong><small>{node.kind.replaceAll("_"," ")}{ATS_PROVIDER_KINDS.has(node.kind) ? " · Not connected" : ""}</small>
                    </button>
                    {dedicated && editor && node.kind !== "end" ? (node.kind==="decision" ? ["yes","no"] as const : ["next"] as const).map(outcome =>
                      <button key={"add-"+outcome} type="button"
                        className={"ats-pipeline-node-add "+(outcome==="yes"?"is-yes":outcome==="no"?"is-no":"is-next")}
                        aria-label={"Add component after "+node.label+(outcome==="next"?"":" on "+outcome+" branch")}
                        title="Insert a connected component"
                        onClick={e=>{e.stopPropagation();openContextLibrary(node.id,outcome==="next"?undefined:outcome);}}>
                        <PlusIcon aria-hidden="true"/>
                      </button>) : null}
                    {node.kind !== "end" ? (node.kind==="decision" ? ["yes","no"] as const : ["next"] as const).map((outcome) =>
                      <button key={outcome} type="button" className={"ats-pipeline-port ats-pipeline-port-output "+(outcome==="yes"?"is-yes":outcome==="no"?"is-no":"is-next")}
                        disabled={!editor}
                        title={"Link "+node.label+(outcome==="next"?"": " ("+outcome+")")+" to another step"}
                        aria-label={"Start "+outcome+" connection from "+node.label}
                        onPointerDown={(e) => { e.stopPropagation(); beginLink(node.id, outcome==="next"?undefined:outcome); }}
                        onClick={(e) => { e.stopPropagation(); beginLink(node.id, outcome==="next"?undefined:outcome); }}>
                        {outcome==="next" ? <span className="sr-only">Next</span> : outcome[0].toUpperCase()}
                      </button>
                    ) : null}
                  </div>)}
                </div>
                {linking ? <div className="ats-pipeline-canvas-hint"><strong>Connecting:</strong> choose an input port or node.
                  <button type="button" onClick={()=>{setLinking(null);setPointer(null);}}>Cancel</button></div>:null}
              </div>
            </div>
            <div className="ats-pipeline-canvas-controls" role="toolbar" aria-label="Canvas navigation and edit controls">
              <details className="ats-canvas-help"><summary title="Canvas help" aria-label="Canvas help"><QuestionMarkCircleIcon aria-hidden="true"/></summary>
                <div role="note">Select a node to edit settings. Use the round output ports to link steps; decisions have Yes/No ports. Arrow keys move a focused node.</div>
              </details>
              <button type="button" disabled={!history.length || !editor} onClick={undo} title="Undo change" aria-label="Undo"><ArrowUturnLeftIcon aria-hidden="true"/></button>
              <button type="button" disabled={!future.length || !editor} onClick={redo} title="Redo change" aria-label="Redo"><ArrowUturnRightIcon aria-hidden="true"/></button>
              <span className="ats-pipeline-canvas-divider" aria-hidden="true"/>
              <button type="button" disabled={zoom <= .4} onClick={() => setZoom((v) => Math.max(.4,+(v-.1).toFixed(2)))} title="Zoom out" aria-label="Zoom out"><MagnifyingGlassMinusIcon aria-hidden="true"/></button>
              <output aria-label="Canvas zoom level">{Math.round(zoom*100)}%</output>
              <button type="button" disabled={zoom >= 1.6} onClick={() => setZoom((v) => Math.min(1.6,+(v+.1).toFixed(2)))} title="Zoom in" aria-label="Zoom in"><MagnifyingGlassPlusIcon aria-hidden="true"/></button>
              <button type="button" onClick={() => setZoom(1)} title="Reset zoom to 100%" aria-label="Reset zoom"><ArrowsPointingOutIcon aria-hidden="true"/></button>
              <span className="ats-pipeline-canvas-divider" aria-hidden="true"/>
              <button type="button" disabled={!editor} title="Automatically arrange workflow nodes" aria-label="Auto-layout pipeline"
                onClick={() => change(autoLayoutPipeline(graph))}><ArrowsPointingInIcon aria-hidden="true"/></button>
              <button type="button" disabled={!selectedNode} title="Center selected component" aria-label="Center selected component"
                onClick={() => {if(selectedNode) centerOnNode(selectedNode);}}><MagnifyingGlassPlusIcon aria-hidden="true"/></button>
            </div>
            <button type="button" className="ats-pipeline-minimap" aria-label="Minimap: click to pan across workflow" title="Click to move the canvas"
              onClick={panToMapPoint}>
              <svg viewBox="0 0 3000 2400" width="190" height="152" aria-hidden="true">
                <rect x={scrollPosition.left/zoom} y={scrollPosition.top/zoom}
                  width={viewportSize.width/zoom} height={viewportSize.height/zoom}
                  fill="none" stroke="currentColor" strokeWidth="24" rx="22"/>
                {graph.edges.map(edge=>{
                  const a=graph.nodes.find(n=>n.id===edge.source), b=graph.nodes.find(n=>n.id===edge.target);
                  return a&&b ? <line key={edge.id} x1={a.x+100} y1={a.y+40} x2={b.x+100} y2={b.y+40} stroke="currentColor" strokeWidth="12" opacity=".55"/> : null;
                })}
                {graph.nodes.map(node=><rect key={node.id} x={node.x} y={node.y} width="210" height="80" rx="12"
                  fill={node.id===selectedNodeId?"var(--txk-info)":"var(--txk-text-muted)"}/>)}
              </svg>
              <span>Minimap · pan</span>
            </button>
          </div>
            {preview?<CandidateJourneyLivePreview
              name={name} graph={graph} journey={journey} dirty={dirty}
              choices={branchChoices}
              onChoice={(nodeId,outcome)=>setBranchChoices(old=>{
                const updated={...old};
                if(outcome)updated[nodeId]=outcome;else delete updated[nodeId];
                return updated;
              })}
              onClose={()=>setPreview(false)}
              onLocate={id=>{
                const node=graph.nodes.find(n=>n.id===id);
                if(node){setSelectedNodeId(id);centerOnNode(node);}
              }}/>:null}
          </div>
          {stagesOpen && dedicated ? <div className="ats-pipeline-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setStagesOpen(false);}}>
            <div className="card ats-pipeline-modal ats-stage-manager" role="dialog" aria-modal="true" aria-label="Manage hiring stages" tabIndex={-1} ref={stagesRef}>
              <div className="ats-pipeline-modal-head">
                <div><p className="eyebrow">Workflow stages</p><h2>Manage stages</h2></div>
                <button type="button" aria-label="Close stage manager" onClick={()=>setStagesOpen(false)}><XMarkIcon aria-hidden="true"/></button>
              </div>
              {graph.schemaVersion===1?<div className="ats-stage-upgrade">
                <p className="card-sub">This draft uses the original graph format. Enable stages on this editable draft without changing previously published versions.</p>
                <button type="button" className="button button-dark" disabled={!editor}
                  onClick={()=>change(toStageGraph(graph))}>Enable stage management</button>
              </div>:<div className="ats-stage-manager-list">
                {(graph.stages??[]).slice().sort((a,b)=>a.sortOrder-b.sortOrder).map(stage=>
                  <div className="ats-stage-manager-row" key={stage.id}>
                    <label>Stage name<input className="input" maxLength={80} disabled={!editor}
                      value={stage.name} onChange={e=>editStage(stage.id,{name:e.target.value})}/></label>
                    <label>Color<input type="color" disabled={!editor} value={stage.color}
                      onChange={e=>editStage(stage.id,{color:e.target.value})}/></label>
                    <label>Completion<select className="select" disabled={!editor}
                      value={stage.completionRule} onChange={e=>editStage(stage.id,{completionRule:e.target.value as "all_required"|"manual"})}>
                      <option value="all_required">All required steps</option>
                      <option value="manual">Manual review</option>
                    </select></label>
                    <button className="button button-ghost" type="button"
                      disabled={!editor||(graph.stages?.length??0)<2} onClick={()=>deleteStage(stage.id)}>Remove</button>
                  </div>)}
                <button type="button" className="button button-ghost"
                  disabled={!editor||(graph.stages?.length??0)>=30} onClick={addStage}><PlusIcon aria-hidden="true"/> Add stage</button>
              </div>}
              <p className="card-sub">Stage colors and assignments are versioned with the graph. Publishing creates a new immutable snapshot.</p>
              <button type="button" className="button button-dark" onClick={()=>setStagesOpen(false)}>Done</button>
            </div>
          </div>:null}
          {libraryOpen && dedicated ? <div className="ats-pipeline-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setLibraryOpen(false);}}>
            <div className="card ats-pipeline-modal ats-component-picker" role="dialog" aria-modal="true"
              aria-labelledby="ats-component-picker-title" tabIndex={-1} ref={libraryRef}>
              <div className="ats-pipeline-modal-head"><div><p className="eyebrow">Component library</p>
                <h2 id="ats-component-picker-title">Insert workflow step</h2></div>
                <button type="button" aria-label="Close component picker" onClick={()=>setLibraryOpen(false)}>
                  <XMarkIcon aria-hidden="true"/></button></div>
              <input className="input" type="search" autoFocus placeholder="Search components…" aria-label="Search components"
                value={componentQuery} onChange={e=>setComponentQuery(e.target.value)}/>
              <div className="ats-component-picker-list">
                {ATS_NODE_KINDS.filter(k=>k!=="start"&&k!=="end"&&
                  (LABELS[k]+" "+DESCRIPTIONS[k]).toLowerCase().includes(componentQuery.trim().toLowerCase()))
                  .map(kind=><button type="button" key={kind} onClick={()=>insertComponent(kind)}>
                    <strong>{LABELS[kind]}</strong><span>{DESCRIPTIONS[kind]}</span>
                    {ATS_PROVIDER_KINDS.has(kind)?<small>Integration setup required for live execution</small>:null}
                  </button>)}
              </div>
              <p className="card-sub">Choose a component to connect it after the selected step. Integrations are configured after insertion.</p>
            </div>
          </div>:null}
          {settingsOpen && selectedNode ? <div className="ats-pipeline-modal-backdrop" onMouseDown={(e) => { if (e.target===e.currentTarget) setSettingsOpen(false); }}>
            <div className="card ats-pipeline-inspector ats-pipeline-modal" ref={modalRef}
              role="dialog" aria-modal="true" aria-labelledby="ats-pipeline-settings-heading" tabIndex={-1}>
              <div className="ats-pipeline-modal-head">
                <div><p className="eyebrow">{LABELS[selectedNode.kind]}</p><h2 id="ats-pipeline-settings-heading">Component settings</h2></div>
                <button type="button" aria-label="Close component settings" title="Close settings" onClick={() => setSettingsOpen(false)}><XMarkIcon aria-hidden="true"/></button>
              </div>
              <p className="card-sub">Changes update your draft immediately. Use Save draft to persist them.</p>
              <div className="ats-pipeline-settings-fields">
                <label><span className="ats-pipeline-setting-title">Step title <Help label="Step title" text="A short descriptive name shown on the workflow and to candidates when visible."/></span>
                  <input className="input" value={selectedNode.label} disabled={!editor} onChange={(e) => setNode({ ...selectedNode,label:e.target.value })}/></label>
                {graph.schemaVersion===2&&selectedNode.kind!=="start"&&selectedNode.kind!=="end"?<label>
                  <span className="ats-pipeline-setting-title">Hiring stage</span>
                  <select className="select" disabled={!editor} value={selectedNode.stageId??""}
                    onChange={e=>setNode({...selectedNode,stageId:e.target.value})}>
                    {(graph.stages??[]).slice().sort((a,b)=>a.sortOrder-b.sortOrder).map(stage=>
                      <option value={stage.id} key={stage.id}>{stage.name}</option>)}
                  </select></label>:null}
                <div className="form-grid ats-pipeline-settings-switches">
                  <label><span className="ats-pipeline-setting-title">Required <Help label="Required step" text="When enabled, completion of this step is required to advance along the workflow."/></span>
                    <input type="checkbox" checked={selectedNode.required} disabled={!editor || selectedNode.kind==="start"} onChange={(e) => setNode({ ...selectedNode, required:e.target.checked })}/></label>
                  <label><span className="ats-pipeline-setting-title">Candidate-visible <Help label="Candidate visibility" text="Controls whether candidates see this step on their progress tracker. Private internal reviews must stay hidden."/></span>
                    <input type="checkbox" checked={selectedNode.candidateVisible} disabled={!editor} onChange={(e) => setNode({ ...selectedNode,candidateVisible:e.target.checked })}/></label>
                </div>
                <label><span className="ats-pipeline-setting-title">Responsible role <Help label="Responsible role" text="Who is accountable for this step? The candidate view shows either a candidate action or waiting on the employer, never private role assignments."/></span>
                  <select className="select" disabled={!editor} value={selectedNode.config.ownerRole??""}
                    onChange={e=>setNode({...selectedNode,config:{...selectedNode.config,
                      ownerRole:(e.target.value||undefined) as PipelineNode["config"]["ownerRole"]}})}>
                    <option value="">Based on step type</option>
                    <option value="candidate">Candidate</option><option value="recruiter">Recruiter</option>
                    <option value="hiring_manager">Hiring manager</option><option value="employer_admin">Employer administrator</option>
                  </select></label>
                <div className="ats-pipeline-settings-duration">
                  <label><span className="ats-pipeline-setting-title">Estimated effort (minutes) <Help label="Expected minutes" text="Approximate time to complete the task. Informational only; does not set an appointment."/></span>
                    <input className="input" type="number" min={1} max={1440} disabled={!editor} value={selectedNode.config.expectedMinutes??""}
                      onChange={e=>setNode({...selectedNode,config:{...selectedNode.config,expectedMinutes:e.target.value?Number(e.target.value):undefined}})}/></label>
                  <label><span className="ats-pipeline-setting-title">Target window (hours) <Help label="Target hours" text="Planning window measured after this step is assigned. This is not a firm calendar deadline or a reminder until ATS-03 task assignments launch."/></span>
                    <input className="input" type="number" min={1} max={2160} disabled={!editor} value={selectedNode.config.targetHours??""}
                      onChange={e=>setNode({...selectedNode,config:{...selectedNode.config,targetHours:e.target.value?Number(e.target.value):undefined}})}/></label>
                </div>
                <label><span className="ats-pipeline-setting-title">Instructions <Help label="Instructions" text="Candidate-safe guidance for completing this step. Do not include private notes or assessment answers."/></span>
                  <textarea className="textarea" rows={3} value={selectedNode.config.instructions??""} disabled={!editor}
                    onChange={(e) => setNode({ ...selectedNode,config:{...selectedNode.config,instructions:e.target.value} })}/></label>
                {selectedNode.kind==="consent" ? <label><span className="ats-pipeline-setting-title">Required disclosure <Help label="Required disclosure" text="Describe exactly what the candidate is consenting to. Publishing a consent node requires non-empty disclosure text."/></span>
                  <textarea className="textarea" rows={3} value={selectedNode.config.disclosure??""} disabled={!editor}
                    onChange={(e) => setNode({ ...selectedNode,config:{...selectedNode.config,disclosure:e.target.value} })}/></label> : null}
                {["video","assessment"].includes(selectedNode.kind) ? <label><span className="ats-pipeline-setting-title">Public HTTPS media URL <Help label="Media URL" text="An HTTPS link to the public media or assessment instructions. Do not paste private video tokens, API keys or answer keys."/></span>
                  <input className="input" type="url" value={selectedNode.config.url??""} disabled={!editor}
                    onChange={(e) => setNode({ ...selectedNode,config:{...selectedNode.config,url:e.target.value} })}/></label>:null}
                {selectedNode.kind==="application_form" ? <label><span className="ats-pipeline-setting-title">Form template fields <Help label="Form fields" text="One field per line: id|label|type|required|choices. Types: text, textarea, email, number, select, checkbox. Select choices are comma-separated."/></span>
                  <textarea className="textarea" rows={6} defaultValue={defaultFields(selectedNode.config.fields)} key={selectedNode.id}
                    disabled={!editor} onBlur={(e) => {
                      try { const fields=parseFields(e.target.value); if (JSON.stringify(fields)!==JSON.stringify(selectedNode.config.fields??[]))
                        setNode({ ...selectedNode, config:{...selectedNode.config,fields} }); }
                      catch (err) { setError(err instanceof Error?err.message:"Invalid fields"); }
                    }}/></label> : null}
                {selectedNode.kind!=="end" ? <fieldset className="ats-pipeline-connections"><legend>Connections <Help label="Connections" text="Assign a next step, or close settings and click the connection ports on the canvas. Decisions require separate Yes and No branches."/></legend>
                  {(selectedNode.kind==="decision" ? ["yes","no"] : ["next"]).map((outcome) => {
                    const assigned=graph.edges.find((e)=>e.source===selectedNode.id && (outcome==="next" || e.outcome===outcome));
                    return <label key={outcome}><span className="ats-pipeline-setting-title">{outcome==="next"?"Next step":outcome.toUpperCase()+" branch"}
                        <Help label={outcome+" connection"} text={outcome==="next"?"Choose the next component. Empty means unlinked.": "Route the "+outcome.toUpperCase()+" result to a specific next step."}/></span>
                      <select className="select" disabled={!editor} value={assigned?.target??""}
                        onChange={(e) => connect(selectedNode.id,e.target.value,outcome==="next"?undefined:outcome as "yes"|"no")}>
                        <option value="">No connection</option>
                        {graph.nodes.filter((n)=>n.id!==selectedNode.id && n.kind!=="start").map((n)=><option key={n.id} value={n.id}>{n.label}</option>)}
                      </select>
                    </label>;
                  })}</fieldset> : null}
                {selectedNode.kind!=="start" && selectedNode.kind!=="end" ? <button type="button" className="button button-ghost" disabled={!editor} onClick={removeNode}><TrashIcon aria-hidden="true"/> Remove step</button> : null}
                {selectedNode.kind === "background_check" ? <CheckrConnection employerId={employerId} /> : null}
                {ATS_PROVIDER_KINDS.has(selectedNode.kind) ? <p className="card-sub">Publishing a node does not start screening or other external actions. Candidate task execution requires an assigned application.</p> : null}
              </div>
              <div className="ats-pipeline-modal-footer">
                <span className="card-sub">{dirty?"Unsaved changes":"Saved draft"} · Rev. {revision}</span>
                <button type="button" className="button button-dark" onClick={() => setSettingsOpen(false)}>Done</button>
              </div>
            </div>
          </div> : null}
        </>
        {currentVersions.length ? <div className="card"><h2>Published versions</h2><p className="card-sub">Published snapshots are immutable. Editing this draft and publishing again creates a new version.</p>
          <div className="grid">{currentVersions.map((v) => <div className="ats-pipeline-version" key={v.id}><strong>Version {v.versionNumber}</strong><small>{new Date(v.publishedAt).toLocaleString()}</small><small>{v.graph.nodes.length} steps</small></div>)}</div>
        </div> : null}
      </>}
    </section>
  </div>;
}
