import {
  AcademicCapIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Brand } from "@/components/brand";
import {
  Card,
  EmptyState,
  MetricCard,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import { InstitutionRoleContext } from "@/components/institution/role-context";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import {
  getInstitutionEmployerLearningContext,
  listInstitutionStudents,
} from "@/lib/institution/learning-repository";
import { institutionAccess } from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

type RouteContext = {
  searchParams: Promise<{
    q?: string;
    program?: string;
    cohort?: string;
    status?: string;
    invite?: string;
  }>;
};

export default async function InstitutionStudentsPage({
  searchParams,
}: RouteContext) {
  const query = await searchParams;
  const context = await requireInstitutionPageContext({ capability: "students" });
  const [learning, students] = await Promise.all([
    getInstitutionEmployerLearningContext(context),
    listInstitutionStudents(context, {
      query: query.q,
      programName: query.program,
      cohortId: query.cohort,
      status: query.status,
    }),
  ]);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);
  const canInviteStudents = context.roles.some((candidate) =>
    [
      "institution_super_admin",
      "institution_admin",
      "department_head",
      "program_coordinator",
    ].includes(candidate.toLowerCase()),
  );
  const assignableCohorts = learning.cohorts.filter((cohort) => cohort.canAssign);

  const activeRoster = students.filter(
    (student) => student.recordType === "student",
  ).length;
  const pendingInvitations = students.filter(
    (student) => student.recordType === "invitation",
  ).length;
  const verifiedSkills = students.reduce(
    (total, student) => total + student.verifiedSkillCount,
    0,
  );
  const activeTraining = students.reduce(
    (total, student) => total + student.activeTrainingCount,
    0,
  );

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="students"
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
          eyebrow="Institution Workspace · Students"
          title="Students"
          description="Review Students and pending Student invitations in your authorized scope, with verified skills, self-attested evidence, Employer Training, referrals, interviews, placements, and retention signals kept distinct."
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          accessLevel={institutionAccess(context, "students")}
        />

        {query.invite ? (
          <Card>
            <p
              className={query.invite === "error" ? "form-error" : "muted"}
              role={query.invite === "error" ? "alert" : "status"}
            >
              {query.invite === "sent"
                ? "Student invitation sent."
                : query.invite === "resent"
                  ? "Student invitation resent with a new expiration."
                  : query.invite === "revoke"
                    ? "Student invitation revoked."
                    : query.invite === "cancel"
                      ? "Student invitation cancelled."
                      : "The invitation action could not be completed. Review the scope and try again."}
            </p>
          </Card>
        ) : null}

        {canInviteStudents ? (
          <Card>
            <div className="institution-student-directory-head">
              <EnvelopeIcon aria-hidden="true" />
              <div>
                <h2>Invite a Student</h2>
                <p className="muted">
                  Invitations are tied to a Cohort in your authorized scope. The
                  role is activated only after the invited email accepts.
                </p>
              </div>
            </div>
            {assignableCohorts.length ? (
              <form
                className="institution-student-directory-filters"
                action="/api/invitations"
                method="post"
              >
                <input type="hidden" name="role" value="student" />
                <input type="hidden" name="scopeType" value="cohort" />
                <input
                  type="hidden"
                  name="institutionId"
                  value={context.institutionId}
                />
                <input type="hidden" name="source" value="individual" />
                <input
                  type="hidden"
                  name="returnTo"
                  value="/institution/students"
                />
                <label className="institution-filter-search">
                  <span>Student email</span>
                  <div>
                    <EnvelopeIcon aria-hidden="true" />
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="student@example.edu"
                    />
                  </div>
                </label>
                <label>
                  <span>Cohort</span>
                  <select name="scopeId" required defaultValue="">
                    <option value="" disabled>
                      Select a Cohort
                    </option>
                    {assignableCohorts.map((cohort) => (
                      <option key={cohort.cohortId} value={cohort.cohortId}>
                        {cohort.name}
                        {cohort.programName ? ` · ${cohort.programName}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="txk-button txk-button-primary txk-button-md"
                  type="submit"
                >
                  <PaperAirplaneIcon aria-hidden="true" />
                  Send invitation
                </button>
              </form>
            ) : (
              <p className="muted">
                Create or activate a Cohort in your authorized scope before
                inviting Students.{" "}
                <Link href="/institution/programs">Open Programs &amp; Cohorts</Link>
              </p>
            )}
          </Card>
        ) : null}

        <section className="txk-metric-grid institution-student-profile-metrics">
          <MetricCard
            label="Roster Students"
            value={activeRoster}
            detail="Canonical Student profiles in scope"
          />
          <MetricCard
            label="Pending invitations"
            value={pendingInvitations}
            detail="Canonical invitations awaiting acceptance"
          />
          <MetricCard
            label="Verified Skills"
            value={verifiedSkills}
            detail="Instructor-authoritative evidence"
          />
          <MetricCard
            label="Active Training"
            value={activeTraining}
            detail="Assigned or in-progress Employer Training"
          />
        </section>

        <form className="institution-student-directory-filters" method="get">
          <label className="institution-filter-search">
            <span>Search Students</span>
            <div>
              <MagnifyingGlassIcon aria-hidden="true" />
              <input
                name="q"
                type="search"
                defaultValue={query.q ?? ""}
                placeholder="Name, Program, Cohort"
              />
            </div>
          </label>
          <label>
            <span>Program</span>
            <select name="program" defaultValue={query.program ?? ""}>
              <option value="">All Programs</option>
              {learning.programs.map((program) => (
                <option key={program.programKey} value={program.programName}>
                  {program.programName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Cohort</span>
            <select name="cohort" defaultValue={query.cohort ?? ""}>
              <option value="">All Cohorts</option>
              {learning.cohorts.map((cohort) => (
                <option key={cohort.cohortId} value={cohort.cohortId}>
                  {cohort.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue={query.status ?? ""}>
              <option value="">All statuses</option>
              <option value="student">Roster Students</option>
              <option value="invitation">Pending invitations</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="invited">Invited</option>
            </select>
          </label>
          <button className="txk-button txk-button-primary txk-button-md" type="submit">
            Filter
          </button>
          <Link className="txk-button txk-button-default txk-button-md" href="/institution/students">
            Clear
          </Link>
        </form>

        {students.length ? (
          <div className="institution-student-directory">
            {students.map((student) => {
              const cardKey =
                student.studentId ??
                student.membershipKey ??
                `${student.recordType}-${student.displayName}`;
              const invitationId =
                student.invitationSource?.startsWith("user_invitation:")
                  ? student.invitationSource.slice("user_invitation:".length)
                  : null;

              return (
                <Card className="institution-student-directory-card" key={cardKey}>
                  <div className="institution-student-directory-head">
                    <UserCircleIcon aria-hidden="true" />
                    <div>
                      {student.studentId ? (
                        <Link
                          className="institution-student-link"
                          href={`/institution/students/${encodeURIComponent(
                            student.studentId,
                          )}`}
                        >
                          {student.displayName}
                        </Link>
                      ) : (
                        <strong>{student.displayName}</strong>
                      )}
                      <span>
                        {student.programName ?? "Program"} ·{" "}
                        {student.cohortName ?? "Pending cohort"}
                      </span>
                      {student.email ? <small>{student.email}</small> : null}
                    </div>
                    <StatusBadge
                      tone={
                        student.recordType === "invitation"
                          ? "warning"
                          : student.profileStatus === "active"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {student.recordType === "invitation"
                        ? `Invitation ${student.invitationStatus ?? "pending"}`
                        : (student.profileStatus ?? "profile")}
                    </StatusBadge>
                  </div>

                  <div className="institution-student-signal-grid">
                    <div>
                      <CheckBadgeIcon aria-hidden="true" />
                      <span>
                        <strong>{student.verifiedSkillCount}</strong>
                        <small>Verified Skills</small>
                      </span>
                    </div>
                    <div>
                      <ClipboardDocumentCheckIcon aria-hidden="true" />
                      <span>
                        <strong>
                          {student.selfAttestedSkillCount +
                            student.inProgressSkillCount}
                        </strong>
                        <small>Self-attested or in review</small>
                      </span>
                    </div>
                    <div>
                      <AcademicCapIcon aria-hidden="true" />
                      <span>
                        <strong>
                          {student.completedTrainingCount}/
                          {student.employerTrainingCount}
                        </strong>
                        <small>Employer Training completed</small>
                      </span>
                    </div>
                    <div>
                      <CheckBadgeIcon aria-hidden="true" />
                      <span>
                        <strong>{student.companyBadgeCount}</strong>
                        <small>Active Company Badges</small>
                      </span>
                    </div>
                  </div>

                  <div className="institution-student-directory-footer">
                    <span>
                      {student.recordType === "invitation"
                        ? "Pending Student invitation; canonical profile opens after acceptance."
                        : `${student.referralCount} referrals · ${student.activeInterviewCount} active interviews · ${student.activePlacementCount} active placements · ${student.openRetentionCaseCount} open retention cases`}
                    </span>
                    {student.studentId ? (
                      <Link
                        className="txk-button txk-button-default txk-button-sm"
                        href={`/institution/students/${encodeURIComponent(
                          student.studentId,
                        )}`}
                      >
                        Open profile
                      </Link>
                    ) : invitationId ? (
                      <div className="header-actions">
                        <form
                          action={`/api/invitations/${encodeURIComponent(
                            invitationId,
                          )}`}
                          method="post"
                        >
                          <input type="hidden" name="action" value="resend" />
                          <input
                            type="hidden"
                            name="returnTo"
                            value="/institution/students"
                          />
                          <button
                            className="txk-button txk-button-default txk-button-sm"
                            type="submit"
                          >
                            <ArrowPathIcon aria-hidden="true" />
                            Resend
                          </button>
                        </form>
                        <form
                          action={`/api/invitations/${encodeURIComponent(
                            invitationId,
                          )}`}
                          method="post"
                        >
                          <input type="hidden" name="action" value="revoke" />
                          <input
                            type="hidden"
                            name="returnTo"
                            value="/institution/students"
                          />
                          <button
                            className="txk-button txk-button-default txk-button-sm"
                            type="submit"
                          >
                            <XMarkIcon aria-hidden="true" />
                            Revoke
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="txk-muted-text">Awaiting acceptance</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No Students match these filters"
              description="Clear one or more filters to return to your authorized Institution roster."
            />
          </Card>
        )}
      </main>
    </>
  );
}
