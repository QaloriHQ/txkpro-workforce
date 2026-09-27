import {
  AcademicCapIcon,
  ArrowLeftIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { notFound } from "next/navigation";
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
import { getInstitutionStudentReadinessSummary } from "@/lib/institution/learning-repository";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ studentId: string }>;
};

export default async function InstitutionStudentProfilePage({
  params,
}: RouteContext) {
  const { studentId } = await params;
  const context = await requireInstitutionContext();
  const canManage = canManageInstitutionLearningAssignments(context);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);

  let profile;
  try {
    profile = await getInstitutionStudentReadinessSummary(
      context,
      decodeURIComponent(studentId),
    );
  } catch (error) {
    if (error instanceof Response && error.status === 404) notFound();
    throw error;
  }

  const activeBadges = profile.companyBadges.filter(
    (badge) => badge.status === "active",
  ).length;
  const completedTraining = profile.employerTraining.filter(
    (assignment) => assignment.status === "completed",
  ).length;
  const activeInterview = profile.interviews.find((item) =>
    ["sent", "accepted", "scheduled"].includes(item.status),
  );
  const activePlacement = profile.placements.find(
    (item) => item.status === "active",
  );

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="students"
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
          eyebrow="Students · Readiness profile"
          title={profile.student.displayName}
          description={
            <>
              {profile.student.programName ?? "Program"} ·{" "}
              {profile.student.cohortName ?? "Cohort"}
            </>
          }
          actions={
            <ButtonLink href="/institution/students">
              <ArrowLeftIcon aria-hidden="true" />
              Students
            </ButtonLink>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          canManage={canManage}
        />

        <section className="txk-metric-grid institution-student-profile-metrics">
          <MetricCard
            label="Verified Skills"
            value={profile.verifiedSkills.length}
            detail="Instructor-authoritative technical evidence"
          />
          <MetricCard
            label="Employer Training"
            value={completedTraining}
            detail={`${profile.employerTraining.length} total assignments`}
          />
          <MetricCard
            label="Company Badges"
            value={activeBadges}
            detail="Active Employer-specific readiness signals"
          />
          <MetricCard
            label="Employer pipeline"
            value={activePlacement ? "Placed" : activeInterview ? "Interview" : "—"}
            detail={
              activePlacement?.employerName ??
              activeInterview?.employerName ??
              "No active outcome"
            }
          />
        </section>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Technical readiness</p>
                <h2>Instructor Verified Skills</h2>
                <p>
                  These are authoritative technical competency records and are
                  separate from Employer Training.
                </p>
              </div>
            </div>
            {profile.verifiedSkills.length ? (
              <div className="institution-evidence-stack">
                {profile.verifiedSkills.map((skill) => (
                  <div className="institution-evidence-compact" key={skill.studentSkillId}>
                    <CheckCircleIcon aria-hidden="true" />
                    <span>
                      <strong>{skill.name}</strong>
                      <small>
                        {skill.category ?? "Skill"}
                        {skill.verifiedAt
                          ? ` · verified ${new Date(
                              skill.verifiedAt,
                            ).toLocaleDateString()}`
                          : ""}
                      </small>
                    </span>
                    <StatusBadge tone="success">Verified</StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No Instructor Verified Skills yet" />
            )}
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Company readiness</p>
                <h2>Company Badges</h2>
              </div>
            </div>
            {profile.companyBadges.length ? (
              <div className="institution-evidence-stack">
                {profile.companyBadges.map((badge) => (
                  <div className="institution-evidence-compact" key={badge.companyBadgeAwardId}>
                    <CheckBadgeIcon aria-hidden="true" />
                    <span>
                      <strong>{badge.title}</strong>
                      <small>
                        {badge.employerName} · earned{" "}
                        {new Date(badge.issuedAt).toLocaleDateString()}
                      </small>
                    </span>
                    <StatusBadge
                      tone={
                        badge.status === "active"
                          ? "success"
                          : badge.status === "expired"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {badge.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No Company Badges earned"
                description="Pending Employer Training assignments are not presented as earned evidence."
              />
            )}
          </Card>
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Company training</p>
              <h2>Employer Training</h2>
            </div>
          </div>
          {profile.employerTraining.length ? (
            <div className="institution-recent-training-list">
              {profile.employerTraining.map((assignment) => (
                <Card
                  className="institution-recent-training-row"
                  key={assignment.assignmentId}
                >
                  <div>
                    <AcademicCapIcon aria-hidden="true" />
                    <span>
                      <strong>{assignment.courseTitle}</strong>
                      <small>
                        {assignment.employerName} · Version {assignment.versionNumber}
                      </small>
                    </span>
                  </div>
                  <div>
                    <strong>
                      {assignment.progress.lessons.requiredCompleted}/
                      {assignment.progress.lessons.requiredTotal} lessons ·{" "}
                      {assignment.progress.assessments.requiredPassed}/
                      {assignment.progress.assessments.requiredTotal} assessments
                    </strong>
                    <span>
                      {assignment.companyBadge
                        ? `Badge: ${assignment.companyBadge.title}`
                        : "No Company Badge configured"}
                    </span>
                  </div>
                  <StatusBadge
                    tone={
                      assignment.status === "completed"
                        ? "success"
                        : assignment.status === "in_progress"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {assignment.status === "assigned"
                      ? "Not started"
                      : assignment.status.replaceAll("_", " ")}
                  </StatusBadge>
                  <ButtonLink
                    href={`/institution/learning/assignments/${encodeURIComponent(
                      assignment.assignmentId,
                    )}`}
                    size="sm"
                  >
                    View evidence
                  </ButtonLink>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState title="No Employer Training assignments" />
            </Card>
          )}
        </section>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Employer pipeline</p>
                <h2>Interviews</h2>
              </div>
            </div>
            {profile.interviews.length ? (
              <div className="institution-evidence-stack">
                {profile.interviews.map((interview) => (
                  <div className="institution-evidence-compact" key={interview.interviewRequestId}>
                    <UserGroupIcon aria-hidden="true" />
                    <span>
                      <strong>{interview.roleTitle ?? "Interview"}</strong>
                      <small>
                        {interview.employerName}
                        {interview.scheduledFor
                          ? ` · ${new Date(
                              interview.scheduledFor,
                            ).toLocaleString()}`
                          : ""}
                      </small>
                    </span>
                    <StatusBadge tone="info">{interview.status}</StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No interview activity" />
            )}
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Outcome</p>
                <h2>Placements</h2>
              </div>
            </div>
            {profile.placements.length ? (
              <div className="institution-evidence-stack">
                {profile.placements.map((placement) => (
                  <div className="institution-evidence-compact" key={placement.placementId}>
                    <BriefcaseIcon aria-hidden="true" />
                    <span>
                      <strong>{placement.roleTitle ?? "Placement"}</strong>
                      <small>
                        {placement.employerName}
                        {placement.hireDate ? ` · hired ${placement.hireDate}` : ""}
                      </small>
                    </span>
                    <StatusBadge tone={placement.status === "active" ? "success" : "neutral"}>
                      {placement.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No placement outcome recorded" />
            )}
          </Card>
        </section>

        <section className="txk-section institution-learning-connection">
          <div>
            <p className="txk-eyebrow">Evidence boundary</p>
            <h2>Readiness signals remain explainable</h2>
            <p>
              Verified Skills, Employer Training, Company Badges, interviews,
              and placement outcomes are displayed separately. TXKPRO does not
              merge them into a hidden employability score.
            </p>
          </div>
          <div className="txk-reference-row">
            <ButtonLink href="/institution/readiness">
              <WrenchScrewdriverIcon aria-hidden="true" />
              Workforce Readiness
            </ButtonLink>
            <ButtonLink href="/institution/referrals">
              Referral context
            </ButtonLink>
          </div>
        </section>
      </main>
    </>
  );
}
