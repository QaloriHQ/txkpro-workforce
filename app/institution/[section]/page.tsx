import {
  AcademicCapIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  CheckBadgeIcon,
  DocumentChartBarIcon,
  RectangleGroupIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
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
import {
  InstitutionWorkspaceNav,
  type InstitutionSection,
} from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  canManageInstitutionLearningAssignments,
  requireInstitutionContext,
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

type RouteContext = { params: Promise<{ section: string }> };

const sections: Record<
  string,
  {
    active: InstitutionSection;
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  programs: {
    active: "programs",
    eyebrow: "Institution Workspace · Programs",
    title: "Programs & Cohorts",
    description:
      "Review the Program and Cohort scope that controls Student access, Employer Training eligibility, and Institution workflow permissions.",
  },
  readiness: {
    active: "readiness",
    eyebrow: "Workforce Readiness",
    title: "Readiness",
    description:
      "Review technical verification and company-specific readiness as separate, explainable evidence categories.",
  },
  employers: {
    active: "employers",
    eyebrow: "Employer Connections",
    title: "Employers",
    description:
      "Review Employers currently represented in Employer Training and Student pipeline activity within your authorized Institution scope.",
  },
  referrals: {
    active: "referrals",
    eyebrow: "Employer Connections",
    title: "Referrals & Interviews",
    description:
      "Use explainable Student evidence when preparing referral workflows. Hiring decisions remain human.",
  },
  placements: {
    active: "placements",
    eyebrow: "Outcomes",
    title: "Placements",
    description:
      "Review known placement outcomes while keeping readiness evidence and hiring outcomes distinct.",
  },
  retention: {
    active: "retention",
    eyebrow: "Outcomes",
    title: "Retention",
    description:
      "Track post-placement outcomes and intervention workflows without inferring causes from readiness signals.",
  },
  reports: {
    active: "reports",
    eyebrow: "Institution Reporting",
    title: "Reports",
    description:
      "Review Institution workforce telemetry using separate technical, training, Employer engagement, placement, and retention measures.",
  },
};

export default async function InstitutionSectionPage({ params }: RouteContext) {
  const { section } = await params;
  const config = sections[section];
  if (!config) notFound();

  const context = await requireInstitutionContext();
  const [summary, learning, assignments, badges] = await Promise.all([
    getInstitutionWorkforceSummary(context),
    getInstitutionEmployerLearningContext(context),
    listInstitutionMicroCertAssignments(context),
    listInstitutionCompanyBadgeEvidence(context),
  ]);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);
  const canManage = canManageInstitutionLearningAssignments(context);

  const employers = new Map<string, string>();
  for (const course of learning.courses) {
    employers.set(course.employerId, course.employerName);
  }
  for (const assignment of assignments) {
    employers.set(assignment.employerId, assignment.employerName);
  }

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active={config.active}
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
          eyebrow={config.eyebrow}
          title={config.title}
          description={config.description}
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          canManage={canManage}
        />

        {section === "programs" ? (
          <>
            <section className="txk-metric-grid institution-section-metrics">
              <MetricCard label="Programs" value={learning.programs.length} detail="Authorized Program scope" />
              <MetricCard label="Cohorts" value={learning.cohorts.length} detail="Authorized Cohort scope" />
              <MetricCard label="Students" value={learning.students.length} detail="Students in scope" href="/institution/students" />
              <MetricCard label="Employer Training" value={summary.totalAssignments} detail="Assignments across Programs/Cohorts" href="/institution/learning/assignments" />
            </section>
            <section className="txk-section">
              <div className="txk-section-heading">
                <div>
                  <p className="txk-eyebrow">Programs</p>
                  <h2>Authorized Program scope</h2>
                </div>
              </div>
              <div className="institution-program-grid">
                {learning.programs.map((program) => (
                  <Card key={program.programKey}>
                    <RectangleGroupIcon aria-hidden="true" />
                    <div>
                      <h3>{program.programName}</h3>
                      <p>{program.studentCount} Students · {program.cohortCount} Cohort{program.cohortCount === 1 ? "" : "s"}</p>
                    </div>
                    <ButtonLink
                      href={`/institution/learning/assignments?program=${encodeURIComponent(program.programName)}`}
                      size="sm"
                    >
                      Employer Training
                    </ButtonLink>
                  </Card>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {section === "readiness" ? (
          <>
            <section className="txk-metric-grid institution-section-metrics">
              <MetricCard label="Verified Skills" value={summary.verifiedSkills} detail="Instructor-authoritative technical evidence" />
              <MetricCard label="Training assignments" value={summary.totalAssignments} detail="Company-specific training" href="/institution/learning/assignments" />
              <MetricCard label="Completed training" value={summary.completedAssignments} detail="Canonical Employer Training completion" />
              <MetricCard label="Company Badges" value={summary.companyBadgesEarned} detail="Employer-specific readiness evidence" href="/institution/learning/badges" />
            </section>
            <section className="institution-readiness-category-grid">
              <Card>
                <WrenchScrewdriverIcon aria-hidden="true" />
                <div>
                  <h3>Technical verification</h3>
                  <p>Instructor Verified Skills remain the authoritative evidence of technical competency.</p>
                </div>
                <StatusBadge tone="success">{summary.verifiedSkills} verified</StatusBadge>
              </Card>
              <Card>
                <AcademicCapIcon aria-hidden="true" />
                <div>
                  <h3>Employer Training</h3>
                  <p>Company-specific readiness content with deterministic completion rules.</p>
                </div>
                <ButtonLink href="/institution/learning" size="sm">Open training</ButtonLink>
              </Card>
              <Card>
                <CheckBadgeIcon aria-hidden="true" />
                <div>
                  <h3>Company Badges</h3>
                  <p>Visual Employer-specific readiness signals generated from canonical completion evidence.</p>
                </div>
                <ButtonLink href="/institution/learning/badges" size="sm">View badges</ButtonLink>
              </Card>
            </section>
          </>
        ) : null}

        {section === "employers" ? (
          <>
            <section className="txk-metric-grid institution-section-metrics">
              <MetricCard label="Employers represented" value={employers.size} detail="Training or Student pipeline activity" />
              <MetricCard label="Available courses" value={summary.availableCourses} detail="Employer Training available" href="/institution/learning" />
              <MetricCard label="Company Badges" value={badges.length} detail="Configured Employer-specific badges" href="/institution/learning/badges" />
              <MetricCard label="Active interviews" value={summary.activeInterviews} detail="Student pipeline activity" href="/institution/referrals" />
            </section>
            <div className="institution-program-grid">
              {[...employers.entries()].map(([employerId, employerName]) => {
                const employerAssignments = assignments.filter((item) => item.employerId === employerId);
                return (
                  <Card key={employerId}>
                    <BuildingOffice2Icon aria-hidden="true" />
                    <div>
                      <h3>{employerName}</h3>
                      <p>{employerAssignments.length} Employer Training assignment{employerAssignments.length === 1 ? "" : "s"} in Institution scope.</p>
                    </div>
                    <ButtonLink
                      href={`/institution/learning/assignments?employer=${encodeURIComponent(employerId)}`}
                      size="sm"
                    >
                      Training evidence
                    </ButtonLink>
                  </Card>
                );
              })}
            </div>
          </>
        ) : null}

        {section === "referrals" ? (
          <>
            <section className="txk-metric-grid institution-section-metrics">
              <MetricCard label="Active interviews" value={summary.activeInterviews} detail="Current interview activity" />
              <MetricCard label="Verified Skills" value={summary.verifiedSkills} detail="Technical evidence available" href="/institution/readiness" />
              <MetricCard label="Company Badges" value={summary.companyBadgesEarned} detail="Company Training evidence available" href="/institution/learning/badges" />
              <MetricCard label="Students" value={summary.activeStudents} detail="Authorized Student scope" href="/institution/students" />
            </section>
            <Card className="institution-guidance-card">
              <UserGroupIcon aria-hidden="true" />
              <div>
                <h2>Referral evidence remains grouped by source</h2>
                <p>
                  Technical Readiness, Company Training, Employer Engagement, and Operational Readiness should be reviewed separately. TXKPRO does not produce an automated hiring recommendation.
                </p>
              </div>
              <ButtonLink href="/institution/students">Review Students</ButtonLink>
            </Card>
          </>
        ) : null}

        {section === "placements" ? (
          <>
            <section className="txk-metric-grid institution-section-metrics">
              <MetricCard label="Active placements" value={summary.activePlacements} detail="Known active placement outcomes" />
              <MetricCard label="Active interviews" value={summary.activeInterviews} detail="Current pipeline activity" />
              <MetricCard label="Completed training" value={summary.completedAssignments} detail="Company training completed" />
              <MetricCard label="Company Badges" value={summary.companyBadgesEarned} detail="Employer readiness evidence" />
            </section>
            <Card className="institution-guidance-card">
              <BriefcaseIcon aria-hidden="true" />
              <div>
                <h2>Placement outcomes are outcomes—not readiness scores</h2>
                <p>
                  Review Student readiness evidence at the time of placement, but do not imply that a badge, training completion, or Verified Skill alone caused a hiring outcome.
                </p>
              </div>
              <ButtonLink href="/institution/students">Student outcomes</ButtonLink>
            </Card>
          </>
        ) : null}

        {section === "retention" ? (
          <Card className="institution-guidance-card">
            <ChartBarIcon aria-hidden="true" />
            <div>
              <h2>Retention follows placement</h2>
              <p>
                Day 30 / 60 / 90 remain the primary intervention workflow. Long-term outcomes should remain separate from technical and Employer Training evidence.
              </p>
            </div>
            <ButtonLink href="/institution/placements">Placements</ButtonLink>
          </Card>
        ) : null}

        {section === "reports" ? (
          <>
            <section className="txk-metric-grid institution-section-metrics">
              <MetricCard label="Active Students" value={summary.activeStudents} detail="Institution telemetry" />
              <MetricCard label="Verified Skills" value={summary.verifiedSkills} detail="Technical readiness evidence" />
              <MetricCard label="Training completed" value={summary.completedAssignments} detail="Company Training evidence" />
              <MetricCard label="Active placements" value={summary.activePlacements} detail="Known outcome telemetry" />
            </section>
            <Card className="institution-guidance-card">
              <DocumentChartBarIcon aria-hidden="true" />
              <div>
                <h2>Reporting categories remain separate</h2>
                <p>
                  Technical Readiness, Company Certification/Training, Employer Exposure, Referral Velocity, Placement, Retention, and external reference data should not be merged into one platform score.
                </p>
              </div>
              <ButtonLink href="/institution">Dashboard</ButtonLink>
            </Card>
          </>
        ) : null}

        <section className="txk-section institution-learning-connection">
          <div>
            <p className="txk-eyebrow">Connected workflow</p>
            <h2>Move between evidence and action without losing provenance</h2>
            <p>
              Student, Program, Employer Training, Company Badge, referral,
              placement, and retention contexts remain linked while preserving
              their own canonical state.
            </p>
          </div>
          <ButtonLink href="/institution">
            Dashboard
            <ArrowRightIcon aria-hidden="true" />
          </ButtonLink>
        </section>
      </main>
    </>
  );
}
