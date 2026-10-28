export type EngineEvent = {
  id: string;
  milestone_id: string;
  subject_key: string;
  recipients: string[];
  status: string;
  evidence: string;
  reason: string | null;
  reserved_cents: number;
  source_actor: string | null;
  safety_by: string | null;
  safety_approved: boolean;
  created_at: string;
  dispute_until: string;
  rule: { title?: string; points: number; approval?: string };
  metrics: Record<string, number>;
  canReview: boolean;
  history: unknown[];
};
export type EngineLot = {
  available: number;
  id: string;
  participant_id: string;
  points: number;
  consumed: number;
  expires_at: string | null;
  policy: {
    creditsPerBlock: number;
    centsPerBlock: number;
    safetyMode: string;
  };
  event_id: string | null;
};
export type EngineWorkspace = {
  roles: { participantId: string; role: string; crewId: string }[];
  consent: boolean;
  execution: {
    enabled: boolean;
    autoRedeem: boolean;
    sandbox: boolean;
    termsVersion: number;
  } | null;
  events: EngineEvent[];
  lots: EngineLot[];
  allowances: {
    participant_id: string;
    period: string;
    points: number;
    spent: number;
    expires_at: string;
  }[];
  employment: {
    participant_id: string;
    started_on: string;
    ended_on: string | null;
    source: string;
    source_key: string;
  }[];
  tiers: {
    id: string;
    title: string;
    milestone_id: string;
    threshold: number;
    perk: string;
    capacity: number;
  }[];
  perks: {
    id: string;
    tier_id: string;
    participant_id: string;
    status: string;
    note: string | null;
  }[];
  integrations: {
    id: string;
    name: string;
    mapping: Record<string, unknown>;
    active: boolean;
  }[];
  ingestion: {
    integrationId: string;
    eventKey: string;
    status: string;
    reason: string | null;
    createdAt: string;
  }[];
  notices: { id: string; title: string; body: string; created_at: string }[];
  board: { name: string; title: string; issuer: string; perk: string }[];
  progress: { crewId: string; count: number; paused: boolean }[];
};
