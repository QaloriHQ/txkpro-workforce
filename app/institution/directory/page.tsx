import { Brand } from "@/components/brand";
import { PageHeader } from "@/components/design-system";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import { InstitutionDirectory,type DirectoryData } from "@/components/classes/directory";
import { InvitationManager, type InvitationRoleOption, type InvitationScopeOption } from "@/components/invitations/invitation-manager";
import { listUserInvitations } from "@/lib/invitations/service";
import { classRpc } from "@/lib/classes/server";
import { institutionScopeLabel, primaryInstitutionRole } from "@/lib/institution/presentation";
export const dynamic="force-dynamic";
export default async function Directory() {
  const context = await requireInstitutionPageContext({ capability: "students" });
  const [data, options] = await Promise.all([
    classRpc<DirectoryData>("institution_connections"),
    classRpc<{roles: InvitationRoleOption[]; scopes: InvitationScopeOption[]}>("directory_invitation_options", {p_institution: context.institutionId}),
  ]);
  const invitations = options.roles.length ? await listUserInvitations({institutionId: context.institutionId}) : [];
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
      <InstitutionDirectory data={{...data,organizations:[{id:context.institutionId,name:context.institutionName}]}} actions={options.roles.length ? <InvitationManager compact initial={invitations} roles={options.roles} scopes={options.scopes}
        tenantFilter={`?institutionId=${encodeURIComponent(context.institutionId)}`} title="Invite faculty, staff and Students"
        description="Choose a permitted role and scope. Acceptance and any required approval grant access." /> : null} />
    </main>
  </>;
}
