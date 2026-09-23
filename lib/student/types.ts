export type StudentContext = {
  authUserId: string;
  legacyUserId: string;
  studentId: string;
  email: string | null;
  firstName: string;
  lastName: string;
};

export type StudentInterview = {
  interviewRequestId: string;
  employerId: string;
  employerName: string;
  roleTitle: string;
  tradeId: string | null;
  message: string | null;
  schedulingUrl: string | null;
  status:
    | "draft"
    | "sent"
    | "accepted"
    | "declined"
    | "scheduling"
    | "scheduled"
    | "completed"
    | "cancelled"
    | "expired"
    | "no_response";
  sentAt: string | null;
  respondedAt: string | null;
  scheduledFor: string | null;
  interviewFormat: string | null;
  locationDetail: string | null;
  placementId: string | null;
  placementStatus: "pending_start" | "active" | "ended" | "unknown" | null;
  hireDate: string | null;
  updatedAt: string;
};

export type StudentPlacement = {
  placementId: string;
  employerName: string;
  roleTitle: string;
  tradeId: string | null;
  hireDate: string;
  employmentType: string | null;
  status: "pending_start" | "active" | "ended" | "unknown";
};
