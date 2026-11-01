import type { PipelineField } from "@/lib/employer/ats-pipelines";

export const ATS_APPLICATION_STATUSES = ["draft", "submitted", "withdrawn", "employer_closed"] as const;
export type AtsApplicationStatus = (typeof ATS_APPLICATION_STATUSES)[number];
export const ATS_TASK_STATUSES = ["not_started", "in_progress", "submitted", "completed", "skipped", "review_required"] as const;
export type AtsTaskStatus = (typeof ATS_TASK_STATUSES)[number];

export type CandidateInvitation = {
  id: string; invitationId: string; jobId: string; email: string; studentId: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  deliveryStatus: "pending" | "sent" | "failed"; sendCount: number;
  expiresAt: string; lastSentAt: string | null; createdAt: string;
};
export type ApplicationTask = {
  id: string; nodeId: string; stageId: string | null; kind: string; label: string;
  instructions: string; ownerRole: string; candidateVisible: boolean; required: boolean;
  status: AtsTaskStatus; targetHours: number | null; assignedAt: string | null;
  dueAt: string | null; revision: number; submittedAt: string | null; completedAt: string | null;
};
export type AtsApplication = {
  id: string; applicationId: string; jobId: string; jobListingId: string; jobTitle: string;
  employerId: string; employerName: string; pipelineVersionId: string;
  identityType: "student" | "external"; studentId: string | null; externalEmail: string | null;
  status: AtsApplicationStatus; lifecycleReason: string | null; revision: number;
  submittedAt: string | null; withdrawnAt: string | null; closedAt: string | null;
  tasks: ApplicationTask[];
};
export type ApplicantFormDefinition = {
  jobListingId: string; title: string; employerName: string; summary: string;
  fields: PipelineField[]; invitationId: string | null;
};

export function labelStatus(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

