import { AcademicCapIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import {
  Card,
  EmptyState,
  MetricCard,
  PageHeader,
  RoleViewBanner,
  StatusBadge,
} from "@/components/design-system";
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
          description="Manage company-specific Micro-Certification courses, versions, eligibility and completion signals. Course completion and Company Badges remain distinct from Instructor Verified Skills."
        />

        <RoleViewBanner title="Employer-owned training">
          {context.role === "employer_owner" || context.role === "employer_admin"
            ? "You can manage your Employer Learning library. Recruiters, Hiring Managers and read-only users can view authorized training without changing course content."
            : "Your current Employer role has read-only access to Employer Learning."}
        </RoleViewBanner>

        <section className="txk-metric-grid txk-learning-metrics" aria-label="Employer Learning summary">
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
                The library is connected to the W11-04 production backend.
                Lesson/content authoring is added in W11-04A.
              </p>
            </div>
            <StatusBadge tone="info">
              {countStatus(courses, "ready")} ready
            </StatusBadge>
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
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                title="No Employer Learning courses yet"
                description="The production library is connected. Course and lesson authoring will use this same library when W11-04A is implemented."
              />
            </Card>
          )}
        </section>
      </main>
    </>
  );
}
