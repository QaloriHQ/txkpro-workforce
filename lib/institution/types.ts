export type InstitutionLearningScope = {
  scopeType: "institution" | "program" | "cohort";
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
  assignedByUserId: string | null;
  assignedByName: string | null;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  assignedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  metadata: Record<string, unknown>;
  latestCompletion: {
    completionId: string;
    attemptNumber: number;
    outcome: string;
    score: number | null;
    completedAt: string;
  } | null;
};
