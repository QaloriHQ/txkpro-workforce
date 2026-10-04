"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/design-system";
import { ActionModal, WorkspaceForm } from "@/components/design-system/action-modal";
import type { AuditFilters, AuditQueue } from "@/lib/audit-workspace/types";

function timestamp(value: string) { return new Date(value).toISOString().slice(0, 19).replace("T", " ") + " UTC"; }
export function AuditWorkspace({ queue, filters, basePath }: { queue: AuditQueue; filters: AuditFilters; basePath: string }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  // Safari may wait for the user to choose View/Download. Keep the file alive
  // while this workspace remains mounted, including after the modal closes.
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  function query(offset?: number) {
    const q = new URLSearchParams();
    for (const key of ["institutionId", "eventType", "result", "from", "to"] as const) if (filters[key]) q.set(key, filters[key]);
    if (offset != null) q.set("offset", String(offset));
    return q;
  }
  async function download() {
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(`/api/audit/events/export?${query()}`, { method: "POST" });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Export failed."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      setDownloadUrl(url);
      link.href = url; link.download = "audit-events.csv"; link.click();
      setFeedback(response.headers.get("X-Export-Truncated") === "true"
        ? "CSV ready with the newest 1,000 matching records. Narrow the date range for a complete export."
        : "CSV ready. Choose View or Download in your browser. The export is recorded in the audit trail.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Export failed."); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader eyebrow="Trust and accountability" title="Audit & events" description="Review attributable activity within your authorized scope." />
    <p className="callout">Records are read-only. Private notes, contact details, authentication identifiers and raw event payloads are excluded.</p>
    <div className="audit-toolbar">
      <WorkspaceForm modalTitle="Filter audit history" triggerLabel="Filters" method="get" action={basePath}>
        {basePath === "/admin/audit" ? <label>Institution ID (optional)<input name="institutionId" defaultValue={filters.institutionId} maxLength={100} /></label>
          : filters.institutionId ? <input type="hidden" name="institutionId" value={filters.institutionId} /> : null}
        <label>Event type<input name="eventType" defaultValue={filters.eventType} maxLength={100} placeholder="For example, PLACEMENT_CREATED" /></label>
        <label>Result<select name="result" defaultValue={filters.result || ""}><option value="">All results</option>
          <option value="success">Success</option><option value="denied">Denied</option><option value="failed">Failed</option></select></label>
        <label>From (inclusive)<input type="datetime-local" name="from" defaultValue={filters.from} /></label>
        <label>To (exclusive)<input type="datetime-local" name="to" defaultValue={filters.to} /></label>
        <p>Date filters and displayed times use UTC.</p>
        <button className="txk-button txk-button-primary" type="submit">Apply filters</button>
      </WorkspaceForm>
      <Link className="txk-button txk-button-default" href={basePath}>Clear filters</Link>
      <ActionModal title="Export audit history" triggerLabel="Export CSV" busy={busy} description="Download the newest 1,000 matching records. Your role and scope are checked again and the export is audited.">
        <p>{queue.total} records match the current filters. Export includes the safe fields visible here.</p>
        <button type="button" className="txk-button txk-button-primary" disabled={busy} onClick={download}>{busy ? "Exporting…" : "Download CSV"}</button>
        <p role="status">{feedback}</p>
        {downloadUrl ? <div className="audit-toolbar" aria-label="Prepared CSV">
          <a className="txk-button txk-button-default" href={downloadUrl} download="audit-events.csv">Download prepared CSV</a>
          <a className="txk-button txk-button-default" href={downloadUrl} target="_blank" rel="noopener noreferrer">View CSV</a>
        </div> : null}
      </ActionModal>
    </div>
    <p>{queue.total} {queue.total === 1 ? "record" : "records"} in your authorized scope{filters.eventType ? ` · ${filters.eventType}` : ""}{filters.result ? ` · ${filters.result}` : ""}</p>
    {!queue.items.length ? <EmptyState title="No matching activity" description="Try a different date range or clear filters. Only records with an established authorized scope appear." /> : null}
    <div className="audit-record-list">{queue.items.map(item => <Card key={item.recordId} className="audit-record-card">
      <div><h2>{item.eventType.replaceAll("_", " ")}</h2><p>{timestamp(item.createdAt)}</p>
        <p>{item.targetType} · {item.targetId || "No target identifier"}</p><p>Actor: {item.actorUserId || "System / actor unavailable"}</p></div>
      <StatusBadge tone={item.result === "success" ? "success" : item.result === "denied" ? "warning" : "danger"}>{item.result}</StatusBadge>
      <ActionModal title="Audit record" triggerLabel="View details">
        <dl className="audit-facts">{Object.entries({ "Event": item.eventType, "Record": item.recordId, "Source": item.source,
          "Occurred": timestamp(item.createdAt), "Actor": item.actorUserId || "System / actor unavailable", "Result": item.result,
          "Target type": item.targetType, "Target": item.targetId, "Institution": item.institutionId, "Student": item.studentId,
          "Correlation": item.correlationId, "Previous status": item.beforeStatus, "Resulting status": item.afterStatus })
          .map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value || "Not recorded / not shared"}</dd></div>)}</dl>
        <p>Only approved lifecycle status values are shown. Original snapshots and private notes are never included.</p>
      </ActionModal>
    </Card>)}</div>
    <nav className="audit-pagination" aria-label="Audit history pages">
      {queue.offset > 0 ? <Link className="txk-button txk-button-default" href={`${basePath}?${query(Math.max(0, queue.offset - queue.limit))}`}>Previous</Link> : null}
      {queue.hasMore ? <Link className="txk-button txk-button-default" href={`${basePath}?${query(queue.offset + queue.limit)}`}>Next</Link> : null}
    </nav>
  </>;
}
