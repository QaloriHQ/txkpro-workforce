export type Progress = {
  season: string;
  seasonEnds: string;
  points: number;
  lifetime: number;
  level: number;
  preferredScope: "cohort" | "institution" | "txkpro";
  rankings: Record<"cohort" | "institution" | "txkpro", number | null>;
  streaks: {
    family: string;
    current: number;
    longest: number;
    available: boolean;
  }[];
};
export type Summary = {
  progress: Progress | null;
  badges: { family: string; tier: number; issuer: string; earnedAt: string }[];
};
export type Submission = {
  id: string;
  participantName: string;
  status: string;
  evidence: string;
  reason: string | null;
  submittedAt: string;
};
export type Activity = {
  id: string;
  title: string;
  kind: string;
  audience: string;
  instructions: string;
  points: number;
  repeat: string;
  dailyCap: number;
  weeklyCap: number;
  weekdays: number[];
  options: string[] | null;
  enabled: boolean;
  submissions: Submission[];
};
export type Program = {
  id: string;
  name: string;
  ownerType: string;
  template: string;
  status: string;
  startsAt: string;
  endsAt: string;
  terms: string;
  termsVersion: number;
  leaderboardVisible: boolean;
  canManage: boolean;
  participation: {
    id: string;
    kind: string;
    status: string;
    acceptedVersion: number | null;
  } | null;
  participants: {
    id: string;
    name: string;
    kind: string;
    status: string;
    score: number;
  }[];
  leaderboard: { rank: number; name: string; score: number }[];
  activities: Activity[];
};
export type PointsWorkspace = {
  summary: Summary | null;
  owners: { type: string; id: string; name: string }[];
  programs: Program[];
  ledger: {
    id: string;
    category: string;
    rule: string;
    points: number;
    requested: number;
    reason: string;
    occurredAt: string;
  }[];
};
