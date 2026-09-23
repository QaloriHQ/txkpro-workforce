import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { EmployerFoundation } from "@/components/employer-foundation";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { getEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerCompanyProfile,
  listHiringNeeds,
} from "@/lib/employer/repository";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";
import {
  listReferrals,
  listSavedTalent,
  searchTalent,
} from "@/lib/employer/workflow-repository";
import {
  listEmployerInterviews,
  listEmployerPlacements,
} from "@/lib/employer/hiring-repository";

export default async function EmployerPage() {
  if (!hasSupabaseServerConfig()) redirect("/login");

  const context = await getEmployerContext();
  if (!context) redirect("/onboarding");

  const [company, hiringNeeds] = await Promise.all([
    getEmployerCompanyProfile(context),
    listHiringNeeds(context),
  ]);

  const [talent, savedTalent, referrals, interviews, placements] =
    context.approvalStatus === "approved"
      ? await Promise.all([
          searchTalent(context),
          listSavedTalent(context),
          listReferrals(context),
          listEmployerInterviews(context),
          listEmployerPlacements(context),
        ])
      : [[], [], [], [], []];

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="overview" />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap employer-dashboard">
        <section className="employer-dashboard-hero">
          <div className="employer-dashboard-intro">
            <p className="eyebrow">Employer workspace</p>
            <h1>Hiring overview</h1>
            <p>
              Manage verified local talent from referral and interview through
              placement and 90-day retention.
            </p>
            <div className="hero-actions">
              <Link className="button button-brand" href="/employer/talent">
                Browse talent
              </Link>
              <Link className="button button-ghost" href="/employer/pipeline">
                View hiring pipeline
              </Link>
            </div>
          </div>

          <aside className="employer-dashboard-account" aria-label="Employer account">
            <div className="employer-dashboard-account-top">
              <span>Company</span>
              <span
                className={
                  context.approvalStatus === "approved"
                    ? "pill pill-good"
                    : "pill pill-neutral"
                }
              >
                {context.approvalStatus}
              </span>
            </div>
            <strong>{context.employerName}</strong>
            <small>{context.role.replaceAll("_", " ")}</small>
          </aside>
        </section>

        {context.approvalStatus === "approved" ? (
          <section className="employer-dashboard-section" aria-labelledby="at-a-glance">
            <div className="employer-dashboard-section-heading">
              <div>
                <p className="eyebrow">Today</p>
                <h2 id="at-a-glance">At a glance</h2>
              </div>
              <Link className="text-link" href="/employer/pipeline">
                Open pipeline
              </Link>
            </div>

            <div className="grid grid-3 employer-metrics">
              <Link className="metric-card employer-metric-link" href="/employer/talent">
                <span>Available talent</span>
                <strong>{talent.length}</strong>
                <small>Employer-discoverable candidates</small>
              </Link>
              <Link className="metric-card employer-metric-link" href="/employer/saved">
                <span>Saved candidates</span>
                <strong>{savedTalent.length}</strong>
                <small>Private shortlist</small>
              </Link>
              <Link className="metric-card employer-metric-link" href="/employer/referrals">
                <span>Referrals</span>
                <strong>{referrals.length}</strong>
                <small>Institution referrals</small>
              </Link>
              <Link className="metric-card employer-metric-link" href="/employer/interviews">
                <span>Interviews</span>
                <strong>{interviews.length}</strong>
                <small>Active interview workflow</small>
              </Link>
              <Link className="metric-card employer-metric-link" href="/employer/placements">
                <span>Placements</span>
                <strong>{placements.length}</strong>
                <small>Recorded employment outcomes</small>
              </Link>
              <div className="metric-card">
                <span>Hiring needs</span>
                <strong>{hiringNeeds.length}</strong>
                <small>Structured workforce demand</small>
              </div>
            </div>
          </section>
        ) : (
          <div className="alert" style={{ marginBottom: 24 }}>
            Your Employer profile is awaiting TXKPRO approval. Hiring tools become
            available after review.
          </div>
        )}

        <EmployerFoundation
          initialContext={context}
          initialCompany={company}
          initialHiringNeeds={hiringNeeds}
        />
      </main>
    </>
  );
}
