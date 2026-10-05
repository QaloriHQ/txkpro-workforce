import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { PageHeader } from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { InstitutionDirectory, type DirectoryData } from "@/components/classes/directory";
import { InvitationManager } from "@/components/invitations/invitation-manager";
import { canManageCompany, getEmployerContext } from "@/lib/employer/auth";
import { listUserInvitations } from "@/lib/invitations/service";
import { classRpc } from "@/lib/classes/server";
export const dynamic = "force-dynamic";
const roles = [
  {value: "employer_employee", label: "Employee", description: "Training and accepted incentive programs only. No hiring or administrative access."},
  {value: "employer_admin", label: "Employer admin", description: "Employer operations and team administration."},
  {value: "recruiter", label: "Recruiter", description: "Authorized candidate and hiring workflows."},
  {value: "hiring_manager", label: "Hiring manager", description: "Assigned hiring workflows."},
  {value: "employer_read_only", label: "Read-only", description: "Permitted operational reporting without mutation."},
];
export default async function Directory() {
  const context = await getEmployerContext();
  if (!context || context.accountStatus !== "active") redirect("/dashboard");
  const manage = canManageCompany(context.role);
  const [data, invitations] = await Promise.all([
    classRpc<DirectoryData>("employer_connections", {p_employer: context.employerId}),
    manage ? listUserInvitations({employerId: context.employerId}) : Promise.resolve([]),
  ]);
  return <>
    <header className="topbar employer-topbar"><Brand /><EmployerWorkspaceNav active="team" /><div className="header-actions"><ThemeToggle /><SignOutButton /></div></header>
    <main className="page-wrap txk-prototype-content directory-page">
      <PageHeader eyebrow="Employer workspace" title="Directory" description="Explore your team by role. Select a person to view their membership." />
      <InstitutionDirectory variant="employer" data={{...data, organizations: [{id: context.employerId, name: context.employerName}]}} actions={manage ? <InvitationManager compact initial={invitations} roles={roles}
        scopes={[{scopeType:"employer",scopeId:context.employerId,employerId:context.employerId,label:context.employerName}]}
        tenantFilter={`?employerId=${encodeURIComponent(context.employerId)}`} title="Invite employees and workspace users"
        description="The person must accept their invitation before access becomes active." /> : null} />
    </main>
  </>;
}
