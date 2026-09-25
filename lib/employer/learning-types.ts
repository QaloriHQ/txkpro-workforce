export const MICRO_CERT_STATUSES = [
  "draft",
  "in_production",
  "review",
  "ready",
  "live",
  "archived",
] as const;

export type MicroCertStatus = (typeof MICRO_CERT_STATUSES)[number];

export type MicroCertEligibility = {
  eligibilityId?: string;
  institutionId?: string | null;
  cohortId?: string | null;
  tradeId?: string | null;
  programName?: string | null;
  active?: boolean;
};

export type MicroCertInput = {
  title?: string;
  description?: string | null;
  active?: boolean;
  status?: MicroCertStatus;
  learningObjective?: string | null;
  contentType?: string;
  contentUrl?: string | null;
  equipmentProcessContext?: string | null;
  safetyNotes?: string | null;
  durationMinutes?: number | null;
  passingRequirement?: Record<string, unknown>;
  companyBadgeId?: string | null;
  eligibility?: MicroCertEligibility[];
};

export type MicroCertBadgeSummary = {
  companyBadgeId: string;
  title: string;
  active?: boolean;
  version: number;
  description?: string | null;
  criteria?: Record<string, unknown>;
  expiresAfterDays?: number | null;
};

export type MicroCertVersion = {
  microCertVersionId: string;
  versionNumber: number;
  status: MicroCertStatus;
  learningObjective: string | null;
  contentType: string;
  contentUrl: string | null;
  equipmentProcessContext: string | null;
  safetyNotes: string | null;
  durationMinutes: number | null;
  passingRequirement: Record<string, unknown>;
  companyBadgeId: string | null;
  certificationDefinitionId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployerMicroCertSummary = {
  microCertId: string;
  employerId: string;
  title: string;
  description: string | null;
  active: boolean;
  currentVersionId: string;
  versionNumber: number;
  status: MicroCertStatus;
  learningObjective: string | null;
  contentType: string;
  contentUrl: string | null;
  durationMinutes: number | null;
  passingRequirement: Record<string, unknown>;
  companyBadge: MicroCertBadgeSummary | null;
  eligibility: MicroCertEligibility[];
  assignmentCount: number;
  completedCount: number;
  completionRate: number;
  createdAt: string;
  updatedAt: string;
};

export type EmployerMicroCertDetail = {
  microCertId: string;
  employerId: string;
  title: string;
  description: string | null;
  active: boolean;
  currentVersionId: string;
  currentVersion: MicroCertVersion;
  versions: MicroCertVersion[];
  eligibility: MicroCertEligibility[];
  companyBadge: MicroCertBadgeSummary | null;
  metrics: {
    assignmentCount: number;
    completedCount: number;
    completionRate: number;
  };
  createdAt: string;
  updatedAt: string;
};
