import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { ButtonLink, Card, MetricCard, PageHeader, RoleViewBanner } from "@/components/design-system";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerTrainingAnalytics } from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

type Period = "30" | "90" | "all";

export default async function EmployerTrainingAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const context = await requireEmployerContext({ approved: true });
  const requested = (await searchParams).period;
  const period: Period = requested === "90" || requested === "all" ? requested : "30";
  const end = new Date();
  const start = period === "all" ? null : new Date(end.getTime() - Number(period) * 86400000);
  const data = await getEmployerTrainingAnalytics(
    context,
    start?.toISOString() ?? null,
    period === "all" ? null : end.toISOString(),
  );
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
        <nav aria-label="Analytics date range" className="txk-inline-heading">
          <div><p className="txk-eyebrow">Date range</p><h2>{period === "all" ? "All time" : `Last ${period} days`}</h2></div>
          <div className="header-actions">
            <ButtonLink href="/employer/learning/analytics?period=30">30 days</ButtonLink>
            <ButtonLink href="/employer/learning/analytics?period=90">90 days</ButtonLink>
            <ButtonLink href="/employer/learning/analytics?period=all">All time</ButtonLink>
          </div>
        </nav>
        <section className="txk-metric-grid txk-learning-metrics" aria-label="Assignment lifecycle">
          <MetricCard label="Assigned" value={data.lifecycle.assigned} detail="Includes cancelled assignments" />
          <MetricCard label="Not started" value={data.lifecycle.not_started} detail="Assigned, awaiting start" />
          <MetricCard label="In progress" value={data.lifecycle.in_progress} detail="Started training" />
          <MetricCard label="Completed" value={data.lifecycle.completed} detail={`${rate}% of non-cancelled assignments`} />
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
