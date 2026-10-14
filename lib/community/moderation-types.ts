export type ModerationSeverity = "low" | "medium" | "high" | "critical";
export type ModerationStatus = "submitted" | "reviewing" | "resolved" | "dismissed";
export type ModerationAction =
  | "no_action" | "warn" | "hide_content" | "remove_content" | "restore_content"
  | "restrict_posting" | "restrict_interactions" | "suspend_user" | "restore_user" | "escalate";

export type ModerationCase = {
  caseId: string;
  targetType: "post" | "comment" | "user" | "message";
  targetId: string;
  targetUserId: string | null;
  targetName: string;
  status: ModerationStatus;
  severity: ModerationSeverity;
  automationState: "pending" | "monitoring" | "actioned" | "needs_review" | "failed" | "overridden";
  priorityScore: number;
  reportCount: number;
  outcome: string | null;
  decisionSummary: string | null;
  lastReportedAt: string;
  evidenceExcerpt: string;
};

export type ModerationWorkspace = {
  items: ModerationCase[];
  stats: { needsReview: number; automated: number; open: number; critical: number };
};

export type ModerationSelfCase = {
  caseId: string; targetType: string; targetId: string; status: ModerationStatus; severity: ModerationSeverity;
  outcome: string; decisionSummary: string | null; closedAt: string | null; actionExpiresAt: string | null;
  appealStatus: "submitted" | "reviewing" | "upheld" | "reversed" | null;
};
