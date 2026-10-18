import type { EmployerRole } from "./types";

export const JOB_REMOTE_POLICIES = ["onsite", "hybrid", "remote"] as const;
export const JOB_EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "temporary"] as const;
export const JOB_PAY_PERIODS = ["hour", "week", "month", "year"] as const;

export type JobRemotePolicy = (typeof JOB_REMOTE_POLICIES)[number];
export type JobEmploymentType = (typeof JOB_EMPLOYMENT_TYPES)[number];
export type JobPayPeriod = (typeof JOB_PAY_PERIODS)[number];
export type JobStatus = "draft" | "published" | "paused" | "closed" | "archived";

export type JobEditableFields = {
  title: string;
  summary: string;
  description: string;
  locationCity: string;
  locationState: string;
  remotePolicy: JobRemotePolicy;
  employmentType: JobEmploymentType;
  payMin: number | null;
  payMax: number | null;
  payPeriod: JobPayPeriod;
  shiftText: string;
  requirements: string[];
  benefits: string[];
  skills: string[];
  applicationInstructions: string;
  isTemplate: boolean;
};

export type JobListing = JobEditableFields & {
  id: string;
  jobListingId: string;
  employerId: string;
  createdByUserId: string | null;
  assignedHiringManagerUserId: string | null;
  hiringNeedId: string | null;
  sourceJobListingId: string | null;
  pipelineVersionId: string | null;
  status: JobStatus;
  revision: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const BLANK_JOB: JobEditableFields = {
  title: "",
  summary: "",
  description: "",
  locationCity: "",
  locationState: "",
  remotePolicy: "onsite",
  employmentType: "full_time",
  payMin: null,
  payMax: null,
  payPeriod: "year",
  shiftText: "",
  requirements: [],
  benefits: [],
  skills: [],
  applicationInstructions: "",
  isTemplate: false,
};

export function canCreateJob(role: EmployerRole): boolean {
  return ["employer_owner", "employer_admin", "recruiter"].includes(role);
}

export function canEditJob(role: EmployerRole, currentUserId: string, assignedManagerId: string | null): boolean {
  return canCreateJob(role) || (role === "hiring_manager" && assignedManagerId === currentUserId);
}

export function canManageJobStatus(role: EmployerRole): boolean {
  return role === "employer_owner" || role === "employer_admin";
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A job object is required");
  }
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, key: string, max: number): string {
  if (typeof value !== "string") throw new Error(key + " must be text");
  const result = value.trim();
  if (result.length > max) throw new Error(key + " is too long (max " + max + ")");
  return result;
}

function boundedArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error(key + " must be an array of at most 30 items");
  return value.map((entry) => boundedText(entry, key + " item", 160)).filter(Boolean);
}

function enumField<T extends string>(value: unknown, key: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error("Invalid " + key);
  }
  return value as T;
}

function money(value: unknown, key: string): number | null {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 9999999999.99) {
    throw new Error("Invalid " + key);
  }
  return Math.round(value * 100) / 100;
}

// Strict allowlist: an API caller cannot change ownership, status, revision,
// pipeline assignment, actor identity or audit metadata through a content patch.
export function parseJobPatch(value: unknown): Partial<JobEditableFields> {
  const input = record(value);
  const forbidden = ["id", "jobListingId", "employerId", "createdByUserId", "revision", "status", "pipelineVersionId", "publishedAt", "assignedHiringManagerUserId", "hiringNeedId", "sourceJobListingId"];
  if (forbidden.some((field) => Object.hasOwn(input, field))) {
    throw new Error("Job ownership and workflow fields are not editable");
  }
  const output: Partial<JobEditableFields> = {};
  if ("title" in input) output.title = boundedText(input.title, "Title", 180);
  if ("summary" in input) output.summary = boundedText(input.summary, "Summary", 600);
  if ("description" in input) output.description = boundedText(input.description, "Description", 12000);
  if ("locationCity" in input) output.locationCity = boundedText(input.locationCity, "City", 120);
  if ("locationState" in input) output.locationState = boundedText(input.locationState, "State", 120);
  if ("remotePolicy" in input) output.remotePolicy = enumField(input.remotePolicy, "remote policy", JOB_REMOTE_POLICIES);
  if ("employmentType" in input) output.employmentType = enumField(input.employmentType, "employment type", JOB_EMPLOYMENT_TYPES);
  if ("payMin" in input) output.payMin = money(input.payMin, "minimum pay");
  if ("payMax" in input) output.payMax = money(input.payMax, "maximum pay");
  if ("payPeriod" in input) output.payPeriod = enumField(input.payPeriod, "pay period", JOB_PAY_PERIODS);
  if ("shiftText" in input) output.shiftText = boundedText(input.shiftText, "Shift", 500);
  if ("requirements" in input) output.requirements = boundedArray(input.requirements, "Requirements");
  if ("benefits" in input) output.benefits = boundedArray(input.benefits, "Benefits");
  if ("skills" in input) output.skills = boundedArray(input.skills, "Skills");
  if ("applicationInstructions" in input) output.applicationInstructions = boundedText(input.applicationInstructions, "Application instructions", 2500);
  if ("isTemplate" in input) {
    if (typeof input.isTemplate !== "boolean") throw new Error("isTemplate must be boolean");
    output.isTemplate = input.isTemplate;
  }
  if (!Object.keys(output).length) throw new Error("No editable job fields were supplied");
  if (output.payMin !== undefined && output.payMax !== undefined &&
    output.payMin !== null && output.payMax !== null && output.payMin > output.payMax) {
    throw new Error("Minimum pay cannot exceed maximum pay");
  }
  return output;
}

export function jobToDatabase(fields: Partial<JobEditableFields>): Record<string, unknown> {
  const columns: Record<keyof JobEditableFields, string> = {
    title: "title", summary: "summary", description: "description",
    locationCity: "location_city", locationState: "location_state",
    remotePolicy: "remote_policy", employmentType: "employment_type",
    payMin: "pay_min", payMax: "pay_max", payPeriod: "pay_period",
    shiftText: "shift_text", requirements: "requirements_json",
    benefits: "benefits_json", skills: "skills_json",
    applicationInstructions: "application_instructions", isTemplate: "is_template",
  };
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(fields) as (keyof JobEditableFields)[]) {
    result[columns[key]] = fields[key];
  }
  return result;
}

function toArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function mapJob(row: Record<string, unknown>): JobListing {
  return {
    id: String(row.id), jobListingId: String(row.job_listing_id),
    employerId: String(row.employer_id),
    createdByUserId: row.created_by_user_id == null ? null : String(row.created_by_user_id),
    assignedHiringManagerUserId: row.assigned_hiring_manager_user_id == null ? null : String(row.assigned_hiring_manager_user_id),
    hiringNeedId: row.hiring_need_id == null ? null : String(row.hiring_need_id),
    sourceJobListingId: row.source_job_listing_id == null ? null : String(row.source_job_listing_id),
    pipelineVersionId: row.pipeline_version_id == null ? null : String(row.pipeline_version_id),
    title: String(row.title ?? ""), summary: String(row.summary ?? ""), description: String(row.description ?? ""),
    locationCity: String(row.location_city ?? ""), locationState: String(row.location_state ?? ""),
    remotePolicy: row.remote_policy as JobRemotePolicy,
    employmentType: row.employment_type as JobEmploymentType,
    payMin: row.pay_min == null ? null : Number(row.pay_min),
    payMax: row.pay_max == null ? null : Number(row.pay_max),
    payPeriod: row.pay_period as JobPayPeriod, shiftText: String(row.shift_text ?? ""),
    requirements: toArray(row.requirements_json), benefits: toArray(row.benefits_json),
    skills: toArray(row.skills_json), applicationInstructions: String(row.application_instructions ?? ""),
    isTemplate: Boolean(row.is_template), status: row.status as JobStatus,
    revision: Number(row.revision ?? 1), publishedAt: row.published_at == null ? null : String(row.published_at),
    createdAt: String(row.created_at ?? ""), updatedAt: String(row.updated_at ?? ""),
  };
}
