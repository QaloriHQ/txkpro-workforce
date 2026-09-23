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
import { listReferrals, listSavedTalent, searchTalent } from "@/lib/employer/workflow-repository";

export default async function EmployerPage() {
  if (!hasSupabaseServerConfig()) redirect("/login");

  const context = await getEmployerContext();
  if (!context) redirect("/onboarding");

  const [company, hiringNeeds] = await Promise.all([
    getEmployerCompanyProfile(context),
    listHiringNeeds(context),
  ]);

  const [talent, savedTalent, referrals] =
    context.approvalStatus === "approved"
      ? await Promise.all([
          searchTalent(context),
          listSavedTalent(context),
          listReferrals(context),
        ])
      : [[], [], []];

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="overview" />
        <div className="header-actions">
          <span className="pill">Production integration</span>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Employer workspace · Wave 7</p>
            <h1>Supabase-backed Employer foundation</h1>
            <p className="card-sub">
              Authentication, membership resolution, Company Profile and Hiring
              Needs now use the shared TXKPRO Workforce backend.
            </p>
          </div>
          <span
            className={
              context.approvalStatus === "approved" ? "pill pill-good" : "pill"
            }
          >
            {context.approvalStatus}
          </span>
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Authorization boundary</strong>
          Identity is verified by Supabase Auth. Employer authority comes from
          active server-side role + scope membership and database RLS; the
          browser cannot grant itself an Employer role.
        </div>

        {context.approvalStatus === "approved" ? (
          <div className="grid grid-4" style={{ marginBottom: 18 }}>
            <div className="metric-card">
              <span>Visible Talent</span>
              <strong>{talent.length}</strong>
              <small>Authorized, Employer-discoverable candidates</small>
            </div>
            <div className="metric-card">
              <span>Saved Candidates</span>
              <strong>{savedTalent.length}</strong>
              <small>Employer-private shortlist</small>
            </div>
            <div className="metric-card">
              <span>Referrals</span>
              <strong>{referrals.length}</strong>
              <small>Institution referral lifecycle</small>
            </div>
            <div className="metric-card">
              <span>Hiring Needs</span>
              <strong>{hiringNeeds.length}</strong>
              <small>Structured Employer demand</small>
            </div>
          </div>
        ) : null}

        <EmployerFoundation
          initialContext={context}
          initialCompany={company}
          initialHiringNeeds={hiringNeeds}
        />
      </main>
    </>
  );
}
