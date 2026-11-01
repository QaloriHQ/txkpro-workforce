import type { JobEditableFields } from "@/lib/employer/job-listings";

export const JOB_TEMPLATE_LEVELS = {
  apprentice: "Apprentice / entry level",
  experienced: "Experienced craft worker",
  lead: "Lead / supervisor",
} as const;

export type JobTemplateLevel = keyof typeof JOB_TEMPLATE_LEVELS;

export type JobTemplate = {
  id: string;
  trade: string;
  tradeSlug: string;
  level: JobTemplateLevel;
  title: string;
  overview: string;
  responsibilities: string[];
  screening: string[];
  fields: JobEditableFields;
};

type TradeSeed = {
  slug: string;
  trade: string;
  role: string;
  work: string[];
  skills: string[];
  credentials: string[];
  pay: Record<JobTemplateLevel, readonly [number, number]>;
};

const TRADES: TradeSeed[] = [
  { slug: "hvac", trade: "HVAC", role: "HVAC Technician", work: ["Install, diagnose, maintain, and repair residential or commercial HVAC equipment", "Document readings, work performed, materials, and customer handoff", "Follow refrigerant, electrical, lockout/tagout, and jobsite safety procedures"], skills: ["HVAC diagnostics", "Electrical fundamentals", "Customer communication"], credentials: ["EPA Section 608 certification or ability to obtain it", "Valid driver's license when driving is an essential job duty"], pay: { apprentice: [18, 24], experienced: [26, 36], lead: [32, 42] } },
  { slug: "electrical", trade: "Electrical", role: "Electrician", work: ["Install and troubleshoot wiring, devices, panels, and controls within authorized scope", "Read plans, diagrams, and job specifications", "Perform energized-work prevention, lockout/tagout, and required testing"], skills: ["Electrical theory", "Blueprint reading", "Safe tool use"], credentials: ["Applicable apprentice, journeyman, or contractor credentials for assigned work", "Valid driver's license when driving is an essential job duty"], pay: { apprentice: [18, 24], experienced: [27, 38], lead: [34, 46] } },
  { slug: "plumbing", trade: "Plumbing", role: "Plumber", work: ["Install, inspect, maintain, and repair piping, fixtures, and drainage systems", "Read plans and verify measurements before work begins", "Document tests, materials, and code-related corrections"], skills: ["Pipe fitting", "Fixture installation", "Troubleshooting"], credentials: ["Applicable plumbing registration or license for assigned work", "Valid driver's license when driving is an essential job duty"], pay: { apprentice: [18, 24], experienced: [27, 38], lead: [34, 46] } },
  { slug: "roofing", trade: "Roofing", role: "Roofing Technician", work: ["Inspect, install, repair, and maintain roofing systems and flashings", "Stage materials and protect occupied property", "Use fall protection and stop work when weather or site conditions are unsafe"], skills: ["Roof-system installation", "Leak diagnosis", "Fall protection"], credentials: ["Ability to complete required fall-protection training", "Valid driver's license when driving is an essential job duty"], pay: { apprentice: [17, 23], experienced: [24, 34], lead: [30, 40] } },
  { slug: "welding", trade: "Welding & fabrication", role: "Welder / Fabricator", work: ["Fit, weld, and finish assemblies to drawings and procedure requirements", "Inspect material preparation and completed welds", "Maintain ventilation, hot-work, fire-watch, and PPE controls"], skills: ["GMAW/SMAW/FCAW processes", "Print reading", "Measurement and layout"], credentials: ["Procedure-specific weld qualification when required", "Ability to complete employer safety qualification"], pay: { apprentice: [18, 25], experienced: [25, 36], lead: [32, 42] } },
  { slug: "carpentry", trade: "Carpentry", role: "Carpenter", work: ["Lay out, build, install, and repair wood or light-gauge assemblies", "Read plans and verify dimensions and tolerances", "Maintain safe saw, ladder, scaffold, and housekeeping practices"], skills: ["Layout and measurement", "Framing or finish carpentry", "Plan reading"], credentials: ["Ability to complete required equipment and fall-protection training", "Valid driver's license when driving is an essential job duty"], pay: { apprentice: [17, 23], experienced: [24, 34], lead: [30, 40] } },
  { slug: "masonry", trade: "Masonry & concrete", role: "Mason / Concrete Craft Worker", work: ["Prepare, place, finish, repair, or assemble masonry and concrete work", "Verify grades, lines, forms, reinforcement, and material condition", "Use silica, lifting, and equipment controls"], skills: ["Concrete or masonry placement", "Layout and grade", "Material handling"], credentials: ["Ability to complete silica and equipment safety training", "Valid driver's license when driving is an essential job duty"], pay: { apprentice: [17, 23], experienced: [23, 32], lead: [29, 38] } },
  { slug: "heavy-equipment", trade: "Heavy equipment", role: "Heavy Equipment Operator", work: ["Inspect and operate assigned equipment within rated limits", "Coordinate spotters, utility clearances, and work-zone movement", "Record inspections, production, maintenance needs, and unsafe conditions"], skills: ["Equipment operation", "Daily inspection", "Grade and site awareness"], credentials: ["Employer qualification for each assigned equipment class", "Valid driver's license or CDL when required by the position"], pay: { apprentice: [19, 26], experienced: [27, 38], lead: [33, 44] } },
  { slug: "facilities", trade: "Facilities maintenance", role: "Facilities Maintenance Technician", work: ["Complete preventive maintenance and repair work across building systems", "Prioritize work orders and document findings, labor, and parts", "Escalate licensed work and unsafe conditions to the appropriate specialist"], skills: ["Preventive maintenance", "Work-order documentation", "Multi-trade troubleshooting"], credentials: ["Trade license only when the assigned work legally requires it", "Valid driver's license when driving is an essential job duty"], pay: { apprentice: [17, 23], experienced: [23, 32], lead: [29, 38] } },
  { slug: "diesel", trade: "Automotive & diesel", role: "Diesel / Automotive Technician", work: ["Inspect, diagnose, service, and repair vehicles or mobile equipment", "Use service information and document test results and repairs", "Maintain lift, battery, fuel, chemical, and lockout safety"], skills: ["Mechanical diagnostics", "Electrical diagnostics", "Service documentation"], credentials: ["ASE or manufacturer credentials preferred where relevant", "Valid driver's license appropriate for test-driving assigned vehicles"], pay: { apprentice: [18, 25], experienced: [25, 36], lead: [32, 42] } },
  { slug: "solar", trade: "Solar & energy systems", role: "Solar Installer / Technician", work: ["Install and inspect racking, modules, wiring, and balance-of-system components", "Follow plans, torque specifications, testing, and commissioning checklists", "Apply fall protection, electrical isolation, and weather stop-work rules"], skills: ["PV installation", "Electrical fundamentals", "Roof and fall safety"], credentials: ["Electrical work performed only within applicable licensing scope", "Ability to complete employer fall-protection qualification"], pay: { apprentice: [18, 24], experienced: [24, 34], lead: [30, 40] } },
  { slug: "construction", trade: "General construction", role: "Construction Craft Worker", work: ["Support layout, material staging, installation, protection, and cleanup", "Use plans, daily assignments, and quality checklists", "Report hazards, changes, damaged work, and material constraints promptly"], skills: ["Construction math", "Hand and power tools", "Jobsite coordination"], credentials: ["Ability to complete employer safety orientation", "Valid driver's license when driving is an essential job duty"], pay: { apprentice: [16, 22], experienced: [22, 32], lead: [28, 38] } },
];

const LEVELS: Record<JobTemplateLevel, {
  prefix: string;
  summary: string;
  description: string;
  requirements: string[];
  benefits: string[];
  extraSkills: string[];
  schedule: string;
}> = {
  apprentice: {
    prefix: "Apprentice",
    summary: "Build trade experience with structured supervision, documented training, and progressively more independent work.",
    description: "This entry-level role supports qualified craft professionals while developing safe, reliable jobsite habits. The employer should define the registered-apprenticeship relationship, supervision ratio, school schedule, and any license pathway before publishing.",
    requirements: ["Reliable attendance and willingness to learn", "Ability to perform the essential physical functions with reasonable accommodation", "Commitment to stop work and report unsafe conditions"],
    benefits: ["Structured on-the-job learning", "Employer-provided safety training and required PPE", "Paid time off and paid holidays after the employer-defined eligibility period"],
    extraSkills: ["Coachability", "Jobsite communication"],
    schedule: "Full-time, Monday–Friday, 7:00 AM–3:30 PM, with occasional overtime and travel to local jobsites.",
  },
  experienced: {
    prefix: "Experienced",
    summary: "Perform skilled work independently, document quality, and coordinate safely with customers and other trades.",
    description: "This experienced craft role owns assigned work from preparation through verification and closeout. The employer should confirm exact licensing, travel, on-call, tool, vehicle, and wage requirements before publishing.",
    requirements: ["Demonstrated experience completing comparable work", "Ability to read applicable plans, service information, or specifications", "Consistent safety and quality documentation"],
    benefits: ["Health, dental, and vision plan options after the employer-defined eligibility period", "Paid time off and paid holidays", "Continuing education and credential-renewal support"],
    extraSkills: ["Independent troubleshooting", "Quality verification"],
    schedule: "Full-time, Monday–Friday, 7:00 AM–4:00 PM, with rotating on-call or overtime when disclosed by the employer.",
  },
  lead: {
    prefix: "Lead",
    summary: "Coordinate crews, verify safety and quality, remove blockers, and communicate job progress without replacing licensed oversight.",
    description: "This lead role coordinates day-to-day execution, worker readiness, documentation, and customer or project communication. It does not authorize work beyond the employee's credentials or the employer's licensed supervision structure.",
    requirements: ["Demonstrated craft proficiency and team leadership", "Experience planning work, materials, and daily safety controls", "Ability to document coaching, quality checks, and production status"],
    benefits: ["Health, dental, and vision plan options after the employer-defined eligibility period", "Paid time off and paid holidays", "Leadership development and advanced technical training"],
    extraSkills: ["Crew coordination", "Coaching and escalation"],
    schedule: "Full-time, Monday–Friday, 6:30 AM–4:00 PM, with schedule coordination, occasional overtime, and local jobsite travel.",
  },
};

function buildTemplate(trade: TradeSeed, level: JobTemplateLevel): JobTemplate {
  const variant = LEVELS[level];
  const title = `${variant.prefix} ${trade.role}`;
  const responsibilities = [...trade.work, ...(level === "lead" ? ["Plan daily assignments, confirm qualifications, and verify closeout with the crew"] : [])];
  const requirements = [...variant.requirements, ...trade.credentials];
  const [payMin, payMax] = trade.pay[level];
  return {
    id: `${trade.slug}-${level}`,
    trade: trade.trade,
    tradeSlug: trade.slug,
    level,
    title,
    overview: variant.description,
    responsibilities,
    screening: ["Use only job-related, employer-approved screening steps", "Give candidates required notices and human review", "Do not auto-reject from screening, assessments, or inferred scores"],
    fields: {
      title,
      summary: variant.summary,
      description: `${variant.description}\n\nResponsibilities:\n${responsibilities.map((item) => `• ${item}`).join("\n")}`,
      locationCity: "Texarkana",
      locationState: "TX",
      remotePolicy: "onsite",
      employmentType: "full_time",
      payMin,
      payMax,
      payPeriod: "hour",
      shiftText: variant.schedule,
      requirements,
      benefits: variant.benefits,
      skills: [...trade.skills, ...variant.extraSkills],
      applicationInstructions: "Apply with your current work history, relevant credentials, and availability. Accommodation requests and questions may be raised during the human-reviewed hiring process.",
      isTemplate: false,
    },
  };
}

export const JOB_TEMPLATES: readonly JobTemplate[] = TRADES.flatMap((trade) =>
  (Object.keys(JOB_TEMPLATE_LEVELS) as JobTemplateLevel[]).map((level) =>
    buildTemplate(trade, level),
  ),
);

export function getJobTemplate(id: string | null | undefined) {
  return JOB_TEMPLATES.find((template) => template.id === id) ?? null;
}

export const findJobTemplate = getJobTemplate;
