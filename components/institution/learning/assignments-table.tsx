"use client";

import {
  CheckBadgeIcon,
  ClockIcon,
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
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

function statusLabel(status: InstitutionMicroCertAssignment["status"]) {
  if (status === "assigned") return "Not started";
  return status.replaceAll("_", " ");
}

function formatActivity(value: string | null) {
  if (!value) return "No Student activity";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
          description="Adjust the filters or status. Existing assignments remain visible even when a course is no longer available for new assignment."
        />
      </Card>
    );
  }

  return (
    <div className="institution-assignments-stack">
      {error ? <div className="alert">{error}</div> : null}
      {assignments.map((assignment) => {
        const progress = assignment.progress;
        const badgeAward = assignment.companyBadgeAward;
        const badge = assignment.companyBadge;

        return (
          <Card
            className="institution-assignment-record"
            key={assignment.assignmentId}
          >
            <div className="institution-assignment-record-head">
              <div className="institution-assignment-subject">
                <Link
                  className="institution-student-link"
                  href={`/institution/students/${encodeURIComponent(
                    assignment.studentId,
                  )}`}
                >
                  {assignment.studentName}
                </Link>
                <span>
                  {assignment.programName ?? "Program"} ·{" "}
                  {assignment.cohortName ?? "Cohort"}
                </span>
              </div>
              <StatusBadge tone={tone(assignment.status)}>
                {statusLabel(assignment.status)}
              </StatusBadge>
            </div>

            <div className="institution-assignment-course-line">
              <div>
                <p className="txk-eyebrow">{assignment.employerName}</p>
                <h3>{assignment.courseTitle}</h3>
                <span>
                  Version {assignment.versionNumber} ·{" "}
                  {assignment.courseStatus}
                </span>
              </div>
              {badge ? (
                <div className="institution-assignment-badge-status">
                  <CheckBadgeIcon aria-hidden="true" />
                  <span>
                    <strong>{badge.title}</strong>
                    <small>
                      {badgeAward
                        ? badgeAward.status === "active"
                          ? `Earned ${new Date(
                              badgeAward.issuedAt,
                            ).toLocaleDateString()}`
                          : badgeAward.status
                        : assignment.status === "completed"
                          ? "Award evaluation pending"
                          : "Not yet earned"}
                    </small>
                  </span>
                </div>
              ) : null}
            </div>

            <div className="institution-assignment-progress-grid">
              <div>
                <span>Required lessons</span>
                <strong>
                  {progress.lessons.requiredCompleted} /{" "}
                  {progress.lessons.requiredTotal}
                </strong>
              </div>
              <div>
                <span>Checkpoints</span>
                <strong>
                  {progress.checkpoints.mode === "weighted_percent"
                    ? `${progress.checkpoints.percent}%`
                    : `${progress.checkpoints.requiredSatisfied} / ${progress.checkpoints.requiredTotal}`}
                </strong>
              </div>
              <div>
                <span>Required assessments</span>
                <strong>
                  {progress.assessments.requiredPassed} /{" "}
                  {progress.assessments.requiredTotal}
                </strong>
              </div>
              <div>
                <span>Last activity</span>
                <strong>{formatActivity(assignment.lastActivityAt)}</strong>
              </div>
            </div>

            <dl className="institution-assignment-record-meta">
              <div>
                <dt>Assigned</dt>
                <dd>{new Date(assignment.assignedAt).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt>Assigned by</dt>
                <dd>{assignment.assignedByName ?? "Institution user"}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>
                  {assignment.startedAt
                    ? new Date(assignment.startedAt).toLocaleDateString()
                    : "Not started"}
                </dd>
              </div>
              <div>
                <dt>Completion evidence</dt>
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

            <div className="institution-assignment-record-footer">
              <span className="institution-assignment-evidence-note">
                <ClockIcon aria-hidden="true" />
                Progress is derived from required lesson, checkpoint, and
                assessment evidence—not an opaque readiness score.
              </span>
              <div className="txk-form-actions">
                <Link
                  className="txk-button txk-button-default txk-button-sm"
                  href={`/institution/learning/assignments/${encodeURIComponent(
                    assignment.assignmentId,
                  )}`}
                >
                  <EyeIcon aria-hidden="true" />
                  View details
                </Link>
                {canManage &&
                (assignment.status === "assigned" ||
                  assignment.status === "in_progress") ? (
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
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
