import "server-only";

import type { EmployerContext } from "@/lib/employer/types";
import type {
  EmployerLearningBlockInput,
  EmployerLearningLessonInput,
  EmployerLearningCheckpointInput,
  EmployerLearningPassingRequirement,
  EmployerMicroCertAuthoringDetail,
  EmployerMicroCertModuleDetail,
  EmployerMicroCertDetail,
  EmployerMicroCertSummary,
  EmployerLearningReusableLibrary,
  EmployerLearningMediaAsset,
  EmployerLearningMediaReserveInput,
  MicroCertEligibility,
  MicroCertInput,
  MicroCertStatus,
} from "@/lib/employer/learning-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function learningRpcError(error: { message?: string }) {
  const message = error.message ?? "Employer Learning request failed.";
  if (/denied|approval/i.test(message)) {
    throw new Response(message, { status: 403 });
  }
  if (/not found/i.test(message)) {
    throw new Response(message, { status: 404 });
  }
  if (/VERSION_CONFLICT|IMMUTABLE|LESSON_ARCHIVED|MEDIA_ASSET_IN_USE/i.test(message)) {
    throw new Response(message, { status: 409 });
  }
  if (
    /invalid|required|must be|outside|unknown|eligibility|duration|badge|certification|lessonIds|lessonBlockIds|checkpoint|passingRequirement|minimumCheckpointPercent|content block|estimatedMinutes|URL|MEDIA_ASSET_IN_USE|media file|media asset|file type/i.test(
      message,
    )
  ) {
    throw new Response(message, { status: 400 });
  }
  throw new Error(message);
}

async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) learningRpcError(error);
  return data as T;
}

export async function listEmployerMicroCerts(
  context: EmployerContext,
  status?: MicroCertStatus | null,
) {
  return rpc<EmployerMicroCertSummary[]>("employer_micro_cert_library", {
    p_employer_id: context.employerId,
    p_status: status ?? null,
  });
}

export async function getEmployerMicroCert(
  context: EmployerContext,
  microCertId: string,
) {
  return rpc<EmployerMicroCertDetail>("employer_micro_cert_detail", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
  });
}

export async function getEmployerMicroCertAuthoringDetail(
  context: EmployerContext,
  microCertId: string,
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_authoring_detail",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
    },
  );
}

export async function createEmployerMicroCert(
  context: EmployerContext,
  input: MicroCertInput,
) {
  return rpc<EmployerMicroCertDetail>("employer_micro_cert_create", {
    p_employer_id: context.employerId,
    p_payload: input,
  });
}

export async function updateEmployerMicroCert(
  context: EmployerContext,
  microCertId: string,
  input: MicroCertInput,
  expectedVersionNumber?: number,
) {
  return rpc<EmployerMicroCertDetail>("employer_micro_cert_update", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_payload: input,
    p_expected_version_number: expectedVersionNumber ?? null,
  });
}

export async function createEmployerMicroCertVersion(
  context: EmployerContext,
  microCertId: string,
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_create_version",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
    },
  );
}

export async function replaceEmployerMicroCertEligibility(
  context: EmployerContext,
  microCertId: string,
  eligibility: MicroCertEligibility[],
) {
  return rpc<EmployerMicroCertDetail>(
    "employer_micro_cert_replace_eligibility",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_eligibility: eligibility,
    },
  );
}

export async function createEmployerLearningLesson(
  context: EmployerContext,
  microCertId: string,
  input: EmployerLearningLessonInput,
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_lesson_create",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_payload: input,
    },
  );
}

export async function updateEmployerLearningLesson(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
  input: EmployerLearningLessonInput,
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_lesson_update",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_lesson_id: lessonId,
      p_payload: input,
    },
  );
}

export async function archiveEmployerLearningLesson(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_lesson_archive",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_lesson_id: lessonId,
    },
  );
}

export async function duplicateEmployerLearningLesson(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_lesson_duplicate",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_lesson_id: lessonId,
    },
  );
}

export async function reorderEmployerLearningLessons(
  context: EmployerContext,
  microCertId: string,
  lessonIds: string[],
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_lessons_reorder",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_lesson_ids: lessonIds,
    },
  );
}

export async function createEmployerLearningBlock(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
  input: EmployerLearningBlockInput,
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_lesson_block_create",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_lesson_id: lessonId,
      p_payload: input,
    },
  );
}

export async function updateEmployerLearningBlock(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
  blockId: string,
  input: EmployerLearningBlockInput,
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_lesson_block_update",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_lesson_id: lessonId,
      p_lesson_block_id: blockId,
      p_payload: input,
    },
  );
}

export async function deleteEmployerLearningBlock(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
  blockId: string,
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_lesson_block_delete",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_lesson_id: lessonId,
      p_lesson_block_id: blockId,
    },
  );
}

export async function reorderEmployerLearningBlocks(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
  lessonBlockIds: string[],
) {
  return rpc<EmployerMicroCertAuthoringDetail>(
    "employer_micro_cert_lesson_blocks_reorder",
    {
      p_employer_id: context.employerId,
      p_micro_cert_id: microCertId,
      p_lesson_id: lessonId,
      p_lesson_block_ids: lessonBlockIds,
    },
  );
}


export async function createEmployerLearningSection(
  context: EmployerContext,
  microCertId: string,
  input: { title: string; description?: string | null; required?: boolean },
) {
  return rpc<EmployerMicroCertAuthoringDetail>("employer_micro_cert_section_create", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_payload: input,
  });
}

export async function updateEmployerLearningSection(
  context: EmployerContext,
  microCertId: string,
  sectionId: string,
  input: { title?: string; description?: string | null; required?: boolean },
) {
  return rpc<EmployerMicroCertAuthoringDetail>("employer_micro_cert_section_update", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_section_id: sectionId,
    p_payload: input,
  });
}

export async function deleteEmployerLearningSection(
  context: EmployerContext,
  microCertId: string,
  sectionId: string,
) {
  return rpc<EmployerMicroCertAuthoringDetail>("employer_micro_cert_section_delete", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_section_id: sectionId,
  });
}

export async function updateEmployerLearningStructure(
  context: EmployerContext,
  microCertId: string,
  structure: Array<{ sectionId: string | null; lessonIds: string[] }>,
) {
  return rpc<EmployerMicroCertAuthoringDetail>("employer_micro_cert_structure_update", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_structure: structure,
  });
}

export async function getEmployerLearningReusableLibrary(
  context: EmployerContext,
) {
  return rpc<EmployerLearningReusableLibrary>("employer_learning_reusable_library", {
    p_employer_id: context.employerId,
  });
}

export async function saveEmployerLearningReusableBlock(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
  blockId: string,
  title: string,
) {
  return rpc<EmployerLearningReusableLibrary>("employer_learning_reusable_block_save", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_lesson_id: lessonId,
    p_lesson_block_id: blockId,
    p_title: title,
  });
}

export async function insertEmployerLearningReusableBlock(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
  reusableBlockId: string,
) {
  return rpc<EmployerMicroCertAuthoringDetail>("employer_learning_reusable_block_insert", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_lesson_id: lessonId,
    p_reusable_block_id: reusableBlockId,
  });
}

export async function saveEmployerLearningLessonTemplate(
  context: EmployerContext,
  microCertId: string,
  lessonId: string,
  title: string,
) {
  return rpc<EmployerLearningReusableLibrary>("employer_learning_lesson_template_save", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_lesson_id: lessonId,
    p_title: title,
  });
}

export async function insertEmployerLearningLessonTemplate(
  context: EmployerContext,
  microCertId: string,
  lessonTemplateId: string,
  sectionId?: string | null,
) {
  return rpc<EmployerMicroCertAuthoringDetail>("employer_learning_lesson_template_insert", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_lesson_template_id: lessonTemplateId,
    p_section_id: sectionId ?? null,
  });
}


export async function getEmployerMicroCertModuleDetail(
  context: EmployerContext,
  microCertId: string,
) {
  return rpc<EmployerMicroCertModuleDetail>("employer_micro_cert_module_detail", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
  });
}

export async function createEmployerLearningCheckpoint(
  context: EmployerContext,
  microCertId: string,
  input: EmployerLearningCheckpointInput,
) {
  return rpc<EmployerMicroCertModuleDetail>("employer_micro_cert_checkpoint_create", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_payload: input,
  });
}

export async function updateEmployerLearningCheckpoint(
  context: EmployerContext,
  microCertId: string,
  checkpointId: string,
  input: EmployerLearningCheckpointInput,
) {
  return rpc<EmployerMicroCertModuleDetail>("employer_micro_cert_checkpoint_update", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_checkpoint_id: checkpointId,
    p_payload: input,
  });
}

export async function deleteEmployerLearningCheckpoint(
  context: EmployerContext,
  microCertId: string,
  checkpointId: string,
) {
  return rpc<EmployerMicroCertModuleDetail>("employer_micro_cert_checkpoint_delete", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_checkpoint_id: checkpointId,
  });
}

export async function reorderEmployerLearningCheckpoints(
  context: EmployerContext,
  microCertId: string,
  checkpointIds: string[],
) {
  return rpc<EmployerMicroCertModuleDetail>("employer_micro_cert_checkpoints_reorder", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_checkpoint_ids: checkpointIds,
  });
}

export async function updateEmployerLearningRequirements(
  context: EmployerContext,
  microCertId: string,
  requirement: EmployerLearningPassingRequirement,
  companyBadgeId?: string | null,
  certificationDefinitionId?: string | null,
) {
  return rpc<EmployerMicroCertModuleDetail>("employer_micro_cert_requirements_update", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_requirement: requirement,
    p_company_badge_id: companyBadgeId ?? null,
    p_certification_definition_id: certificationDefinitionId ?? null,
  });
}


export async function duplicateEmployerLearningSection(
  context: EmployerContext,
  microCertId: string,
  sectionId: string,
) {
  return rpc<EmployerMicroCertAuthoringDetail>("employer_micro_cert_section_duplicate", {
    p_employer_id: context.employerId,
    p_micro_cert_id: microCertId,
    p_section_id: sectionId,
  });
}

export async function reserveEmployerLearningMedia(
  context: EmployerContext,
  input: EmployerLearningMediaReserveInput,
) {
  return rpc<EmployerLearningMediaAsset>("employer_learning_media_reserve", {
    p_employer_id: context.employerId,
    p_filename: input.filename,
    p_display_name: input.displayName ?? null,
    p_media_kind: input.mediaKind,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_metadata: input.metadata ?? {},
  });
}

export async function finalizeEmployerLearningMedia(
  context: EmployerContext,
  mediaAssetId: string,
) {
  return rpc<EmployerLearningMediaAsset>("employer_learning_media_finalize", {
    p_employer_id: context.employerId,
    p_media_asset_id: mediaAssetId,
  });
}

export async function listEmployerLearningMedia(
  context: EmployerContext,
) {
  return rpc<EmployerLearningMediaAsset[]>("employer_learning_media_list", {
    p_employer_id: context.employerId,
  });
}

export async function getEmployerLearningMedia(
  context: EmployerContext,
  mediaAssetId: string,
) {
  return rpc<EmployerLearningMediaAsset>("employer_learning_media_get", {
    p_employer_id: context.employerId,
    p_media_asset_id: mediaAssetId,
  });
}

export async function guardEmployerLearningMediaDelete(
  context: EmployerContext,
  mediaAssetId: string,
) {
  return rpc<{
    mediaAssetId: string;
    bucketId: string;
    storagePath: string;
    status: string;
    referenceCount: number;
  }>("employer_learning_media_delete_guard", {
    p_employer_id: context.employerId,
    p_media_asset_id: mediaAssetId,
  });
}

export async function finalizeEmployerLearningMediaDelete(
  context: EmployerContext,
  mediaAssetId: string,
) {
  return rpc<void>("employer_learning_media_delete_finalize", {
    p_employer_id: context.employerId,
    p_media_asset_id: mediaAssetId,
  });
}
