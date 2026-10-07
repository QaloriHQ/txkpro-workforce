import { Brand } from "@/components/brand";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import { primaryInstitutionRole, institutionScopeLabel } from "@/lib/institution/presentation";
import { workspace, configured } from "@/lib/authenticate/server";
import { ScreeningWorkspace } from "@/components/screening/workspace";
export const dynamic = "force-dynamic";
export default async function Programs() {
    const context = await requireInstitutionPageContext({
        capability: "students",
    });
    const role = primaryInstitutionRole(context);
    let data;
    try {
        data = await workspace({ ownerType: "institution", ownerId: context.institutionId });
    }
    catch (e) {
        if (e instanceof Response && e.status === 403)
            return <main className="page-wrap"><h1>Background checks</h1><p>Your institution administrator must grant screening access.</p></main>;
        throw e;
    }
    return (<>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav active="screening" institutionName={context.institutionName} roleLabel={role.label} scopeLabel={institutionScopeLabel(context)} roles={context.roles} scopes={context.scopes}/>
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap txk-prototype-content">
        <ScreeningWorkspace initial={data} ownerType="institution" ownerId={context.institutionId} configured={configured()}/>
      </main>
    </>);
}
