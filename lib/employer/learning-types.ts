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
