import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { buildHiringJourneys } from "@/lib/employer/candidate-pipeline";
import type { PipelineSelection } from "@/lib/employer/candidate-pipeline";
import { getEmployerHiringRecords } from "@/lib/employer/pipeline-repository";
import type { EmployerContext } from "@/lib/employer/types";

function evidenceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(date);
}

export function HiringProgressLoading() {
  return <section className="card candidate-progress" aria-busy="true"><h2>Hiring progress</h2><p className="card-sub">Loading hiring activity…</p></section>;
}

export async function CandidatePipelineProgress({ context, ...selection }: PipelineSelection & { context: EmployerContext }) {
  let records;
  try {
    records = await getEmployerHiringRecords(context);
  } catch {
    return <section className="card candidate-progress"><h2>Hiring progress</h2><p role="status">Hiring progress is temporarily unavailable. Refresh this page to try again.</p></section>;
  }
  const journeys = buildHiringJourneys(records, selection);
  return (
    <section className="card candidate-progress">
      <h2>Hiring progress</h2>
      {!journeys.length ? <p className="card-sub">No hiring activity is recorded{selection.hiringNeedId ? " for this Hiring Need" : ""}.</p> : null}
      {journeys.map(j => (
        <div className="candidate-progress-journey" key={j.key}>
          <div className="card-header">
            <div><h3>{j.title}</h3><p className="card-sub">{j.detail}</p></div>
            <span className={`pill ${j.stage === "Employment Started" ? "pill-good" : j.stage === "Needs Review" ? "pill-warn" : "pill-info"}`}>{j.stage}</span>
          </div>
          <ol className="candidate-progress-steps" aria-label={`Hiring stages for ${j.title}`}>
            {j.steps.map((step, index) => (
              <li key={step.label} className={`candidate-progress-step${step.current ? " current" : ""}`} aria-current={step.current ? "step" : undefined}>
                <span className="candidate-progress-marker" aria-hidden="true">{step.recorded ? <CheckCircleIcon /> : index + 1}</span>
                <strong>{step.label}</strong>
                <span className="candidate-progress-state">{step.current ? "Current" : step.recorded ? "Recorded" : "Not recorded"}</span>
                {step.date ? <time dateTime={step.date}>{evidenceDate(step.date)}</time> : null}
              </li>
            ))}
          </ol>
          <div className="hero-actions">{j.links.map(link => <Link key={link.href} href={link.href} className="button button-ghost button-small">{link.label}</Link>)}</div>
        </div>
      ))}
      {journeys.length ? <p className="footer-note">Employment Started requires a confirmed actual start. Retention check-ins are tracked separately.</p> : null}
    </section>
  );
}
