// ATS-02: Pure, server-revalidated hiring pipeline DSL. Never contain applicant data, provider secrets or assessment answer keys.
export const ATS_NODE_KINDS = [
  "start", "end", "application_form", "assessment", "video", "consent",
  "contract_signature", "interview_in_person", "interview_online",
  "background_check", "fingerprinting", "drug_test",
  "manual_review", "decision", "notification",
] as const;
export type ATSNodeKind = (typeof ATS_NODE_KINDS)[number];

export type PipelineField = { id: string; label: string; type: "text" | "textarea" | "email" | "number" | "select" | "checkbox"; required: boolean; options?: string[] };
export type PipelineNode = {
  id: string; kind: ATSNodeKind; label: string; x: number; y: number;
  required: boolean; candidateVisible: boolean;
  config: { instructions?: string; url?: string; fields?: PipelineField[]; disclosure?: string; expectedMinutes?: number; ownerRole?: "candidate" | "recruiter" | "hiring_manager" | "employer_admin"; targetHours?: number };
};
export type PipelineEdge = { id: string; source: string; target: string; outcome?: "yes" | "no" };
export type PipelineGraph = { schemaVersion: 1; entryNodeId: string; nodes: PipelineNode[]; edges: PipelineEdge[] };
export type PipelineTemplateSummary = {
  id: string; employerId: string; name: string; description: string; revision: number;
  graph: PipelineGraph; latestVersion: number; updatedAt: string; createdAt: string;
};
export type PipelineVersionSummary = {
  id: string; employerId: string; templateId: string; versionNumber: number;
  graph: PipelineGraph; publishedAt: string;
};

export const ATS_PROVIDER_KINDS = new Set<ATSNodeKind>([
  "contract_signature", "interview_online", "background_check", "fingerprinting", "drug_test",
]);

export const STARTER_PIPELINE: PipelineGraph = {
  schemaVersion: 1, entryNodeId: "start",
  nodes: [
    { id: "start", kind: "start", label: "Start", x: 60, y: 120, required: true, candidateVisible: false, config: {} },
    { id: "application", kind: "application_form", label: "Job application", x: 340, y: 120, required: true, candidateVisible: true,
      config: { instructions: "Complete the application.", fields: [
        { id: "experience", label: "Describe your relevant experience", type: "textarea", required: true },
      ] } },
    { id: "review", kind: "manual_review", label: "Employer review", x: 620, y: 120, required: true, candidateVisible: false, config: {} },
    { id: "complete", kind: "end", label: "Complete", x: 900, y: 120, required: true, candidateVisible: true, config: {} },
  ],
  edges: [
    { id: "e1", source: "start", target: "application" },
    { id: "e2", source: "application", target: "review" },
    { id: "e3", source: "review", target: "complete" },
  ],
};

const ID = /^[a-z][a-z0-9_-]{0,59}$/;
function obj(v: unknown, name: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(name + " must be an object");
  return v as Record<string, unknown>;
}
function text(v: unknown, name: string, max: number): string {
  if (typeof v !== "string" || v.trim().length > max) throw new Error("Invalid " + name);
  return v.trim();
}
function id(v: unknown, name: string): string {
  const s = text(v, name, 60);
  if (!ID.test(s)) throw new Error("Invalid " + name);
  return s;
}
function bool(v: unknown, name: string): boolean {
  if (typeof v !== "boolean") throw new Error(name + " must be Boolean");
  return v;
}
function number(v: unknown, name: string, low: number, high: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < low || v > high) throw new Error("Invalid " + name);
  return v;
}
function fields(input: unknown): PipelineField[] {
  if (!Array.isArray(input) || input.length > 35) throw new Error("Invalid form fields");
  const unique = new Set<string>();
  return input.map((raw) => {
    const f = obj(raw, "field");
    const fieldId = id(f.id, "field id");
    if (unique.has(fieldId)) throw new Error("Duplicate field ID");
    unique.add(fieldId);
    const type = f.type;
    if (!["text", "textarea", "email", "number", "select", "checkbox"].includes(String(type))) throw new Error("Invalid field type");
    const opts = f.options === undefined ? [] : f.options;
    if (!Array.isArray(opts) || opts.length > 30) throw new Error("Invalid choices");
    const options = opts.map((v: unknown) => text(v, "option", 100)).filter(Boolean);
    if (type === "select" && options.length === 0) throw new Error("Select field requires choices");
    return { id: fieldId, label: text(f.label, "field label", 140), type: type as PipelineField["type"], required: bool(f.required, "field required"), ...(options.length ? { options } : {}) };
  });
}
function config(raw: unknown, kind: ATSNodeKind, publish: boolean): PipelineNode["config"] {
  const v = obj(raw ?? {}, "component config");
  const allowed = ["instructions", "url", "fields", "disclosure", "expectedMinutes", "ownerRole", "targetHours"];
  if (Object.keys(v).some((key) => !allowed.includes(key))) throw new Error("Unsupported or secret-bearing component setting");
  const result: PipelineNode["config"] = {};
  if (v.instructions !== undefined) result.instructions = text(v.instructions, "instructions", 3000);
  if (v.disclosure !== undefined) result.disclosure = text(v.disclosure, "disclosure", 2500);
  if (v.expectedMinutes !== undefined) result.expectedMinutes = number(v.expectedMinutes, "duration", 1, 1440);
  if (v.targetHours !== undefined) result.targetHours = number(v.targetHours, "target hours", 1, 2160);
  if (v.ownerRole !== undefined) {
    if (!["candidate", "recruiter", "hiring_manager", "employer_admin"].includes(String(v.ownerRole))) throw new Error("Invalid step owner role");
    result.ownerRole = v.ownerRole as NonNullable<PipelineNode["config"]["ownerRole"]>;
  }
  if (v.url !== undefined) {
    const url = text(v.url, "media URL", 2048);
    if (url) {
      let parsed: URL;
      try { parsed = new URL(url); } catch { throw new Error("Invalid media URL"); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Only public HTTPS media URLs are allowed");
      result.url = url;
    }
  }
  if (v.fields !== undefined) {
    if (kind !== "application_form") throw new Error("Custom fields belong to form components");
    result.fields = fields(v.fields);
  }
  if (publish && kind === "consent" && !result.disclosure) throw new Error("Consent requires disclosure text");
  return result;
}

export function validatePipelineGraph(input: unknown, publish = true): PipelineGraph {
  const graph = obj(input, "pipeline");
  if (graph.schemaVersion !== 1) throw new Error("Unsupported pipeline schema");
  if (!Array.isArray(graph.nodes) || graph.nodes.length < 2 || graph.nodes.length > 100) throw new Error("Pipeline requires 2–100 nodes");
  if (!Array.isArray(graph.edges) || graph.edges.length > 200) throw new Error("Too many pipeline connections");
  const nodes: PipelineNode[] = graph.nodes.map((raw) => {
    const n = obj(raw, "node");
    if (!ATS_NODE_KINDS.includes(n.kind as ATSNodeKind)) throw new Error("Unsupported component type");
    const kind = n.kind as ATSNodeKind;
    return {
      id: id(n.id, "node id"), kind, label: text(n.label, "component label", 140),
      x: number(n.x, "horizontal position", -20000, 20000),
      y: number(n.y, "vertical position", -20000, 20000),
      required: bool(n.required, "required"), candidateVisible: bool(n.candidateVisible, "candidate visibility"),
      config: config(n.config, kind, publish),
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new Error("Duplicate component ID");
  const startNodes = nodes.filter((n) => n.kind === "start");
  const endNodes = nodes.filter((n) => n.kind === "end");
  if (startNodes.length !== 1 || endNodes.length < 1) throw new Error("Exactly one Start and at least one End required");
  const entryNodeId = id(graph.entryNodeId, "entry component");
  if (startNodes[0].id !== entryNodeId) throw new Error("Entry component must be Start");
  const edgeIds = new Set<string>();
  const edges: PipelineEdge[] = graph.edges.map((raw) => {
    const e = obj(raw, "edge");
    const edgeId = id(e.id, "edge id");
    if (edgeIds.has(edgeId)) throw new Error("Duplicate edge ID");
    edgeIds.add(edgeId);
    const source = id(e.source, "edge source"), target = id(e.target, "edge target");
    if (!ids.has(source) || !ids.has(target) || source === target) throw new Error("Connection references invalid components");
    if (e.outcome !== undefined && e.outcome !== "yes" && e.outcome !== "no") throw new Error("Invalid branch outcome");
    const from = nodes.find((n) => n.id === source)!;
    const to = nodes.find((n) => n.id === target)!;
    if (from.kind === "end" || to.kind === "start") throw new Error("Start/End connection not permitted");
    if (e.outcome && from.kind !== "decision") throw new Error("Only decision components can branch");
    return { id: edgeId, source, target, ...(e.outcome ? { outcome: e.outcome } : {}) };
  });
  if (!publish) return { schemaVersion: 1, entryNodeId, nodes, edges };
  const edgesBySource = new Map(nodes.map((n) => [n.id, edges.filter((e) => e.source === n.id)]));
  for (const node of nodes) {
    const outgoing = edgesBySource.get(node.id)!;
    if (node.kind === "end" && outgoing.length) throw new Error("End cannot have outgoing connections");
    if (node.kind === "decision") {
      if (outgoing.length !== 2 || !outgoing.some((e) => e.outcome === "yes") || !outgoing.some((e) => e.outcome === "no"))
        throw new Error("Decision requires Yes and No branches");
    } else if (node.kind !== "end" && outgoing.length !== 1) throw new Error(node.label + " must connect to exactly one next step");
    if (node.kind !== "start" && !edges.some((e) => e.target === node.id)) throw new Error(node.label + " is disconnected");
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  function walk(nodeId: string) {
    if (visiting.has(nodeId)) throw new Error("Pipeline cycles are not allowed");
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const edge of edgesBySource.get(nodeId) ?? []) walk(edge.target);
    visiting.delete(nodeId);
    visited.add(nodeId);
  }
  walk(entryNodeId);
  if (visited.size !== nodes.length) throw new Error("Every component must be reachable from Start");
  return { schemaVersion: 1, entryNodeId, nodes, edges };
}
/** Editor-safe, immutable edge linking with immediate cycle/branch checks.
 * Validation runs again on the server when drafts are saved/published. */
export function upsertPipelineConnection(
  graph: PipelineGraph, source: string, target: string,
  outcome?: "yes" | "no",
): PipelineGraph {
  const from = graph.nodes.find((n) => n.id === source);
  const to = graph.nodes.find((n) => n.id === target);
  if (!from || !to || source === target) throw new Error("Choose two different workflow components");
  if (from.kind === "end" || to.kind === "start") throw new Error("Start and End connections cannot be reversed");
  if (from.kind === "decision" && !outcome) throw new Error("Choose Yes or No for a decision branch");
  if (from.kind !== "decision" && outcome) throw new Error("Only decision components support Yes/No branches");
  // Converting a regular step into a decision must discard its legacy
  // unlabelled "next" edge when an explicit Yes/No relation is created.
  const replaced = graph.edges.filter((edge) => !(edge.source === source &&
    (from.kind !== "decision" || !edge.outcome || edge.outcome === outcome)));
  const edge: PipelineEdge = {
    id: "edge_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    source, target, ...(outcome ? { outcome } : {}),
  };
  const next: PipelineGraph = { ...graph, edges: [...replaced, edge] };
  // Prevent a new back-edge in the editor without requiring a completed draft.
  const visiting = new Set<string>(), visited = new Set<string>();
  function walk(nodeId: string) {
    if (visiting.has(nodeId)) throw new Error("This connection creates a cycle");
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const connection of next.edges.filter((e) => e.source === nodeId)) walk(connection.target);
    visiting.delete(nodeId); visited.add(nodeId);
  }
  for (const node of graph.nodes) walk(node.id);
  return validatePipelineGraph(next, false);
}

export function removePipelineConnection(graph: PipelineGraph, source: string, outcome?: "yes" | "no"): PipelineGraph {
  const from = graph.nodes.find((n) => n.id === source);
  if (!from) return graph;
  return { ...graph, edges: graph.edges.filter((edge) => edge.source !== source ||
    (from.kind === "decision" && edge.outcome !== outcome)) };
}

export function validatePipelineName(raw: unknown): string {
  const name = text(raw, "pipeline name", 140);
  if (name.length < 3) throw new Error("Pipeline name must have at least 3 characters");
  return name;
}
export function isPipelineConfigurator(role: string): boolean {
  return role === "employer_owner" || role === "employer_admin" || role === "recruiter";
}
export function isPipelinePublisher(role: string): boolean {
  return role === "employer_owner" || role === "employer_admin";
}
