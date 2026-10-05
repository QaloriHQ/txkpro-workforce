"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ActionModal } from "@/components/design-system/action-modal";
import { directoryGraph, NODE_HEIGHT, NODE_WIDTH, type DirectoryData, type DirectoryNode } from "@/lib/classes/directory-graph";
export type { DirectoryData } from "@/lib/classes/directory-graph";

const label = (value: string) => value.replaceAll("_", " ");
type View = { x: number; y: number; scale: number };
const clamp = (scale: number) => Math.max(0.03, Math.min(2, scale));

export function InstitutionDirectory({ data }: { data: DirectoryData }) {
  const [role, setRole] = useState("");
  const [cohort, setCohort] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState<DirectoryNode | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const graph = useMemo(() => directoryGraph(data, role, cohort, collapsed), [data, role, cohort, collapsed]);
  const cohorts = [...new Map([
    ...data.people.map(p => [p.cohortId, p.cohortName] as const),
    ...data.classes.flatMap(c => c.cohorts.map(v => [v.cohortId, v.name] as const)),
  ]).entries()];

  function fit() {
    const el = viewport.current;
    if (!el) return;
    const scale = clamp(Math.min(1, (el.clientWidth - 48) / graph.width, (el.clientHeight - 80) / graph.height));
    setView({ scale, x: (el.clientWidth - graph.width * scale) / 2, y: (el.clientHeight - graph.height * scale) / 2 });
  }
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const scale = clamp(Math.min(1, (el.clientWidth - 48) / graph.width, (el.clientHeight - 80) / graph.height));
      setView({ scale, x: (el.clientWidth - graph.width * scale) / 2, y: (el.clientHeight - graph.height * scale) / 2 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [graph.width, graph.height, role, cohort]);

  function zoom(factor: number) {
    const el = viewport.current;
    if (!el) return;
    setView(v => {
      const scale = clamp(v.scale * factor);
      const ratio = scale / v.scale;
      return { scale, x: el.clientWidth / 2 - (el.clientWidth / 2 - v.x) * ratio, y: el.clientHeight / 2 - (el.clientHeight / 2 - v.y) * ratio };
    });
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const old = pointers.current.get(event.pointerId);
    if (!old) return;
    const next = { x: event.clientX, y: event.clientY };
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    pointers.current.set(event.pointerId, next);
    const rect = viewport.current!.getBoundingClientRect();
    if (other) {
      const before = Math.hypot(old.x - other.x, old.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      const center = { x: (old.x + other.x) / 2 - rect.left, y: (old.y + other.y) / 2 - rect.top };
      setView(v => {
        const scale = clamp(v.scale * (before > 0 ? after / before : 1));
        const ratio = scale / v.scale;
        return { scale, x: center.x - (center.x - v.x) * ratio + (next.x - old.x) / 2, y: center.y - (center.y - v.y) * ratio + (next.y - old.y) / 2 };
      });
    } else setView(v => ({ ...v, x: v.x + next.x - old.x, y: v.y + next.y - old.y }));
  }
  function stop(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
  }
  function toggle(id: string) {
    setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  return <div className="directory-workspace">
    <div className="directory-toolbar">
      <div className="directory-scope"><span className="pill">Authorized scope</span><span className="card-sub">{role ? label(role) : "All staff roles"} · {cohort ? cohorts.find(([id]) => id === cohort)?.[1] : "All cohorts"}</span></div>
      <div className="institution-action-bar">
        <ActionModal title="Filter institution directory" triggerLabel="Filter by role / cohort">
          <div className="form-stack">
            <label><span>Role</span><select className="select" value={role} onChange={e => setRole(e.target.value)}><option value="">All roles</option>{[...new Set(data.people.map(p => p.role))].sort().map(v => <option key={v} value={v}>{label(v)}</option>)}</select></label>
            <label><span>Cohort</span><select className="select" value={cohort} onChange={e => setCohort(e.target.value)}><option value="">All authorized cohorts</option>{cohorts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <button className="button" onClick={() => { setRole(""); setCohort(""); setCollapsed(new Set()); }}>Clear filters</button>
          </div>
        </ActionModal>
        <button className="button" onClick={() => { setRole(""); setCohort(""); setCollapsed(new Set()); fit(); }}>Back to role scope</button>
        <button className="button button-dark" onClick={fit}>Fit to scope</button>
      </div>
    </div>
    <p className="directory-note">Connections show authorized scope and cohort affiliations. Shared classes appear under each linked cohort.</p>
    <div className="directory-canvas-wrap">
      <div className="directory-zoom" aria-label="Canvas controls">
        <button className="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>−</button>
        <output aria-label="Zoom level">{Math.round(view.scale * 100)}%</output>
        <button className="button" aria-label="Zoom in" onClick={() => zoom(1.2)}>+</button>
        <button className="button" onClick={fit}>Center</button>
      </div>
      <div ref={viewport} className="directory-canvas" role="region" aria-label="Interactive institution directory" aria-describedby="directory-canvas-help" tabIndex={0}
        onPointerDown={event => {
          if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
          event.currentTarget.focus();
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          const shifts: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
          if (shifts[event.key]) { event.preventDefault(); const [x, y] = shifts[event.key]; setView(v => ({ ...v, x: v.x + x, y: v.y + y })); }
          else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1.2); }
          else if (event.key === "-") { event.preventDefault(); zoom(1 / 1.2); }
          else if (event.key === "0" || event.key === "Home") { event.preventDefault(); fit(); }
        }}>
        {!graph.nodes.length ? <div className="directory-empty"><h2>No matching connections</h2><p>Try another role or cohort filter.</p></div> : null}
        <div className="directory-plane" style={{ width: graph.width, height: graph.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <svg className="directory-lines" width={graph.width} height={graph.height} aria-hidden="true">
            {graph.edges.map(({ from, to }) => {
              const x1 = from.x + NODE_WIDTH / 2, y1 = from.y + NODE_HEIGHT;
              const x2 = to.x + NODE_WIDTH / 2, y2 = to.y;
              return <path key={to.id} d={`M ${x1} ${y1} V ${(y1 + y2) / 2} H ${x2} V ${y2}`} />;
            })}
          </svg>
          {graph.nodes.map(node => <article className={`directory-node directory-node-${node.kind}`} key={node.id} style={{ left: node.x, top: node.y }}>
            <button className="directory-node-main" aria-label={`View ${node.kind}: ${node.name}`}
              onFocus={() => {
                // Keyboard navigation keeps focused cards in view even after panning.
                const el = viewport.current;
                if (!el) return;
                const left = node.x * view.scale + view.x, top = node.y * view.scale + view.y;
                if (left < 0 || top < 0 || left + NODE_WIDTH * view.scale > el.clientWidth || top + NODE_HEIGHT * view.scale > el.clientHeight)
                  setView(v => ({ ...v, x: el.clientWidth / 2 - (node.x + NODE_WIDTH / 2) * v.scale, y: el.clientHeight / 2 - (node.y + NODE_HEIGHT / 2) * v.scale }));
              }}
              onClick={event => { selectedButton.current = event.currentTarget; setSelected(node); dialog.current?.showModal(); }}>
              <span className="directory-node-kind">{node.kind === "staff" ? "Team member" : node.kind}</span>
              <strong>{node.name}</strong><span>{node.subtitle}</span>
            </button>
            {node.children.length ? <button className="directory-branch" aria-expanded={!collapsed.has(node.id)} aria-label={`${collapsed.has(node.id) ? "Expand" : "Collapse"} ${node.name}`} onClick={() => toggle(node.id)}>
              <span>{node.children.length} connections</span><b aria-hidden="true">{collapsed.has(node.id) ? "+" : "−"}</b>
            </button> : null}
          </article>)}
        </div>
      </div>
      <div className="directory-canvas-footer">
        <span id="directory-canvas-help">Drag to pan · Pinch or + / − to zoom · Arrow keys to pan · Select a card for details</span>
        <span aria-live="polite">{graph.nodes.length} visible nodes</span>
      </div>
    </div>
    <dialog ref={dialog} className="txk-action-dialog" aria-labelledby="directory-node-title" onClose={() => selectedButton.current?.focus()}>
      <header className="txk-action-dialog-header"><h2 id="directory-node-title">{selected?.name ?? "Connection details"}</h2><button className="txk-action-dialog-close" aria-label="Close connection details" onClick={() => dialog.current?.close()}>×</button></header>
      <div className="txk-action-dialog-body form-stack">
        <p className="pill">{selected?.kind === "staff" ? "Team member" : selected?.kind}</p>
        <p>{selected?.subtitle}</p>
        {selected?.details.map(text => <p key={text}>{text}</p>)}
        {selected?.children.length ? <p>{selected.children.length} authorized connections. Use the branch button to expand or collapse.</p> : null}
      </div>
      <footer className="txk-action-dialog-footer"><button className="button" onClick={() => dialog.current?.close()}>Close</button></footer>
    </dialog>
    {data.assistance.length ? <section className="card"><h2>Cohort assistance requests</h2>{data.assistance.map(request => <p key={`${request.name}:${request.institutionId}:${request.requestedAt}`}>{request.name} · {new Date(request.requestedAt).toLocaleString()}</p>)}</section> : null}
  </div>;
}
