export type InvitationRoleGroup = "student" | "institution" | "employer" | "platform";

export type InvitationStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "revoked"
  | "cancelled";

export type InvitationRecord = {
  invitationId: string;
  email: string;
  role: string;
  roleGroup: InvitationRoleGroup;
  scopeType: string;
  scopeId: string | null;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  resendCount: number;
  deliveryStatus: "queued" | "sent" | "delivered" | "failed" | "suppressed";
  deliveryError: string | null;
  membershipId: string | null;
  acceptedUserId: string | null;
  canManage: boolean;
};

export type InvitationCreateInput = {
  email: string;
  role: string;
  scopeType: string;
  scopeId?: string | null;
  metadata?: Record<string, unknown>;
  expiresHours?: number;
};

export type InvitationCreateResult = {
  ok: boolean;
  idempotent?: boolean;
  alreadyMember?: boolean;
  invitationId?: string;
  status?: string;
  email?: string;
  role?: string;
  scopeType?: string;
  scopeId?: string | null;
  expiresAt?: string;
  activationToken?: string | null;
  activationPath?: string | null;
  activationUrl?: string | null;
  deliveryStatus?: string;
  membershipId?: string;
  error?: string;
};

export type InvitationAcceptResult = {
  ok: boolean;
  idempotent?: boolean;
  invitationId: string;
  status: "accepted";
  role?: string;
  roleGroup?: InvitationRoleGroup;
  scopeType?: string;
  scopeId?: string | null;
  userId?: string;
  membershipId?: string;
  redirectTo: string;
};
