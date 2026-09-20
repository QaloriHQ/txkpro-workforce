import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { EmployerFoundation } from "@/components/employer-foundation";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { getEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerCompanyProfile,
  listHiringNeeds,
} from "@/lib/employer/repository";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export default async function EmployerPage() {
  if (!hasSupabaseServerConfig()) redirect("/login");

  const context = await getEmployerContext();
  if (!context) redirect("/onboarding");

  const [company, hiringNeeds] = await Promise.all([
    getEmployerCompanyProfile(context),
    listHiringNeeds(context),
  ]);

  return (
    <>
      <header className="topbar">
        <Brand />
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

        <EmployerFoundation
          initialContext={context}
          initialCompany={company}
          initialHiringNeeds={hiringNeeds}
        />
      </main>
    </>
  );
}
