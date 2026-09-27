export type StudentReadinessEvidence = {
  verifiedSkills: Array<{
    studentSkillId: string;
    name: string;
    category: string | null;
    verifiedAt: string | null;
    provenance: string | null;
  }>;
  employerTraining: Array<{
    assignmentId: string;
    employerName: string;
    courseTitle: string;
    versionNumber: number;
    status: "assigned" | "in_progress" | "completed" | "cancelled";
    completedAt: string | null;
  }>;
  companyBadges: Array<{
    awardId: string;
    title: string;
    employerName: string;
    issuedAt: string;
    expiresAt: string | null;
    evidenceType: string;
    courseTitle: string | null;
    versionNumber: number | null;
    completedAt: string | null;
    status: "active" | "expired" | "revoked";
    microCertVersionId: string | null;
  }>;
  employerCertifications: Array<{
    credentialId: string;
    title: string;
    employerName: string;
    courseTitle: string;
    versionNumber: number;
    status: "active" | "expired" | "revoked";
    issuedAt: string;
    expiresAt: string | null;
    completedAt: string;
    evidenceCategory: "employer_training";
    technicalSkillVerified: false;
  }>;
};
