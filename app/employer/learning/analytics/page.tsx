import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { ButtonLink, Card, MetricCard, PageHeader, RoleViewBanner } from "@/components/design-system";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAccountContext } from "@/lib/auth";
import { getEmployerContext } from "@/lib/employer/auth";
import { getEmployerTrainingAnalytics } from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

type Period = "30" | "90" | "all";

export default async function EmployerTrainingAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string; courseVersion?: string; institution?: string;
    program?: string; cohort?: string;
  }>;
}) {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  const context = await getEmployerContext();
  if (!context) redirect("/onboarding");
  if (
    context.approvalStatus !== "approved" ||
    context.accountStatus === "suspended" ||
    context.accountStatus === "closed"
  ) redirect("/employer");
  const params = await searchParams;
  const period: Period = params.period === "90" || params.period === "all" ? params.period : "30";
  const end = new Date();
  const start = period === "all" ? null : new Date(end.getTime() - Number(period) * 86400000);
  const filters = {
    microCertVersionId: params.courseVersion || null,
    institutionId: params.institution || null,
    programName: params.program || null,
    cohortId: params.cohort || null,
  };
  const [data, options] = await Promise.all([
    getEmployerTrainingAnalytics(context, start?.toISOString() ?? null,
      period === "all" ? null : end.toISOString(), filters),
    getEmployerTrainingAnalytics(context, null, null),
  ]);
  const eligible = data.lifecycle.assigned - data.lifecycle.cancelled;
  const rate = eligible ? Math.round((data.lifecycle.completed / eligible) * 100) : 0;

  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="learning" />
        <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
      </header>
      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Employer Learning · Analytics"
          title="Employer Training analytics"
          description="Aggregate activity for your employer's courses. Training, Company Badges, and Employer Certifications are separate evidence types. Instructor Verified Skills are not included."
          actions={<ButtonLink href="/employer/learning"><ArrowLeftIcon aria-hidden="true" /> Employer Learning</ButtonLink>}
        />
        <RoleViewBanner title="Reporting scope">
          Assignment counts describe the cohort assigned during the selected period and its current status.
          Assessment outcomes, badge and certification awards, and recent completions use their own event dates.
          No student names or hiring scores appear in this report.
        </RoleViewBanner>
        <section className="txk-section" aria-label="Analytics filters">
          <div className="txk-section-heading"><div><p className="txk-eyebrow">Reporting scope</p><h2>Filter aggregate results</h2></div></div>
          <form method="get" action="/employer/learning/analytics" className="txk-analytics-filters">
            <label className="txk-form-field"><span className="txk-form-label">Date range</span>
              <select className="select" name="period" defaultValue={period}>
                <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
              </select>
            </label>
            <label className="txk-form-field"><span className="txk-form-label">Course version</span>
              <select className="select" name="courseVersion" defaultValue={filters.microCertVersionId ?? ""}>
                <option value="">All course versions</option>
                {options.courses.map((course) => <option key={course.micro_cert_version_id} value={course.micro_cert_version_id}>{course.title} · v{course.version_number}</option>)}
              </select>
            </label>
            <label className="txk-form-field"><span className="txk-form-label">Institution</span>
              <select className="select" name="institution" defaultValue={filters.institutionId ?? ""}>
                <option value="">All institutions</option>
                {options.institutions.filter((item) => item.id).map((item) => <option key={item.id} value={item.id!}>{item.label}</option>)}
              </select>
            </label>
            <label className="txk-form-field"><span className="txk-form-label">Program</span>
              <select className="select" name="program" defaultValue={filters.programName ?? ""}>
                <option value="">All programs</option>
                {options.programs.filter((item) => item.label !== "Program not recorded").map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}
              </select>
            </label>
            <label className="txk-form-field"><span className="txk-form-label">Cohort</span>
              <select className="select" name="cohort" defaultValue={filters.cohortId ?? ""}>
                <option value="">All cohorts</option>
                {options.cohorts.filter((item) => item.id).map((item) => <option key={item.id} value={item.id!}>{item.label}</option>)}
              </select>
            </label>
            <button className="txk-button txk-button-primary" type="submit">Apply filters</button>
            <ButtonLink href="/employer/learning/analytics">Clear filters</ButtonLink>
          </form>
          <p className="txk-form-help">Assignment counts use the selected assignment-date cohort. Outcomes use their own event dates within the selected range.</p>
        </section>
        <section className="txk-metric-grid txk-learning-metrics" aria-label="Assignment lifecycle">
          <MetricCard label="Assigned" value={data.lifecycle.assigned} detail="Includes cancelled assignments" />
          <MetricCard label="Not started" value={data.lifecycle.not_started} detail="Assigned, awaiting start" />
          <MetricCard label="In progress" value={data.lifecycle.in_progress} detail="Started training" />
          <MetricCard label="Completed" value={data.lifecycle.completed} detail={`${rate}% of non-cancelled assignments`} />
          <MetricCard label="Cancelled" value={data.lifecycle.cancelled} detail="Excluded from completion rate" />
        </section>
        <section className="txk-section">
          <div className="txk-section-heading"><div><p className="txk-eyebrow">Permitted dimensions</p><h2>Institution, program and cohort</h2></div></div>
          <div className="txk-learning-grid">
            <Card><h3>Institutions</h3>{data.institutions.length ? data.institutions.map((row) =>
              <p key={row.id ?? row.label}>{row.label}: {row.completed} completed / {row.assigned} assigned</p>
            ) : <p>No assignments in this range.</p>}</Card>
            <Card><h3>Programs</h3>{data.programs.length ? data.programs.map((row) =>
              <p key={row.label}>{row.label}: {row.completed} completed / {row.assigned} assigned</p>
            ) : <p>No assignments in this range.</p>}</Card>
            <Card><h3>Cohorts</h3>{data.cohorts.length ? data.cohorts.map((row) =>
              <p key={row.id ?? row.label}>{row.label}: {row.completed} completed / {row.assigned} assigned</p>
            ) : <p>No assignments in this range.</p>}</Card>
          </div>
        </section>
        <section className="txk-section">
          <div className="txk-section-heading"><div><p className="txk-eyebrow">Evidence outcomes</p><h2>Separate signals</h2></div></div>
          <div className="txk-learning-grid">
            <Card><h3>Assessments</h3><p>Passed: {data.assessments.passed} · Not passed: {data.assessments.not_passed}</p><p>Submitted attempts in the period.</p></Card>
            <Card><h3>Company Badges</h3><p>Active: {data.badges.active} · Expired: {data.badges.expired} · Revoked: {data.badges.revoked}</p><p>Awards issued in the period, classified by current state.</p></Card>
            <Card><h3>Employer Certifications</h3><p>Active: {data.certifications.active} · Expired: {data.certifications.expired} · Revoked: {data.certifications.revoked}</p><p>Credentials issued in the period, classified by current state.</p></Card>
          </div>
        </section>
        <section className="txk-section">
          <div className="txk-section-heading"><div><p className="txk-eyebrow">Exact versions</p><h2>Course assignment cohorts</h2></div></div>
          {data.courses.length ? (
            <div className="txk-learning-grid">
              {data.courses.map((course) => (
                <Card key={course.micro_cert_version_id}>
                  <h3>{course.title} · v{course.version_number}</h3>
                  <p>Assigned: {course.assigned} · Not started: {course.not_started} · In progress: {course.in_progress}</p>
                  <p>Completed: {course.completed} · Cancelled: {course.cancelled}</p>
                </Card>
              ))}
            </div>
          ) : <p>No courses are available for this employer.</p>}
        </section>
        <section className="txk-section">
          <div className="txk-section-heading"><div><p className="txk-eyebrow">Recent activity</p><h2>Completion days</h2></div></div>
          {data.recentDays.length ? (
            <div className="txk-learning-grid">
              {data.recentDays.map((day) => (
                <Card key={day.day}><h3>{day.day} UTC</h3><p>{day.completions} completion{day.completions === 1 ? "" : "s"}</p></Card>
              ))}
            </div>
          ) : <p>No completions occurred in the selected period.</p>}
        </section>
      </main>
    </>
  );
}
