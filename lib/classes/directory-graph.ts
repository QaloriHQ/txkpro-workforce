import type { ClassRecord } from "@/lib/classes/server";

export type DirectoryData = {
  classes: ClassRecord[];
  people: { userId: string; name: string; role: string; scopeType: string; scopeId: string; institutionId: string; institutionName: string; cohortId: string; cohortName: string; program: string | null }[];
  assistance: { name: string; institutionId: string; requestedAt: string }[];
};
export type DirectoryNode = {
  id: string; kind: "institution" | "program" | "cohort" | "staff" | "class";
  name: string; subtitle: string; details: string[]; children: DirectoryNode[];
  x: number; y: number;
};
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 112;

// Connections come only from the authorized read model. They describe scope
// and affiliation, never inferred management reporting lines.
export function directoryGraph(data: DirectoryData, role: string, cohort: string, collapsed: ReadonlySet<string>) {
  const people = data.people.filter(p => (!role || p.role === role) && (!cohort || p.cohortId === cohort));
  const classes = role ? [] : data.classes.filter(c => !cohort || c.cohorts.some(v => v.cohortId === cohort));
  const roots: DirectoryNode[] = [];
  const make = (id: string, kind: DirectoryNode["kind"], name: string, subtitle: string, details: string[] = []): DirectoryNode =>
    ({ id, kind, name, subtitle, details, children: [], x: 0, y: 0 });
  const institutions = new Set([...people.map(p => p.institutionId), ...classes.map(c => c.institutionId)]);
  for (const id of institutions) {
    const staff = people.filter(p => p.institutionId === id);
    const linkedClasses = classes.filter(c => c.institutionId === id);
    const root = make(`institution:${id}`, "institution", staff[0]?.institutionName ?? data.people.find(p => p.institutionId === id)?.institutionName ?? id, "Authorized institution");
    const cohorts = new Map<string, { name: string; program: string }>();
    staff.forEach(p => cohorts.set(p.cohortId, { name: p.cohortName, program: p.program ?? "Program" }));
    linkedClasses.forEach(c => c.cohorts.filter(v => !cohort || v.cohortId === cohort).forEach(v => cohorts.set(v.cohortId, { name: v.name, program: v.program ?? "Program" })));
    for (const program of [...new Set([...cohorts.values()].map(c => c.program))].sort()) {
      const branch = make(`${root.id}:program:${program}`, "program", program, "Program");
      for (const [cohortId, value] of cohorts) {
        if (value.program !== program) continue;
        const group = make(`cohort:${cohortId}`, "cohort", value.name, program);
        const seen = new Set<string>();
        for (const person of staff.filter(p => p.cohortId === cohortId)) {
          const key = `${person.userId}:${person.role}:${person.scopeType}:${person.scopeId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          group.children.push(make(`${group.id}:staff:${key}`, "staff", person.name, person.role.replaceAll("_", " "),
            [`Role: ${person.role.replaceAll("_", " ")}`, `Scope: ${person.scopeType.replaceAll("_", " ")}`, `Cohort connection: ${value.name}`]));
        }
        for (const item of linkedClasses.filter(c => c.cohorts.some(v => v.cohortId === cohortId))) {
          group.children.push(make(`${group.id}:class:${item.classId}`, "class", item.name, item.courseName || "Class",
            [`Status: ${item.status}`, `Cohorts: ${item.cohorts.map(v => v.name).join(", ")}`, `Instructors: ${item.instructors?.map(v => v.name).join(", ") || "None assigned"}`]));
        }
        branch.children.push(group);
      }
      root.children.push(branch);
    }
    roots.push(root);
  }
  const visible: DirectoryNode[] = [];
  const edges: { from: DirectoryNode; to: DirectoryNode }[] = [];
  const children = (n: DirectoryNode) => collapsed.has(n.id) ? [] : n.children;
  const widths = new Map<string, number>();
  function measure(n: DirectoryNode): number {
    const width = Math.max(NODE_WIDTH + 32, children(n).reduce((sum, child) => sum + measure(child), 0));
    widths.set(n.id, width);
    return width;
  }
  function place(n: DirectoryNode, left: number, depth: number) {
    n.x = left + (widths.get(n.id)! - NODE_WIDTH) / 2;
    n.y = 32 + depth * 176;
    visible.push(n);
    let childLeft = left;
    for (const child of children(n)) {
      place(child, childLeft, depth + 1);
      edges.push({ from: n, to: child });
      childLeft += widths.get(child.id)!;
    }
  }
  let left = 16;
  for (const root of roots) { measure(root); place(root, left, 0); left += widths.get(root.id)!; }
  return { nodes: visible, edges, width: Math.max(272, left + 16), height: Math.max(160, ...visible.map(n => n.y + NODE_HEIGHT + 32)) };
}

