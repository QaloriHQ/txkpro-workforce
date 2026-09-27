import {
  AcademicCapIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
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

export default async function InstitutionDashboardPage() {
  const context = await requireInstitutionPageContext();
  const [learning, summary, assignments, badges] = await Promise.all([
    getInstitutionEmployerLearningContext(context),
    getInstitutionWorkforceSummary(context),
    listInstitutionMicroCertAssignments(context),
    listInstitutionCompanyBadgeEvidence(context),
  ]);
  const canManage = canManageInstitutionLearningAssignments(context);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);

  const attentionCount =
    summary.notStartedAssignments + summary.assessmentExhaustedAssignments;

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="dashboard"
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
          eyebrow="Institution Workspace"
          title="Workforce dashboard"
          description="Monitor technical readiness, Employer Training, Company Badge evidence, interviews, placements, and current operational work without collapsing them into one hidden score."
          actions={
            <ButtonLink href="/institution/learning">
              <AcademicCapIcon aria-hidden="true" />
              Employer Training
            </ButtonLink>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          canManage={canManage}
        />

        <section className="txk-metric-grid institution-dashboard-metrics">
          <MetricCard
            label="Active Students"
            value={summary.activeStudents}
            detail="Authorized Institution scope"
            href="/institution/students"
          />
          <MetricCard
            label="Verified Skills"
            value={summary.verifiedSkills}
            detail="Instructor-verified competency evidence"
            href="/institution/readiness"
          />
          <MetricCard
            label="Employer Training"
            value={summary.totalAssignments}
            detail={`${summary.inProgressAssignments} in progress`}
            href="/institution/learning/assignments"
          />
          <MetricCard
            label="Company Badges"
            value={summary.companyBadgesEarned}
            detail="Active Employer-specific readiness signals"
            href="/institution/learning/badges"
          />
        </section>

        <section className="institution-dashboard-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Action required</p>
                <h2>Operational queue</h2>
                <p>Only explainable workflow conditions appear here.</p>
              </div>
              <StatusBadge tone={attentionCount ? "warning" : "success"}>
                {attentionCount ? `${attentionCount} open` : "Clear"}
              </StatusBadge>
            </div>

            <div className="institution-dashboard-action-list">
              <Link href="/institution/learning/assignments?status=assigned">
                <ClipboardDocumentCheckIcon aria-hidden="true" />
                <span>
                  <strong>{summary.notStartedAssignments} Employer Training not started</strong>
                  <small>Assigned Students who have not begun training</small>
                </span>
                <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link href="/institution/learning/assignments">
                <CheckBadgeIcon aria-hidden="true" />
                <span>
                  <strong>{summary.assessmentExhaustedAssignments} assessment attempt issues</strong>
                  <small>Required assessments with exhausted attempts</small>
                </span>
                <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link href="/institution/referrals">
                <UserGroupIcon aria-hidden="true" />
                <span>
                  <strong>{summary.activeInterviews} active interviews</strong>
                  <small>Current Student interview activity</small>
                </span>
                <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link href="/institution/placements">
                <BriefcaseIcon aria-hidden="true" />
                <span>
                  <strong>{summary.activePlacements} active placements</strong>
                  <small>Known active employment outcomes</small>
                </span>
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </div>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Lab-to-field</p>
                <h2>Readiness composition</h2>
                <p>
                  Each evidence category remains distinct and explainable.
                </p>
              </div>
            </div>
            <div className="institution-readiness-composition">
              <Link href="/institution/readiness">
                <span>Technical verification</span>
                <strong>{summary.verifiedSkills} verified skills</strong>
              </Link>
              <Link href="/institution/learning">
                <span>Company training</span>
                <strong>{summary.availableCourses} available courses</strong>
              </Link>
              <Link href="/institution/learning/badges">
                <span>Company readiness</span>
                <strong>{summary.companyBadgesEarned} active badges</strong>
              </Link>
              <Link href="/institution/referrals">
                <span>Employer pipeline</span>
                <strong>{summary.activeInterviews} active interviews</strong>
              </Link>
            </div>
          </Card>
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Recent activity</p>
              <h2>Employer Training assignments</h2>
              <p>
                Current Student activity and completion evidence in your scope.
              </p>
            </div>
            <ButtonLink href="/institution/learning/assignments" size="sm">
              All assignments
            </ButtonLink>
          </div>

          <div className="institution-recent-training-list">
            {assignments.slice(0, 5).map((assignment) => (
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
                  <strong>{assignment.courseTitle}</strong>
                  <span>{assignment.employerName}</span>
                </div>
                <StatusBadge
                  tone={
                    assignment.status === "completed"
                      ? "success"
                      : assignment.status === "in_progress"
                        ? "info"
                        : assignment.status === "cancelled"
                          ? "danger"
                          : "neutral"
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
                  View
                </Link>
              </Card>
            ))}
          </div>
        </section>

        <section className="txk-section institution-dashboard-resource-grid">
          <Card>
            <UsersIcon aria-hidden="true" />
            <div>
              <h3>Programs & Students</h3>
              <p>
                {learning.programs.length} Program
                {learning.programs.length === 1 ? "" : "s"} ·{" "}
                {learning.students.length} Students in your current scope.
              </p>
            </div>
            <ButtonLink href="/institution/students" size="sm">
              Students
            </ButtonLink>
          </Card>
          <Card>
            <CheckBadgeIcon aria-hidden="true" />
            <div>
              <h3>Company Badge definitions</h3>
              <p>
                {badges.length} Employer-specific readiness definition
                {badges.length === 1 ? "" : "s"} connected to your Institution.
              </p>
            </div>
            <ButtonLink href="/institution/learning/badges" size="sm">
              Badge evidence
            </ButtonLink>
          </Card>
        </section>
      </main>
    </>
  );
}
