import { validatePipelineGraph, type PipelineGraph, type PipelineNode, type PipelineEdge } from "./ats-pipelines";

export type PipelineIssue = { nodeId: string; message: string; severity: "error" | "warning" };
export type CandidatePreviewStep = {
  id: string; label: string; instructions: string; required: boolean;
  expectedMinutes: number | null; targetHours: number | null;
  owner: "candidate" | "employer"; status: "upcoming";
};
export type CandidateJourneyPreview = {
  steps: CandidatePreviewStep[]; nextAction: string | null; awaitingDecision: string | null;
  completedPath: boolean; diagnostics: string[];
};

/** Draft-time issues used by the editor. Publication still calls canonical validation. */
export function inspectPipelineGraph(graph: PipelineGraph): PipelineIssue[] {
  const issues: PipelineIssue[] = [];
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const add = (node: PipelineNode, message: string, severity: PipelineIssue["severity"] = "error") =>
    issues.push({ nodeId: node.id, message, severity });
  for (const node of graph.nodes) {
    const incoming = graph.edges.filter(e => e.target === node.id);
    const outgoing = graph.edges.filter(e => e.source === node.id);
    if (node.kind !== "start" && !incoming.length) add(node, "No incoming connection");
    if (node.kind === "end") {
      if (outgoing.length) add(node, "End cannot connect to another step");
    } else if (node.kind === "decision") {
      if (!outgoing.some(e => e.outcome === "yes")) add(node, "Missing Yes branch");
      if (!outgoing.some(e => e.outcome === "no")) add(node, "Missing No branch");
      if (outgoing.length !== 2) add(node, "Decision requires exactly two branches");
    } else if (outgoing.length !== 1) add(node, "Connect exactly one next step");
    if (node.kind === "consent" && !node.config.disclosure?.trim()) add(node, "Required disclosure is empty");
    if (!node.label.trim()) add(node, "Step title is required");
    if (node.candidateVisible && node.config.ownerRole && node.config.ownerRole !== "candidate")
      add(node, "Visible step is owned by an employer role; candidate should see a waiting status", "warning");
  }
  const reachable = new Set<string>();
  function visit(id: string) {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const edge of graph.edges.filter(e => e.source === id)) visit(edge.target);
  }
  visit(graph.entryNodeId);
  for (const node of graph.nodes) if (!reachable.has(node.id)) add(node, "Not reachable from Start");
  for (const edge of graph.edges) {
    const from = nodes.get(edge.source), to = nodes.get(edge.target);
    if (from && to && (to.kind === "start" || from.kind === "end" || from.id === to.id))
      add(from, "Invalid direction of connection");
  }
  try { validatePipelineGraph(graph, true); }
  catch (e) {
    const reason = e instanceof Error ? e.message : "Invalid workflow";
    if (!issues.some(x => reason.includes(x.message))) {
      const start = nodes.get(graph.entryNodeId);
      if (start) add(start, reason);
    }
  }
  return issues;
}

/** Deterministic topological layering; moves positions only and never mutates a saved version. */
export function autoLayoutPipeline(graph: PipelineGraph): PipelineGraph {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const indegree = new Map(graph.nodes.map(node => [node.id, 0]));
  for (const edge of graph.edges) if (indegree.has(edge.target)) indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  const queue = graph.nodes.filter(node => !indegree.get(node.id)).map(node => node.id);
  const level = new Map(graph.nodes.map(node => [node.id, 0]));
  const visited = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    visited.add(id);
    for (const edge of graph.edges.filter(e => e.source === id)) {
      level.set(edge.target, Math.max(level.get(edge.target) ?? 0, (level.get(id) ?? 0) + 1));
      indegree.set(edge.target, (indegree.get(edge.target) ?? 1) - 1);
      if (indegree.get(edge.target) === 0) queue.push(edge.target);
    }
  }
  // Incomplete drafts can have disconnected/cyclic segments: place them separately without looping.
  const ordered = [...queue, ...graph.nodes.filter(node => !visited.has(node.id)).map(node => node.id)];
  const indexInLevel = new Map<number, number>();
  const positioned = new Map<string, { x: number; y: number }>();
  for (const id of ordered) {
    const column = Math.min(level.get(id) ?? 0, 9);
    const row = indexInLevel.get(column) ?? 0;
    indexInLevel.set(column, row + 1);
    positioned.set(id, { x: 75 + 285 * column, y: 130 + row * 140 });
  }
  return { ...graph, nodes: graph.nodes.map(node => ({ ...node, ...(positioned.get(node.id) ?? {}) })) };
}

/** No synthetic applicant decisions. Branch choices are explicit in the simulator. */
export function simulateCandidateJourney(
  graph: PipelineGraph, choices: Record<string, "yes" | "no"> = {},
): CandidateJourneyPreview {
  const steps: CandidatePreviewStep[] = [];
  const seen = new Set<string>();
  const diagnostics: string[] = [];
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  let id: string | undefined = graph.entryNodeId;
  let awaitingDecision: string | null = null;
  let completedPath = false;
  while (id && nodes.has(id)) {
    if (seen.has(id)) { diagnostics.push("Workflow cycle detected"); break; }
    seen.add(id);
    const node: PipelineNode = nodes.get(id)!;
    if (node.kind === "end") completedPath = true;
    if (node.candidateVisible && node.kind !== "start") {
      steps.push({
        id: node.id, label: node.label, instructions: node.config.instructions ?? "",
        required: node.required, targetHours: node.config.targetHours ?? null,
        expectedMinutes: node.config.expectedMinutes ?? null,
        owner: node.config.ownerRole === "candidate" || !node.config.ownerRole && !["manual_review","decision","notification"].includes(node.kind) ? "candidate" : "employer",
        status: "upcoming",
      });
    }
    if (node.kind === "end") break;
    const outgoing = graph.edges.filter(edge => edge.source === node.id);
    if (node.kind === "decision" && !choices[node.id]) {
      awaitingDecision = node.id; break;
    }
    const next: PipelineEdge | undefined = node.kind === "decision" ? outgoing.find(edge => edge.outcome === choices[node.id]) : outgoing[0];
    if (!next) { diagnostics.push("Missing connection after " + node.label); break; }
    id = next.target;
  }
  // Hidden steps are skipped. No private instructions/notes or screening metadata are projected.
  const next = steps.find(step => step.owner === "candidate") ?? null;
  return { steps, nextAction: next?.label ?? (awaitingDecision ? "Await an employer decision" : completedPath ? "No additional action planned" : "Await next steps"),
    awaitingDecision, completedPath, diagnostics };
}
