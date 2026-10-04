import type { InterviewSummary, PlacementSummary, ReferralSummary } from "@/lib/employer/types";

export const hiringStages = [
  "New / Referred", "Interview Requested", "Interviewing", "Decision",
  "Hire Scheduled", "Employment Started", "Closed", "Needs Review",
] as const;
export type HiringStage = typeof hiringStages[number];
export type HiringRecords = {
  referrals: ReferralSummary[];
  interviews: InterviewSummary[];
  placements: PlacementSummary[];
};
export type PipelineFocus = { kind: "referral" | "interview" | "placement"; id: string };
export type PipelineSelection = { studentId?: string; hiringNeedId?: string | null; focus?: PipelineFocus };
export type HiringJourney = {
  key: string;
  studentId: string;
  studentName: string;
  hiringNeedId: string | null;
  title: string;
  stage: HiringStage;
  detail: string;
  href: string;
  sortDate: string;
  links: { label: string; href: string }[];
  steps: { label: string; recorded: boolean; current: boolean; date: string | null }[];
  recordIds: { referral?: string; interview?: string; placement?: string };
};

function path(kind: PipelineFocus["kind"], id: string) {
  return `/employer/${kind === "referral" ? "referrals" : kind === "interview" ? "interviews" : "placements"}/${encodeURIComponent(id)}`;
}

function journey(referral?: ReferralSummary, interview?: InterviewSummary, placement?: PlacementSummary): HiringJourney {
  const started = Boolean(placement?.startConfirmedAt && placement.employmentStartDate);
  let stage: HiringStage = "New / Referred";
  let detail = referral ? `Referral: ${referral.status.replaceAll("_", " ")}` : "Direct candidate";
  if (referral) {
    if (["closed", "expired", "interview_declined"].includes(referral.status)) stage = "Closed";
    else if (["interview_requested", "interview_accepted"].includes(referral.status)) stage = "Interview Requested";
    else if (referral.status === "hired") {
      stage = "Needs Review";
      detail = "Referral marked hired; placement evidence is unavailable.";
    } else if (!["draft", "referred", "delivered", "viewed"].includes(referral.status)) {
      stage = "Needs Review";
      detail = "Referral status needs review";
    }
  }
  if (interview) {
    stage = ["declined", "cancelled", "expired"].includes(interview.status) ? "Closed"
      : interview.status === "completed" ? "Decision"
      : ["accepted", "scheduling", "scheduled"].includes(interview.status) ? "Interviewing"
      : interview.status === "draft" ? "New / Referred"
      : ["sent", "no_response"].includes(interview.status) ? "Interview Requested" : "Needs Review";
    detail = `Interview: ${interview.status.replaceAll("_", " ")}`;
  }
  if (placement) {
    stage = placement.status === "ended" ? "Closed"
      : !["pending_start", "active"].includes(placement.status) ? "Needs Review"
      : placement.status === "active" && started ? "Employment Started" : "Hire Scheduled";
    detail = placement.status === "ended" ? "Placement ended"
      : stage === "Needs Review" ? "Placement status needs review"
      : stage === "Employment Started" ? "Employment start confirmed"
      : placement.status === "active" ? "Start confirmation required" : "Scheduled start pending confirmation";
  }
  // Later stages never manufacture evidence for skipped steps.
  const steps = [
    { label: "New / Referred", recorded: Boolean(referral || interview || placement), date: referral?.referredAt ?? null },
    { label: "Interview Requested", recorded: Boolean(interview && ["sent", "accepted", "declined", "scheduling", "scheduled", "completed", "cancelled", "expired", "no_response"].includes(interview.status)), date: interview?.sentAt ?? null },
    { label: "Interviewing", recorded: Boolean(interview && ["accepted", "scheduling", "scheduled", "completed"].includes(interview.status)), date: interview?.scheduledFor ?? interview?.respondedAt ?? null },
    { label: "Decision", recorded: interview?.status === "completed", date: interview?.completedAt ?? null },
    { label: "Hire Scheduled", recorded: Boolean(placement && ["pending_start", "active", "ended"].includes(placement.status)), date: placement?.hireDate ?? null },
    { label: "Employment Started", recorded: started, date: started ? placement?.employmentStartDate ?? null : null },
  ].map(step => ({ ...step, date: step.recorded ? step.date : null, current: step.label === stage }));
  const key = placement ? `placement:${placement.placementId}` : interview ? `interview:${interview.interviewRequestId}` : `referral:${referral!.referralId}`;
  const href = placement ? path("placement", placement.placementId) : interview ? path("interview", interview.interviewRequestId) : path("referral", referral!.referralId);
  return {
    key, href, stage, detail, steps,
    studentId: placement?.studentId ?? interview?.studentId ?? referral!.studentId,
    studentName: placement?.studentName ?? interview?.studentName ?? referral!.studentName,
    hiringNeedId: placement?.hiringNeedId ?? interview?.hiringNeedId ?? referral?.hiringNeedId ?? null,
    title: placement?.roleTitle ?? interview?.roleTitle ?? referral?.hiringNeedTitle ?? "Referral",
    sortDate: placement?.endedAt ?? placement?.startConfirmedAt ?? placement?.hireDate ?? interview?.updatedAt ?? referral?.updatedAt ?? "",
    recordIds: { referral: referral?.referralId, interview: interview?.interviewRequestId, placement: placement?.placementId },
    links: [
      ...(referral ? [{ label: "View referral", href: path("referral", referral.referralId) }] : []),
      ...(interview ? [{ label: "View interview", href: path("interview", interview.interviewRequestId) }] : []),
      ...(placement ? [{ label: "View placement", href: path("placement", placement.placementId) }] : []),
    ],
  };
}

function compatible(a: { studentId: string; hiringNeedId: string | null }, b: { studentId: string; hiringNeedId: string | null }) {
  return a.studentId === b.studentId && (!a.hiringNeedId || !b.hiringNeedId || a.hiringNeedId === b.hiringNeedId);
}

export function buildHiringJourneys(records: HiringRecords, selection: PipelineSelection = {}): HiringJourney[] {
  const referrals = records.referrals.filter(r => !selection.studentId || r.studentId === selection.studentId);
  const interviews = records.interviews.filter(r => !selection.studentId || r.studentId === selection.studentId);
  const placements = records.placements.filter(r => !selection.studentId || r.studentId === selection.studentId);
  const referralById = new Map(referrals.map(r => [r.referralId, r]));
  const interviewById = new Map(interviews.map(i => [i.interviewRequestId, i]));
  const usedInterviews = new Set<string>();
  const usedReferrals = new Set<string>();
  const journeys: HiringJourney[] = [];
  for (const p of placements) {
    const linkedInterview = p.interviewRequestId ? interviewById.get(p.interviewRequestId) : undefined;
    const i = linkedInterview && compatible(p, linkedInterview)
      && (!p.referralId || !linkedInterview.referralId || p.referralId === linkedInterview.referralId) ? linkedInterview : undefined;
    const referralId = p.referralId ?? i?.referralId;
    const linkedReferral = referralId ? referralById.get(referralId) : undefined;
    const r = linkedReferral && compatible(p, linkedReferral) && (!i || compatible(i, linkedReferral)) ? linkedReferral : undefined;
    if (i) usedInterviews.add(i.interviewRequestId);
    if (r) usedReferrals.add(r.referralId);
    journeys.push(journey(r, i, p));
  }
  for (const i of interviews) {
    if (usedInterviews.has(i.interviewRequestId)) continue;
    const linkedReferral = i.referralId ? referralById.get(i.referralId) : undefined;
    const r = linkedReferral && compatible(i, linkedReferral) ? linkedReferral : undefined;
    if (r) usedReferrals.add(r.referralId);
    journeys.push(journey(r, i));
  }
  for (const r of referrals) {
    if (!usedReferrals.has(r.referralId)) journeys.push(journey(r));
  }
  return journeys.filter(j => (!selection.hiringNeedId || j.hiringNeedId === selection.hiringNeedId)
    && (!selection.focus || j.recordIds[selection.focus.kind] === selection.focus.id))
    .sort((a, b) => (Date.parse(b.sortDate) || 0) - (Date.parse(a.sortDate) || 0) || a.key.localeCompare(b.key));
}
