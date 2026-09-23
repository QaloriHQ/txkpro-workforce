import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { CompleteInterviewButton } from "@/components/employer/complete-interview-button";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { InterviewEvaluationForm } from "@/components/employer/interview-evaluation-form";
import { InterviewScheduleForm } from "@/components/employer/interview-schedule-form";
import { RecordHireForm } from "@/components/employer/record-hire-form";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerInterview } from "@/lib/employer/hiring-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export default async function EmployerInterviewDetailPage({ params }: RouteContext) {
  const { id } = await params;
  const context = await requireEmployerContext({ approved: true });

  let interview;
  try {
    interview = await getEmployerInterview(context, decodeURIComponent(id));
  } catch {
    notFound();
  }

  const mutable = context.role !== "employer_read_only";
  const canSchedule = ["accepted", "scheduling", "scheduled"].includes(interview.status);

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="interviews" />
        <ThemeToggle />
        <SignOutButton />
      </header>

      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Interview Detail</p>
            <h1>{interview.studentName}</h1>
            <p className="card-sub">
              {interview.roleTitle} · {interview.program ?? interview.institutionName ?? "Candidate"}
            </p>
          </div>
          <span className="pill pill-info">{interview.status.replaceAll("_", " ")}</span>
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Separate canonical state machines</strong>
          Interview status is {interview.status.replaceAll("_", " ")}
          {interview.referralId
            ? `; linked Referral status is ${interview.referralStatus?.replaceAll("_", " ") ?? "unknown"}`
            : "; this is a direct Interview Request"}.
          A Placement is created only when an authorized human records a hire.
        </div>

        <div className="grid grid-2">
          <section className="card">
            <h2>Interview request</h2>
            <div className="readiness-list" style={{ marginTop: 16 }}>
              <div className="readiness-row"><span>Interview ID</span><strong>{interview.interviewRequestId}</strong></div>
              <div className="readiness-row"><span>Hiring Need</span><strong>{interview.hiringNeedTitle ?? "Direct"}</strong></div>
              <div className="readiness-row"><span>Trade</span><strong>{interview.tradeId ?? "—"}</strong></div>
              <div className="readiness-row"><span>Sent</span><strong>{interview.sentAt ? new Date(interview.sentAt).toLocaleString() : "—"}</strong></div>
              <div className="readiness-row"><span>Student response</span><strong>{interview.respondedAt ? new Date(interview.respondedAt).toLocaleString() : "Awaiting response"}</strong></div>
            </div>
            {interview.message ? (
              <div className="callout" style={{ marginTop: 16 }}>
                <strong>Student-facing message</strong>
                {interview.message}
              </div>
            ) : null}
            {interview.responseNote ? (
              <div className="callout" style={{ marginTop: 12 }}>
                <strong>Student response note</strong>
                {interview.responseNote}
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>Schedule</h2>
            {interview.scheduledFor ? (
              <div className="readiness-list" style={{ marginTop: 16 }}>
                <div className="readiness-row"><span>Date / time</span><strong>{new Date(interview.scheduledFor).toLocaleString()}</strong></div>
                <div className="readiness-row"><span>Format</span><strong>{interview.interviewFormat ?? "—"}</strong></div>
                <div className="readiness-row"><span>Location</span><strong>{interview.locationDetail ?? "—"}</strong></div>
              </div>
            ) : (
              <p className="card-sub">No Interview schedule has been recorded yet.</p>
            )}
            {mutable && canSchedule ? (
              <InterviewScheduleForm
                interviewRequestId={interview.interviewRequestId}
                defaultScheduledFor={interview.scheduledFor}
                defaultFormat={interview.interviewFormat}
                defaultLocation={interview.locationDetail}
              />
            ) : null}
            {mutable && interview.status === "scheduled" ? (
              <div className="hero-actions">
                <CompleteInterviewButton interviewRequestId={interview.interviewRequestId} />
              </div>
            ) : null}
          </section>
        </div>

        {interview.status === "completed" ? (
          <div className="grid grid-2" style={{ marginTop: 18 }}>
            <section className="card">
              <h2>Employer-private evaluation</h2>
              <p className="card-sub">
                Internal interview observations never update Verified Skills and are not shown to Student or Institution users.
              </p>
              {mutable ? (
                <InterviewEvaluationForm
                  interviewRequestId={interview.interviewRequestId}
                  evaluation={interview.evaluation}
                />
              ) : (
                <div className="callout" style={{ marginTop: 16 }}>
                  <strong>{interview.evaluation?.nextStep.replaceAll("_", " ") ?? "No evaluation"}</strong>
                  {interview.evaluation?.summary ?? "No private evaluation has been recorded."}
                </div>
              )}
            </section>

            <section className="card">
              <h2>{interview.placement ? "Placement recorded" : "Record Hire"}</h2>
              {interview.placement ? (
                <>
                  <div className="readiness-list" style={{ marginTop: 16 }}>
                    <div className="readiness-row"><span>Role</span><strong>{interview.placement.roleTitle}</strong></div>
                    <div className="readiness-row"><span>Start date</span><strong>{interview.placement.hireDate}</strong></div>
                    <div className="readiness-row"><span>Status</span><strong>{interview.placement.status.replaceAll("_", " ")}</strong></div>
                  </div>
                  <div className="hero-actions">
                    <Link
                      className="button button-brand"
                      href={`/employer/placements/${encodeURIComponent(interview.placement.placementId)}`}
                    >
                      Open Placement
                    </Link>
                  </div>
                </>
              ) : mutable ? (
                <RecordHireForm
                  interviewRequestId={interview.interviewRequestId}
                  defaultRoleTitle={interview.roleTitle}
                  defaultTradeId={interview.tradeId}
                />
              ) : (
                <p className="card-sub">Read-only Employer role cannot record a hire.</p>
              )}
            </section>
          </div>
        ) : null}

        <div className="hero-actions">
          <Link className="button button-ghost" href="/employer/interviews">Back to Interviews</Link>
          <Link
            className="button button-ghost"
            href={`/employer/talent/${encodeURIComponent(interview.studentId)}${interview.hiringNeedId ? `?hiringNeedId=${encodeURIComponent(interview.hiringNeedId)}` : ""}`}
          >
            Candidate Profile
          </Link>
          {interview.referralId ? (
            <Link className="button button-ghost" href={`/employer/referrals/${encodeURIComponent(interview.referralId)}`}>
              Referral
            </Link>
          ) : null}
        </div>
      </main>
    </>
  );
}
