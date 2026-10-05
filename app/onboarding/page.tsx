import { studentPublicSettings } from "@/lib/student-public-profile/repository";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { getAccountContext, hasStaffProfileMembership } from "@/lib/auth";
import { onboardingInstitutions } from "@/lib/institutions";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const params = await searchParams;
  const requestedRole = params.role === "student" || params.role === "educator" || params.role === "employer" ? params.role : null;
  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (!account.role && hasStaffProfileMembership(account)) redirect("/professional/profile");

  // Platform administrators are provisioned server-side and never complete
  // public workforce onboarding.
  if (account.role === "admin") redirect("/admin");

  if (account.onboarding?.status === "complete" && account.role) {
    if (account.role === "employer") redirect("/employer");
    if (account.role === "student") {
      const settings = await studentPublicSettings();
      redirect(settings.chosen ? "/student" : "/student/profile?privacy=required");
    }
    redirect("/dashboard");
  }

  const institutions = await onboardingInstitutions().catch(() => null);
  const educatorInstitutions = institutions?.filter(item => item.authorized) ?? [];
  const initialData = { ...(account.onboarding?.profile_data ?? {}) };
  if ((account.role === "educator" || account.onboarding?.selected_role === "educator") && !initialData.institutionId && educatorInstitutions.length === 1) {
    initialData.institutionId = educatorInstitutions[0].institution_id;
  }

  return (
    <main className="onboarding-wrap">
      <header className="onboarding-header">
        <Brand />
        <div className="header-actions">
          <ThemeToggle />
          <form action="/auth/signout" method="post"><button className="button button-ghost button-small" type="submit">Sign out</button></form>
        </div>
      </header>
      <div className="onboarding-layout">
        <aside className="onboarding-aside">
          <p className="eyebrow">TXKPRO Workforce</p>
          <h1>Set up your workforce profile.</h1>
          <p>One account connects your identity to the correct student, educator, employer, or TXKPRO operations permissions.</p>
          <div className="onboarding-trust"><strong>Role access is server-controlled.</strong><span>Choosing a role here never grants admin access or institution student-data access by itself.</span></div>
        </aside>
        <OnboardingWizard
          firstName={account.firstName}
          lastName={account.lastName}
          phone={account.phone}
          provisionedRole={account.role}
          initialRole={account.onboarding?.selected_role ?? account.role ?? requestedRole}
          initialStep={account.onboarding?.current_step ?? 1}
          initialData={initialData}
          institutions={account.role === "educator" || account.onboarding?.selected_role === "educator" ? educatorInstitutions : institutions ?? []}
          directoryError={institutions === null ? "Institution directory is unavailable. Please try again shortly." : null}
          pending={account.onboarding?.status === "pending_review"}
        />
      </div>
    </main>
  );
}
