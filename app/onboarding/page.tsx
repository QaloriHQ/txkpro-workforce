import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { getAccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const params = await searchParams;
  const requestedRole = params.role === "student" || params.role === "educator" || params.role === "employer" ? params.role : null;
  const account = await getAccountContext();
  if (!account) redirect("/login");
  const supabase = await createServerSupabaseClient();
  const { data: institutions } = await supabase
    .from("wf_institutions")
    .select("institution_id, name, city, state")
    .eq("active", true)
    .order("name");

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
          initialData={account.onboarding?.profile_data ?? {}}
          institutions={institutions ?? []}
          pending={account.onboarding?.status === "pending_review"}
        />
      </div>
    </main>
  );
}
