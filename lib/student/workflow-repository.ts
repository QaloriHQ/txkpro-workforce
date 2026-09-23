import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  StudentInterview,
  StudentPlacement,
} from "@/lib/student/types";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapInterview(value: unknown): StudentInterview {
  const row = objectValue(value);
  return {
    interviewRequestId: String(row.interviewRequestId ?? ""),
    employerId: String(row.employerId ?? ""),
    employerName: String(row.employerName ?? "Employer"),
    roleTitle: String(row.roleTitle ?? "Interview"),
    tradeId: text(row.tradeId),
    message: text(row.message),
    schedulingUrl: text(row.schedulingUrl),
    status: String(row.status ?? "sent") as StudentInterview["status"],
    sentAt: text(row.sentAt),
    respondedAt: text(row.respondedAt),
    scheduledFor: text(row.scheduledFor),
    interviewFormat: text(row.interviewFormat),
    locationDetail: text(row.locationDetail),
    placementId: text(row.placementId),
    placementStatus: text(row.placementStatus) as StudentInterview["placementStatus"],
    hireDate: text(row.hireDate),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function mapPlacement(value: unknown): StudentPlacement {
  const row = objectValue(value);
  return {
    placementId: String(row.placementId ?? ""),
    employerName: String(row.employerName ?? "Employer"),
    roleTitle: String(row.roleTitle ?? ""),
    tradeId: text(row.tradeId),
    hireDate: String(row.hireDate ?? ""),
    employmentType: text(row.employmentType),
    status: String(row.status ?? "unknown") as StudentPlacement["status"],
  };
}

export async function listStudentInterviews(): Promise<StudentInterview[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("student_interviews_list");
  if (error) throw error;
  return Array.isArray(data) ? data.map(mapInterview) : [];
}

export async function respondToInterview(input: {
  interviewRequestId: string;
  response: "accepted" | "declined" | "scheduling";
  note?: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("student_respond_interview", {
    p_interview_request_id: input.interviewRequestId,
    p_response: input.response,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return objectValue(data);
}

export async function listStudentPlacements(): Promise<StudentPlacement[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("student_placements_list");
  if (error) throw error;
  return Array.isArray(data) ? data.map(mapPlacement) : [];
}
