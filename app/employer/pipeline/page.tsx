import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { buildHiringJourneys, hiringStages } from "@/lib/employer/candidate-pipeline";
import { getEmployerHiringRecords } from "@/lib/employer/pipeline-repository";

export const dynamic = "force-dynamic";

export default async function HiringPipelinePage() {
  const context = await requireEmployerContext({ approved: true });
  const values = buildHiringJourneys(await getEmployerHiringRecords(context));

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="pipeline" />
        <ThemeToggle />
        <SignOutButton />
      </header>
      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Employer · Hiring Pipeline</p>
            <h1>Hiring pipeline</h1>
            <p className="card-sub">
              Follow each candidate’s hiring progress. Separate hiring attempts stay separate.
            </p>
          </div>
          <span className="pill pill-neutral">{values.length} hiring journeys</span>
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Open a candidate’s hiring record to continue.</strong>
          Employment Started requires confirmed employment. Retention check-ins remain separate.
        </div>

        <div className="pipeline-board">
          {hiringStages.map((stage) => {
            const stageCards = values.filter((card) => card.stage === stage);
            return (
              <section className="pipeline-column" key={stage}>
                <div className="pipeline-column-head">
                  <strong>{stage}</strong>
                  <span className="pill pill-neutral">{stageCards.length}</span>
                </div>
                <div className="grid">
                  {stageCards.map((card) => (
                    <Link className="pipeline-card" href={card.href} key={card.key}>
                      <strong>{card.studentName}</strong>
                      <span>{card.title}</span>
                      <small>{card.detail}</small>
                    </Link>
                  ))}
                  {!stageCards.length ? <div className="empty">No records</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
