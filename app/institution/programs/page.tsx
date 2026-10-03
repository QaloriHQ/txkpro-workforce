import {
  AcademicCapIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  RectangleGroupIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { CohortEditor, type CohortSaveState } from "@/components/institution/cohort-editor";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
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
  getInstitutionProgramCohortManagement,
  upsertInstitutionCohort,
} from "@/lib/institution/learning-repository";
import {
  institutionAccess,
  institutionCanManage,
} from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";
import type {
  InstitutionProgramManagementCohort,
  InstitutionProgramManagementProgram,
} from "@/lib/institution/types";

export const dynamic = "force-dynamic";


function pretty(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "Not provided";
}

function date(value: string | null | undefined) {
  return value && !value.startsWith("1970")
    ? new Date(value).toLocaleDateString()
    : "No activity yet";
}

function statusTone(value: string | null | undefined) {
  if (value === "active" || value === "enrolling" || value === "in_progress") {
    return "success" as const;
  }
  if (value === "planning" || value === "paused") return "warning" as const;
  if (value === "archived") return "danger" as const;
  return "info" as const;
}

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function saveCohort(_state: CohortSaveState, formData: FormData): Promise<CohortSaveState> {
  "use server";
  try {
    const context = await requireInstitutionPageContext({ capability: "programs" });
    await upsertInstitutionCohort(context, {
      cohortId: formValue(formData, "cohortId"), name: formValue(formData, "name") ?? "",
      programName: formValue(formData, "programName"), tradeId: formValue(formData, "tradeId"),
      term: formValue(formData, "term"), graduationDate: formValue(formData, "graduationDate"),
      status: formValue(formData, "status") ?? "active",
    });
    revalidatePath("/institution/programs");
    return { ok: true, message: formValue(formData, "cohortId") ? "Cohort updated." : "Program and cohort saved." };
  } catch (error) {
    unstable_rethrow(error);
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Unable to save. Check your details and institution access, then try again.";
    return { ok: false, message };
  }
}

function total(
  items: Array<InstitutionProgramManagementProgram | InstitutionProgramManagementCohort>,
  key: keyof InstitutionProgramManagementProgram,
) {
  return items.reduce((sum, item) => {
    const value = item[key as keyof typeof item];
    return typeof value === "number" ? sum + value : sum;
  }, 0);
}

export default async function InstitutionProgramsPage() {
  const context = await requireInstitutionPageContext({
    capability: "programs",
  });
  const data = await getInstitutionProgramCohortManagement(context);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);
  const canManagePrograms = institutionCanManage(context, "programs");

  const studentCount = total(data.programs, "studentCount");
  const verifiedSkillCount = total(data.programs, "verifiedSkillCount");
  const assignmentCount = total(data.programs, "assignmentCount");
  const placementCount = total(data.programs, "placementCount");

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="programs"
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
          eyebrow="Institution Workspace - Programs"
          title="Programs & Cohorts"
          description="Create programs and cohorts, manage student groups, and review their training and outcomes."
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          accessLevel={institutionAccess(context, "programs")}
        />

        <section className="txk-metric-grid institution-dashboard-metrics">
          <MetricCard
            label="Programs"
            value={data.programs.length}
            detail="Programs with cohorts"
          />
          <MetricCard
            label="Cohorts"
            value={data.cohorts.length}
            detail="Lifecycle managed in scope"
          />
          <MetricCard
            label="Students"
            value={studentCount}
            detail="Canonical roster affiliations"
            href="/institution/students"
          />
          <MetricCard
            label="Placements"
            value={placementCount}
            detail="Canonical outcomes"
            href="/institution/placements"
          />
        </section>

        {canManagePrograms ? <div className="institution-action-bar">
          <CohortEditor programs={data.programs} newProgram saveAction={saveCohort} />
          {data.programs.some(p => p.canManage) ? <CohortEditor programs={data.programs} saveAction={saveCohort} /> : null}
        </div> : null}

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Program rollups</p>
              <h2>Programs</h2>
            </div>
          </div>

          {data.programs.length ? (
            <div className="institution-program-grid">
              {data.programs.map((program) => (
                <Card key={program.programKey}>
                  <RectangleGroupIcon aria-hidden="true" />
                  <div>
                    <h3>{program.programName}</h3>
                    <p>
                      {program.studentCount} Students - {program.cohortCount} Cohort
                      {program.cohortCount === 1 ? "" : "s"} -{" "}
                      {program.placementCount} Placement
                      {program.placementCount === 1 ? "" : "s"}
                    </p>
                    <p>Last activity: {date(program.lastActivityAt)}</p>
                  </div>
                  <div className="institution-program-actions">
                    {program.canManage ? <CohortEditor programs={data.programs} defaultProgramKey={program.programKey} saveAction={saveCohort} /> : null}
                    <StatusBadge tone={program.canManage ? "success" : "info"}>
                      {program.canManage ? "Manage" : "Read"}
                    </StatusBadge>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No Programs in this scope"
              description="Programs appear when authorized Cohort records exist for the current Institution scope."
            />
          )}
        </section>

        <section className="institution-readiness-category-grid">
          <Card>
            <UserGroupIcon aria-hidden="true" />
            <div>
              <h3>Student affiliation</h3>
              <p>{studentCount} scoped Students across authorized Cohorts.</p>
            </div>
          </Card>
          <Card>
            <CheckBadgeIcon aria-hidden="true" />
            <div>
              <h3>Readiness</h3>
              <p>{verifiedSkillCount} instructor-authoritative Verified Skills.</p>
            </div>
          </Card>
          <Card>
            <AcademicCapIcon aria-hidden="true" />
            <div>
              <h3>Employer Training</h3>
              <p>{assignmentCount} canonical assignment records in scope.</p>
            </div>
          </Card>
          <Card>
            <BriefcaseIcon aria-hidden="true" />
            <div>
              <h3>Outcomes</h3>
              <p>
                Referrals, placements, and retention stay separate from readiness
                evidence.
              </p>
            </div>
          </Card>
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Cohorts</p>
              <h2>Lifecycle, roster, and outcomes</h2>
            </div>
          </div>

          {data.cohorts.length ? (
            <div className="institution-student-profile-grid">
              {data.cohorts.map((cohort) => (
                <Card key={cohort.cohortId}>
                  <div className="txk-section-heading">
                    <div>
                      <p className="txk-eyebrow">
                        {cohort.programName ?? cohort.tradeId ?? "Program"}
                      </p>
                      <h3>{cohort.name}</h3>
                      <p>
                        {cohort.term ?? "Term not provided"} - Graduation{" "}
                        {cohort.graduationDate ?? "not provided"}
                      </p>
                    </div>
                    <StatusBadge tone={statusTone(cohort.status)}>
                      {pretty(cohort.status)}
                    </StatusBadge>
                  </div>

                  <div className="txk-metric-grid institution-section-metrics">
                    <MetricCard
                      label="Students"
                      value={cohort.studentCount}
                      detail="Affiliated roster"
                    />
                    <MetricCard
                      label="Verified Skills"
                      value={cohort.verifiedSkillCount}
                      detail="Readiness tab"
                    />
                    <MetricCard
                      label="Training"
                      value={cohort.assignmentCount}
                      detail={`${cohort.completedAssignmentCount} completed`}
                    />
                    <MetricCard
                      label="Open retention"
                      value={cohort.openRetentionCaseCount}
                      detail={`${cohort.retentionMilestoneCount} milestones`}
                    />
                  </div>

                  <div className="institution-evidence-stack">
                    <div className="institution-evidence-compact">
                      <BriefcaseIcon aria-hidden="true" />
                      <span>
                        <strong>Referral and placement outcomes</strong>
                        <small>
                          {cohort.referralCount} referrals,{" "}
                          {cohort.placementCount} placements,{" "}
                          {cohort.activePlacementCount} active
                        </small>
                      </span>
                      <StatusBadge tone="info">Canonical</StatusBadge>
                    </div>
                    {cohort.students.slice(0, 5).map((student) => (
                      <div
                        className="institution-evidence-compact"
                        key={student.studentId}
                      >
                        <ClipboardDocumentCheckIcon aria-hidden="true" />
                        <span>
                          <strong>{student.displayName}</strong>
                          <small>
                            {student.verifiedSkillCount} skills,{" "}
                            {student.assignmentCount} training,{" "}
                            {student.referralCount} referrals
                          </small>
                        </span>
                        <ButtonLink
                          href={`/institution/students/${encodeURIComponent(student.studentId)}`}
                          size="sm"
                        >
                          Profile
                        </ButtonLink>
                      </div>
                    ))}
                    {!cohort.students.length ? (
                      <EmptyState title="No Students affiliated with this Cohort" />
                    ) : null}
                  </div>

                  {cohort.canManage ? <CohortEditor cohort={cohort} programs={data.programs} saveAction={saveCohort} /> : null}
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No Cohorts in this scope"
              description="Create a Cohort or request access to the relevant Program or Cohort scope."
            />
          )}
        </section>
      </main>
    </>
  );
}
