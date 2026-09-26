export type StudentContext = {
  authUserId: string;
  legacyUserId: string;
  studentId: string;
  email: string | null;
  firstName: string;
  lastName: string;
};

export type StudentInterview = {
  interviewRequestId: string;
  employerId: string;
  employerName: string;
  roleTitle: string;
  tradeId: string | null;
  message: string | null;
  schedulingUrl: string | null;
  status:
    | "draft"
    | "sent"
    | "accepted"
    | "declined"
    | "scheduling"
    | "scheduled"
    | "completed"
    | "cancelled"
    | "expired"
    | "no_response";
  sentAt: string | null;
  respondedAt: string | null;
  scheduledFor: string | null;
  interviewFormat: string | null;
  locationDetail: string | null;
  placementId: string | null;
  placementStatus: "pending_start" | "active" | "ended" | "unknown" | null;
  hireDate: string | null;
  updatedAt: string;
};

export type StudentPlacement = {
  placementId: string;
  employerName: string;
  roleTitle: string;
  tradeId: string | null;
  hireDate: string;
  employmentType: string | null;
  status: "pending_start" | "active" | "ended" | "unknown";
};


export type StudentEmployerTrainingAssignmentStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

export type StudentEmployerTrainingProgress = {
  requiredItems: {
    completed: number;
    total: number;
    percent: number;
  };
  lessons: {
    completed: number;
    total: number;
    requiredCompleted: number;
    requiredTotal: number;
  };
  checkpoints: {
    completed: number;
    total: number;
    requiredCompleted: number;
    requiredTotal: number;
  };
  assessments: {
    passed: number;
    total: number;
    requiredPassed: number;
    requiredTotal: number;
  };
};

export type StudentEmployerTrainingAssignmentSummary = {
  assignmentId: string;
  status: StudentEmployerTrainingAssignmentStatus;
  assignedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  institutionId: string | null;
  cohortId: string | null;
  microCertId: string;
  microCertVersionId: string;
  versionNumber: number;
  versionStatus: string;
  employerId: string;
  employerName: string;
  title: string;
  description: string | null;
  learningObjective: string | null;
  durationMinutes: number | null;
  progress: StudentEmployerTrainingProgress | null;
};

export type StudentEmployerTrainingBlock = {
  lessonBlockId: string;
  lessonId: string;
  sequence: number;
  blockType:
    | "text"
    | "rich_text"
    | "heading"
    | "list"
    | "callout"
    | "safety_note"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "link"
    | "embed"
    | "divider"
    | "button"
    | "download"
    | "accordion"
    | "columns";
  title: string | null;
  content: Record<string, unknown>;
  required: boolean;
};

export type StudentEmployerTrainingLesson = {
  lessonId: string;
  sectionId: string | null;
  sequence: number;
  title: string;
  description: string | null;
  learningObjective: string | null;
  estimatedMinutes: number | null;
  required: boolean;
  status: "ready" | "published";
  startedAt: string | null;
  lastViewedAt: string | null;
  completedAt: string | null;
  blocks: StudentEmployerTrainingBlock[];
};

export type StudentEmployerTrainingSection = {
  sectionId: string;
  sequence: number;
  title: string;
  description: string | null;
  required: boolean;
};

export type StudentEmployerTrainingCheckpoint = {
  checkpointId: string;
  sequence: number;
  title: string | null;
  prompt: string;
  checkpointType: "acknowledgement" | "confirmation" | "reflection";
  config: Record<string, unknown>;
  required: boolean;
  weight: number;
  satisfied: boolean;
  latestResponse: {
    checkpointResponseId: string;
    attemptNumber: number;
    response: Record<string, unknown>;
    score: number | null;
    submittedAt: string;
  } | null;
};

export type StudentEmployerTrainingAssessmentSummary = {
  assessmentId: string;
  lessonId: string | null;
  sequence: number;
  title: string;
  description: string | null;
  assessmentType: "checkpoint" | "lesson_quiz" | "final_assessment";
  passingScore: number;
  maxAttempts: number | null;
  required: boolean;
  questionCount: number;
  eligibility: StudentEmployerTrainingAssessmentEligibility;
  latestAttempt: StudentEmployerTrainingAssessmentAttempt | null;
};

export type StudentEmployerTrainingRuntime = {
  assignment: {
    assignmentId: string;
    status: StudentEmployerTrainingAssignmentStatus;
    assignedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    institutionId: string | null;
    cohortId: string | null;
    microCertId: string;
    microCertVersionId: string;
  };
  course: {
    microCertId: string;
    title: string;
    description: string | null;
    employerId: string;
    employerName: string;
    microCertVersionId: string;
    versionNumber: number;
    versionStatus: string;
    learningObjective: string | null;
    durationMinutes: number | null;
    equipmentProcessContext: string | null;
    safetyNotes: string | null;
  };
  sections: StudentEmployerTrainingSection[];
  lessons: StudentEmployerTrainingLesson[];
  checkpoints: StudentEmployerTrainingCheckpoint[];
  assessments: StudentEmployerTrainingAssessmentSummary[];
  progress: StudentEmployerTrainingProgress;
};

export type StudentEmployerTrainingAssessmentEligibility = {
  assignmentId: string;
  assessmentId: string;
  microCertVersionId: string;
  allowed: boolean;
  reason:
    | "eligible"
    | "already_passed"
    | "attempt_in_progress"
    | "maximum_attempts_reached";
  attemptsUsed: number;
  maxAttempts: number | null;
  nextAttemptNumber: number;
  alreadyPassed: boolean;
  attemptInProgress: boolean;
};

export type StudentEmployerTrainingAssessmentAttempt = {
  assessmentAttemptId: string;
  attemptNumber: number;
  status: "in_progress" | "submitted" | "passed" | "not_passed" | "voided";
  score: number | null;
  startedAt: string;
  submittedAt: string | null;
};

export type StudentEmployerTrainingAssessmentQuestion = {
  questionId: string;
  sequence: number;
  questionType:
    | "single_choice"
    | "multiple_choice"
    | "true_false"
    | "acknowledgement"
    | "numeric";
  prompt: string;
  options: Array<{ id: string; label: string }>;
  points: number;
  required: boolean;
};

export type StudentEmployerTrainingAssessmentRuntime = {
  definition: {
    assessmentId: string;
    microCertVersionId: string;
    lessonId: string | null;
    sequence: number;
    title: string;
    description: string | null;
    assessmentType: "checkpoint" | "lesson_quiz" | "final_assessment";
    passingScore: number;
    maxAttempts: number | null;
    required: boolean;
    randomizeQuestions: boolean;
    showFeedback: boolean;
    questions: StudentEmployerTrainingAssessmentQuestion[];
  };
  eligibility: StudentEmployerTrainingAssessmentEligibility;
  currentAttempt: StudentEmployerTrainingAssessmentAttempt | null;
  attempts: StudentEmployerTrainingAssessmentAttempt[];
};

export type StudentEmployerTrainingAssessmentSubmitResult = {
  attempt: {
    assessmentAttemptId: string;
    attemptNumber: number;
    status: "passed" | "not_passed";
    score: number;
  };
  score: {
    assessmentId: string;
    valid: boolean;
    missingRequiredQuestionIds: string[];
    score: number;
    pointsEarned: number;
    pointsPossible: number;
    passed: boolean;
    passingScore: number;
    results: Array<{
      questionId: string;
      isCorrect: boolean;
      score: number;
      pointsPossible: number;
      feedback?: string | null;
    }>;
  };
  eligibility: StudentEmployerTrainingAssessmentEligibility;
  progress: StudentEmployerTrainingProgress;
};

export type StudentEmployerTrainingMediaAuthorization = {
  mediaAssetId: string;
  bucketId: string;
  storagePath: string;
  originalFilename: string;
  displayName: string;
  mediaKind: "image" | "video" | "audio" | "document";
  mimeType: string;
  extension: string;
  sizeBytes: number;
};
