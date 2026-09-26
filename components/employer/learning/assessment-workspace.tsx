"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardDocumentCheckIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  FormField,
  IconButton,
  Input,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import type {
  EmployerLearningAssessmentSummary,
  EmployerLearningAssessmentType,
  EmployerMicroCertModuleDetail,
} from "@/lib/employer/learning-types";

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as {
    error?: string;
    assessment?: unknown;
    course?: unknown;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to update assessments.");
  }
  return body;
}

function typeLabel(type: EmployerLearningAssessmentType) {
  if (type === "lesson_quiz") return "Lesson quiz";
  if (type === "final_assessment") return "Final assessment";
  return "Lesson checkpoint";
}

export function AssessmentWorkspace({
  course,
  canManage,
  initialLessonId,
}: {
  course: EmployerMicroCertModuleDetail;
  canManage: boolean;
  initialLessonId?: string | null;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(Boolean(initialLessonId));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const immutable = ["live", "archived"].includes(course.currentVersion.status);
  const canEdit = canManage && !immutable;
  const assessments = [...course.assessmentSummary].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const lessonMap = useMemo(
    () => new Map(course.lessons.map((lesson) => [lesson.lessonId, lesson])),
    [course.lessons],
  );
  const base = `/api/employer/learning/courses/${encodeURIComponent(
    course.microCertId,
  )}/assessments`;

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("create");
    setError(null);
    try {
      const assessmentType = String(
        form.get("assessmentType") ?? "lesson_quiz",
      ) as EmployerLearningAssessmentType;
      const maxAttemptsRaw = String(form.get("maxAttempts") ?? "").trim();
      const response = await requestJson(base, {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description:
            String(form.get("description") ?? "").trim() || null,
          assessmentType,
          lessonId:
            assessmentType === "final_assessment"
              ? null
              : String(form.get("lessonId") ?? "").trim() || null,
          passingScore: Number(form.get("passingScore") ?? 80),
          maxAttempts: maxAttemptsRaw
            ? Number(maxAttemptsRaw)
            : null,
          required: form.get("required") === "on",
          randomizeQuestions:
            form.get("randomizeQuestions") === "on",
          showFeedback: form.get("showFeedback") === "on",
          config: {},
        }),
      });
      const created = response.assessment as
        | { assessmentId?: string }
        | undefined;
      formElement.reset();
      setCreateOpen(false);
      if (created?.assessmentId) {
        router.push(
          `/employer/learning/${encodeURIComponent(
            course.microCertId,
          )}/assessments/${encodeURIComponent(created.assessmentId)}`,
        );
      } else {
        router.refresh();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create assessment.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function duplicateAssessment(assessmentId: string) {
    setBusy(`duplicate-${assessmentId}`);
    setError(null);
    try {
      const response = await requestJson(
        `${base}/${encodeURIComponent(assessmentId)}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      const duplicate = response.assessment as
        | { assessmentId?: string }
        | undefined;
      if (duplicate?.assessmentId) {
        router.push(
          `/employer/learning/${encodeURIComponent(
            course.microCertId,
          )}/assessments/${encodeURIComponent(duplicate.assessmentId)}`,
        );
      } else {
        router.refresh();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to duplicate assessment.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function deleteAssessment(assessment: EmployerLearningAssessmentSummary) {
    if (
      !window.confirm(
        `Delete "${assessment.title}" and all of its questions? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(`delete-${assessment.assessmentId}`);
    setError(null);
    try {
      await requestJson(
        `${base}/${encodeURIComponent(assessment.assessmentId)}`,
        { method: "DELETE" },
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete assessment.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function moveAssessment(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= assessments.length) return;
    const ids = assessments.map((assessment) => assessment.assessmentId);
    const [assessmentId] = ids.splice(index, 1);
    ids.splice(target, 0, assessmentId);
    setBusy("reorder");
    setError(null);
    try {
      await requestJson(base, {
        method: "PUT",
        body: JSON.stringify({ assessmentIds: ids }),
      });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to reorder assessments.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="txk-assessment-workspace">
      {error ? <div className="alert">{error}</div> : null}

      <div className="txk-assessment-toolbar">
        <div>
          <p className="txk-eyebrow">Assessment architecture</p>
          <h2>Course assessments</h2>
          <p>
            Build lesson checkpoints, lesson quizzes, and final assessments.
            Answer keys remain restricted to Employer Owner/Admin authoring
            views.
          </p>
        </div>
        {canEdit ? (
          <Button
            tone="primary"
            type="button"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon aria-hidden="true" />
            Add assessment
          </Button>
        ) : null}
      </div>

      {immutable ? (
        <div className="alert">
          This version is {course.currentVersion.status}. Create a new Draft
          version before changing assessments.
        </div>
      ) : null}

      <div className="txk-assessment-list">
        {assessments.map((assessment, index) => {
          const lesson = assessment.lessonId
            ? lessonMap.get(assessment.lessonId)
            : null;
          return (
            <Card
              className="txk-assessment-card"
              key={assessment.assessmentId}
            >
              <div className="txk-assessment-card-head">
                <span className="txk-assessment-sequence">
                  {assessment.sequence}
                </span>
                <div>
                  <strong>{assessment.title}</strong>
                  <small>
                    {typeLabel(assessment.assessmentType)}
                    {lesson ? ` · ${lesson.title}` : " · Course"}
                  </small>
                </div>
                <StatusBadge
                  tone={assessment.required ? "info" : "neutral"}
                >
                  {assessment.required ? "Required" : "Optional"}
                </StatusBadge>
              </div>

              {assessment.description ? (
                <p>{assessment.description}</p>
              ) : null}

              <div className="txk-assessment-meta">
                <span>
                  <strong>{assessment.questionCount}</strong>
                  questions
                </span>
                <span>
                  <strong>{assessment.passingScore}%</strong>
                  passing score
                </span>
                <span>
                  <strong>
                    {assessment.maxAttempts ?? "∞"}
                  </strong>
                  attempts
                </span>
                <span>
                  <strong>
                    {assessment.randomizeQuestions ? "Yes" : "No"}
                  </strong>
                  randomize
                </span>
              </div>

              <div className="txk-form-actions">
                {canManage ? (
                  <Link
                    className="txk-button txk-button-primary txk-button-sm"
                    href={`/employer/learning/${encodeURIComponent(
                      course.microCertId,
                    )}/assessments/${encodeURIComponent(
                      assessment.assessmentId,
                    )}`}
                  >
                    <PencilSquareIcon aria-hidden="true" />
                    Open builder
                  </Link>
                ) : (
                  <StatusBadge tone="neutral">
                    Student-safe summary only
                  </StatusBadge>
                )}

                {canEdit ? (
                  <>
                    <Button
                      size="sm"
                      type="button"
                      disabled={index === 0 || Boolean(busy)}
                      onClick={() => moveAssessment(index, -1)}
                    >
                      <ArrowUpIcon aria-hidden="true" />
                      <span className="sr-only">Move assessment up</span>
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      disabled={
                        index === assessments.length - 1 ||
                        Boolean(busy)
                      }
                      onClick={() => moveAssessment(index, 1)}
                    >
                      <ArrowDownIcon aria-hidden="true" />
                      <span className="sr-only">
                        Move assessment down
                      </span>
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        duplicateAssessment(assessment.assessmentId)
                      }
                    >
                      <DocumentDuplicateIcon aria-hidden="true" />
                      Duplicate
                    </Button>
                    <Button
                      size="sm"
                      tone="danger"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => deleteAssessment(assessment)}
                    >
                      <TrashIcon aria-hidden="true" />
                      Delete
                    </Button>
                  </>
                ) : null}
              </div>
            </Card>
          );
        })}

        {assessments.length === 0 ? (
          <Card className="txk-assessment-empty">
            <ClipboardDocumentCheckIcon aria-hidden="true" />
            <h3>No assessments yet</h3>
            <p>
              Add a lesson checkpoint, lesson quiz, or final assessment to
              evaluate company-specific training knowledge.
            </p>
            {canEdit ? (
              <Button
                tone="primary"
                type="button"
                onClick={() => setCreateOpen(true)}
              >
                <PlusIcon aria-hidden="true" />
                Create first assessment
              </Button>
            ) : null}
          </Card>
        ) : null}
      </div>

      {createOpen ? (
        <div
          className="txk-course-dialog-backdrop txk-assessment-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busy) {
              setCreateOpen(false);
            }
          }}
        >
          <Card
            className="txk-course-dialog txk-assessment-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Create assessment"
          >
            <div className="txk-inline-heading">
              <div>
                <p className="txk-eyebrow">Employer assessment</p>
                <h2>Add assessment</h2>
              </div>
              <IconButton
                label="Close"
                disabled={Boolean(busy)}
                onClick={() => setCreateOpen(false)}
              >
                <XMarkIcon aria-hidden="true" />
              </IconButton>
            </div>

            <form className="txk-form-stack" onSubmit={createAssessment}>
              <FormField label="Assessment title">
                <Input
                  name="title"
                  required
                  autoFocus
                  defaultValue={
                    initialLessonId
                      ? `${lessonMap.get(initialLessonId)?.title ?? "Lesson"} quiz`
                      : ""
                  }
                />
              </FormField>

              <FormField label="Description">
                <Textarea name="description" />
              </FormField>

              <div className="txk-form-grid-2">
                <FormField label="Assessment type">
                  <select
                    className="txk-input"
                    name="assessmentType"
                    defaultValue={
                      initialLessonId ? "lesson_quiz" : "final_assessment"
                    }
                  >
                    <option value="checkpoint">
                      Lesson checkpoint
                    </option>
                    <option value="lesson_quiz">Lesson quiz</option>
                    <option value="final_assessment">
                      Final assessment
                    </option>
                  </select>
                </FormField>

                <FormField
                  label="Lesson"
                  help="Ignored for a Final assessment."
                >
                  <select
                    className="txk-input"
                    name="lessonId"
                    defaultValue={initialLessonId ?? ""}
                  >
                    <option value="">Select lesson</option>
                    {course.lessons
                      .filter((lesson) => lesson.status !== "archived")
                      .map((lesson) => (
                        <option
                          key={lesson.lessonId}
                          value={lesson.lessonId}
                        >
                          {lesson.title}
                        </option>
                      ))}
                  </select>
                </FormField>
              </div>

              <div className="txk-form-grid-2">
                <FormField label="Passing score (%)">
                  <Input
                    name="passingScore"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue="80"
                    required
                  />
                </FormField>
                <FormField
                  label="Maximum attempts"
                  help="Leave blank for no authored limit."
                >
                  <Input
                    name="maxAttempts"
                    type="number"
                    min="1"
                    max="100"
                  />
                </FormField>
              </div>

              <label className="txk-check-field">
                <input
                  name="required"
                  type="checkbox"
                  defaultChecked
                />
                <span>Required assessment</span>
              </label>
              <label className="txk-check-field">
                <input name="randomizeQuestions" type="checkbox" />
                <span>Randomize question order for learners</span>
              </label>
              <label className="txk-check-field">
                <input
                  name="showFeedback"
                  type="checkbox"
                  defaultChecked
                />
                <span>Show authored feedback after scoring</span>
              </label>

              <div className="txk-form-actions">
                <Button
                  tone="primary"
                  type="submit"
                  disabled={Boolean(busy)}
                >
                  <PlusIcon aria-hidden="true" />
                  Create assessment
                </Button>
                <Button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
