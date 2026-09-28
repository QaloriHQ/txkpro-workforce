import type { InstitutionContext } from "@/lib/institution/types";
import { primaryInstitutionRolePolicy } from "@/lib/institution/policy";

export function primaryInstitutionRole(context: InstitutionContext) {
  const policy = primaryInstitutionRolePolicy(context);
  return { role: policy.role, label: policy.label };
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

  const departmentScopes = context.scopes.filter(
    (scope) => scope.scopeType === "department",
  );
  if (departmentScopes.length === 1) return "Assigned department";
  if (departmentScopes.length > 1) {
    return `${departmentScopes.length} departments`;
  }

  return "Scoped access";
}
