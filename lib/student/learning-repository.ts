import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  StudentEmployerTrainingAssignmentSummary,
  StudentEmployerTrainingAssessmentRuntime,
  StudentEmployerTrainingAssessmentSubmitResult,
  StudentEmployerTrainingMediaAuthorization,
  StudentEmployerTrainingRuntime,
} from "@/lib/student/types";

function learningError(error: { message?: string }) {
  const message =
    error.message ?? "Student Employer Training request failed.";

  if (
    /membership required|not found|cancelled|outside the assigned course version|not available for this assigned course version/i.test(
      message,
    )
  ) {
    throw new Response(message, { status: 404 });
  }

  if (/read-only|attempt not allowed|no longer in progress|maximum_attempts_reached|already_passed/i.test(message)) {
    throw new Response(message, { status: 409 });
  }

  if (
    /must be|missing required|duplicate question|question outside|response contains/i.test(
      message,
    )
  ) {
    throw new Response(message, { status: 400 });
  }

  throw new Error(message);
}

async function rpc<T>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) learningError(error);
  return data as T;
}

function mediaUrl(
  assignmentId: string,
  mediaAssetId: string,
  download = false,
) {
  const base =
    "/api/student/employer-training/assignments/" +
    encodeURIComponent(assignmentId) +
    "/media/" +
    encodeURIComponent(mediaAssetId);
  return download ? base + "?download=1" : base;
}

function hydratePrivateMedia(
  runtime: StudentEmployerTrainingRuntime,
): StudentEmployerTrainingRuntime {
  return {
    ...runtime,
    lessons: runtime.lessons.map((lesson) => ({
      ...lesson,
      blocks: lesson.blocks.map((block) => {
        const content = { ...block.content };
        const mediaAssetId =
          typeof content.mediaAssetId === "string"
            ? content.mediaAssetId
            : null;
        const posterMediaAssetId =
          typeof content.posterMediaAssetId === "string"
            ? content.posterMediaAssetId
            : null;
        const captionsMediaAssetId =
          typeof content.captionsMediaAssetId === "string"
            ? content.captionsMediaAssetId
            : null;

        if (mediaAssetId) {
          content.url = mediaUrl(
            runtime.assignment.assignmentId,
            mediaAssetId,
            block.blockType === "download",
          );
        }
        if (posterMediaAssetId) {
          content.posterUrl = mediaUrl(
            runtime.assignment.assignmentId,
            posterMediaAssetId,
          );
        }
        if (captionsMediaAssetId) {
          content.captionsUrl = mediaUrl(
            runtime.assignment.assignmentId,
            captionsMediaAssetId,
          );
        }

        return { ...block, content };
      }),
    })),
  };
}

export async function listStudentEmployerTrainingAssignments() {
  return rpc<StudentEmployerTrainingAssignmentSummary[]>(
    "student_employer_training_assignments",
  );
}

export async function getStudentEmployerTrainingAssignment(
  assignmentId: string,
) {
  const runtime = await rpc<StudentEmployerTrainingRuntime>(
    "student_employer_training_assignment",
    { p_assignment_id: assignmentId },
  );
  return hydratePrivateMedia(runtime);
}

export async function startStudentEmployerTraining(assignmentId: string) {
  const runtime = await rpc<StudentEmployerTrainingRuntime>(
    "student_employer_training_start",
    { p_assignment_id: assignmentId },
  );
  return hydratePrivateMedia(runtime);
}

export async function touchStudentEmployerTrainingLesson(
  assignmentId: string,
  lessonId: string,
) {
  return rpc("student_employer_training_lesson_touch", {
    p_assignment_id: assignmentId,
    p_lesson_id: lessonId,
  });
}

export async function completeStudentEmployerTrainingLesson(
  assignmentId: string,
  lessonId: string,
) {
  return rpc("student_employer_training_lesson_complete", {
    p_assignment_id: assignmentId,
    p_lesson_id: lessonId,
  });
}

export async function submitStudentEmployerTrainingCheckpoint(
  assignmentId: string,
  checkpointId: string,
  response: Record<string, unknown>,
) {
  return rpc("student_employer_training_checkpoint_submit", {
    p_assignment_id: assignmentId,
    p_checkpoint_id: checkpointId,
    p_response: response,
  });
}

export async function getStudentEmployerTrainingAssessment(
  assignmentId: string,
  assessmentId: string,
) {
  return rpc<StudentEmployerTrainingAssessmentRuntime>(
    "student_employer_training_assessment",
    {
      p_assignment_id: assignmentId,
      p_assessment_id: assessmentId,
    },
  );
}

export async function startStudentEmployerTrainingAssessment(
  assignmentId: string,
  assessmentId: string,
) {
  return rpc<StudentEmployerTrainingAssessmentRuntime>(
    "student_employer_training_assessment_start",
    {
      p_assignment_id: assignmentId,
      p_assessment_id: assessmentId,
    },
  );
}

export async function submitStudentEmployerTrainingAssessment(
  assignmentId: string,
  assessmentId: string,
  assessmentAttemptId: string,
  responses: Array<{ questionId: string; response: Record<string, unknown> }>,
) {
  return rpc<StudentEmployerTrainingAssessmentSubmitResult>(
    "student_employer_training_assessment_submit",
    {
      p_assignment_id: assignmentId,
      p_assessment_id: assessmentId,
      p_assessment_attempt_id: assessmentAttemptId,
      p_responses: responses,
    },
  );
}

export async function authorizeStudentEmployerTrainingMedia(
  assignmentId: string,
  mediaAssetId: string,
) {
  return rpc<StudentEmployerTrainingMediaAuthorization>(
    "student_employer_training_media_authorization",
    {
      p_assignment_id: assignmentId,
      p_media_asset_id: mediaAssetId,
    },
  );
}
