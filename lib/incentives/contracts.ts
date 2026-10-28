export const BLUEPRINTS = [
  "quality",
  "delivery",
  "safety",
  "recognition",
  "retention",
  "combined",
] as const;
export type Blueprint = (typeof BLUEPRINTS)[number];
export type Condition = {
  metric:
    | "budget_percent"
    | "delay_hours"
    | "reviews"
    | "training_count"
    | "service_days"
    | "qualifying_projects";
  operator: "gte" | "lte";
  value: number;
};
export type Milestone = {
  repeat?: "once" | "per_source";
  id: string;
  title: string;
  recipient: "individual" | "crew";
  points: number;
  match: "all" | "any";
  conditions: Condition[];
  safetyRequired: boolean;
  approval: "manager" | "safety_then_manager";
};
export type Definition = {
  schemaVersion: 1;
  name: string;
  description: string;
  blueprint: Blueprint;
  trade: string;
  startsAt: string;
  endsAt: string;
  terms: string;
  timezone: string;
  budgetCents: number;
  creditsPerBlock: number;
  centsPerBlock: number;
  minimumCredits: number;
  expiryMonths: number | null;
  departure: "retain" | "window";
  departureDays: number;
  safetyMode: "immediate" | "bank" | "bank_and_redeem";
  safetyPoints: number;
  givingAllowance: number;
  recipientMonthlyCap: number;
  publicRecognition: boolean;
  teams: { id: string; name: string; participantIds: string[] }[];
  milestones: Milestone[];
  notifications: { inApp: boolean; email: boolean };
};
export function initialDefinition(): Definition {
  const start = new Date();
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 3);
  return {
    schemaVersion: 1,
    name: "",
    description: "",
    blueprint: "quality",
    trade: "",
    startsAt: start.toISOString().slice(0, 10),
    endsAt: end.toISOString().slice(0, 10),
    terms: "",
    timezone: "America/Chicago",
    budgetCents: 50000,
    creditsPerBlock: 100,
    centsPerBlock: 100,
    minimumCredits: 500,
    expiryMonths: null,
    departure: "retain",
    departureDays: 90,
    safetyMode: "bank_and_redeem",
    safetyPoints: 1000,
    givingAllowance: 500,
    recipientMonthlyCap: 2000,
    publicRecognition: false,
    teams: [],
    milestones: [],
    notifications: { inApp: true, email: true },
  };
}
export function validateDefinition(d: Definition, publish = false): string[] {
  const errors: string[] = [];
  if (!d || d.schemaVersion !== 1) return ["Unsupported program definition."];
  if (!d.name?.trim() || d.name.length > 100)
    errors.push("Enter a name of 1–100 characters.");
  if (d.description?.length > 1000 || d.terms?.length > 4000)
    errors.push("Description or terms are too long.");
  if (!BLUEPRINTS.includes(d.blueprint)) errors.push("Choose a blueprint.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: d.timezone });
  } catch {
    errors.push("Choose a valid timezone.");
  }
  if (
    !Number.isFinite(Date.parse(d.startsAt)) ||
    !Number.isFinite(Date.parse(d.endsAt)) ||
    Date.parse(d.endsAt) <= Date.parse(d.startsAt)
  )
    errors.push("End date must follow start date.");
  for (const [key, min, max] of [
    ["budgetCents", 0, 100000000],
    ["creditsPerBlock", 1, 1000000],
    ["centsPerBlock", 1, 100000],
    ["minimumCredits", 1, 1000000],
    ["safetyPoints", 0, 1000000],
    ["givingAllowance", 0, 1000000],
    ["recipientMonthlyCap", 0, 1000000],
    ["departureDays", 1, 3650],
  ] as const)
    if (!Number.isSafeInteger(d[key]) || d[key] < min || d[key] > max)
      errors.push(`Check ${key}.`);
  if (
    d.expiryMonths !== null &&
    (!Number.isInteger(d.expiryMonths) ||
      d.expiryMonths < 1 ||
      d.expiryMonths > 120)
  )
    errors.push("Expiration must be 1–120 months or indefinite.");
  if (
    !["retain", "window"].includes(d.departure) ||
    !["immediate", "bank", "bank_and_redeem"].includes(d.safetyMode)
  )
    errors.push("Choose valid reward policies.");
  if (
    !Array.isArray(d.teams) ||
    d.teams.length > 50 ||
    new Set(d.teams.map((t) => t.id)).size !== d.teams.length
  )
    errors.push("Check teams.");
  if (!Array.isArray(d.milestones) || d.milestones.length > 50)
    return [...errors, "Use up to 50 milestones."];
  for (const m of d.milestones) {
    if (
      !m.id ||
      !m.title?.trim() ||
      m.title.length > 100 ||
      !Number.isSafeInteger(m.points) ||
      m.points < 1 ||
      m.points > 1000000 ||
      !["individual", "crew"].includes(m.recipient) ||
      !["all", "any"].includes(m.match) ||
      !["manager", "safety_then_manager"].includes(m.approval) ||
      (m.repeat !== undefined && !["once", "per_source"].includes(m.repeat))
    )
      errors.push("Check milestone title, points and routing.");
    if (
      !Array.isArray(m.conditions) ||
      m.conditions.length < 1 ||
      m.conditions.length > 10
    )
      errors.push("Each milestone needs 1–10 conditions.");
    else
      for (const c of m.conditions)
        if (
          ![
            "budget_percent",
            "delay_hours",
            "reviews",
            "training_count",
            "service_days",
            "qualifying_projects",
          ].includes(c.metric) ||
          !["gte", "lte"].includes(c.operator) ||
          !Number.isFinite(c.value) ||
          c.value < 0 ||
          c.value > 1000000
        )
          errors.push("Check milestone conditions.");
  }
  if (publish && (!d.terms.trim() || d.milestones.length === 0))
    errors.push(
      "Add employee terms and at least one milestone before publication.",
    );
  return [...new Set(errors)];
}
export function evaluateMilestone(
  m: Milestone,
  metrics: Partial<Record<Condition["metric"], number>>,
  safetyComplete: boolean,
) {
  const results = m.conditions.map((c) => ({
    ...c,
    actual: metrics[c.metric] ?? null,
    passed:
      Number.isFinite(metrics[c.metric]) &&
      (c.operator === "gte"
        ? metrics[c.metric]! >= c.value
        : metrics[c.metric]! <= c.value),
  }));
  const eligible =
    results.length > 0 &&
    (m.match === "all"
      ? results.every((c) => c.passed)
      : results.some((c) => c.passed)) &&
    (!m.safetyRequired || safetyComplete);
  return {
    eligible,
    results,
    points: eligible ? m.points : 0,
    reason:
      m.safetyRequired && !safetyComplete
        ? "Required safety/quality checks are incomplete."
        : eligible
          ? "Conditions met; required approval still applies."
          : "Conditions not met; review evidence and exception window.",
  };
}
export function splitCrew(points: number, memberIds: string[]) {
  if (
    !Number.isSafeInteger(points) ||
    points < 0 ||
    !memberIds.length ||
    new Set(memberIds).size !== memberIds.length
  )
    throw new Error("Invalid crew allocation");
  const sorted = [...memberIds].sort();
  return sorted.map((id, i) => ({
    participantId: id,
    points:
      Math.floor(points / sorted.length) + (i < points % sorted.length ? 1 : 0),
  }));
}
export function roi(input: {
  departures: number;
  replacementCost: number;
  avoidedDepartures: number;
  incidentCost: number;
  reduction: number;
  programCost: number;
}) {
  if (
    Object.values(input).some((x) => !Number.isFinite(x) || x < 0) ||
    input.reduction > 1 ||
    input.avoidedDepartures > input.departures
  )
    throw new Error("Check scenario values.");
  const savings =
    input.avoidedDepartures * input.replacementCost +
    input.incidentCost * input.reduction;
  return {
    savings,
    net: savings - input.programCost,
    roi:
      input.programCost > 0
        ? ((savings - input.programCost) / input.programCost) * 100
        : null,
    breakEvenDepartures:
      input.replacementCost > 0
        ? Math.ceil(input.programCost / input.replacementCost)
        : null,
  };
}
export type Configuration = {
  programId: string;
  revision: number;
  draft: Definition;
  published: Definition | null;
  paused: boolean;
  archived: boolean;
  updatedAt: string;
};
export type Case = {
  id: string;
  kind: "safety" | "dispute" | "recognition";
  status: string;
  body: string;
  reason: string | null;
  created_at: string;
  deadline: string | null;
  actor: string;
  recipient_id: string | null;
};
export type CrewAssignment = {
  crewId: string;
  memberIds: string[];
  revision: number;
};
export type Extension = {
  assignments: Record<string, CrewAssignment[]>;
  configs: Configuration[];
  cases: Record<string, Case[]>;
  audit: Record<string, { event: string; created_at: string }[]>;
};

export function blueprintMilestones(blueprint: Blueprint): Milestone[] {
  const common = {
    recipient: "individual" as const,
    points: 100,
    match: "all" as const,
    safetyRequired: true,
    approval: "manager" as const,
  };
  if (blueprint === "retention")
    return [90, 365].map((days) => ({
      ...common,
      id: `service-${days}`,
      title: `${days}-day service milestone`,
      safetyRequired: false,
      conditions: [
        {
          metric: "service_days" as const,
          operator: "gte" as const,
          value: days,
        },
      ],
    }));
  if (blueprint === "delivery")
    return [
      {
        ...common,
        id: "on-time",
        title: "Qualifying on-time project",
        recipient: "crew",
        conditions: [{ metric: "delay_hours", operator: "lte", value: 0 }],
      },
    ];
  if (blueprint === "safety")
    return [
      {
        ...common,
        id: "safety-training",
        title: "Safety preparation completed",
        conditions: [{ metric: "training_count", operator: "gte", value: 1 }],
      },
    ];
  return [
    {
      ...common,
      id: "quality-review",
      title: "Customer appreciation milestone",
      conditions: [{ metric: "reviews", operator: "gte", value: 1 }],
    },
  ];
}
