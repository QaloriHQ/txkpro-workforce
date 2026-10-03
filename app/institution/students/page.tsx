import {
  AcademicCapIcon,
  CheckBadgeIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Brand } from "@/components/brand";
import {
  Card,
  EmptyState,
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
  listInstitutionCompanyBadgeEvidence,
  listInstitutionMicroCertAssignments,
} from "@/lib/institution/learning-repository";
import { institutionAccess } from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

type RouteContext = {
  searchParams: Promise<{ q?: string; program?: string; cohort?: string }>;
};

export default async function InstitutionStudentsPage({
  searchParams,
}: RouteContext) {
  const query = await searchParams;
  const context = await requireInstitutionPageContext({ capability: "students" });
  const [learning, assignments, badges] = await Promise.all([
    getInstitutionEmployerLearningContext(context),
    listInstitutionMicroCertAssignments(context),
    listInstitutionCompanyBadgeEvidence(context),
  ]);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);
  const q = query.q?.trim().toLowerCase() ?? "";

  const assignmentNames = new Map(
    assignments.map((assignment) => [
      assignment.studentId,
      assignment.studentName,
    ]),
  );
  const badgeCounts = new Map<string, number>();
  for (const badge of badges) {
    for (const award of badge.awards) {
      if (award.status !== "active") continue;
      badgeCounts.set(
        award.studentId,
        (badgeCounts.get(award.studentId) ?? 0) + 1,
      );
    }
  }

  const students = learning.students.filter((student) => {
    const name = assignmentNames.get(student.studentId) ?? student.displayName;
    return (
      (!q ||
        name.toLowerCase().includes(q) ||
        (student.programName ?? "").toLowerCase().includes(q) ||
        student.cohortName.toLowerCase().includes(q)) &&
      (!query.program || student.programName === query.program) &&
      (!query.cohort || student.cohortId === query.cohort)
    );
  });

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
          description="Review Students in your authorized scope and move between technical verification, Employer Training, Company Badge, interview, and placement evidence without combining them into a single score."
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          accessLevel={institutionAccess(context, "students")}
        />

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
              const studentAssignments = assignments.filter(
                (assignment) => assignment.studentId === student.studentId,
              );
              const activeTraining = studentAssignments.find(
                (assignment) =>
                  assignment.status === "assigned" ||
                  assignment.status === "in_progress",
              );
              const name =
                assignmentNames.get(student.studentId) ?? student.displayName;

              return (
                <Card className="institution-student-directory-card" key={student.studentId}>
                  <div className="institution-student-directory-head">
                    <UserCircleIcon aria-hidden="true" />
                    <div>
                      <Link
                        className="institution-student-link"
                        href={`/institution/students/${encodeURIComponent(
                          student.studentId,
                        )}`}
                      >
                        {name}
                      </Link>
                      <span>
                        {student.programName ?? "Program"} · {student.cohortName}
                      </span>
                    </div>
                    <StatusBadge tone={student.profileStatus === "active" ? "success" : "neutral"}>
                      {student.profileStatus ?? "profile"}
                    </StatusBadge>
                  </div>

                  <div className="institution-student-signal-grid">
                    <div>
                      <AcademicCapIcon aria-hidden="true" />
                      <span>
                        <strong>{studentAssignments.length}</strong>
                        <small>Employer Training assignments</small>
                      </span>
                    </div>
                    <div>
                      <CheckBadgeIcon aria-hidden="true" />
                      <span>
                        <strong>{badgeCounts.get(student.studentId) ?? 0}</strong>
                        <small>Active Company Badges</small>
                      </span>
                    </div>
                  </div>

                  <div className="institution-student-directory-footer">
                    <span>
                      {activeTraining
                        ? `${activeTraining.courseTitle} · ${
                            activeTraining.status === "assigned"
                              ? "Not started"
                              : "In progress"
                          }`
                        : "No active Employer Training"}
                    </span>
                    <Link
                      className="txk-button txk-button-default txk-button-sm"
                      href={`/institution/students/${encodeURIComponent(
                        student.studentId,
                      )}`}
                    >
                      Open profile
                    </Link>
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
