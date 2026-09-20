export type EmployerApprovalDecision = "approved" | "rejected" | "suspended";

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
