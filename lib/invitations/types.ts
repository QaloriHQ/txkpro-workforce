export type WorkforceInvitationStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "revoked"
  | "cancelled";

export type WorkforceInvitation = {
  invitationId: string;
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  institutionId: string | null;
  contractorId: string | null;
  targetUserId: string | null;
  targetAuthUserId: string | null;
  status: WorkforceInvitationStatus;
  source: string;
  expiresAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
  lastSentAt: string | null;
  sendCount: number;
  deliveryStatus: "pending" | "sent" | "failed";
  deliveryError: string | null;
  createdAt: string;
  updatedAt: string;
  existingAccount: boolean;
  institutionName?: string | null;
  contractorName?: string | null;
  scopeLabel?: string | null;
};

export type WorkforceInvitationCreateInput = {
  email: string;
  role: string;
  scopeType: string;
  scopeId?: string | null;
  institutionId?: string | null;
  contractorId?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
};

export type WorkforceInvitationAcceptance = WorkforceInvitation & {
  ok: boolean;
  message?: string;
  redirectTo?: string;
  idempotent?: boolean;
};
