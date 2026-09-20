export const EMPLOYER_ROLES = [
  "employer_owner",
  "employer_admin",
  "recruiter",
  "hiring_manager",
  "employer_read_only",
] as const;

export type EmployerRole = (typeof EMPLOYER_ROLES)[number];

export type EmployerApprovalStatus =
  | "pending"
  | "approved"
  | "suspended"
  | "rejected"
  | "closed";

export type EmployerMembership = {
  role: EmployerRole;
  rawRole: string;
  status: string;
  scopeType: string;
  employerId: string;
};

export type EmployerContext = {
  authUserId: string;
  legacyUserId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  employerId: string;
  employerName: string;
  role: EmployerRole;
  approvalStatus: EmployerApprovalStatus;
  accountStatus: string;
  workforceStatus: string | null;
  membership: EmployerMembership;
};

export type EmployerCompanyProfile = {
  employerId: string;
  businessName: string;
  businessPhone: string | null;
  businessEmail: string | null;
  website: string | null;
  description: string | null;
  yearsInBusiness: string | null;
  approvalStatus: EmployerApprovalStatus;
  accountStatus: string;
  workforceStatus: string | null;
  operatingBaseZip: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  serviceArea: Record<string, unknown>;
  tradeIds: string[];
  hiringRoles: string[];
  annualHiringVolume: number | null;
  hiringHorizon: string | null;
  workforceDescription: string | null;
  profileMetadata: Record<string, unknown>;
  profileVersion: number;
};

export type HiringNeedStatus = "draft" | "active" | "paused" | "closed";
export type HiringNeedVisibility = "employer_private" | "institution_shared";

export type HiringNeed = {
  id: string;
  hiringNeedId: string;
  employerId: string;
  createdByUserId: string | null;
  assignedRecruiterUserId: string | null;
  assignedHiringManagerUserId: string | null;
  title: string;
  tradeId: string | null;
  roleType: string | null;
  targetHires: number;
  targetHireDate: string | null;
  serviceArea: Record<string, unknown>;
  workTypes: string[];
  shifts: string[];
  programEligibility: string[];
  graduationTiming: string | null;
  requiredVerifiedSkills: string[];
  optionalVerifiedSkills: string[];
  minimumVerifiedSkillCount: number;
  requiresDriversLicense: boolean;
  requiresDrivingRecordAttestation: boolean;
  requiresBackgroundWillingness: boolean;
  requiresDrugScreenWillingness: boolean;
  sharedNotes: string | null;
  status: HiringNeedStatus;
  visibility: HiringNeedVisibility;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type EmployerCompanyProfilePatch = Partial<{
  businessName: string;
  businessPhone: string | null;
  website: string | null;
  description: string | null;
  yearsInBusiness: string | null;
  operatingBaseZip: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  serviceArea: Record<string, unknown>;
  tradeIds: string[];
  hiringRoles: string[];
  annualHiringVolume: number | null;
  hiringHorizon: string | null;
  workforceDescription: string | null;
  profileMetadata: Record<string, unknown>;
}>;

export type HiringNeedInput = {
  title: string;
  tradeId?: string | null;
  roleType?: string | null;
  targetHires?: number;
  targetHireDate?: string | null;
  serviceArea?: Record<string, unknown>;
  workTypes?: string[];
  shifts?: string[];
  programEligibility?: string[];
  graduationTiming?: string | null;
  requiredVerifiedSkills?: string[];
  optionalVerifiedSkills?: string[];
  minimumVerifiedSkillCount?: number;
  requiresDriversLicense?: boolean;
  requiresDrivingRecordAttestation?: boolean;
  requiresBackgroundWillingness?: boolean;
  requiresDrugScreenWillingness?: boolean;
  sharedNotes?: string | null;
  assignedRecruiterUserId?: string | null;
  assignedHiringManagerUserId?: string | null;
  status?: HiringNeedStatus;
  visibility?: HiringNeedVisibility;
};
