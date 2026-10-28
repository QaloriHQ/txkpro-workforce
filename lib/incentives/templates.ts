import type { Blueprint, Definition, Milestone, Condition } from "./contracts";
export const EMPLOYER_SIZES = {
  small: "Small employer · 5–25 people",
  medium: "Medium employer · 26–99 people",
  enterprise: "Enterprise · 100+ people",
} as const;
export type EmployerSize = keyof typeof EMPLOYER_SIZES;
export const PROGRAM_GOALS: Record<Blueprint, string> = {
  quality: "Quality & customer appreciation",
  delivery: "Crew project delivery",
  safety: "Safety reporting & improvement",
  recognition: "Peer recognition",
  retention: "Retention & anniversaries",
  combined: "Combined programs",
};
export type IncentiveTemplate = {
  id: string;
  size: EmployerSize;
  goal: Blueprint;
  name: string;
  description: string;
  trade: string;
  durationDays: number;
  evidence: string;
  recommendedMode: "guided" | "advanced";
  definition: Omit<Definition, "startsAt" | "endsAt">;
};
const themes: Record<Blueprint, readonly [string, string, string][]> = {
  quality: [
    [
      "Customer care",
      "Recognize verified customer appreciation and practical service training.",
      "Residential HVAC & plumbing",
    ],
    [
      "Craftsmanship",
      "Reward documented project quality and continued craft development.",
      "Electrical & finish carpentry",
    ],
    [
      "Service excellence",
      "Build a consistent customer experience through verified reviews and learning.",
      "Multi-trade service teams",
    ],
  ],
  delivery: [
    [
      "Reliable handoffs",
      "Share crew rewards for verified on-time delivery and completed handoffs.",
      "Commercial MEP",
    ],
    [
      "Budget stewardship",
      "Recognize responsible project delivery with required safety and quality checks.",
      "Mechanical & electrical installation",
    ],
    [
      "Project closeout",
      "Celebrate qualifying completed projects and dependable crew coordination.",
      "Construction & specialty trades",
    ],
  ],
  safety: [
    [
      "Speak up safely",
      "Reward verified hazard reporting and safety preparation without resetting crew progress.",
      "All field trades",
    ],
    [
      "Safety learning",
      "Recognize practical safety training and verified corrective-action work.",
      "Roofing & electrical",
    ],
    [
      "Prepared crews",
      "Build safe work habits through verified preparation, training and reporting.",
      "Industrial & commercial trades",
    ],
  ],
  recognition: [
    [
      "Everyday teamwork",
      "Give coworkers funded points for specific acts of helpfulness and teamwork.",
      "Service & maintenance",
    ],
    [
      "Mentorship circle",
      "Recognize knowledge sharing and verified mentoring contributions.",
      "Apprenticeship & skilled trades",
    ],
    [
      "Craft appreciation",
      "Celebrate craftsmanship, practical learning and crew support.",
      "Multi-trade crews",
    ],
  ],
  retention: [
    [
      "First-year foundations",
      "Recognize verified service at 90, 180 and 365 days.",
      "All trades",
    ],
    [
      "Long-term contributors",
      "Celebrate 180, 365 and 730 days of verified employment.",
      "All trades",
    ],
    [
      "Growing together",
      "Reward 90-day service alongside verified craft development and qualifying projects.",
      "All trades",
    ],
  ],
  combined: [
    [
      "Balanced crew success",
      "Combine independent customer rewards, team delivery and verified service milestones.",
      "Residential & commercial MEP",
    ],
    [
      "Quality & growth",
      "Combine craftsmanship, learning and qualifying crew project rewards.",
      "Multi-trade contractors",
    ],
    [
      "People & performance",
      "Balance team delivery with independent training and retention recognition.",
      "Commercial & industrial trades",
    ],
  ],
};
const condition = (
  metric: Condition["metric"],
  value: number,
  operator: Condition["operator"] = "gte",
): Condition => ({ metric, value, operator });
function milestones(
  goal: Blueprint,
  variant: number,
  scale: number,
  enterprise: boolean,
): Milestone[] {
  const make = (
    id: string,
    title: string,
    conditions: Condition[],
    recipient: Milestone["recipient"] = "individual",
    points = 500,
    once = false,
  ): Milestone => ({
    id,
    title,
    conditions,
    recipient,
    points: points * scale,
    match: "all",
    repeat: once ? "once" : "per_source",
    safetyRequired: recipient === "crew" || goal === "safety",
    approval:
      enterprise && (recipient === "crew" || goal === "safety")
        ? "safety_then_manager"
        : "manager",
  });
  if (goal === "quality")
    return [
      make("appreciation", "Verified customer appreciation", [
        condition("reviews", variant + 1),
      ]),
      make(
        "craft-learning",
        "Verified craft training",
        [condition("training_count", variant + 1)],
        "individual",
        750,
        true,
      ),
      make(
        "quality-projects",
        "Qualifying quality projects",
        [condition("qualifying_projects", [5, 10, 20][variant])],
        "individual",
        1000,
        true,
      ),
    ];
  if (goal === "delivery")
    return [
      make(
        "delivery",
        "Verified crew delivery",
        [
          condition(
            variant === 1 ? "budget_percent" : "delay_hours",
            variant === 1 ? 100 : 0,
            "lte",
          ),
        ],
        "crew",
        2500,
      ),
      make(
        "crew-projects",
        "Qualifying crew projects",
        [condition("qualifying_projects", [5, 10, 15][variant])],
        "crew",
        3000,
        true,
      ),
      make(
        "handoff-learning",
        "Verified handoff training",
        [condition("training_count", 1)],
        "individual",
        500,
        true,
      ),
    ];
  if (goal === "safety")
    return [
      make(
        "safety-preparation",
        "Verified safety preparation",
        [condition("training_count", 1)],
        "individual",
        500,
        true,
      ),
      make(
        "safety-development",
        "Continued safety learning",
        [condition("training_count", variant + 2)],
        "individual",
        1000,
        true,
      ),
      make(
        "safe-projects",
        "Projects with verified safety and quality checks",
        [condition("qualifying_projects", [5, 10, 15][variant])],
        "crew",
        2000,
        true,
      ),
    ];
  if (goal === "recognition")
    return [
      make(
        "mentoring",
        "Verified mentoring or teamwork training",
        [condition("training_count", 1)],
        "individual",
        500,
        true,
      ),
      make(
        "shared-learning",
        "Continued peer learning",
        [condition("training_count", variant + 3)],
        "individual",
        750,
        true,
      ),
      make(
        "shared-craft",
        "Qualifying craft contributions",
        [condition("qualifying_projects", [5, 10, 20][variant])],
        "individual",
        1000,
        true,
      ),
    ];
  if (goal === "retention") {
    if (variant < 2)
      return (variant === 0 ? [90, 180, 365] : [180, 365, 730]).map((days, i) =>
        make(
          `service-${days}`,
          `${days}-day verified service`,
          [condition("service_days", days)],
          "individual",
          [1000, 2500, 5000][i],
          true,
        ),
      );
    return [
      make(
        "service-90",
        "90-day verified service",
        [condition("service_days", 90)],
        "individual",
        1000,
        true,
      ),
      make(
        "retention-learning",
        "Verified professional development",
        [condition("training_count", 3)],
        "individual",
        1500,
        true,
      ),
      make(
        "retention-projects",
        "25 qualifying projects",
        [condition("qualifying_projects", 25)],
        "individual",
        2500,
        true,
      ),
    ];
  }
  return [
    make(
      "individual-growth",
      variant === 0
        ? "Verified customer appreciation"
        : "Verified individual learning",
      [condition(variant === 0 ? "reviews" : "training_count", variant + 1)],
      "individual",
      750,
      true,
    ),
    make(
      "crew-delivery",
      "Verified crew project delivery",
      enterprise
        ? [
            condition("delay_hours", 0, "lte"),
            condition("budget_percent", 100, "lte"),
          ]
        : [condition("delay_hours", 0, "lte")],
      "crew",
      2500,
    ),
    make(
      "service-90",
      "90-day verified service",
      [condition("service_days", 90)],
      "individual",
      1500,
      true,
    ),
  ];
}
function build(
  size: EmployerSize,
  goal: Blueprint,
  variant: number,
): IncentiveTemplate {
  const [title, description, trade] = themes[goal][variant];
  const scale = size === "enterprise" ? 3 : size === "medium" ? 2 : 1;
  const name = `${title} · ${size === "small" ? "Local team" : size === "medium" ? "Growing employer" : "Enterprise"}`;
  const durationDays =
    goal === "retention" ? 760 : goal === "combined" ? 365 : 180;
  const evidence =
    goal === "recognition"
      ? "Peer nominations require a specific contribution, an available monthly giving allowance and independent review. Learning/project milestones require separately verified evidence."
      : goal === "retention"
        ? "Service dates must come from confirmed placement, independently verified actual employment or a bound HRMS source. Service-day thresholds are elapsed calendar dates; invitations and planned starts do not qualify."
        : goal === "quality"
          ? "Use attributable customer reviews, verified training completions and defined qualifying-project records. Repeated source events do not create duplicate awards."
          : goal === "delivery"
            ? "Verify project completion, delay/budget measurements, safety and quality checks, and the eligible crew roster. Preserve supplier/weather exceptions for review."
            : goal === "safety"
              ? "Verify actual safety training and qualifying-project checks. Reports are confidential; report counts or silence never establish safe performance."
              : "Verify each individual and crew metric separately. Record actual employment dates and preserve project, safety, quality and customer evidence.";
  const givingAllowance =
    (goal === "recognition" ? 1000 : goal === "combined" ? 500 : 0) * scale;
  const terms = `${name}. ${description} Eligibility: invited employees must accept the published program terms; participation grants no staff access, license or verified credential. Rewards: 100 points convert to 100 USD cents; normal redemption minimum 500 points. Each milestone uses its published target, award frequency, recipient and approval sequence. Crew awards snapshot eligible members at the verified event and split points equally with deterministic remainder allocation; individual awards are independent of crew speed. ${evidence} Verified distinct hazards earn ${1000 * scale} points; banked safety points may be redeemed immediately under the published safety option. Reporting never resets earned safety progress; remediation has a 24-hour target and remains open until resolved. ${givingAllowance ? `Monthly points to give: ${givingAllowance}; unused giving allowance expires at the employer-local month boundary. Giving is optional; no self-awards, cross-program transfers or collusive exchanges. Received points follow earned-point terms.` : "No peer giving allowance is offered by this preset."} Earned points ${variant === 1 ? "expire 24 months after award" : "remain available indefinitely"}; after employment ends, original earned-point availability continues. Missed/rejected metric decisions provide a notified 48-hour exception window and one evidence-backed appeal. Original evidence and earned rights are retained. New awards require available confirmed funding and the published program budget; budget exhaustion never devalues earned points. Provider uncertainty preserves entitlement until reconciliation. Recognition is opt-in and company-issued. Sandbox execution and eligible fee-free USD catalog products only; live funding and fulfillment require separate activation.`;
  return {
    id: `${size}-${goal}-${variant + 1}`,
    size,
    goal,
    name,
    description,
    trade,
    durationDays,
    evidence,
    recommendedMode: size === "enterprise" ? "advanced" : "guided",
    definition: {
      schemaVersion: 1,
      name,
      description,
      blueprint: goal,
      trade,
      terms,
      timezone: "America/Chicago",
      budgetCents:
        (size === "small" ? 150000 : size === "medium" ? 1500000 : 10000000) +
        variant * 25000,
      creditsPerBlock: 100,
      centsPerBlock: 100,
      minimumCredits: 500,
      expiryMonths: variant === 1 ? 24 : null,
      departure: "retain",
      departureDays: 90,
      safetyMode: "bank_and_redeem",
      safetyPoints: 1000 * scale,
      givingAllowance,
      recipientMonthlyCap: givingAllowance * 3,
      publicRecognition: goal === "recognition" || goal === "combined",
      teams: ["delivery", "safety", "combined"].includes(goal)
        ? [{ id: "primary-crew", name: "Primary crew", participantIds: [] }]
        : [],
      milestones: milestones(goal, variant, scale, size === "enterprise"),
      notifications: { inApp: true, email: false },
    },
  };
}
export const INCENTIVE_TEMPLATES: readonly IncentiveTemplate[] = (
  Object.keys(EMPLOYER_SIZES) as EmployerSize[]
).flatMap((size) =>
  (Object.keys(PROGRAM_GOALS) as Blueprint[]).flatMap((goal) =>
    [0, 1, 2].map((variant) => build(size, goal, variant)),
  ),
);
export function templateDefinition(
  template: IncentiveTemplate,
  now = new Date(),
): Definition {
  const startsAt = new Intl.DateTimeFormat("en-CA", {
    timeZone: template.definition.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const end = new Date(`${startsAt}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + template.durationDays);
  return {
    ...structuredClone(template.definition),
    startsAt,
    endsAt: end.toISOString().slice(0, 10),
  };
}
export function findIncentiveTemplate(id: string) {
  return INCENTIVE_TEMPLATES.find((t) => t.id === id);
}
