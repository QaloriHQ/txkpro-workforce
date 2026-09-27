import {
  AcademicCapIcon,
  ArrowLeftIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentCheckIcon,
  UserIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  Card,
  MetricCard,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import { InstitutionRoleContext } from "@/components/institution/role-context";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  canManageInstitutionLearningAssignments,
  requireInstitutionPageContext,
} from "@/lib/institution/auth";
import { getInstitutionMicroCertAssignmentDetail } from "@/lib/institution/learning-repository";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ assignmentId: string }>;
};

function statusTone(status: string) {
  if (status === "completed" || status === "passed") return "success" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "cancelled" || status === "not_passed") return "danger" as const;
  return "neutral" as const;
}

function statusLabel(status: string) {
  if (status === "assigned") return "Not started";
  return status.replaceAll("_", " ");
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function InstitutionAssignmentDetailPage({
  params,
}: RouteContext) {
  const { assignmentId } = await params;
  const context = await requireInstitutionPageContext();
  const canManage = canManageInstitutionLearningAssignments(context);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);

  let detail;
  try {
    detail = await getInstitutionMicroCertAssignmentDetail(
      context,
      decodeURIComponent(assignmentId),
    );
  } catch (error) {
    if (error instanceof Response && error.status === 404) notFound();
    throw error;
  }

  const assignment = detail.assignment;
  const progress = assignment.progress;
  const badge = assignment.companyBadge;
  const badgeAward = assignment.companyBadgeAward;

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="assignments"
          institutionName={context.institutionName}
          roleLabel={role.label}
          scopeLabel={scopeLabel}
        />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Employer Training · Assignment"
          title={assignment.studentName}
          description={
            <>
              {assignment.courseTitle} · {assignment.employerName} · Version{" "}
              {assignment.versionNumber}
            </>
          }
          actions={
            <>
              <ButtonLink href="/institution/learning/assignments">
                <ArrowLeftIcon aria-hidden="true" />
                Assignments
              </ButtonLink>
              <ButtonLink
                href={`/institution/students/${encodeURIComponent(
                  assignment.studentId,
                )}`}
              >
                <UserIcon aria-hidden="true" />
                Student profile
              </ButtonLink>
            </>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          canManage={canManage}
        />

        <Card className="institution-assignment-detail-hero">
          <div>
            <p className="txk-eyebrow">{assignment.employerName}</p>
            <h2>{assignment.courseTitle}</h2>
            <p>
              {assignment.programName ?? "Program"} ·{" "}
              {assignment.cohortName ?? "Cohort"} · pinned version{" "}
              {assignment.versionNumber}
            </p>
          </div>
          <StatusBadge tone={statusTone(assignment.status)}>
            {statusLabel(assignment.status)}
          </StatusBadge>
        </Card>

        <section className="txk-metric-grid institution-assignment-detail-metrics">
          <MetricCard
            label="Required lessons"
            value={`${progress.lessons.requiredCompleted} / ${progress.lessons.requiredTotal}`}
            detail={progress.lessons.passed ? "Requirement met" : "Still required"}
          />
          <MetricCard
            label="Checkpoints"
            value={
              progress.checkpoints.mode === "weighted_percent"
                ? `${progress.checkpoints.percent}%`
                : `${progress.checkpoints.requiredSatisfied} / ${progress.checkpoints.requiredTotal}`
            }
            detail={
              progress.checkpoints.mode === "weighted_percent"
                ? `Minimum ${progress.checkpoints.minimumPercent}%`
                : progress.checkpoints.passed
                  ? "Requirement met"
                  : "Still required"
            }
          />
          <MetricCard
            label="Required assessments"
            value={`${progress.assessments.requiredPassed} / ${progress.assessments.requiredTotal}`}
            detail={
              progress.assessments.requiredExhausted
                ? `${progress.assessments.requiredExhausted} exhausted`
                : progress.assessments.passed
                  ? "Requirement met"
                  : "Still required"
            }
          />
          <MetricCard
            label="Last activity"
            value={assignment.lastActivityAt ? dateTime(assignment.lastActivityAt) : "None"}
            detail="Student Employer Training activity"
          />
        </section>

        <section className="institution-assignment-detail-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Completion evidence</p>
                <h2>Explainable requirements</h2>
                <p>
                  Completion is derived from the exact assigned version. It is
                  not a universal readiness score.
                </p>
              </div>
            </div>

            <div className="institution-requirement-list">
              <div className={progress.lessons.passed ? "is-complete" : ""}>
                {progress.lessons.passed ? (
                  <CheckCircleIcon aria-hidden="true" />
                ) : (
                  <ClockIcon aria-hidden="true" />
                )}
                <span>
                  <strong>Required lessons</strong>
                  <small>
                    {progress.lessons.requiredCompleted} of{" "}
                    {progress.lessons.requiredTotal} complete
                  </small>
                </span>
              </div>
              <div className={progress.checkpoints.passed ? "is-complete" : ""}>
                {progress.checkpoints.passed ? (
                  <CheckCircleIcon aria-hidden="true" />
                ) : (
                  <ClockIcon aria-hidden="true" />
                )}
                <span>
                  <strong>Checkpoint requirement</strong>
                  <small>
                    {progress.checkpoints.mode === "weighted_percent"
                      ? `${progress.checkpoints.percent}% of ${progress.checkpoints.minimumPercent}% required`
                      : `${progress.checkpoints.requiredSatisfied} of ${progress.checkpoints.requiredTotal} satisfied`}
                  </small>
                </span>
              </div>
              <div className={progress.assessments.passed ? "is-complete" : ""}>
                {progress.assessments.passed ? (
                  <CheckCircleIcon aria-hidden="true" />
                ) : (
                  <ClockIcon aria-hidden="true" />
                )}
                <span>
                  <strong>Required assessments</strong>
                  <small>
                    {progress.assessments.requiredPassed} of{" "}
                    {progress.assessments.requiredTotal} passed
                  </small>
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Company readiness</p>
                <h2>Company Badge</h2>
                <p>
                  Employer-specific readiness evidence remains separate from
                  Instructor Verified technical skills.
                </p>
              </div>
            </div>

            {badge ? (
              <div className="institution-badge-evidence-card">
                <CheckBadgeIcon aria-hidden="true" />
                <div>
                  <strong>{badge.title}</strong>
                  <span>{assignment.employerName} · definition v{badge.version}</span>
                  <small>
                    {badgeAward
                      ? badgeAward.status === "active"
                        ? `Earned ${dateTime(badgeAward.issuedAt)}`
                        : `Award ${badgeAward.status}`
                      : assignment.status === "completed"
                        ? "Completion recorded; award evaluation pending"
                        : "Not yet earned"}
                  </small>
                </div>
                <ButtonLink href="/institution/learning/badges" size="sm">
                  Badge evidence
                </ButtonLink>
              </div>
            ) : (
              <p className="institution-muted-copy">
                This assigned course version does not configure a Company Badge.
              </p>
            )}
          </Card>
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Lessons</p>
              <h2>Lesson progress</h2>
            </div>
          </div>
          <div className="institution-evidence-list">
            {detail.lessons.map((lesson) => (
              <Card className="institution-evidence-row" key={lesson.lessonId}>
                <AcademicCapIcon aria-hidden="true" />
                <div>
                  <strong>{lesson.title}</strong>
                  <span>
                    {lesson.required ? "Required" : "Optional"}
                    {lesson.estimatedMinutes ? ` · ${lesson.estimatedMinutes} min` : ""}
                  </span>
                </div>
                <StatusBadge tone={lesson.completedAt ? "success" : lesson.startedAt ? "info" : "neutral"}>
                  {lesson.completedAt
                    ? "Completed"
                    : lesson.startedAt
                      ? "In progress"
                      : "Not started"}
                </StatusBadge>
                <small>
                  {lesson.completedAt
                    ? dateTime(lesson.completedAt)
                    : lesson.lastViewedAt
                      ? `Last viewed ${dateTime(lesson.lastViewedAt)}`
                      : "No activity"}
                </small>
              </Card>
            ))}
          </div>
        </section>

        <section className="institution-assignment-detail-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Checkpoints</p>
                <h2>Checkpoint evidence</h2>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {detail.checkpoints.map((checkpoint) => (
                <div className="institution-evidence-compact" key={checkpoint.checkpointId}>
                  {checkpoint.satisfied ? (
                    <CheckCircleIcon aria-hidden="true" />
                  ) : (
                    <ClockIcon aria-hidden="true" />
                  )}
                  <span>
                    <strong>{checkpoint.title}</strong>
                    <small>
                      {checkpoint.required ? "Required" : "Optional"} · weight{" "}
                      {checkpoint.weight}
                    </small>
                  </span>
                  <StatusBadge tone={checkpoint.satisfied ? "success" : "neutral"}>
                    {checkpoint.satisfied ? "Satisfied" : "Pending"}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Assessments</p>
                <h2>Assessment attempts</h2>
                <p>
                  Institution views never expose answer keys or correct-answer
                  configuration.
                </p>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {detail.assessments.map((assessment) => (
                <div className="institution-evidence-compact" key={assessment.assessmentId}>
                  {assessment.passed ? (
                    <CheckCircleIcon aria-hidden="true" />
                  ) : assessment.latestAttempt?.status === "not_passed" ? (
                    <XCircleIcon aria-hidden="true" />
                  ) : (
                    <DocumentCheckIcon aria-hidden="true" />
                  )}
                  <span>
                    <strong>{assessment.title}</strong>
                    <small>
                      Passing {assessment.passingScore}% · {assessment.attemptCount}
                      {assessment.maxAttempts
                        ? ` / ${assessment.maxAttempts}`
                        : ""}{" "}
                      attempts
                    </small>
                  </span>
                  <StatusBadge
                    tone={
                      assessment.passed
                        ? "success"
                        : assessment.latestAttempt?.status === "not_passed"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {assessment.passed
                      ? "Passed"
                      : assessment.latestAttempt
                        ? statusLabel(assessment.latestAttempt.status)
                        : "Not attempted"}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="institution-assignment-detail-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Notifications</p>
                <h2>Delivery history</h2>
              </div>
            </div>
            {detail.notifications.length ? (
              <div className="institution-evidence-stack">
                {detail.notifications.map((item) => (
                  <div className="institution-evidence-compact" key={item.notificationId}>
                    <ClockIcon aria-hidden="true" />
                    <span>
                      <strong>{item.eventType.replaceAll("_", " ")}</strong>
                      <small>{item.channel} · {dateTime(item.createdAt)}</small>
                    </span>
                    <StatusBadge tone={item.status === "sent" ? "success" : "neutral"}>
                      {item.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="institution-muted-copy">
                No assignment notification delivery record is available.
              </p>
            )}
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Audit trail</p>
                <h2>Training activity</h2>
              </div>
            </div>
            {detail.activity.length ? (
              <div className="institution-evidence-stack">
                {detail.activity.map((event, index) => (
                  <div
                    className="institution-evidence-compact"
                    key={`${event.eventType}-${event.createdAt}-${index}`}
                  >
                    <ClockIcon aria-hidden="true" />
                    <span>
                      <strong>{event.eventType.replaceAll("_", " ")}</strong>
                      <small>{dateTime(event.createdAt)}</small>
                    </span>
                    <StatusBadge tone={event.result === "success" ? "success" : "neutral"}>
                      {event.result}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="institution-muted-copy">No domain events recorded yet.</p>
            )}
          </Card>
        </section>

        <section className="txk-section institution-learning-connection">
          <div>
            <p className="txk-eyebrow">Readiness context</p>
            <h2>Keep evidence categories distinct</h2>
            <p>
              Review the Student profile for Instructor Verified Skills,
              Employer Training, Company Badges, interviews, and placement
              context. These signals are explainable and are not merged into a
              hidden score.
            </p>
          </div>
          <div className="txk-reference-row">
            <ButtonLink
              href={`/institution/students/${encodeURIComponent(
                assignment.studentId,
              )}`}
            >
              Student readiness
            </ButtonLink>
            <ButtonLink href="/institution/referrals">Referral context</ButtonLink>
          </div>
        </section>
      </main>
    </>
  );
}
