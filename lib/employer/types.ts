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


export type VerifiedSkill = {
  skillId: string;
  name: string;
  category: string | null;
  tradeId: string | null;
  provenance: "institution_verified" | "third_party_verified" | "self_attested" | "not_verified";
  verifiedAt: string | null;
};

export type CandidateReadiness = {
  driversLicense: string | null;
  drivingRecordAttestation: boolean | null;
  backgroundScreenWillingness: boolean | null;
  drugScreenWillingness: boolean | null;
  workTypes: string[];
  shifts: string[];
  provenance: Record<string, string>;
};

export type HiringNeedFit = {
  hiringNeedId: string;
  title: string;
  trade: boolean;
  minimumVerifiedSkills: boolean;
  requiredSkills: boolean;
  driversLicense: boolean;
  drivingRecordAttestation: boolean;
  backgroundWillingness: boolean;
  drugScreenWillingness: boolean;
};

export type TalentCandidate = {
  studentId: string;
  displayName: string;
  institutionId: string | null;
  institutionName: string | null;
  cohortId: string | null;
  program: string | null;
  graduationDate: string | null;
  graduationYear: string | null;
  city: string | null;
  state: string | null;
  primaryTradeId: string | null;
  availabilityStatus: string | null;
  availableStartDate: string | null;
  verifiedSkillCount: number;
  verifiedSkills: VerifiedSkill[];
  readiness: CandidateReadiness;
  savedCandidateId: string | null;
  referralStatus: string | null;
  hiringNeedFit: HiringNeedFit | null;
};

export type TalentFilters = {
  studentId?: string;
  institutionId?: string;
  program?: string;
  graduation?: string;
  location?: string;
  skillIds?: string[];
  minVerifiedSkillCount?: number;
  driversLicense?: boolean;
  drivingRecordAttestation?: boolean;
  backgroundWillingness?: boolean;
  drugScreenWillingness?: boolean;
  workType?: string;
  shift?: string;
  referralState?: string;
};

export type SavedCandidate = {
  savedCandidateId: string;
  employerId: string;
  studentId: string;
  hiringNeedId: string | null;
  savedByUserId: string | null;
  ownerUserId: string | null;
  internalTag: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReferralSummary = {
  referralId: string;
  studentId: string;
  studentName: string;
  institutionId: string;
  institutionName: string | null;
  program: string | null;
  primaryTradeId: string | null;
  hiringNeedId: string | null;
  hiringNeedTitle: string | null;
  status: string;
  institutionSharedNote: string | null;
  referredAt: string | null;
  viewedAt: string | null;
  updatedAt: string;
};

export type EmployerPrivateNote = {
  noteId: string;
  note: string;
  createdByUserId: string | null;
  createdAt: string;
};

export type ReferralDetail = ReferralSummary & {
  technicalSnapshot: Record<string, unknown>;
  professionalSnapshot: Record<string, unknown>;
  operationalSnapshot: Record<string, unknown>;
  privateNotes: EmployerPrivateNote[];
};
