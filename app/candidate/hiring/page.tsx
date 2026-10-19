import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { candidateChecks } from "@/lib/checkr/candidate";
import { CandidateChecks } from "@/components/screening/candidate-checks";
import { Brand } from "@/components/brand";
import { listStudentInterviews, listStudentPlacements } from "@/lib/student/workflow-repository";
export const dynamic = "force-dynamic";
export default async function CandidateHiring() {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  const [checks, interviews, placements] = await Promise.all([
    candidateChecks(),
    account.role === "student" ? listStudentInterviews() : Promise.resolve([]),
    account.role === "student" ? listStudentPlacements() : Promise.resolve([]),
  ]);
  return <><header className="topbar"><Brand /><Link className="button button-ghost" href="/dashboard">My workspace</Link></header>
    <main className="page-wrap"><h1>My hiring progress</h1>
      <p>Review your recorded hiring updates and continue your Checkr screening.</p>
      <section className="card"><h2>Hiring updates</h2>
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
        <p className="card-sub">Custom pipeline task progress will be available when applications launch. No planned step is treated as completed.</p>
      </section>
      <CandidateChecks checks={checks} />
    </main></>;
}
