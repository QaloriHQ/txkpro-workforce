import { Brand } from "@/components/brand";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { OrganizationProfileEditor } from "@/components/public/organization-profile-editor";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageHeader } from "@/components/design-system";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import { institutionScopeLabel, primaryInstitutionRole } from "@/lib/institution/presentation";
import { organizationSettings } from "@/lib/public/organization-profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public Institution profile | TXKPRO", robots: { index: false, follow: false } };

export default async function InstitutionPublicProfileSettingsPage() {
  const context = await requireInstitutionPageContext({ capability: "settings" });
  const profile = await organizationSettings("institution", context.institutionId);
  const role = primaryInstitutionRole(context);
  return <><header className="topbar institution-topbar"><Brand /><InstitutionWorkspaceNav active="public-profile" institutionName={context.institutionName} roleLabel={role.label} scopeLabel={institutionScopeLabel(context)} roles={context.roles} scopes={context.scopes} /><div className="header-actions"><ThemeToggle /><SignOutButton /></div></header><main className="page-wrap txk-prototype-content"><PageHeader eyebrow="Institution workspace" title="Public Institution profile" description="Publish approved Institution facts, programs, service area, and contact actions without exposing Student or operational records." /><OrganizationProfileEditor initial={profile} /></main></>;
}
