import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { InvitationManager } from "@/components/invitations/invitation-manager";
import { PageHeader } from "@/components/design-system";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listInvitations } from "@/lib/invitations/repository";

export const dynamic = "force-dynamic";

const employerInviteRoles = [
  {
    value: "employer_admin",
    label: "Employer admin",
    description: "Can help manage Employer workspace operations for this employer.",
  },
  {
    value: "recruiter",
    label: "Recruiter",
    description: "Can manage talent pipeline workflows permitted by Employer policy.",
  },
  {
    value: "hiring_manager",
    label: "Hiring manager",
    description: "Scoped hiring workflow participant for this employer.",
  },
  {
    value: "employer_read_only",
    label: "Read-only",
    description: "Read-only Employer workspace access for this employer.",
  },
];

export default async function EmployerTeamPage() {
  const context = await requireEmployerContext();
  const invitations = await listInvitations({
    scopeType: "employer",
    scopeId: context.employerId,
  });

  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="team" />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Employer Workspace · Team"
          title={`${context.employerName} team invitations`}
          description="Invite Employer team members into this Employer scope. Owner/Admin authority is checked server-side, and activation links do not expose editable role grants."
        />

        <InvitationManager
          initial={invitations.filter((item) => item.roleGroup === "employer")}
          roles={employerInviteRoles}
          scopes={[
            {
              scopeType: "employer",
              scopeId: context.employerId,
              label: `${context.employerName} · Employer`,
              description:
                "Employer Owner/Admin roles may invite permitted team roles into this employer only.",
            },
          ]}
          title="Invite Employer team members"
          description="Create, resend, revoke, and inspect Employer-team invitations with audit-backed lifecycle state."
        />
      </main>
    </>
  );
}
