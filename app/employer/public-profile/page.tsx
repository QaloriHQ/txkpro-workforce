import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { OrganizationProfileEditor } from "@/components/public/organization-profile-editor";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageHeader } from "@/components/design-system";
import { getEmployerContext } from "@/lib/employer/auth";
import { organizationSettings } from "@/lib/public/organization-profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public Employer profile | TXKPRO", robots: { index: false, follow: false } };

export default async function EmployerPublicProfileSettingsPage() {
  const context = await getEmployerContext();
  if (!context) redirect("/login");
  const profile = await organizationSettings("employer", context.employerId);
  return <><header className="topbar"><Brand /><EmployerWorkspaceNav active="public-profile" /><div className="header-actions"><ThemeToggle /><SignOutButton /></div></header><main className="page-wrap employer-dashboard"><PageHeader eyebrow="Employer workspace" title="Public company profile" description="Choose the approved facts customers, Students, and search engines may see. Hiring records and private Workforce data are never published." /><OrganizationProfileEditor initial={profile} /></main></>;
}
