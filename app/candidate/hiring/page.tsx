import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext, getVerifiedIdentity } from "@/lib/auth";
import { listCandidateApplications } from "@/lib/ats/applications-repository";
import { labelStatus } from "@/lib/ats/applications";
import { StatusBadge } from "@/components/design-system/primitives";
import { SubmitCandidateTask, WithdrawApplication } from "@/components/ats/candidate-lifecycle-actions";
import { candidateChecks } from "@/lib/checkr/candidate";
import { CandidateChecks } from "@/components/screening/candidate-checks";
import { Brand } from "@/components/brand";
import { listStudentInterviews, listStudentPlacements } from "@/lib/student/workflow-repository";
export const dynamic = "force-dynamic";
export default async function CandidateHiring() {
  const account = await getAccountContext();
  const identity = account ?? await getVerifiedIdentity();
  if (!identity) redirect("/login?next=/candidate/hiring");
  const [applications, checks, interviews, placements] = await Promise.all([
    listCandidateApplications(),
    account ? candidateChecks() : Promise.resolve([]),
    account?.role === "student" ? listStudentInterviews() : Promise.resolve([]),
    account?.role === "student" ? listStudentPlacements() : Promise.resolve([]),
  ]);
  return <><header className="topbar"><Brand /><Link className="button button-ghost" href={account?"/dashboard":"/jobs"}>{account?"My workspace":"Open opportunities"}</Link></header>
    <main className="page-wrap"><h1>My hiring progress</h1>
      <p>Review your applications, candidate-visible pipeline steps, and recorded hiring updates.</p>
      <section className="card"><h2>My applications</h2>
        {applications.map(application => <article className="card" key={application.id} style={{display:"grid",gap:12}}><div><StatusBadge tone={application.status==="submitted"?"info":"neutral"}>{labelStatus(application.status)}</StatusBadge><h3>{application.employerName} · {application.jobTitle}</h3><p className="card-sub">{application.applicationId} · pinned workflow {application.pipelineVersionId.slice(0,8)}</p></div>{application.tasks.filter(task=>task.candidateVisible).map(task=><div className="card" key={task.id}><strong>{task.label}</strong><p>{labelStatus(task.status)}</p><p className="card-sub">{task.instructions||"Follow the employer’s instructions for this step."}</p>{task.dueAt?<p>Due {new Date(task.dueAt).toLocaleString()}</p>:<p className="card-sub">No deadline assigned.</p>}{application.status==="submitted"&&task.ownerRole==="candidate"&&["not_started","in_progress","review_required"].includes(task.status)?<SubmitCandidateTask id={task.id} revision={task.revision} label={task.label}/>:null}</div>)}{application.status==="submitted"?<WithdrawApplication id={application.id} revision={application.revision}/>:application.lifecycleReason?<p><strong>Reason:</strong> {application.lifecycleReason}</p>:null}</article>)}
        {!applications.length ? <p>No ATS applications have been submitted.</p> : null}
      </section>
      {account ? <section className="card"><h2>Hiring updates</h2>
        {interviews.map(i => <article className="card" key={i.interviewRequestId}>
          <h3>{i.employerName} · {i.roleTitle}</h3>
          <p>Interview: {i.status.replaceAll("_", " ")}</p>
          {i.scheduledFor ? <p>Scheduled: {new Date(i.scheduledFor).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" })}</p> : null}
          <Link href="/student/opportunities?view=interviews">View interview and next actions</Link>
        </article>)}
        {placements.map(p => <article className="card" key={p.placementId}>
          <h3>{p.employerName} · {p.roleTitle}</h3>
          <p>{p.status === "ended" ? "Employment ended" : p.officialPlacement ? "Employment start confirmed" : "Employment start awaiting confirmation"}</p>
          <Link href="/student/opportunities?view=employment">View employment details</Link>
        </article>)}
        {!interviews.length && !placements.length ? <p>No interview or employment updates have been recorded.</p> : null}
        <p className="card-sub">These legacy interview and placement updates remain separate from ATS application tasks.</p>
      </section> : null}
      {account ? <CandidateChecks checks={checks} /> : null}
    </main></>;
}
