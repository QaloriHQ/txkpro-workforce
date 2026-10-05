import { Brand } from "@/components/brand";
import { PageHeader } from "@/components/design-system";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import { InstitutionDirectory,type DirectoryData } from "@/components/classes/directory";
import { classRpc } from "@/lib/classes/server";
import { institutionScopeLabel, primaryInstitutionRole } from "@/lib/institution/presentation";
export const dynamic="force-dynamic";
export default async function Directory() {
  const context = await requireInstitutionPageContext({ capability: "students" });
  const data = await classRpc<DirectoryData>("institution_connections");
  const role = primaryInstitutionRole(context);
  return <>
    <header className="topbar institution-topbar">
      <Brand />
      <InstitutionWorkspaceNav active="directory" institutionName={context.institutionName} roleLabel={role.label}
        scopeLabel={institutionScopeLabel(context)} roles={context.roles} scopes={context.scopes} />
      <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
    </header>
    <main className="page-wrap txk-prototype-content directory-page">
      <PageHeader eyebrow="Role-scoped institution map" title="Institution directory"
        description="Explore your institution, programs, cohorts and staff in an interactive canvas." />
      <InstitutionDirectory data={data} />
    </main>
  </>;
}
