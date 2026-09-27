import type { InstitutionContext } from "@/lib/institution/types";

const ROLE_LABELS: Record<string, string> = {
  institution_admin: "Institution Admin",
  department_head: "Department Head",
  program_coordinator: "Program Coordinator",
  instructor: "Instructor",
  assistant_instructor: "Assistant Instructor",
  career_services: "Career Services",
  read_only_analyst: "Analyst",
  educator: "Educator",
};

const ROLE_PRIORITY = [
  "institution_admin",
  "department_head",
  "program_coordinator",
  "career_services",
  "instructor",
  "assistant_instructor",
  "read_only_analyst",
  "educator",
];

export function primaryInstitutionRole(context: InstitutionContext) {
  const role =
    ROLE_PRIORITY.find((candidate) =>
      context.roles.some((value) => value.toLowerCase() === candidate),
    ) ?? context.roles[0] ?? "educator";

  return {
    role,
    label: ROLE_LABELS[role] ?? role.replaceAll("_", " "),
  };
}

export function institutionScopeLabel(context: InstitutionContext) {
  const institutionScope = context.scopes.find(
    (scope) => scope.scopeType === "institution",
  );
  if (institutionScope) return "Institution-wide";

  const cohortScopes = context.scopes.filter(
    (scope) => scope.scopeType === "cohort",
  );
  if (cohortScopes.length === 1) return "Assigned cohort";
  if (cohortScopes.length > 1) return `${cohortScopes.length} cohorts`;

  const programScopes = context.scopes.filter(
    (scope) => scope.scopeType === "program",
  );
  if (programScopes.length === 1) return "Assigned program";
  if (programScopes.length > 1) return `${programScopes.length} programs`;

  return "Scoped access";
}
