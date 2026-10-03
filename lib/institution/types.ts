import type { StudentReadinessEvidence } from "@/lib/student/readiness";

export type InstitutionLearningScope = {
  scopeType: "institution" | "department" | "program" | "cohort";
  scopeId: string;
  role: string;
};

export type InstitutionAccessContext = {
  institutionId: string;
  institutionName: string;
  roles: string[];
  scopes: InstitutionLearningScope[];
};

export type InstitutionContext = InstitutionAccessContext & {
  authUserId: string;
  legacyUserId: string;
  email: string | null;
  firstName: string;
  lastName: string;
};

export type InstitutionLearningProgram = {
  programKey: string;
  programName: string;
  tradeId: string | null;
  cohortCount: number;
  studentCount: number;
};

export type InstitutionLearningCohort = {
  cohortId: string;
  name: string;
  programName: string | null;
  tradeId: string | null;
  term: string | null;
  graduationDate: string | null;
  status: string | null;
  studentCount: number;
  canAssign: boolean;
};

export type InstitutionLearningStudent = {
  studentId: string;
  displayName: string;
  cohortId: string;
  cohortName: string;
  programName: string | null;
  tradeId: string | null;
  graduationDate: string | null;
  profileStatus: string | null;
  canAssign: boolean;
};

export type InstitutionStudentDirectoryItem = {
  recordType: "student" | "invitation";
  studentId: string | null;
  membershipKey: string | null;
  userId: string | null;
  authUserId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  invitationStatus: string | null;
  invitationSource: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  profileStatus: string | null;
  availabilityStatus: string | null;
  programName: string | null;
  cohortId: string | null;
  cohortName: string | null;
  tradeId: string | null;
  graduationDate: string | null;
  verifiedSkillCount: number;
  selfAttestedSkillCount: number;
  inProgressSkillCount: number;
  employerTrainingCount: number;
  completedTrainingCount: number;
  activeTrainingCount: number;
  companyBadgeCount: number;
  referralCount: number;
  activeInterviewCount: number;
  placementCount: number;
  activePlacementCount: number;
  retentionMilestoneDueCount: number;
  openRetentionCaseCount: number;
  lastActivityAt: string | null;
};

export type InstitutionStudentDirectoryFilters = {
  query?: string | null;
  programName?: string | null;
  cohortId?: string | null;
  status?: string | null;
};

export type InstitutionStudentSkillEvidence = {
  studentSkillId: string;
  skillId: string;
  name: string;
  category: string | null;
  tradeId: string | null;
  status: string;
  provenance: string;
  evidenceClass: "verified" | "self_attested" | "in_progress";
  selfAttestedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
};

export type InstitutionStudentReferralEvidence = {
  referralId: string;
  employerId: string;
  employerName: string;
  hiringNeedId: string | null;
  status: string;
  referredAt: string | null;
  deliveredAt: string | null;
  viewedAt: string | null;
  closedAt: string | null;
};

export type InstitutionStudentInterviewEvidence = {
  interviewRequestId: string;
  referralId: string | null;
  hiringNeedId: string | null;
  employerId: string;
  employerName: string;
  roleTitle: string | null;
  tradeId: string | null;
  status: string;
  sentAt: string | null;
  respondedAt: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  interviewFormat: string | null;
};

export type InstitutionStudentPlacementEvidence = {
  placementId: string;
  referralId: string | null;
  interviewRequestId: string | null;
  hiringNeedId: string | null;
  employerId: string;
  employerName: string;
  roleTitle: string | null;
  employmentType: string | null;
  status: string;
  hireDate: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

export type InstitutionStudentRetentionMilestone = {
  milestoneId: string;
  placementId: string;
  employerName: string;
  roleTitle: string | null;
  dayNumber: number;
  scheduledFor: string;
  status: string;
  sentAt: string | null;
  responseReceivedAt: string | null;
};

export type InstitutionStudentRetentionCase = {
  caseId: string;
  placementId: string;
  milestoneId: string;
  employerName: string;
  roleTitle: string | null;
  severity: string;
  status: string;
  openedAt: string;
  resolvedAt: string | null;
  resolutionCode: string | null;
};

export type InstitutionStudentActivityItem = {
  activityType:
    | "employer_training"
    | "referral"
    | "interview"
    | "placement"
    | "retention";
  title: string;
  status: string;
  occurredAt: string;
  sourceId: string;
};

export type InstitutionStudentProfile = {
  student: {
    studentId: string;
    userId: string | null;
    authUserId: string | null;
    displayName: string;
    email: string | null;
    phone: string | null;
    membershipKey: string | null;
    invitationStatus: string | null;
    invitationSource: string | null;
    acceptedAt: string | null;
    programName: string | null;
    cohortId: string | null;
    cohortName: string | null;
    tradeId: string | null;
    graduationDate: string | null;
    profileStatus: string | null;
    availabilityStatus: string | null;
    discoverabilityStatus: string | null;
    institutionValidationStatus: string | null;
  };
  technicalSkills: InstitutionStudentSkillEvidence[];
  readinessEvidence: StudentReadinessEvidence;
  employerTraining: InstitutionMicroCertAssignment[];
  referrals: InstitutionStudentReferralEvidence[];
  interviews: InstitutionStudentInterviewEvidence[];
  placements: InstitutionStudentPlacementEvidence[];
  retention: {
    milestones: InstitutionStudentRetentionMilestone[];
    cases: InstitutionStudentRetentionCase[];
  };
  activity: InstitutionStudentActivityItem[];
};

export type InstitutionLearningCourse = {
  microCertId: string;
  employerId: string;
  employerName: string;
  title: string;
  description: string | null;
  microCertVersionId: string;
  versionNumber: number;
  status: "ready" | "live";
  learningObjective: string | null;
  durationMinutes: number | null;
  contentType: string;
  companyBadge: {
    companyBadgeId: string;
    title: string;
    version: number;
  } | null;
  eligibleStudentCount: number;
  activeAssignmentCount: number;
};

export type InstitutionEmployerLearningContext = {
  institution: {
    institutionId: string;
    name: string;
    shortName: string | null;
    city: string | null;
    state: string | null;
  };
  canAssign: boolean;
  programs: InstitutionLearningProgram[];
  cohorts: InstitutionLearningCohort[];
  students: InstitutionLearningStudent[];
  courses: InstitutionLearningCourse[];
};

export type InstitutionProgramCohortMetrics = {
  studentCount: number;
  profileCompleteCount: number;
  verifiedSkillCount: number;
  assignmentCount: number;
  completedAssignmentCount: number;
  inProgressAssignmentCount: number;
  referralCount: number;
  openReferralCount: number;
  placementCount: number;
  activePlacementCount: number;
  retentionMilestoneCount: number;
  openRetentionCaseCount: number;
};

export type InstitutionProgramManagementProgram =
  InstitutionProgramCohortMetrics & {
    programKey: string;
    programName: string;
    tradeId: string | null;
    cohortCount: number;
    activeCohortCount: number;
    lastActivityAt: string | null;
    canManage: boolean;
  };

export type InstitutionProgramManagementStudent = {
  studentId: string;
  displayName: string;
  profileStatus: string | null;
  verifiedSkillCount: number;
  assignmentCount: number;
  referralCount: number;
  placementCount: number;
};

export type InstitutionProgramManagementCohort =
  InstitutionProgramCohortMetrics & {
    cohortId: string;
    name: string;
    programKey: string | null;
    programName: string | null;
    tradeId: string | null;
    term: string | null;
    graduationDate: string | null;
    status: string;
    students: InstitutionProgramManagementStudent[];
    canManage: boolean;
  };

export type InstitutionProgramCohortManagement = {
  programs: InstitutionProgramManagementProgram[];
  cohorts: InstitutionProgramManagementCohort[];
};

export type InstitutionCohortUpsertInput = {
  cohortId?: string | null;
  name: string;
  programName?: string | null;
  tradeId?: string | null;
  term?: string | null;
  graduationDate?: string | null;
  status?: string | null;
};

export type InstitutionAssignmentTargetType =
  | "program"
  | "cohort"
  | "students";

export type InstitutionAssignmentPreviewStudent = {
  studentId: string;
  displayName: string;
  cohortId: string;
  cohortName: string;
  programName: string | null;
  eligible: boolean;
  activeAssignmentId: string | null;
};

export type InstitutionAssignmentPreview = {
  course: {
    microCertId: string;
    microCertVersionId: string;
    versionNumber: number;
    status: "ready" | "live";
    employerId: string;
    employerName: string;
    title: string;
  };
  targetType: InstitutionAssignmentTargetType;
  programKey: string | null;
  cohortId: string | null;
  students: InstitutionAssignmentPreviewStudent[];
};

export type InstitutionAssignmentInput = {
  microCertId: string;
  targetType: InstitutionAssignmentTargetType;
  programKey?: string | null;
  cohortId?: string | null;
  studentIds?: string[];
  notifyStudents?: boolean;
};

export type InstitutionAssignmentResult = {
  assignmentRequestId: string;
  course: InstitutionAssignmentPreview["course"];
  targetType: InstitutionAssignmentTargetType;
  createdCount: number;
  skippedCount: number;
  notificationCount: number;
  notificationsDeferred: boolean;
  created: Array<{
    assignmentId: string;
    studentId: string;
    studentName: string;
    cohortId: string;
    eventId: string;
  }>;
  skipped: Array<{
    studentId: string;
    assignmentId?: string;
    reason: "not_eligible" | "already_assigned";
  }>;
};

export type InstitutionTrainingProgress = {
  rule: {
    completionRuleVersion: 1;
    checkpointMode: "all_required" | "weighted_percent";
    minimumCheckpointPercent: number;
    requireAllRequiredLessons: boolean;
    requireAllRequiredAssessments: boolean;
  };
  lessons: {
    passed: boolean;
    gateEnabled: boolean;
    requiredTotal: number;
    requiredCompleted: number;
    requiredLessonIds: string[];
    completedRequiredLessonIds: string[];
  };
  checkpoints: {
    mode: "all_required" | "weighted_percent";
    passed: boolean;
    percent: number;
    weightTotal: number;
    requiredTotal: number;
    minimumPercent: number;
    weightSatisfied: number;
    requiredSatisfied: number;
    requiredCheckpointIds: string[];
    satisfiedRequiredCheckpointIds: string[];
  };
  assessments: {
    passed: boolean;
    gateEnabled: boolean;
    requiredTotal: number;
    requiredPassed: number;
    requiredExhausted: number;
    requiredInProgress: number;
    requiredAssessmentIds: string[];
    passedRequiredAssessmentIds: string[];
    exhaustedRequiredAssessmentIds: string[];
  };
  assignmentId: string;
  assignmentStatus: "assigned" | "in_progress" | "completed" | "cancelled";
  microCertId: string;
  microCertVersionId: string;
  versionNumber: number;
  versionStatus: string;
  blockedReasons: string[];
  eligibleForCompletion: boolean;
  completionId: string | null;
  outcome: "passed" | null;
  evidenceCategory: "employer_training";
  technicalSkillVerified: false;
};

export type InstitutionCompanyBadgeSummary = {
  companyBadgeId: string;
  title: string;
  version: number;
  active: boolean;
  expiresAfterDays: number | null;
};

export type InstitutionCompanyBadgeAwardSummary = {
  companyBadgeAwardId: string;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
};

export type InstitutionMicroCertAssignment = {
  assignmentId: string;
  microCertId: string;
  microCertVersionId: string;
  courseTitle: string;
  versionNumber: number;
  courseStatus: string;
  employerId: string;
  employerName: string;
  studentId: string;
  studentName: string;
  institutionId: string;
  cohortId: string | null;
  cohortName: string | null;
  programName: string | null;
  tradeId: string | null;
  assignedByUserId: string | null;
  assignedByName: string | null;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  assignedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  lastActivityAt: string | null;
  metadata: Record<string, unknown>;
  progress: InstitutionTrainingProgress;
  latestCompletion: {
    completionId: string;
    attemptNumber: number;
    outcome: string;
    score: number | null;
    completedAt: string;
  } | null;
  companyBadge: InstitutionCompanyBadgeSummary | null;
  companyBadgeAward: InstitutionCompanyBadgeAwardSummary | null;
};

export type InstitutionAssignmentFilters = {
  status?: string | null;
  studentId?: string | null;
  query?: string | null;
  employerId?: string | null;
  microCertId?: string | null;
  programName?: string | null;
  cohortId?: string | null;
  companyBadgeId?: string | null;
};

export type InstitutionAssignmentDetail = {
  assignment: InstitutionMicroCertAssignment;
  lessons: Array<{
    lessonId: string;
    title: string;
    sequenceNo: number;
    required: boolean;
    estimatedMinutes: number | null;
    status: string;
    startedAt: string | null;
    lastViewedAt: string | null;
    completedAt: string | null;
  }>;
  checkpoints: Array<{
    checkpointId: string;
    title: string;
    sequenceNo: number;
    required: boolean;
    weight: number;
    satisfied: boolean;
    latestScore: number | null;
    submittedAt: string | null;
  }>;
  assessments: Array<{
    assessmentId: string;
    title: string;
    assessmentType: string;
    sequenceNo: number;
    required: boolean;
    passingScore: number;
    maxAttempts: number | null;
    attemptCount: number;
    passed: boolean;
    latestAttempt: {
      attemptNumber: number;
      status: string;
      score: number | null;
      startedAt: string;
      submittedAt: string | null;
      gradedAt: string | null;
    } | null;
  }>;
  notifications: Array<{
    notificationId: string;
    eventType: string;
    channel: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  activity: Array<{
    eventType: string;
    targetType: string;
    result: string;
    createdAt: string;
  }>;
};

export type InstitutionCompanyBadgeEvidence = {
  companyBadgeId: string;
  title: string;
  description: string | null;
  version: number;
  active: boolean;
  expiresAfterDays: number | null;
  employerId: string;
  employerName: string;
  linkedCourses: Array<{
    microCertId: string;
    title: string;
    microCertVersionId: string;
    versionNumber: number;
    status: string;
  }>;
  awards: Array<{
    companyBadgeAwardId: string;
    studentId: string;
    studentName: string;
    microCertId: string | null;
    microCertVersionId: string | null;
    issuedAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    status: "active" | "expired" | "revoked";
    evidenceType: string;
    evidenceId: string;
  }>;
};

export type InstitutionWorkforceSummary = {
  activeStudents: number;
  profileCompleteStudents: number;
  profileCompletionPercent: number;
  verifiedSkills: number;
  verifiedSkillsLast30Days: number;
  totalReferrals: number;
  openReferrals: number;
  referralsLast30Days: number;
  totalInterviews: number;
  activeInterviews: number;
  completedInterviews: number;
  totalHires: number;
  activePlacements: number;
  retentionMilestonesDue: number;
  retentionMilestonesCompleted: number;
  retentionMilestoneCompletionPercent: number;
  openRetentionCases: number;
  urgentRetentionCases: number;
  availableCourses: number;
  totalAssignments: number;
  companyBadgesEarned: number;
  cancelledAssignments: number;
  completedAssignments: number;
  inProgressAssignments: number;
  notStartedAssignments: number;
  assessmentExhaustedAssignments: number;
};

export type InstitutionStudentReadinessSummary = {
  student: {
    studentId: string;
    displayName: string;
    programName: string | null;
    cohortId: string | null;
    cohortName: string | null;
    graduationDate: string | null;
    profileStatus: string | null;
    availabilityStatus: string | null;
  };
  verifiedSkills: Array<{
    studentSkillId: string;
    skillId: string;
    name: string;
    category: string | null;
    tradeId: string | null;
    verifiedAt: string | null;
    provenance: string | null;
  }>;
  employerTraining: InstitutionMicroCertAssignment[];
  companyBadges: Array<{
    companyBadgeAwardId: string;
    companyBadgeId: string;
    title: string;
    employerName: string;
    issuedAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    status: "active" | "expired" | "revoked";
    evidenceType: string;
    evidenceId: string;
    microCertVersionId: string | null;
  }>;
  interviews: Array<{
    interviewRequestId: string;
    employerId: string;
    employerName: string;
    roleTitle: string | null;
    status: string;
    scheduledFor: string | null;
    interviewFormat: string | null;
  }>;
  placements: Array<{
    placementId: string;
    employerId: string;
    employerName: string;
    roleTitle: string | null;
    employmentType: string | null;
    status: string;
    hireDate: string | null;
    startedAt: string | null;
  }>;
};

export type InstitutionReferralStatus =
  | "draft"
  | "referred"
  | "delivered"
  | "viewed"
  | "interview_requested"
  | "interview_accepted"
  | "interview_declined"
  | "hired"
  | "closed"
  | "expired";

export type InstitutionReferralConsent = {
  allowed: boolean;
  status: string;
  source: string;
};

export type InstitutionReferralCreateStudent = {
  studentId: string;
  displayName: string;
  programName: string | null;
  cohortId: string | null;
  cohortName: string | null;
  primaryTradeId: string | null;
  profileStatus: string | null;
  referralConsent: InstitutionReferralConsent;
};

export type InstitutionReferralEmployer = {
  employerId: string;
  employerName: string;
};

export type InstitutionReferralHiringNeed = {
  hiringNeedId: string;
  employerId: string;
  employerName: string;
  title: string;
  tradeId: string | null;
  roleType: string | null;
  targetHires: number | null;
  workTypes: unknown[];
  shifts: unknown[];
  requiredVerifiedSkills: unknown[];
  optionalVerifiedSkills: unknown[];
};

export type InstitutionReferralCreateContext = {
  students: InstitutionReferralCreateStudent[];
  employers: InstitutionReferralEmployer[];
  hiringNeeds: InstitutionReferralHiringNeed[];
};

export type InstitutionReferralSummary = {
  referralId: string;
  studentId: string;
  studentName: string;
  employerId: string;
  employerName: string | null;
  institutionId: string;
  institutionName: string | null;
  program: string | null;
  cohortId: string | null;
  cohortName: string | null;
  primaryTradeId: string | null;
  hiringNeedId: string | null;
  hiringNeedTitle: string | null;
  status: InstitutionReferralStatus;
  institutionSharedNote: string | null;
  referralConsentStatus: string | null;
  referralConsentSource: string | null;
  referralNotePolicy: string | null;
  referralNoteVisibility: string | null;
  referredAt: string | null;
  deliveredAt: string | null;
  viewedAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  latestInterviewStatus: string | null;
  placementStatus: string | null;
};

export type InstitutionReferralInterview = {
  interviewRequestId: string;
  employerId: string;
  employerName: string;
  roleTitle: string | null;
  status: string;
  scheduledFor: string | null;
  interviewFormat: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  completedAt: string | null;
};

export type InstitutionReferralPlacement = {
  placementId: string;
  employerId: string;
  employerName: string;
  roleTitle: string | null;
  tradeId: string | null;
  employmentType: string | null;
  status: string;
  hireDate: string | null;
  startedAt: string | null;
};

export type InstitutionReferralDetail = InstitutionReferralSummary & {
  technicalSnapshot: Record<string, unknown>;
  professionalSnapshot: Record<string, unknown>;
  operationalSnapshot: Record<string, unknown>;
  companyTrainingSnapshot: Record<string, unknown> | null;
  referralConsentCheckedAt: string | null;
  interviews: InstitutionReferralInterview[];
  placements: InstitutionReferralPlacement[];
};

export type InstitutionReferralCreateInput = {
  studentId: string;
  employerId: string;
  hiringNeedId?: string | null;
  note?: string | null;
};

export type InstitutionReferralCreateResult = {
  referralId: string;
  status: InstitutionReferralStatus;
  referralConsent: InstitutionReferralConsent;
  notePolicy: string | null;
};

export type InstitutionEmployerDirectoryItem = {
  employerId: string;
  employerName: string;
  approvalStatus: string;
  accountStatus: string;
  city: string | null;
  state: string | null;
  website: string | null;
  foundingPartnerStatus: string | null;
  tradeIds: unknown[];
  hiringNeedCount: number;
  microCertCount: number;
  referralCount: number;
  activeReferralCount: number;
  placementCount: number;
  activePlacementCount: number;
  retentionCaseCount: number;
  openRetentionCaseCount: number;
  exposureEventCount: number;
  lastActivityAt: string | null;
};

export type InstitutionEmployerHiringNeed = {
  hiringNeedId: string;
  title: string;
  tradeId: string | null;
  roleType: string | null;
  targetHires: number;
  targetHireDate: string | null;
  workTypes: unknown[];
  shifts: unknown[];
  requiredVerifiedSkills: unknown[];
  optionalVerifiedSkills: unknown[];
  minimumVerifiedSkillCount: number;
  requiresDriversLicense: boolean;
  requiresDrivingRecordAttestation: boolean;
  requiresBackgroundWillingness: boolean;
  requiresDrugScreenWillingness: boolean;
  sharedNotes: string | null;
  status: string;
  updatedAt: string | null;
};

export type InstitutionEmployerMicroCert = {
  microCertId: string;
  title: string;
  description: string | null;
  microCertVersionId: string;
  versionNumber: number;
  status: "ready" | "live";
  learningObjective: string | null;
  contentType: string;
  durationMinutes: number | null;
  companyBadge: InstitutionCompanyBadgeSummary | null;
  eligibleStudentCount: number;
  assignmentCount: number;
  completedCount: number;
};

export type InstitutionEmployerReferral = {
  referralId: string;
  studentId: string;
  studentName: string;
  program: string | null;
  cohortName: string | null;
  hiringNeedId: string | null;
  hiringNeedTitle: string | null;
  status: InstitutionReferralStatus;
  referralConsentStatus: string | null;
  referredAt: string | null;
  updatedAt: string | null;
};

export type InstitutionEmployerPlacement = {
  placementId: string;
  studentId: string;
  studentName: string;
  roleTitle: string | null;
  tradeId: string | null;
  employmentType: string | null;
  status: string;
  hireDate: string | null;
  startedAt: string | null;
};

export type InstitutionEmployerRetentionMilestone = {
  milestoneId: string;
  placementId: string;
  dayNumber: number;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  responseReceivedAt: string | null;
};

export type InstitutionEmployerRetentionCase = {
  caseId: string;
  placementId: string;
  milestoneId: string;
  severity: string;
  status: string;
  summary: string | null;
  openedAt: string;
  resolvedAt: string | null;
  resolutionCode: string | null;
};

export type InstitutionEmployerExposureEvent = {
  exposureEventId: string;
  studentId: string;
  eventType: string;
  sourceType: string;
  sourceId: string | null;
  microCertId: string | null;
  assignmentId: string | null;
  occurredAt: string;
};

export type InstitutionEmployerDetail = Pick<
  InstitutionEmployerDirectoryItem,
  | "employerId"
  | "employerName"
  | "approvalStatus"
  | "accountStatus"
  | "city"
  | "state"
  | "website"
  | "foundingPartnerStatus"
  | "tradeIds"
> & {
  description: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  county: string | null;
  dispatchRadiusMiles: number | null;
  serviceArea: Record<string, unknown>;
  hiringRoles: unknown[];
  annualHiringVolume: number | null;
  hiringHorizon: string | null;
  workforceDescription: string | null;
  talentScopes: Array<{
    talentScopeId: string;
    institutionId: string | null;
    cohortId: string | null;
    cohortName: string | null;
    tradeId: string | null;
    programName: string | null;
    startsAt: string | null;
    endsAt: string | null;
  }>;
  hiringNeeds: InstitutionEmployerHiringNeed[];
  microCerts: InstitutionEmployerMicroCert[];
  referrals: InstitutionEmployerReferral[];
  placements: InstitutionEmployerPlacement[];
  retention: {
    milestones: InstitutionEmployerRetentionMilestone[];
    cases: InstitutionEmployerRetentionCase[];
  };
  exposure: InstitutionEmployerExposureEvent[];
};
