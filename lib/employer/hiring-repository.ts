import "server-only";

import type {
  EmployerContext,
  InterviewDetail,
  InterviewEvaluation,
  InterviewStatus,
  InterviewSummary,
  PlacementDetail,
  PlacementStatus,
  PlacementSummary,
  RetentionMilestone,
} from "@/lib/employer/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapEvaluation(value: unknown): InterviewEvaluation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    evaluationId: String(row.evaluationId ?? ""),
    interviewerUserId: text(row.interviewerUserId),
    nextStep: String(row.nextStep ?? "not_set") as InterviewEvaluation["nextStep"],
    summary: text(row.summary),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function mapInterview(value: unknown): InterviewSummary {
  const row = objectValue(value);
  return {
    interviewRequestId: String(row.interviewRequestId ?? ""),
    studentId: String(row.studentId ?? ""),
    studentName: String(row.studentName ?? "Student"),
    institutionName: text(row.institutionName),
    program: text(row.program),
    hiringNeedId: text(row.hiringNeedId),
    hiringNeedTitle: text(row.hiringNeedTitle),
    referralId: text(row.referralId),
    roleTitle: String(row.roleTitle ?? "Interview"),
    tradeId: text(row.tradeId),
    message: text(row.message),
    schedulingUrl: text(row.schedulingUrl),
    status: String(row.status ?? "sent") as InterviewStatus,
    sentAt: text(row.sentAt),
    respondedAt: text(row.respondedAt),
    scheduledFor: text(row.scheduledFor),
    interviewFormat: text(row.interviewFormat),
    locationDetail: text(row.locationDetail),
    completedAt: text(row.completedAt),
    evaluationNextStep: text(row.evaluationNextStep) as InterviewEvaluation["nextStep"] | null,
    placementId: text(row.placementId),
    placementStatus: text(row.placementStatus) as PlacementStatus | null,
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function mapInterviewDetail(value: unknown): InterviewDetail {
  const row = objectValue(value);
  const placement = row.placement ? objectValue(row.placement) : null;
  return {
    ...mapInterview(row),
    referralStatus: text(row.referralStatus),
    responseNote: text(row.responseNote),
    evaluation: mapEvaluation(row.evaluation),
    placement: placement
      ? {
          placementId: String(placement.placementId ?? ""),
          status: String(placement.status ?? "unknown") as PlacementStatus,
          roleTitle: String(placement.roleTitle ?? ""),
          tradeId: text(placement.tradeId),
          hireDate: String(placement.hireDate ?? ""),
          employmentType: text(placement.employmentType),
        }
      : null,
  };
}

function mapMilestone(value: unknown): RetentionMilestone {
  const row = objectValue(value);
  return {
    milestoneId: String(row.milestoneId ?? ""),
    dayNumber: Number(row.dayNumber ?? 30) as 30 | 60 | 90,
    scheduledFor: String(row.scheduledFor ?? ""),
    status: String(row.status ?? "pending") as RetentionMilestone["status"],
    sentAt: text(row.sentAt),
    responseReceivedAt: text(row.responseReceivedAt),
  };
}

function mapPlacement(value: unknown): PlacementSummary {
  const row = objectValue(value);
  return {
    placementId: String(row.placementId ?? ""),
    studentId: String(row.studentId ?? ""),
    studentName: String(row.studentName ?? "Student"),
    interviewRequestId: text(row.interviewRequestId),
    referralId: text(row.referralId),
    hiringNeedId: text(row.hiringNeedId),
    hiringNeedTitle: text(row.hiringNeedTitle),
    roleTitle: String(row.roleTitle ?? ""),
    tradeId: text(row.tradeId),
    hireDate: String(row.hireDate ?? ""),
    employmentType: text(row.employmentType),
    status: String(row.status ?? "unknown") as PlacementStatus,
    startedAt: text(row.startedAt),
    endedAt: text(row.endedAt),
    milestoneCount: Number(row.milestoneCount ?? 0),
  };
}

function mapPlacementDetail(value: unknown): PlacementDetail {
  const row = objectValue(value);
  return {
    ...mapPlacement(row),
    endReason: text(row.endReason),
    milestones: arrayValue(row.milestones).map(mapMilestone),
  };
}

export async function listEmployerInterviews(
  context: EmployerContext,
  queue?: string | null,
): Promise<InterviewSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_interviews_list", {
    p_employer_id: context.employerId,
    p_queue: queue ?? null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data.map(mapInterview) : [];
}

export async function getEmployerInterview(
  context: EmployerContext,
  interviewRequestId: string,
): Promise<InterviewDetail> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_interview_detail", {
    p_employer_id: context.employerId,
    p_interview_request_id: interviewRequestId,
  });
  if (error) throw error;
  return mapInterviewDetail(data);
}

export async function requestInterview(
  context: EmployerContext,
  input: {
    studentId: string;
    hiringNeedId?: string | null;
    referralId?: string | null;
    roleTitle?: string | null;
    tradeId?: string | null;
    message?: string | null;
    schedulingUrl?: string | null;
  },
) {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot request interviews.", {
      status: 403,
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_request_interview", {
    p_employer_id: context.employerId,
    p_student_id: input.studentId,
    p_hiring_need_id: input.hiringNeedId ?? null,
    p_referral_id: input.referralId ?? null,
    p_role_title: input.roleTitle ?? null,
    p_trade_id: input.tradeId ?? null,
    p_message: input.message ?? null,
    p_scheduling_url: input.schedulingUrl ?? null,
  });
  if (error) throw error;
  return objectValue(data);
}

export async function scheduleInterview(
  context: EmployerContext,
  input: {
    interviewRequestId: string;
    scheduledFor: string;
    format: string;
    locationDetail?: string | null;
  },
) {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot schedule interviews.", {
      status: 403,
    });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_schedule_interview", {
    p_employer_id: context.employerId,
    p_interview_request_id: input.interviewRequestId,
    p_scheduled_for: input.scheduledFor,
    p_format: input.format,
    p_location_detail: input.locationDetail ?? null,
  });
  if (error) throw error;
  return objectValue(data);
}

export async function completeInterview(
  context: EmployerContext,
  interviewRequestId: string,
) {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot complete interviews.", {
      status: 403,
    });
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_complete_interview", {
    p_employer_id: context.employerId,
    p_interview_request_id: interviewRequestId,
  });
  if (error) throw error;
  return objectValue(data);
}

export async function saveInterviewEvaluation(
  context: EmployerContext,
  input: {
    interviewRequestId: string;
    nextStep: InterviewEvaluation["nextStep"];
    summary?: string | null;
  },
) {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot save evaluations.", {
      status: 403,
    });
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "employer_save_interview_evaluation",
    {
      p_employer_id: context.employerId,
      p_interview_request_id: input.interviewRequestId,
      p_next_step: input.nextStep,
      p_summary: input.summary ?? null,
    },
  );
  if (error) throw error;
  return objectValue(data);
}

export async function recordHire(
  context: EmployerContext,
  input: {
    interviewRequestId: string;
    roleTitle: string;
    tradeId?: string | null;
    hireDate: string;
    employmentType?: string | null;
  },
) {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot record hires.", {
      status: 403,
    });
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_record_hire", {
    p_employer_id: context.employerId,
    p_interview_request_id: input.interviewRequestId,
    p_role_title: input.roleTitle,
    p_trade_id: input.tradeId ?? null,
    p_hire_date: input.hireDate,
    p_employment_type: input.employmentType ?? null,
  });
  if (error) throw error;
  return objectValue(data);
}

export async function listEmployerPlacements(
  context: EmployerContext,
): Promise<PlacementSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_placements_list", {
    p_employer_id: context.employerId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data.map(mapPlacement) : [];
}

export async function getEmployerPlacement(
  context: EmployerContext,
  placementId: string,
): Promise<PlacementDetail> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_placement_detail", {
    p_employer_id: context.employerId,
    p_placement_id: placementId,
  });
  if (error) throw error;
  return mapPlacementDetail(data);
}

export async function updatePlacementStatus(
  context: EmployerContext,
  input: {
    placementId: string;
    status: "active" | "ended";
    endReason?: string | null;
  },
) {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot change placements.", {
      status: 403,
    });
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "employer_update_placement_status",
    {
      p_employer_id: context.employerId,
      p_placement_id: input.placementId,
      p_status: input.status,
      p_end_reason: input.endReason ?? null,
    },
  );
  if (error) throw error;
  return objectValue(data);
}
