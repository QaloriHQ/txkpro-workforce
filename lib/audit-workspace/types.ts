export type AuditFilters = {
  institutionId?: string; eventType?: string; result?: string; from?: string; to?: string; offset?: string;
};
export type AuditRecord = {
  recordId: string; source: "audit" | "domain"; eventType: string; targetType: string; targetId: string | null;
  actorUserId: string | null; result: string; institutionId: string | null; studentId: string | null;
  correlationId: string; createdAt: string; beforeStatus: string | null; afterStatus: string | null;
};
export type AuditQueue = {
  items: AuditRecord[]; total: number; offset: number; limit: number; hasMore: boolean; truncated: boolean;
};
