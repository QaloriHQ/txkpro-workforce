export const CASE_STATUSES = [
  "open",
  "assigned",
  "contacted",
  "monitoring",
  "resolved",
  "closed_no_response",
  "cancelled",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const CASE_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  contacted: "Contacted",
  monitoring: "Monitoring",
  resolved: "Resolved",
  closed_no_response: "Closed · no response",
  cancelled: "Cancelled",
};
export const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ["assigned", "cancelled"],
  assigned: ["contacted", "closed_no_response", "cancelled"],
  contacted: ["monitoring", "resolved", "closed_no_response", "cancelled"],
  monitoring: ["contacted", "resolved", "closed_no_response", "cancelled"],
  resolved: [],
  closed_no_response: [],
  cancelled: [],
};
export function caseIsClosed(status: CaseStatus) {
  return CASE_TRANSITIONS[status].length === 0;
}
export type RetentionCase = {
  caseId: string;
  placementId: string;
  studentId: string;
  studentName: string;
  institutionId: string | null;
  roleTitle: string | null;
  cohortName: string | null;
  status: CaseStatus;
  severity: "low" | "medium" | "high" | "urgent";
  ownerUserId: string | null;
  ownerName: string | null;
  openedAt: string;
  updatedAt: string;
  nextFollowUpAt: string | null;
  contactedAt: string | null;
  closedAt: string | null;
  resolvedAt: string | null;
  resolutionCode: string | null;
  milestoneDay: number;
  version: number;
  canManage: boolean;
};
export type RetentionDetail = RetentionCase & {
  notes: {
    noteId: string;
    authorName: string;
    note: string;
    createdAt: string;
  }[];
  eligibleOwners: { userId: string; name: string }[];
};
export type RetentionQueue = {
  items: RetentionCase[];
  total: number;
  offset: number;
  limit: number;
};
export type RetentionFilters = {
  institutionId?: string;
  status?: string;
  owner?: string;
  q?: string;
  offset?: string;
};
