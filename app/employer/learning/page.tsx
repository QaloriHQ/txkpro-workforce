import { AcademicCapIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  Card,
  EmptyState,
  MetricCard,
  PageHeader,
  RoleViewBanner,
  StatusBadge,
} from "@/components/design-system";
import { CourseCreatePanel } from "@/components/employer/learning/course-create-panel";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listEmployerMicroCerts } from "@/lib/employer/learning-repository";
import type {
  EmployerMicroCertSummary,
  MicroCertStatus,
} from "@/lib/employer/learning-types";

export const dynamic = "force-dynamic";

function statusTone(
  status: MicroCertStatus,
): "neutral" | "success" | "warning" | "info" {
  if (status === "live") return "success";
  if (status === "ready" || status === "review") return "info";
  if (status === "in_production") return "warning";
  return "neutral";
}

function friendlyStatus(status: MicroCertStatus) {
  return status.replaceAll("_", " ");
}

function countStatus(
  courses: EmployerMicroCertSummary[],
  status: MicroCertStatus,
) {
  return courses.filter((course) => course.status === status).length;
}

export default async function EmployerLearningPage() {
  const context = await requireEmployerContext({ approved: true });
  const courses = await listEmployerMicroCerts(context);
  const canManage =
    context.role === "employer_owner" || context.role === "employer_admin";

  const assignments = courses.reduce(
    (total, course) => total + course.assignmentCount,
    0,
  );
  const completions = courses.reduce(
    (total, course) => total + course.completedCount,
    0,
  );

  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="learning" />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Readiness & Outcomes"
          title="Employer Learning"
          description="Create company-specific Micro-Certification courses, build versioned lessons and content, and track completion signals. Employer Training remains distinct from Instructor Verified Skills."
          actions={canManage ? <CourseCreatePanel /> : undefined}
        />

        <RoleViewBanner title="Employer-owned training">
          {canManage
            ? "You can create and manage your Employer's courses, lessons, content blocks and versions. Published versions are locked; create a new version to revise live content."
            : "Your current Employer role can inspect authorized Employer Learning but cannot change course content."}
        </RoleViewBanner>

        <section
          className="txk-metric-grid txk-learning-metrics"
          aria-label="Employer Learning summary"
        >
          <MetricCard
            label="Courses"
            value={courses.length}
            detail="All current Micro-Certifications"
          />
          <MetricCard
            label="Live"
            value={countStatus(courses, "live")}
            detail="Published current versions"
          />
          <MetricCard
            label="Assignments"
            value={assignments}
            detail="Active and completed assignments"
          />
          <MetricCard
            label="Completions"
            value={completions}
            detail="Completed assignments"
          />
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Library</p>
              <h2>Micro-Certification courses</h2>
              <p>
                Open a course to manage its current version, lessons and ordered
                content blocks.
              </p>
            </div>
            {countStatus(courses, "ready") > 0 ? (
              <StatusBadge tone="info">
                {countStatus(courses, "ready")} ready
              </StatusBadge>
            ) : null}
          </div>

          {courses.length ? (
            <div className="txk-learning-grid">
              {courses.map((course) => (
                <Card className="txk-course-card" key={course.microCertId}>
                  <div className="txk-course-card-head">
                    <div className="txk-course-icon" aria-hidden="true">
                      <AcademicCapIcon />
                    </div>
                    <StatusBadge tone={statusTone(course.status)}>
                      {friendlyStatus(course.status)}
                    </StatusBadge>
                  </div>

                  <div>
                    <h3>{course.title}</h3>
                    <p>
                      {course.description ||
                        "No course description has been added yet."}
                    </p>
                  </div>

                  <dl className="txk-course-facts">
                    <div>
                      <dt>Version</dt>
                      <dd>{course.versionNumber}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>
                        {course.durationMinutes
                          ? `${course.durationMinutes} min`
                          : "Not set"}
                      </dd>
                    </div>
                    <div>
                      <dt>Assignments</dt>
                      <dd>{course.assignmentCount}</dd>
                    </div>
                    <div>
                      <dt>Completion</dt>
                      <dd>{course.completionRate}%</dd>
                    </div>
                  </dl>

                  <div className="txk-course-footer">
                    <span>
                      {course.companyBadge?.title
                        ? `Badge: ${course.companyBadge.title}`
                        : "No Company Badge linked"}
                    </span>
                    <span>
                      {course.eligibility.length
                        ? `${course.eligibility.length} eligibility rule${course.eligibility.length === 1 ? "" : "s"}`
                        : "No eligibility rule"}
                    </span>
                  </div>

                  <ButtonLink
                    href={`/employer/learning/${encodeURIComponent(course.microCertId)}`}
                    tone="primary"
                  >
                    {canManage ? "Open authoring" : "View course"}
                  </ButtonLink>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="txk-empty-card">
              <EmptyState
                title="No Employer Learning courses yet"
                description={
                  canManage
                    ? "Create the first draft Micro-Certification to begin building lessons and company-specific training content."
                    : "No Employer Learning courses are available for your Employer yet."
                }
                action={
                  canManage ? (
                    <CourseCreatePanel label="Create first course" />
                  ) : undefined
                }
              />
            </Card>
          )}
        </section>
      </main>
    </>
  );
}
