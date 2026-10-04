export const MICRO_CERT_STATUSES = [
  "draft",
  "in_production",
  "review",
  "ready",
  "live",
  "archived",
] as const;

export type MicroCertStatus = (typeof MICRO_CERT_STATUSES)[number];

export const LESSON_STATUSES = [
  "draft",
  "ready",
  "published",
  "archived",
] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const LESSON_BLOCK_TYPES = [
  "text",
  "rich_text",
  "heading",
  "list",
  "callout",
  "safety_note",
  "image",
  "video",
  "audio",
  "document",
  "link",
  "embed",
  "divider",
  "button",
  "download",
  "accordion",
  "columns",
] as const;
export type LessonBlockType = (typeof LESSON_BLOCK_TYPES)[number];

export type MicroCertEligibility = {
  eligibilityId?: string;
  institutionId?: string | null;
  cohortId?: string | null;
  tradeId?: string | null;
  programName?: string | null;
  active?: boolean;
};

export type MicroCertInput = {
  title?: string;
  description?: string | null;
  active?: boolean;
  status?: MicroCertStatus;
  learningObjective?: string | null;
  contentType?: string;
  contentUrl?: string | null;
  equipmentProcessContext?: string | null;
  safetyNotes?: string | null;
  durationMinutes?: number | null;
  passingRequirement?: Record<string, unknown>;
  companyBadgeId?: string | null;
  eligibility?: MicroCertEligibility[];
};

export type MicroCertBadgeSummary = {
  companyBadgeId: string;
  title: string;
  active?: boolean;
  version: number;
  description?: string | null;
  criteria?: Record<string, unknown>;
  expiresAfterDays?: number | null;
};

export type MicroCertVersion = {
  microCertVersionId: string;
  versionNumber: number;
  status: MicroCertStatus;
  learningObjective: string | null;
  contentType: string;
  contentUrl: string | null;
  equipmentProcessContext: string | null;
  safetyNotes: string | null;
  durationMinutes: number | null;
  passingRequirement: Record<string, unknown>;
  companyBadgeId: string | null;
  certificationDefinitionId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployerMicroCertSummary = {
  microCertId: string;
  employerId: string;
  title: string;
  description: string | null;
  active: boolean;
  currentVersionId: string;
  versionNumber: number;
  status: MicroCertStatus;
  learningObjective: string | null;
  contentType: string;
  contentUrl: string | null;
  durationMinutes: number | null;
  passingRequirement: Record<string, unknown>;
  companyBadge: MicroCertBadgeSummary | null;
  eligibility: MicroCertEligibility[];
  assignmentCount: number;
  completedCount: number;
  completionRate: number;
  createdAt: string;
  updatedAt: string;
};

export type EmployerMicroCertDetail = {
  microCertId: string;
  employerId: string;
  title: string;
  description: string | null;
  active: boolean;
  currentVersionId: string;
  currentVersion: MicroCertVersion;
  versions: MicroCertVersion[];
  eligibility: MicroCertEligibility[];
  companyBadge: MicroCertBadgeSummary | null;
  metrics: {
    assignmentCount: number;
    completedCount: number;
    completionRate: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type EmployerLearningBlockContent = {
  text?: string;
  url?: string;
  caption?: string;
  alt?: string;
  [key: string]: unknown;
};

export type EmployerLearningLessonBlock = {
  lessonBlockId: string;
  lessonId: string;
  sequence: number;
  blockType: LessonBlockType;
  title: string | null;
  content: EmployerLearningBlockContent;
  required: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployerLearningCourseSection = {
  sectionId: string;
  microCertVersionId: string;
  sequence: number;
  title: string;
  description: string | null;
  required: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployerLearningLesson = {
  lessonId: string;
  microCertVersionId: string;
  sectionId: string | null;
  sequence: number;
  title: string;
  description: string | null;
  learningObjective: string | null;
  estimatedMinutes: number | null;
  required: boolean;
  status: LessonStatus;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  blocks: EmployerLearningLessonBlock[];
};

export type EmployerMicroCertAuthoringDetail = EmployerMicroCertDetail & {
  sections: EmployerLearningCourseSection[];
  lessons: EmployerLearningLesson[];
};

export type EmployerLearningReusableBlock = {
  reusableBlockId: string;
  title: string;
  blockType: LessonBlockType;
  content: EmployerLearningBlockContent;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployerLearningLessonTemplate = {
  lessonTemplateId: string;
  title: string;
  description: string | null;
  snapshot: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployerLearningReusableLibrary = {
  blocks: EmployerLearningReusableBlock[];
  lessonTemplates: EmployerLearningLessonTemplate[];
};

export type EmployerLearningLessonInput = {
  title?: string;
  description?: string | null;
  learningObjective?: string | null;
  estimatedMinutes?: number | null;
  required?: boolean;
  status?: Extract<LessonStatus, "draft" | "ready">;
  sectionId?: string | null;
};

export type EmployerLearningBlockInput = {
  blockType?: LessonBlockType;
  title?: string | null;
  content?: EmployerLearningBlockContent;
  required?: boolean;
};


export const EMPLOYER_LEARNING_CHECKPOINT_TYPES = [
  "acknowledgement",
  "confirmation",
  "reflection",
] as const;
export type EmployerLearningCheckpointType =
  (typeof EMPLOYER_LEARNING_CHECKPOINT_TYPES)[number];

export type EmployerLearningCheckpoint = {
  checkpointId: string;
  microCertVersionId: string;
  sequence: number;
  title: string | null;
  prompt: string;
  checkpointType: EmployerLearningCheckpointType;
  config: Record<string, unknown>;
  required: boolean;
  weight: number;
  createdAt: string;
  updatedAt: string;
};

export type EmployerLearningCheckpointInput = {
  title?: string | null;
  prompt?: string;
  checkpointType?: EmployerLearningCheckpointType;
  config?: Record<string, unknown>;
  required?: boolean;
  weight?: number;
};

export type EmployerLearningPassingRequirement = {
  completionRuleVersion: 1;
  checkpointMode: "all_required" | "weighted_percent";
  minimumCheckpointPercent: number;
  requireAllRequiredLessons: boolean;
  requireAllRequiredAssessments: boolean;
};

export type EmployerLearningAssessmentSummary = {
  assessmentId: string;
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
  questionCount: number;
  createdAt: string;
  updatedAt: string;
};


export const EMPLOYER_LEARNING_ASSESSMENT_TYPES = [
  "checkpoint",
  "lesson_quiz",
  "final_assessment",
] as const;
export type EmployerLearningAssessmentType =
  (typeof EMPLOYER_LEARNING_ASSESSMENT_TYPES)[number];

export const EMPLOYER_LEARNING_QUESTION_TYPES = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "acknowledgement",
  "numeric",
] as const;
export type EmployerLearningQuestionType =
  (typeof EMPLOYER_LEARNING_QUESTION_TYPES)[number];

export type EmployerLearningChoiceOption = {
  id: string;
  label: string;
};

export type EmployerLearningAssessmentQuestion = {
  questionId: string;
  assessmentId: string;
  sequence: number;
  questionType: EmployerLearningQuestionType;
  prompt: string;
  options: EmployerLearningChoiceOption[];
  answerKey: Record<string, unknown>;
  points: number;
  required: boolean;
  feedbackCorrect: string | null;
  feedbackIncorrect: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployerLearningAssessmentAuthoringDetail = {
  assessmentId: string;
  microCertVersionId: string;
  lessonId: string | null;
  sequence: number;
  title: string;
  description: string | null;
  assessmentType: EmployerLearningAssessmentType;
  passingScore: number;
  maxAttempts: number | null;
  required: boolean;
  randomizeQuestions: boolean;
  showFeedback: boolean;
  config: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  questions: EmployerLearningAssessmentQuestion[];
};

export type EmployerLearningAssessmentInput = Partial<{
  lessonId: string | null;
  title: string;
  description: string | null;
  assessmentType: EmployerLearningAssessmentType;
  passingScore: number;
  maxAttempts: number | null;
  required: boolean;
  randomizeQuestions: boolean;
  showFeedback: boolean;
  config: Record<string, unknown>;
}>;

export type EmployerLearningAssessmentQuestionInput = Partial<{
  questionType: EmployerLearningQuestionType;
  prompt: string;
  options: EmployerLearningChoiceOption[];
  answerKey: Record<string, unknown>;
  points: number;
  required: boolean;
  feedbackCorrect: string | null;
  feedbackIncorrect: string | null;
}>;

export type EmployerLearningStudentAssessmentQuestion = {
  questionId: string;
  sequence: number;
  questionType: EmployerLearningQuestionType;
  prompt: string;
  options: EmployerLearningChoiceOption[];
  points: number;
  required: boolean;
};

export type EmployerLearningStudentAssessment = {
  assessmentId: string;
  microCertVersionId: string;
  lessonId: string | null;
  sequence: number;
  title: string;
  description: string | null;
  assessmentType: EmployerLearningAssessmentType;
  passingScore: number;
  maxAttempts: number | null;
  required: boolean;
  randomizeQuestions: boolean;
  showFeedback: boolean;
  questions: EmployerLearningStudentAssessmentQuestion[];
};

export type EmployerLearningAssessmentScoreResult = {
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

export type EmployerLearningCertificationSummary = {
  certificationDefinitionId: string;
  title: string;
  description: string | null;
  criteria: Record<string, unknown>;
  version: number;
  active: boolean;
  expiresAfterDays: number | null;
};

export type EmployerLearningResourceSummary = {
  primaryContentType: string;
  primaryContentUrl: string | null;
  resources: Array<{
    lessonId: string;
    lessonTitle: string;
    lessonBlockId: string;
    blockType: LessonBlockType;
    title: string | null;
    url: string;
  }>;
};

export type EmployerMicroCertModuleDetail = EmployerMicroCertAuthoringDetail & {
  checkpoints: EmployerLearningCheckpoint[];
  assessmentSummary: EmployerLearningAssessmentSummary[];
  certification: EmployerLearningCertificationSummary | null;
  resourceSummary: EmployerLearningResourceSummary;
};


export const EMPLOYER_LEARNING_MEDIA_KINDS = [
  "image",
  "video",
  "audio",
  "document",
] as const;

export type EmployerLearningMediaKind =
  (typeof EMPLOYER_LEARNING_MEDIA_KINDS)[number];

export type EmployerLearningMediaAsset = {
  mediaAssetId: string;
  employerId: string;
  bucketId: string;
  storagePath: string;
  originalFilename: string;
  displayName: string;
  mediaKind: EmployerLearningMediaKind;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  status: "pending" | "ready" | "failed" | "deleted";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  contentUrl?: string;
  downloadUrl?: string;
};

export type EmployerLearningMediaReserveInput = {
  filename: string;
  displayName?: string | null;
  mediaKind: EmployerLearningMediaKind;
  mimeType: string;
  sizeBytes: number;
  metadata?: Record<string, unknown>;
};


export type EmployerCompanyBadgeCriteria = {
  criteriaVersion: 1;
  evidenceType: "micro_cert_completion";
  requiredOutcome: "passed";
};

export type EmployerCompanyBadgeDefinition = {
  companyBadgeId: string;
  employerId: string;
  title: string;
  description: string | null;
  criteria: EmployerCompanyBadgeCriteria;
  version: number;
  active: boolean;
  expiresAfterDays: number | null;
  locked: boolean;
  linkedVersionCount: number;
  awardCount: number;
  activeAwardCount: number;
  createdAt: string;
  updatedAt: string;
};

export type EmployerCompanyBadgeAward = {
  companyBadgeAwardId: string;
  companyBadgeId: string;
  badgeTitle: string;
  badgeVersion: number;
  studentId: string;
  employerId: string;
  evidenceType: "micro_cert_completion";
  evidenceId: string;
  completionId: string;
  microCertId: string;
  microCertVersionId: string;
  courseTitle: string | null;
  versionNumber: number | null;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  status: "active" | "expired" | "revoked";
  metadata: Record<string, unknown>;
};

export type EmployerCompanyBadgeInput = {
  title?: string;
  description?: string | null;
  criteria?: EmployerCompanyBadgeCriteria;
  expiresAfterDays?: number | null;
  active?: boolean;
};


export type EmployerCertificationCriteria = {
  criteriaVersion: 1;
  evidenceType: "micro_cert_completion";
  requiredOutcome: "passed";
};

export type EmployerCertificationDefinition = {
  certificationDefinitionId: string;
  employerId: string;
  microCertId: string;
  courseTitle: string;
  title: string;
  description: string | null;
  criteria: EmployerCertificationCriteria;
  version: number;
  active: boolean;
  expiresAfterDays: number | null;
  locked: boolean;
  linkedVersionCount: number;
  awardCount: number;
  activeAwardCount: number;
  createdAt: string;
  updatedAt: string;
};

export type EmployerCertificationAward = {
  certificationAwardId: string;
  credentialId: string;
  certificationDefinitionId: string;
  certificationTitle: string;
  certificationVersion: number;
  studentId: string;
  studentName: string;
  employerId: string;
  issuerName: string;
  microCertId: string;
  courseTitle: string;
  microCertVersionId: string;
  courseVersionNumber: number;
  assignmentId: string;
  completionId: string;
  status: "active" | "expired" | "revoked";
  canonicalStatus: "active" | "revoked";
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  evidence: Record<string, unknown>;
  verificationMetadata: Record<string, unknown>;
};

export type EmployerCertificationInput = {
  title?: string;
  description?: string | null;
  criteria?: EmployerCertificationCriteria;
  expiresAfterDays?: number | null;
  active?: boolean;
};

export type EmployerCertificationVerification = {
  found: boolean;
  credentialId: string;
  certificationAwardId?: string;
  status?: "active" | "expired" | "revoked";
  canonicalStatus?: "active" | "revoked";
  issuedAt?: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  revokeReason?: string | null;
  issuer?: {
    employerId: string;
    name: string;
  };
  learner?: {
    studentId: string;
    name: string;
  };
  certification?: {
    certificationDefinitionId: string;
    title: string;
    description: string | null;
    definitionVersion: number;
  };
  course?: {
    microCertId: string;
    title: string;
    microCertVersionId: string;
    versionNumber: number;
  };
  evidence?: {
    assignmentId: string;
    completionId: string;
    evidenceType: "micro_cert_completion";
    evidenceCategory: "employer_training";
    technicalSkillVerified: false;
    snapshot: Record<string, unknown>;
  };
  verification?: {
    verificationVersion: number;
    issuanceDigest: string | null;
    digestValid: boolean;
    algorithm: "SHA-256";
    metadata: Record<string, unknown>;
  };
};
export type LearningPublicPageSettings = {
  slug: string; canonicalPath?: string; visibility: "public" | "private";
  publicationStatus: "draft" | "published" | "unpublished"; robotsIndex: boolean;
  seoTitle?: string | null; metaDescription?: string | null;
};
export type LearningPublicSettings = {
  employerSlug: string | null; employerPublished: boolean | null; course: LearningPublicPageSettings | null;
  lessons: Array<LearningPublicPageSettings & { lessonId: string }>;
};
export type LearningPublicSettingsInput = Omit<LearningPublicPageSettings, "slug"> & {
  employerSlug: string; publishEmployerPage: boolean; courseSlug: string; expectedCurrentVersionId: string;
  lessons: Array<LearningPublicPageSettings & { lessonId: string }>;
};
