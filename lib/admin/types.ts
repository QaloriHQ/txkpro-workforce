export type EmployerApprovalDecision = "approved" | "rejected" | "suspended";
export type EducatorApprovalDecision = "approved" | "rejected";

export type PendingEmployerApproval = {
  employerId: string;
  businessName: string;
  ownerName: string;
  ownerEmail: string | null;
  phone: string | null;
  website: string | null;
  approvalStatus: string;
  accountStatus: string;
  workforceStatus: string | null;
  onboardingStatus: string | null;
  onboardingSubmittedAt: string | null;
  createdAt: string | null;
};

export type PendingEducatorApproval = {
  membershipId: string;
  userId: string;
  authUserId: string | null;
  educatorName: string;
  educatorEmail: string | null;
  role: string;
  scopeType: string;
  scopeId: string | null;
  institutionId: string | null;
  institutionName: string;
  onboardingStatus: string | null;
  submittedAt: string | null;
  createdAt: string | null;
};
