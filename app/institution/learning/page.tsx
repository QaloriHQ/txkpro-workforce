import {
  AcademicCapIcon,
  ArrowRightIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  Card,
  EmptyState,
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
import {
  getInstitutionEmployerLearningContext,
  getInstitutionWorkforceSummary,
  listInstitutionCompanyBadgeEvidence,
  listInstitutionMicroCertAssignments,
} from "@/lib/institution/learning-repository";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

function formatActivity(value: string | null) {
  if (!value) return "No activity";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function InstitutionLearningPage() {
  const context = await requireInstitutionPageContext();
  const [learning, assignments, summary, badges] = await Promise.all([
    getInstitutionEmployerLearningContext(context),
    listInstitutionMicroCertAssignments(context),
    getInstitutionWorkforceSummary(context),
    listInstitutionCompanyBadgeEvidence(context),
  ]);
  const canManage = canManageInstitutionLearningAssignments(context);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);

  const recentAssignments = assignments.slice(0, 5);
  const attention = assignments.filter((item) => {
    const reasons = item.progress.blockedReasons ?? [];
    return (
      item.status === "assigned" ||
      reasons.includes("required_assessment_attempts_exhausted")
    );
  });

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="learning"
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
          eyebrow="Workforce Readiness · Employer Training"
          title="Employer Training"
          description={
            canManage
              ? "Assign company-specific readiness training to authorized Programs, Cohorts, or selected Students, then monitor explainable completion and Company Badge evidence."
              : "Review company-specific readiness training, Student progress, completion evidence, and Company Badge outcomes in your authorized scope."
          }
          actions={
            <>
              <ButtonLink href="/institution/learning/badges">
                <CheckBadgeIcon aria-hidden="true" />
                Company Badges
              </ButtonLink>
              <ButtonLink href="/institution/learning/assignments">
                <ClipboardDocumentCheckIcon aria-hidden="true" />
                View assignments
              </ButtonLink>
              <ButtonLink href="/institution/learning/production">
                Production requests
              </ButtonLink>
            </>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          canManage={canManage}
        />

        <section className="txk-metric-grid institution-learning-metrics institution-learning-metrics-five">
          <MetricCard
            label="Available courses"
            value={summary.availableCourses}
            detail="Ready or Live for new assignment"
            href="/institution/learning"
          />
          <MetricCard
            label="Total assignments"
            value={summary.totalAssignments}
            detail="Current and historical"
            href="/institution/learning/assignments"
          />
          <MetricCard
            label="In progress"
            value={summary.inProgressAssignments}
            detail="Student activity underway"
            href="/institution/learning/assignments?status=in_progress"
          />
          <MetricCard
            label="Completed"
            value={summary.completedAssignments}
            detail="Canonical Employer Training completions"
            href="/institution/learning/assignments?status=completed"
          />
          <MetricCard
            label="Company Badges"
            value={summary.companyBadgesEarned}
            detail="Active Employer-specific readiness evidence"
            href="/institution/learning/badges"
          />
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Operations</p>
              <h2>Needs attention</h2>
              <p>
                Objective workflow conditions only. TXKPRO does not create a
                hidden readiness or employability score.
              </p>
            </div>
            <StatusBadge tone={attention.length ? "warning" : "success"}>
              {attention.length ? `${attention.length} items` : "Clear"}
            </StatusBadge>
          </div>

          {attention.length ? (
            <div className="institution-attention-list">
              {attention.slice(0, 6).map((item) => {
                const exhausted = item.progress.blockedReasons.includes(
                  "required_assessment_attempts_exhausted",
                );
                return (
                  <Card className="institution-attention-card" key={item.assignmentId}>
                    <ExclamationTriangleIcon aria-hidden="true" />
                    <div>
                      <strong>
                        {exhausted
                          ? "Required assessment attempts exhausted"
                          : "Employer Training not started"}
                      </strong>
                      <p>
                        {item.studentName} · {item.courseTitle} ·{" "}
                        {item.employerName}
                      </p>
                    </div>
                    <Link
                      className="txk-button txk-button-default txk-button-sm"
                      href={`/institution/learning/assignments/${encodeURIComponent(
                        item.assignmentId,
                      )}`}
                    >
                      Review
                    </Link>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <EmptyState
                title="No Employer Training items need attention"
                description="Not-started assignments and exhausted required assessments will appear here when they require follow-up."
              />
            </Card>
          )}
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Library</p>
              <h2>Available Employer Training</h2>
              <p>
                Ready or Live courses matching Students in your authorized
                Institution scope. Existing assignments remain visible even if
                a course later becomes unavailable for new assignment.
              </p>
            </div>
          </div>

          {learning.courses.length ? (
            <div className="institution-course-grid">
              {learning.courses.map((course) => (
                <article
                  className="txk-card institution-course-card"
                  key={course.microCertId}
                >
                  <div className="institution-course-card-head">
                    <span className="institution-course-icon">
                      <AcademicCapIcon aria-hidden="true" />
                    </span>
                    <StatusBadge tone={course.status === "live" ? "success" : "info"}>
                      {course.status}
                    </StatusBadge>
                  </div>
                  <div>
                    <p className="txk-eyebrow">{course.employerName}</p>
                    <h3>{course.title}</h3>
                    <p>{course.learningObjective ?? course.description}</p>
                  </div>
                  <dl className="institution-course-facts">
                    <div>
                      <dt>Version</dt>
                      <dd>{course.versionNumber}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{course.durationMinutes ?? 0} min</dd>
                    </div>
                    <div>
                      <dt>Eligible Students</dt>
                      <dd>{course.eligibleStudentCount}</dd>
                    </div>
                    <div>
                      <dt>Active assignments</dt>
                      <dd>{course.activeAssignmentCount}</dd>
                    </div>
                  </dl>
                  {course.companyBadge ? (
                    <div className="institution-course-badge">
                      <CheckBadgeIcon aria-hidden="true" />
                      <span>
                        Company Badge <strong>{course.companyBadge.title}</strong>
                      </span>
                    </div>
                  ) : null}
                  <div className="institution-course-actions">
                    {canManage && learning.canAssign ? (
                      <Link
                        className="txk-button txk-button-primary txk-button-md"
                        href={`/institution/learning/${encodeURIComponent(
                          course.microCertId,
                        )}/assign`}
                      >
                        Assign training
                        <ArrowRightIcon aria-hidden="true" />
                      </Link>
                    ) : (
                      <StatusBadge tone="neutral">
                        {canManage ? "No assignable Students" : "View only"}
                      </StatusBadge>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                title="No Employer Training is available for new assignment"
                description="No Ready or Live Micro-Certifications currently match Students in your authorized Program or Cohort scope. Existing assignments remain available in Assignment Tracking."
                action={
                  <ButtonLink href="/institution/learning/assignments">
                    View current assignments
                  </ButtonLink>
                }
              />
            </Card>
          )}
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Recent activity</p>
              <h2>Student Employer Training</h2>
              <p>
                Recent assignment activity with explainable completion and
                Company Badge state.
              </p>
            </div>
          </div>

          {recentAssignments.length ? (
            <div className="institution-recent-training-list">
              {recentAssignments.map((item) => (
                <Card className="institution-recent-training-row" key={item.assignmentId}>
                  <div>
                    <Link
                      className="institution-student-link"
                      href={`/institution/students/${encodeURIComponent(
                        item.studentId,
                      )}`}
                    >
                      {item.studentName}
                    </Link>
                    <span>
                      {item.programName ?? "Program"} · {item.cohortName ?? "Cohort"}
                    </span>
                  </div>
                  <div>
                    <strong>{item.courseTitle}</strong>
                    <span>{item.employerName} · Version {item.versionNumber}</span>
                  </div>
                  <div>
                    <StatusBadge
                      tone={
                        item.status === "completed"
                          ? "success"
                          : item.status === "in_progress"
                            ? "info"
                            : item.status === "cancelled"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {item.status === "assigned"
                        ? "Not started"
                        : item.status.replaceAll("_", " ")}
                    </StatusBadge>
                    <small>{formatActivity(item.lastActivityAt)}</small>
                  </div>
                  <Link
                    className="txk-button txk-button-default txk-button-sm"
                    href={`/institution/learning/assignments/${encodeURIComponent(
                      item.assignmentId,
                    )}`}
                  >
                    View details
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                title="No Employer Training assignments yet"
                description={
                  canManage
                    ? "Assign an eligible course to a Program, Cohort, or selected Students to begin tracking activity."
                    : "Assignments will appear here when an authorized Institution role assigns Employer Training within your scope."
                }
              />
            </Card>
          )}
        </section>

        {badges.length ? (
          <section className="txk-section institution-learning-connection">
            <div>
              <p className="txk-eyebrow">Readiness evidence</p>
              <h2>Company Badges stay distinct from Verified Skills</h2>
              <p>
                Company Badges show successful Employer-specific readiness
                completion. Instructor Verified Skills remain the authoritative
                technical competency evidence.
              </p>
            </div>
            <ButtonLink href="/institution/learning/badges">
              Review Company Badges
              <ArrowRightIcon aria-hidden="true" />
            </ButtonLink>
          </section>
        ) : null}
      </main>
    </>
  );
}
