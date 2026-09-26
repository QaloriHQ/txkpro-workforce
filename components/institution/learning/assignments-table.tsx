"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  StatusBadge,
} from "@/components/design-system";
import type { InstitutionMicroCertAssignment } from "@/lib/institution/types";

function tone(status: InstitutionMicroCertAssignment["status"]) {
  if (status === "completed") return "success" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "cancelled") return "danger" as const;
  return "neutral" as const;
}

export function InstitutionAssignmentsTable({
  assignments,
  institutionId,
  canManage,
}: {
  assignments: InstitutionMicroCertAssignment[];
  institutionId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(assignment: InstitutionMicroCertAssignment) {
    const reason = window.prompt(
      `Cancel ${assignment.courseTitle} for ${assignment.studentName}? Optional reason:`,
      "",
    );
    if (reason === null) return;
    setBusy(assignment.assignmentId);
    setError(null);
    try {
      const response = await fetch(
        `/api/institution/learning/assignments/${encodeURIComponent(
          assignment.assignmentId,
        )}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ institutionId, reason }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to cancel assignment.");
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to cancel assignment.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!assignments.length) {
    return (
      <Card>
        <EmptyState
          title="No assignments match this view"
          description="Assignments appear here after an authorized Institution user assigns Employer Training to a Program, Cohort, or selected Students."
        />
      </Card>
    );
  }

  return (
    <div className="institution-assignments-stack">
      {error ? <div className="alert">{error}</div> : null}
      {assignments.map((assignment) => (
        <Card
          className="institution-assignment-record"
          key={assignment.assignmentId}
        >
          <div className="institution-assignment-record-head">
            <div>
              <p className="txk-eyebrow">{assignment.employerName}</p>
              <h3>{assignment.courseTitle}</h3>
              <span>
                {assignment.studentName} ·{" "}
                {assignment.programName ?? "Program"} ·{" "}
                {assignment.cohortName ?? "Cohort"}
              </span>
            </div>
            <StatusBadge tone={tone(assignment.status)}>
              {assignment.status.replaceAll("_", " ")}
            </StatusBadge>
          </div>

          <dl className="institution-assignment-record-meta">
            <div>
              <dt>Version</dt>
              <dd>{assignment.versionNumber}</dd>
            </div>
            <div>
              <dt>Assigned</dt>
              <dd>{new Date(assignment.assignedAt).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt>Assigned by</dt>
              <dd>{assignment.assignedByName ?? "Institution user"}</dd>
            </div>
            <div>
              <dt>Completion</dt>
              <dd>
                {assignment.latestCompletion
                  ? `${assignment.latestCompletion.outcome}${
                      assignment.latestCompletion.score !== null
                        ? ` · ${assignment.latestCompletion.score}%`
                        : ""
                    }`
                  : "Not completed"}
              </dd>
            </div>
          </dl>

          {canManage &&
          (assignment.status === "assigned" ||
            assignment.status === "in_progress") ? (
            <div className="txk-form-actions">
              <Button
                size="sm"
                tone="danger"
                type="button"
                disabled={busy === assignment.assignmentId}
                onClick={() => cancel(assignment)}
              >
                <TrashIcon aria-hidden="true" />
                Cancel assignment
              </Button>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
