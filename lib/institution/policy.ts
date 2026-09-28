import type { InstitutionContext } from "@/lib/institution/types";

export const INSTITUTION_ROLES = [
  "institution_super_admin",
  "institution_admin",
  "department_head",
  "program_coordinator",
  "instructor",
  "assistant_instructor",
  "career_services",
  "read_only_analyst",
] as const;

export type InstitutionRole = (typeof INSTITUTION_ROLES)[number];

export type InstitutionCapability =
  | "dashboard"
  | "students"
  | "programs"
  | "readiness"
  | "learning"
  | "assignments"
  | "badges"
  | "employers"
  | "referrals"
  | "placements"
  | "retention"
  | "reports"
  | "team"
  | "audit"
  | "settings";

export type InstitutionAccessLevel =
  | "full"
  | "scoped"
  | "limited"
  | "prepare"
  | "draft"
  | "read"
  | "none";

type RolePolicy = {
  label: string;
  priority: number;
  capabilities: Record<InstitutionCapability, InstitutionAccessLevel>;
};

const full = "full" as const;
const read = "read" as const;
const none = "none" as const;

export const INSTITUTION_ROLE_POLICIES: Record<InstitutionRole, RolePolicy> = {
  institution_super_admin: {
    label: "Institution Super Admin",
    priority: 80,
    capabilities: {
      dashboard: full, students: full, programs: full, readiness: full,
      learning: full, assignments: full, badges: full, employers: full,
      referrals: full, placements: full, retention: full, reports: full,
      team: full, audit: full, settings: full,
    },
  },
  institution_admin: {
    label: "Institution Admin",
    priority: 70,
    capabilities: {
      dashboard: full, students: full, programs: full, readiness: full,
      learning: full, assignments: full, badges: full, employers: full,
      referrals: full, placements: full, retention: full, reports: full,
      team: full, audit: read, settings: "limited",
    },
  },
  department_head: {
    label: "Department Head",
    priority: 60,
    capabilities: {
      dashboard: full, students: full, programs: full, readiness: full,
      learning: full, assignments: full, badges: read, employers: read,
      referrals: full, placements: read, retention: read, reports: full,
      team: "limited", audit: read, settings: read,
    },
  },
  program_coordinator: {
    label: "Program Coordinator",
    priority: 50,
    capabilities: {
      dashboard: full, students: full, programs: full, readiness: full,
      learning: full, assignments: full, badges: read, employers: full,
      referrals: full, placements: full, retention: full, reports: full,
      team: read, audit: read, settings: read,
    },
  },
  career_services: {
    label: "Career Services",
    priority: 40,
    capabilities: {
      dashboard: full, students: full, programs: read, readiness: full,
      learning: full, assignments: full, badges: full, employers: full,
      referrals: full, placements: full, retention: full, reports: full,
      team: none, audit: none, settings: none,
    },
  },
  instructor: {
    label: "Instructor",
    priority: 30,
    capabilities: {
      dashboard: "scoped", students: "scoped", programs: read,
      readiness: full, learning: read, assignments: read, badges: read,
      employers: read, referrals: full, placements: read,
      retention: "scoped", reports: read, team: none, audit: none,
      settings: none,
    },
  },
  assistant_instructor: {
    label: "Assistant Instructor",
    priority: 20,
    capabilities: {
      dashboard: "scoped", students: "scoped", programs: read,
      readiness: "prepare", learning: read, assignments: read, badges: read,
      employers: read, referrals: "draft", placements: read,
      retention: "scoped", reports: read, team: none, audit: none,
      settings: none,
    },
  },
  read_only_analyst: {
    label: "Read-Only Analyst",
    priority: 10,
    capabilities: {
      dashboard: read, students: "limited", programs: read, readiness: read,
      learning: read, assignments: none, badges: read, employers: read,
      referrals: read, placements: read, retention: read, reports: full,
      team: none, audit: read, settings: none,
    },
  },
};

const ACCESS_PRIORITY: Record<InstitutionAccessLevel, number> = {
  none: 0,
  read: 1,
  limited: 2,
  draft: 3,
  prepare: 3,
  scoped: 4,
  full: 5,
};

export function canonicalInstitutionRole(role: string): InstitutionRole | null {
  const normalized = role.trim().toLowerCase();
  if (normalized === "educator" || normalized === "institution") {
    return "instructor";
  }
  return INSTITUTION_ROLES.includes(normalized as InstitutionRole)
    ? (normalized as InstitutionRole)
    : null;
}

export function institutionRoles(context: Pick<InstitutionContext, "roles">) {
  return [...new Set(context.roles.map(canonicalInstitutionRole).filter(
    (role): role is InstitutionRole => Boolean(role),
  ))];
}

export function primaryInstitutionRolePolicy(
  context: Pick<InstitutionContext, "roles">,
) {
  const role = institutionRoles(context).sort(
    (a, b) =>
      INSTITUTION_ROLE_POLICIES[b].priority -
      INSTITUTION_ROLE_POLICIES[a].priority,
  )[0] ?? "instructor";
  return { role, ...INSTITUTION_ROLE_POLICIES[role] };
}

export function institutionAccess(
  context: Pick<InstitutionContext, "roles">,
  capability: InstitutionCapability,
): InstitutionAccessLevel {
  return institutionRoles(context).reduce<InstitutionAccessLevel>(
    (current, role) => {
      const candidate = INSTITUTION_ROLE_POLICIES[role].capabilities[capability];
      return ACCESS_PRIORITY[candidate] > ACCESS_PRIORITY[current]
        ? candidate
        : current;
    },
    "none",
  );
}

export function institutionCanView(
  context: Pick<InstitutionContext, "roles">,
  capability: InstitutionCapability,
) {
  return institutionAccess(context, capability) !== "none";
}

export function institutionCanManage(
  context: Pick<InstitutionContext, "roles">,
  capability: InstitutionCapability,
) {
  return ["full", "scoped", "limited", "prepare", "draft"].includes(
    institutionAccess(context, capability),
  );
}

export function institutionAccessLabel(access: InstitutionAccessLevel) {
  return {
    full: "Manage in authorized scope",
    scoped: "Assigned scope",
    limited: "Limited actions",
    prepare: "Prepare for approval",
    draft: "Draft only",
    read: "View only",
    none: "No access",
  }[access];
}
