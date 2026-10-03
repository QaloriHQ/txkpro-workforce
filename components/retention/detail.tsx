"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Card,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import {
  CASE_LABELS,
  CASE_TRANSITIONS,
  caseIsClosed,
  type CaseStatus,
  type RetentionDetail,
} from "@/lib/retention/types";
import { RetentionTimestamp } from "./timestamp";

function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function RetentionCaseDetail({
  item,
  basePath,
}: {
  item: RetentionDetail;
  basePath: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CaseStatus>(item.status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState(false);
  const [success, setSuccess] = useState(false);
  const pending = useRef<{
    requestKey: string;
    expectedVersion: number;
    command: Record<string, unknown>;
  } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const closed = caseIsClosed(item.status);
  const closing = caseIsClosed(status);
  async function send(body: NonNullable<typeof pending.current>) {
    setBusy(true);
    setMessage("");
    setFailed(false);
    setSuccess(false);
    try {
      const result = await fetch(
        `/api/retention/cases/${encodeURIComponent(item.caseId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await result.json();
      if (!result.ok) {
        setMessage(payload.error || "Unable to save.");
        setConflict(result.status === 409);
        if (result.status < 500) pending.current = null;
        else setFailed(true);
        return;
      }
      pending.current = null;
      setMessage("Case saved.");
      setSuccess(true);
      router.refresh();
    } catch {
      setFailed(true);
      setMessage(
        "Save could not be confirmed. Retry the same update before editing.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        className="txk-button txk-button-ghost txk-button-md"
        href={basePath}
      >
        Back to cases
      </Link>
      <PageHeader
        eyebrow={`${item.milestoneDay}-day Student pulse · ${item.caseId}`}
        title={item.studentName}
        description={`${item.roleTitle || "Placement"} · ${item.cohortName || "Cohort unavailable"}`}
      />
      <p className="callout">
        Internal support workspace. Record only information needed for
        follow-up. Notes stay within authorized Institution and TXKPRO teams.
      </p>
      <div className="retention-detail-grid">
        <Card>
          <h2>Case progress</h2>
          <StatusBadge>{CASE_LABELS[item.status]}</StatusBadge>{" "}
          <StatusBadge tone="warning">{item.severity} priority</StatusBadge>
          <dl className="retention-facts">
            <div>
              <dt>Owner</dt>
              <dd>{item.ownerName || "Unassigned"}</dd>
            </div>
            <div>
              <dt>Opened</dt>
              <dd>
                <RetentionTimestamp value={item.openedAt} />
              </dd>
            </div>
            <div>
              <dt>Last contact</dt>
              <dd>
                <RetentionTimestamp
                  value={item.contactedAt}
                  empty="Not recorded"
                />
              </dd>
            </div>
            <div>
              <dt>Next follow-up</dt>
              <dd>
                <RetentionTimestamp
                  value={item.nextFollowUpAt}
                  empty="Not scheduled"
                />
              </dd>
            </div>
            {closed ? (
              <>
                <div>
                  <dt>Closed</dt>
                  <dd>
                    <RetentionTimestamp
                      value={item.closedAt || item.resolvedAt}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Resolution</dt>
                  <dd>{item.resolutionCode || "Not recorded"}</dd>
                </div>
              </>
            ) : null}
          </dl>
          {basePath.startsWith("/institution") ? (
            <Link
              className="txk-button txk-button-default txk-button-md"
              href={`/institution/students/${encodeURIComponent(item.studentId)}`}
            >
              Student profile
            </Link>
          ) : null}
          <p className="txk-muted-text">
            Follow-up is performed by the case owner. Saving a contact outcome
            does not send a message or change employment status.
          </p>
        </Card>
        <Card>
          <h2>Manage case</h2>
          {!item.canManage ? (
            <p>
              Your role can view this case. Management requires an active role
              in the case’s scope.
            </p>
          ) : closed ? (
            <p>This case is closed. Its history remains available.</p>
          ) : (
            <form
              ref={form}
              className="retention-editor"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy || conflict || pending.current) return;
                const fields = new FormData(event.currentTarget);
                const owner = String(fields.get("owner") || "");
                const follow = String(fields.get("follow") || "");
                const note = String(fields.get("note") || "").trim();
                const command: Record<string, unknown> = {};
                if (owner !== (item.ownerUserId || ""))
                  command.ownerUserId = owner || null;
                if (status !== item.status) command.status = status;
                if (follow !== localDate(item.nextFollowUpAt))
                  command.nextFollowUpAt = follow
                    ? new Date(follow).toISOString()
                    : null;
                if (note) command.note = note;
                if (closing)
                  command.resolutionCode = String(
                    fields.get("resolution") || "",
                  ).trim();
                if (!Object.keys(command).length) {
                  setMessage("Choose a change or add a note.");
                  return;
                }
                pending.current = {
                  requestKey: crypto.randomUUID(),
                  expectedVersion: item.version,
                  command,
                };
                void send(pending.current);
              }}
            >
              <fieldset disabled={busy || conflict || failed || success}>
                <label>
                  Case owner
                  <select name="owner" defaultValue={item.ownerUserId || ""}>
                    <option value="">Unassigned</option>
                    {item.ownerUserId &&
                    !item.eligibleOwners.some(
                      (owner) => owner.userId === item.ownerUserId,
                    ) ? (
                      <option value={item.ownerUserId}>
                        Current owner (access no longer active)
                      </option>
                    ) : null}
                    {item.eligibleOwners.map((owner) => (
                      <option key={owner.userId} value={owner.userId}>
                        {owner.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value as CaseStatus)
                    }
                  >
                    {[item.status, ...CASE_TRANSITIONS[item.status]].map(
                      (value) => (
                        <option key={value} value={value}>
                          {CASE_LABELS[value]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Next follow-up (your local time)
                  <input
                    name="follow"
                    type="datetime-local"
                    defaultValue={localDate(item.nextFollowUpAt)}
                    suppressHydrationWarning
                    disabled={closing}
                  />
                </label>
                {closing ? (
                  <label>
                    Resolution code
                    <input
                      name="resolution"
                      maxLength={120}
                      required
                      placeholder="Brief reason for closure"
                    />
                  </label>
                ) : null}
                <label>
                  Internal note
                  <textarea
                    name="note"
                    rows={5}
                    maxLength={4000}
                    required={
                      closing ||
                      (status === "contacted" && status !== item.status)
                    }
                    placeholder="Contact outcome, next step, or resolution. Include only necessary support details."
                  />
                </label>
                <Button tone="primary" type="submit">
                  {busy ? "Saving…" : "Save case"}
                </Button>
              </fieldset>
            </form>
          )}
          <div
            aria-live="polite"
            role={conflict || failed ? "alert" : "status"}
          >
            <p>{message}</p>
          </div>
          {failed ? (
            <Button
              disabled={busy}
              onClick={() => {
                if (pending.current) void send(pending.current);
              }}
            >
              Retry same update
            </Button>
          ) : null}
          {conflict ? (
            <Button onClick={() => router.refresh()}>Refresh case</Button>
          ) : null}
        </Card>
      </div>
      <Card className="retention-notes">
        <h2>
          <ChatBubbleLeftRightIcon aria-hidden="true" /> Internal notes
        </h2>
        {item.notes.length ? (
          <ol>
            {item.notes.map((note) => (
              <li key={note.noteId}>
                <p>
                  <strong>{note.authorName}</strong> ·{" "}
                  <RetentionTimestamp value={note.createdAt} />
                </p>
                <p className="retention-note-text">{note.note}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>No internal notes yet.</p>
        )}
      </Card>
    </>
  );
}
