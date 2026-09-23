import "server-only";

import type {
  EmployerContext,
  EmployerPrivateNote,
  ReferralDetail,
  ReferralSummary,
  SavedCandidate,
  TalentCandidate,
  TalentFilters,
} from "@/lib/employer/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function mapCandidate(value: unknown): TalentCandidate {
  const row = objectValue(value);
  const readiness = objectValue(row.readiness);
  const fit = row.hiringNeedFit ? objectValue(row.hiringNeedFit) : null;

  return {
    studentId: String(row.studentId ?? ""),
    displayName: String(row.displayName ?? "Student"),
    institutionId: text(row.institutionId),
    institutionName: text(row.institutionName),
    cohortId: text(row.cohortId),
    program: text(row.program),
    graduationDate: text(row.graduationDate),
    graduationYear: text(row.graduationYear),
    city: text(row.city),
    state: text(row.state),
    primaryTradeId: text(row.primaryTradeId),
    availabilityStatus: text(row.availabilityStatus),
    availableStartDate: text(row.availableStartDate),
    verifiedSkillCount: Number(row.verifiedSkillCount ?? 0),
    verifiedSkills: arrayValue(row.verifiedSkills).map((skill) => ({
      skillId: String(skill.skillId ?? ""),
      name: String(skill.name ?? ""),
      category: text(skill.category),
      tradeId: text(skill.tradeId),
      provenance: String(
        skill.provenance ?? "not_verified",
      ) as TalentCandidate["verifiedSkills"][number]["provenance"],
      verifiedAt: text(skill.verifiedAt),
    })),
    readiness: {
      driversLicense: text(readiness.driversLicense),
      drivingRecordAttestation: boolOrNull(
        readiness.drivingRecordAttestation,
      ),
      backgroundScreenWillingness: boolOrNull(
        readiness.backgroundScreenWillingness,
      ),
      drugScreenWillingness: boolOrNull(readiness.drugScreenWillingness),
      workTypes: Array.isArray(readiness.workTypes)
        ? readiness.workTypes.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      shifts: Array.isArray(readiness.shifts)
        ? readiness.shifts.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      provenance: Object.fromEntries(
        Object.entries(objectValue(readiness.provenance)).filter(
          ([, item]) => typeof item === "string",
        ),
      ) as Record<string, string>,
    },
    savedCandidateId: text(row.savedCandidateId),
    referralStatus: text(row.referralStatus),
    hiringNeedFit: fit
      ? {
          hiringNeedId: String(fit.hiringNeedId ?? ""),
          title: String(fit.title ?? ""),
          trade: Boolean(fit.trade),
          minimumVerifiedSkills: Boolean(fit.minimumVerifiedSkills),
          requiredSkills: Boolean(fit.requiredSkills),
          driversLicense: Boolean(fit.driversLicense),
          drivingRecordAttestation: Boolean(fit.drivingRecordAttestation),
          backgroundWillingness: Boolean(fit.backgroundWillingness),
          drugScreenWillingness: Boolean(fit.drugScreenWillingness),
        }
      : null,
  };
}

function mapReferral(value: unknown): ReferralSummary {
  const row = objectValue(value);
  return {
    referralId: String(row.referralId ?? ""),
    studentId: String(row.studentId ?? ""),
    studentName: String(row.studentName ?? "Student"),
    institutionId: String(row.institutionId ?? ""),
    institutionName: text(row.institutionName),
    program: text(row.program),
    primaryTradeId: text(row.primaryTradeId),
    hiringNeedId: text(row.hiringNeedId),
    hiringNeedTitle: text(row.hiringNeedTitle),
    status: String(row.status ?? "referred"),
    institutionSharedNote: text(row.institutionSharedNote),
    referredAt: text(row.referredAt),
    viewedAt: text(row.viewedAt),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function mapReferralDetail(value: unknown): ReferralDetail {
  const row = objectValue(value);
  return {
    ...mapReferral(row),
    technicalSnapshot: objectValue(row.technicalSnapshot),
    professionalSnapshot: objectValue(row.professionalSnapshot),
    operationalSnapshot: objectValue(row.operationalSnapshot),
    privateNotes: arrayValue(row.privateNotes).map(
      (note): EmployerPrivateNote => ({
        noteId: String(note.noteId ?? ""),
        note: String(note.note ?? ""),
        createdByUserId: text(note.createdByUserId),
        createdAt: String(note.createdAt ?? ""),
      }),
    ),
  };
}

export async function searchTalent(
  context: EmployerContext,
  options?: {
    hiringNeedId?: string | null;
    filters?: TalentFilters;
  },
): Promise<TalentCandidate[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_talent_search", {
    p_employer_id: context.employerId,
    p_hiring_need_id: options?.hiringNeedId ?? null,
    p_filters: options?.filters ?? {},
  });
  if (error) throw error;
  return arrayValue(data).map(mapCandidate);
}

export async function getTalentCandidate(
  context: EmployerContext,
  studentId: string,
  hiringNeedId?: string | null,
) {
  const candidates = await searchTalent(context, {
    hiringNeedId,
    filters: { studentId },
  });
  return candidates[0] ?? null;
}

export async function saveCandidate(
  context: EmployerContext,
  input: {
    studentId: string;
    hiringNeedId?: string | null;
    internalTag?: string | null;
  },
): Promise<SavedCandidate> {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot save candidates.", {
      status: 403,
    });
  }

  const supabase = await createServerSupabaseClient();
  const payload = {
    employer_id: context.employerId,
    student_id: input.studentId,
    hiring_need_id: input.hiringNeedId ?? null,
    saved_by_user_id: context.legacyUserId,
    owner_user_id: context.legacyUserId,
    internal_tag: input.internalTag?.trim().slice(0, 120) || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("wf_saved_candidates")
    .upsert(payload, {
      onConflict: "employer_id,student_id,hiring_need_id",
    })
    .select("*")
    .single();
  if (error) throw error;

  return {
    savedCandidateId: String(data.saved_candidate_id),
    employerId: String(data.employer_id),
    studentId: String(data.student_id),
    hiringNeedId: text(data.hiring_need_id),
    savedByUserId: text(data.saved_by_user_id),
    ownerUserId: text(data.owner_user_id),
    internalTag: text(data.internal_tag),
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
  };
}

export async function unsaveCandidate(
  context: EmployerContext,
  studentId: string,
  hiringNeedId?: string | null,
) {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot remove saved candidates.", {
      status: 403,
    });
  }

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("wf_saved_candidates")
    .delete()
    .eq("employer_id", context.employerId)
    .eq("student_id", studentId);

  query = hiringNeedId
    ? query.eq("hiring_need_id", hiringNeedId)
    : query.is("hiring_need_id", null);

  const { error } = await query;
  if (error) throw error;
}

export async function listSavedTalent(
  context: EmployerContext,
  hiringNeedId?: string | null,
) {
  const candidates = await searchTalent(context, { hiringNeedId });
  return candidates.filter((candidate) => Boolean(candidate.savedCandidateId));
}

export async function addEmployerPrivateNote(
  context: EmployerContext,
  input: {
    studentId: string;
    referralId?: string | null;
    note: string;
  },
) {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot add private notes.", {
      status: 403,
    });
  }

  const note = input.note.trim().slice(0, 4000);
  if (!note) throw new Error("Note is required.");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("wf_employer_candidate_notes")
    .insert({
      employer_id: context.employerId,
      student_id: input.studentId,
      referral_id: input.referralId ?? null,
      created_by_user_id: context.legacyUserId,
      note,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listReferrals(
  context: EmployerContext,
  status?: string | null,
): Promise<ReferralSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_referrals_list", {
    p_employer_id: context.employerId,
    p_status: status ?? null,
  });
  if (error) throw error;
  return arrayValue(data).map(mapReferral);
}

export async function getReferralDetail(
  context: EmployerContext,
  referralId: string,
  options?: { markViewed?: boolean },
): Promise<ReferralDetail> {
  const supabase = await createServerSupabaseClient();
  const functionName = options?.markViewed
    ? "employer_mark_referral_viewed"
    : "employer_referral_detail";
  const { data, error } = await supabase.rpc(functionName, {
    p_employer_id: context.employerId,
    p_referral_id: referralId,
  });
  if (error) throw error;
  return mapReferralDetail(data);
}

export async function closeReferral(
  context: EmployerContext,
  referralId: string,
) {
  if (context.role === "employer_read_only") {
    throw new Response("Read-only Employer role cannot close referrals.", {
      status: 403,
    });
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("employer_close_referral", {
    p_employer_id: context.employerId,
    p_referral_id: referralId,
  });
  if (error) throw error;
  return mapReferralDetail(data);
}
