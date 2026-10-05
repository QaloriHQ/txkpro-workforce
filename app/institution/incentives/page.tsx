import { Brand } from "@/components/brand";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import {
  primaryInstitutionRole,
  institutionScopeLabel,
} from "@/lib/institution/presentation";
import { pointsWorkspace } from "@/lib/pro-points/server";
import { IncentiveWorkspace } from "@/components/pro-points/workspace";
export const dynamic = "force-dynamic";
export default async function Programs() {
  const context = await requireInstitutionPageContext({
    capability: "students",
  });
  const role = primaryInstitutionRole(context);
  const data = await pointsWorkspace();
  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="incentives"
          institutionName={context.institutionName}
          roleLabel={role.label}
          scopeLabel={institutionScopeLabel(context)}
          roles={context.roles}
          scopes={context.scopes}
        />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap txk-prototype-content">
        <h1>Incentive programs</h1>
        <p className="card-sub">
          Create private activity programs for your institution. Students
          explicitly accept participation.
        </p>
        <IncentiveWorkspace data={data} ownerType="institution" />
      </main>
    </>
  );
}
