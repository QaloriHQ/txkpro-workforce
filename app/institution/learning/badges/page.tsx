import {
  ArrowLeftIcon,
  CheckBadgeIcon,
  ClockIcon,
  ShieldCheckIcon,
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
  requireInstitutionContext,
} from "@/lib/institution/auth";
import {
  listInstitutionCompanyBadgeEvidence,
  listInstitutionMicroCertAssignments,
} from "@/lib/institution/learning-repository";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

export default async function InstitutionCompanyBadgesPage() {
  const context = await requireInstitutionContext();
  const [badges, assignments] = await Promise.all([
    listInstitutionCompanyBadgeEvidence(context),
    listInstitutionMicroCertAssignments(context),
  ]);
  const canManage = canManageInstitutionLearningAssignments(context);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);

  const totalAwards = badges.reduce(
    (sum, badge) => sum + badge.awards.length,
    0,
  );
  const activeAwards = badges.reduce(
    (sum, badge) =>
      sum + badge.awards.filter((award) => award.status === "active").length,
    0,
  );
  const pendingAssignments = assignments.filter(
    (assignment) => assignment.companyBadge && !assignment.companyBadgeAward,
  );

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="badges"
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
          eyebrow="Workforce Readiness · Company Badges"
          title="Company Badges"
          description="Review Employer-specific readiness signals tied to canonical Employer Training completion evidence. Company Badges do not replace Instructor Verified Skills."
          actions={
            <ButtonLink href="/institution/learning">
              <ArrowLeftIcon aria-hidden="true" />
              Employer Training
            </ButtonLink>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          canManage={canManage}
        />

        <section className="txk-metric-grid institution-badge-metrics">
          <MetricCard
            label="Badge definitions"
            value={badges.length}
            detail="Employer-issued readiness signals"
          />
          <MetricCard
            label="Awards"
            value={totalAwards}
            detail="Canonical award records"
          />
          <MetricCard
            label="Active awards"
            value={activeAwards}
            detail="Not expired or revoked"
          />
          <MetricCard
            label="Pending"
            value={pendingAssignments.length}
            detail="Assigned training with badge not yet earned"
          />
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Configured badges</p>
              <h2>Employer-specific readiness evidence</h2>
              <p>
                Every Company Badge shows its issuer, linked course/version,
                award state, expiration when configured, and completion
                evidence.
              </p>
            </div>
          </div>

          {badges.length ? (
            <div className="institution-badge-grid">
              {badges.map((badge) => (
                <Card className="institution-badge-card" key={badge.companyBadgeId}>
                  <div className="institution-badge-card-head">
                    <span className="institution-course-icon">
                      <CheckBadgeIcon aria-hidden="true" />
                    </span>
                    <StatusBadge tone={badge.active ? "success" : "neutral"}>
                      {badge.active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </div>
                  <div>
                    <p className="txk-eyebrow">{badge.employerName}</p>
                    <h3>{badge.title}</h3>
                    <p>
                      {badge.description ??
                        "Employer-specific readiness evidence from completed training."}
                    </p>
                  </div>
                  <dl className="institution-course-facts">
                    <div>
                      <dt>Definition</dt>
                      <dd>v{badge.version}</dd>
                    </div>
                    <div>
                      <dt>Linked courses</dt>
                      <dd>{badge.linkedCourses.length}</dd>
                    </div>
                    <div>
                      <dt>Awards</dt>
                      <dd>{badge.awards.length}</dd>
                    </div>
                    <div>
                      <dt>Expiration</dt>
                      <dd>
                        {badge.expiresAfterDays
                          ? `${badge.expiresAfterDays} days`
                          : "None"}
                      </dd>
                    </div>
                  </dl>

                  <div className="institution-badge-linked-courses">
                    {badge.linkedCourses.map((course) => (
                      <div key={course.microCertVersionId}>
                        <AcademicCourseIcon />
                        <span>
                          <strong>{course.title}</strong>
                          <small>
                            Version {course.versionNumber} · {course.status}
                          </small>
                        </span>
                      </div>
                    ))}
                  </div>

                  {badge.awards.length ? (
                    <div className="institution-badge-awards">
                      {badge.awards.slice(0, 8).map((award) => (
                        <div key={award.companyBadgeAwardId}>
                          <ShieldCheckIcon aria-hidden="true" />
                          <span>
                            <Link
                              className="institution-student-link"
                              href={`/institution/students/${encodeURIComponent(
                                award.studentId,
                              )}`}
                            >
                              {award.studentName}
                            </Link>
                            <small>
                              Earned {new Date(award.issuedAt).toLocaleDateString()}
                              {award.expiresAt
                                ? ` · expires ${new Date(
                                    award.expiresAt,
                                  ).toLocaleDateString()}`
                                : ""}
                            </small>
                          </span>
                          <StatusBadge
                            tone={
                              award.status === "active"
                                ? "success"
                                : award.status === "expired"
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            {award.status}
                          </StatusBadge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="institution-badge-pending">
                      <ClockIcon aria-hidden="true" />
                      <span>
                        No awards yet. The badge is awarded automatically after
                        the linked course version satisfies canonical completion
                        rules.
                      </span>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                title="No Company Badges in this Institution scope"
                description="Company Badge definitions appear here when an Employer links one to training available to, or historically assigned within, your authorized scope."
              />
            </Card>
          )}
        </section>

        {pendingAssignments.length ? (
          <section className="txk-section">
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Pending evidence</p>
                <h2>Students working toward Company Badges</h2>
                <p>
                  These are not earned badges yet. They remain pending until
                  canonical Employer Training completion is recorded.
                </p>
              </div>
            </div>
            <div className="institution-recent-training-list">
              {pendingAssignments.slice(0, 10).map((assignment) => (
                <Card
                  className="institution-recent-training-row"
                  key={assignment.assignmentId}
                >
                  <div>
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
                  <div>
                    <strong>{assignment.companyBadge?.title}</strong>
                    <span>{assignment.employerName}</span>
                  </div>
                  <StatusBadge
                    tone={
                      assignment.status === "in_progress" ? "info" : "neutral"
                    }
                  >
                    {assignment.status === "assigned"
                      ? "Not started"
                      : assignment.status.replaceAll("_", " ")}
                  </StatusBadge>
                  <Link
                    className="txk-button txk-button-default txk-button-sm"
                    href={`/institution/learning/assignments/${encodeURIComponent(
                      assignment.assignmentId,
                    )}`}
                  >
                    Review training
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}

function AcademicCourseIcon() {
  return <CheckBadgeIcon aria-hidden="true" />;
}
