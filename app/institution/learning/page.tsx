import {
  AcademicCapIcon,
  ArrowRightIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Brand } from "@/components/brand";
import {
  MetricCard,
  PageHeader,
  RoleViewBanner,
  StatusBadge,
} from "@/components/design-system";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  canManageInstitutionLearningAssignments,
  requireInstitutionContext,
} from "@/lib/institution/auth";
import {
  getInstitutionEmployerLearningContext,
  listInstitutionMicroCertAssignments,
} from "@/lib/institution/learning-repository";

export const dynamic = "force-dynamic";

export default async function InstitutionLearningPage() {
  const context = await requireInstitutionContext();
  const [learning, assignments] = await Promise.all([
    getInstitutionEmployerLearningContext(context),
    listInstitutionMicroCertAssignments(context),
  ]);
  const canManage = canManageInstitutionLearningAssignments(context);
  const assigned = assignments.filter((item) => item.status === "assigned").length;
  const inProgress = assignments.filter(
    (item) => item.status === "in_progress",
  ).length;
  const completed = assignments.filter(
    (item) => item.status === "completed",
  ).length;

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="learning"
          institutionName={context.institutionName}
        />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Workforce Readiness · Employer Training"
          title="Employer Micro-Certifications"
          description="Assign company-specific readiness training to authorized Programs, Cohorts, or selected Students. Employer Training remains distinct from Instructor Verified Skills."
          actions={
            <Link
              className="txk-button txk-button-default txk-button-md"
              href="/institution/learning/assignments"
            >
              <ClipboardDocumentCheckIcon aria-hidden="true" />
              View assignments
            </Link>
          }
        />

        {!canManage ? (
          <RoleViewBanner title="Read-only Employer Training">
            Your role can view eligible Employer Micro-Certifications and
            assignment progress. Assignment creation is limited to authorized
            Institution roles and scope.
          </RoleViewBanner>
        ) : null}

        <div className="txk-metric-grid institution-learning-metrics">
          <MetricCard
            label="Eligible courses"
            value={learning.courses.length}
            detail="Ready or Live"
          />
          <MetricCard label="Assigned" value={assigned} detail="Not started" />
          <MetricCard
            label="In progress"
            value={inProgress}
            detail="Student activity"
          />
          <MetricCard
            label="Completed"
            value={completed}
            detail="Employer Training completions"
          />
        </div>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Library</p>
              <h2>Assignable Employer Training</h2>
              <p>
                Only courses with eligible Students in your authorized
                Institution scope appear here.
              </p>
            </div>
          </div>

          <div className="institution-course-grid">
            {learning.courses.map((course) => (
              <article className="txk-card institution-course-card" key={course.microCertId}>
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
                    <dt>Eligible</dt>
                    <dd>{course.eligibleStudentCount}</dd>
                  </div>
                  <div>
                    <dt>Active assignments</dt>
                    <dd>{course.activeAssignmentCount}</dd>
                  </div>
                </dl>
                {course.companyBadge ? (
                  <div className="institution-course-badge">
                    Company Badge: <strong>{course.companyBadge.title}</strong>
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
                    <StatusBadge tone="neutral">View only</StatusBadge>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
