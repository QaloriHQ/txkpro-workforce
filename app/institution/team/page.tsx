import { Brand } from "@/components/brand";
import { InstitutionRoleContext } from "@/components/institution/role-context";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { InvitationManager } from "@/components/invitations/invitation-manager";
import { PageHeader } from "@/components/design-system";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import { institutionAccess } from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";
import { getInstitutionEmployerLearningContext } from "@/lib/institution/learning-repository";
import { listUserInvitations } from "@/lib/invitations/service";

export const dynamic = "force-dynamic";

const institutionInviteRoles = [
  { value: "institution_super_admin", label: "Institution super admin", description: "Institution-wide administration; requires the canonical inviter policy." },
  { value: "institution_admin", label: "Institution admin", description: "Institution-wide administration; requires the canonical inviter policy." },
  { value: "department_head", label: "Department head", description: "Contained Department, Program or Cohort team scope." },
  {
    value: "student",
    label: "Student",
    description:
      "Creates a pending Student membership and activation handoff for Student onboarding/profile privacy controls.",
  },
  {
    value: "instructor",
    label: "Instructor",
    description:
      "Creates a scoped Institution-team invitation. Final authority is granted only by server-side role/scope policy.",
  },
  {
    value: "assistant_instructor",
    label: "Assistant instructor",
    description: "Scoped Institution-team access for classroom support.",
  },
  {
    value: "career_services",
    label: "Career services",
    description: "Scoped access for referrals, readiness, and placement support.",
  },
  {
    value: "read_only_analyst",
    label: "Read-only analyst",
    description: "Scoped read-only reporting and audit visibility.",
  },
  {
    value: "program_coordinator",
    label: "Program coordinator",
    description: "Program/cohort operations role; scope containment is enforced server-side.",
  },
];

export default async function InstitutionTeamPage() {
  const context = await requireInstitutionPageContext({ capability: "team" });
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);
  const invitations = await listUserInvitations({ institutionId: context.institutionId });
  const learning = await getInstitutionEmployerLearningContext(context);
  const scopeKeys = new Set<string>();
  const scopes = [
    ...(context.scopes.some(s => s.scopeType === "institution" && s.scopeId === context.institutionId) ? [{
      scopeType: "institution",
      scopeId: context.institutionId,
      institutionId: context.institutionId,
      label: `${context.institutionName} · Institution`,
      description: "Institution-wide scope. Server policy decides which roles can use it.",
    }] : []),
    ...learning.programs.map(p => ({ scopeType: "program", scopeId: p.programKey, institutionId: context.institutionId, label: `${p.programName} · Program` })),
    ...learning.cohorts.map(c => ({ scopeType: "cohort", scopeId: c.cohortId, institutionId: context.institutionId, label: `${c.name} · Cohort` })),
    ...context.scopes
      .filter((scope) => {
        return scope.scopeId !== context.institutionId || scope.scopeType !== "institution";
      })
      .map((scope) => ({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        institutionId: context.institutionId,
        label: `${scope.scopeId} · ${scope.scopeType}`,
        description: `Contained by your ${scope.role.replaceAll("_", " ")} membership.`,
      })),
  ].filter(scope => {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    if (scopeKeys.has(key)) return false;
    scopeKeys.add(key);
    return true;
  });

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="team"
          institutionName={context.institutionName}
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          roles={context.roles}
          scopes={context.scopes}
        />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Institution Workspace · Team"
          title="Team & Student invitations"
          description="Create, inspect, resend, and revoke scoped invitations. Activation links never carry editable authorization data; the server grants only the role and scope recorded on the invitation."
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          accessLevel={institutionAccess(context, "team")}
        />

        <InvitationManager
          initial={invitations}
          tenantFilter={`?institutionId=${encodeURIComponent(context.institutionId)}`}
          roles={institutionInviteRoles}
          scopes={scopes}
          title="Invite Students and Institution team members"
          description="Use the same canonical invitation service that CSV roster import will call. Duplicate pending invites are idempotent and accepted invites link to canonical identities."
        />
      </main>
    </>
  );
}
