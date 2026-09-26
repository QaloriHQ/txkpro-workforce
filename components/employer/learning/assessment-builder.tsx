"use client";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { FormEvent, useState } from "react";
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
  EmployerLearningAssessmentAuthoringDetail,
  EmployerLearningAssessmentQuestion,
  EmployerLearningAssessmentQuestionInput,
  EmployerLearningAssessmentScoreResult,
  EmployerLearningQuestionType,
  EmployerLearningStudentAssessment,
  EmployerMicroCertModuleDetail,
} from "@/lib/employer/learning-types";

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Employer Learning assessment request failed.");
  }
  return body;
}

function questionTypeLabel(type: EmployerLearningQuestionType) {
  if (type === "single_choice") return "Single choice";
  if (type === "multiple_choice") return "Multiple choice";
  if (type === "true_false") return "True / false";
  if (type === "acknowledgement") return "Acknowledgement";
  return "Numeric";
}

function optionLines(question?: EmployerLearningAssessmentQuestion | null) {
  return (question?.options ?? []).map((option) => option.label).join("\n");
}

function answerSummary(question: EmployerLearningAssessmentQuestion) {
  const key = question.answerKey ?? {};
  if (question.questionType === "single_choice") {
    const id = String(key.correctOptionId ?? "");
    return (
      question.options.find((option) => option.id === id)?.label ??
      "Answer not configured"
    );
  }
  if (question.questionType === "multiple_choice") {
    const ids = Array.isArray(key.correctOptionIds)
      ? key.correctOptionIds.map(String)
      : [];
    return question.options
      .filter((option) => ids.includes(option.id))
      .map((option) => option.label)
      .join(", ");
  }
  if (question.questionType === "true_false") {
    return String(key.correct ?? false) === "true" ? "True" : "False";
  }
  if (question.questionType === "acknowledgement") {
    return "Acknowledged";
  }
  if (String(key.mode ?? "exact") === "range") {
    return `${String(key.min ?? "")}–${String(key.max ?? "")}`;
  }
  return `${String(key.value ?? "")}${
    Number(key.tolerance ?? 0) > 0
      ? ` ± ${String(key.tolerance)}`
      : ""
  }`;
}

function normalizeQuestionPayload(
  form: FormData,
  questionType: EmployerLearningQuestionType,
): EmployerLearningAssessmentQuestionInput {
  const optionsText = String(form.get("options") ?? "");
  const labels = optionsText
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const options = labels.map((label, index) => ({
    id: `opt_${index + 1}`,
    label,
  }));
  let answerKey: Record<string, unknown> = {};

  if (questionType === "single_choice") {
    const correct = Math.max(1, Number(form.get("correctOption") ?? 1));
    answerKey = { correctOptionId: `opt_${correct}` };
  } else if (questionType === "multiple_choice") {
    const values = String(form.get("correctOptions") ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    answerKey = {
      correctOptionIds: [...new Set(values)].map(
        (value) => `opt_${value}`,
      ),
    };
  } else if (questionType === "true_false") {
    answerKey = {
      correct: String(form.get("correctBoolean") ?? "true") === "true",
    };
  } else if (questionType === "acknowledgement") {
    answerKey = { requiredValue: true };
  } else {
    const mode = String(form.get("numericMode") ?? "exact");
    if (mode === "range") {
      answerKey = {
        mode: "range",
        min: Number(form.get("numericMin") ?? 0),
        max: Number(form.get("numericMax") ?? 0),
      };
    } else {
      answerKey = {
        mode: "exact",
        value: Number(form.get("numericValue") ?? 0),
        tolerance: Math.max(
          0,
          Number(form.get("numericTolerance") ?? 0),
        ),
      };
    }
  }

  return {
    questionType,
    prompt: String(form.get("prompt") ?? "").trim(),
    options:
      questionType === "single_choice" ||
      questionType === "multiple_choice"
        ? options
        : [],
    answerKey,
    points: Number(form.get("points") ?? 1),
    required: form.get("required") === "on",
    feedbackCorrect:
      String(form.get("feedbackCorrect") ?? "").trim() || null,
    feedbackIncorrect:
      String(form.get("feedbackIncorrect") ?? "").trim() || null,
  };
}

function QuestionForm({
  question,
  busy,
  onCancel,
  onSubmit,
}: {
  question?: EmployerLearningAssessmentQuestion | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (
    payload: EmployerLearningAssessmentQuestionInput,
  ) => Promise<void>;
}) {
  const [type, setType] = useState<EmployerLearningQuestionType>(
    question?.questionType ?? "single_choice",
  );
  const key = question?.answerKey ?? {};
  const existingCorrectSingle =
    question?.questionType === "single_choice"
      ? Math.max(
          1,
          question.options.findIndex(
            (option) => option.id === String(key.correctOptionId ?? ""),
          ) + 1,
        )
      : 1;
  const existingCorrectMultiple =
    question?.questionType === "multiple_choice"
      ? question.options
          .map((option, index) =>
            Array.isArray(key.correctOptionIds) &&
            key.correctOptionIds.map(String).includes(option.id)
              ? String(index + 1)
              : null,
          )
          .filter(Boolean)
          .join(", ")
      : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit(normalizeQuestionPayload(form, type));
  }

  return (
    <form className="txk-form-stack" onSubmit={submit}>
      <FormField label="Question type">
        <select
          className="txk-input"
          name="questionType"
          value={type}
          onChange={(event) =>
            setType(event.target.value as EmployerLearningQuestionType)
          }
          disabled={busy}
        >
          <option value="single_choice">Single choice</option>
          <option value="multiple_choice">Multiple choice</option>
          <option value="true_false">True / false</option>
          <option value="acknowledgement">Acknowledgement</option>
          <option value="numeric">Numeric</option>
        </select>
      </FormField>

      <FormField label="Question">
        <Textarea
          name="prompt"
          defaultValue={question?.prompt ?? ""}
          required
          disabled={busy}
        />
      </FormField>

      {(type === "single_choice" || type === "multiple_choice") ? (
        <FormField
          label="Answer options"
          help="One option per line. Option numbers follow this order."
        >
          <Textarea
            name="options"
            defaultValue={optionLines(question)}
            placeholder={"First option\nSecond option\nThird option"}
            required
            disabled={busy}
          />
        </FormField>
      ) : null}

      {type === "single_choice" ? (
        <FormField
          label="Correct option number"
          help="Example: 2 means the second option is correct."
        >
          <Input
            name="correctOption"
            type="number"
            min="1"
            defaultValue={existingCorrectSingle}
            required
            disabled={busy}
          />
        </FormField>
      ) : null}

      {type === "multiple_choice" ? (
        <FormField
          label="Correct option numbers"
          help="Comma-separated. Example: 1, 3, 4. Scoring requires the exact authored set."
        >
          <Input
            name="correctOptions"
            defaultValue={existingCorrectMultiple}
            placeholder="1, 3"
            required
            disabled={busy}
          />
        </FormField>
      ) : null}

      {type === "true_false" ? (
        <FormField label="Correct answer">
          <select
            className="txk-input"
            name="correctBoolean"
            defaultValue={String(key.correct ?? true)}
            disabled={busy}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </FormField>
      ) : null}

      {type === "acknowledgement" ? (
        <div className="txk-assessment-key-note">
          Learners pass this question by explicitly acknowledging the statement.
        </div>
      ) : null}

      {type === "numeric" ? (
        <>
          <FormField label="Numeric scoring">
            <select
              className="txk-input"
              name="numericMode"
              defaultValue={String(key.mode ?? "exact")}
              disabled={busy}
            >
              <option value="exact">Exact value ± tolerance</option>
              <option value="range">Accepted range</option>
            </select>
          </FormField>
          <div className="txk-form-grid-2">
            <FormField label="Exact value">
              <Input
                name="numericValue"
                type="number"
                step="any"
                defaultValue={String(key.value ?? 0)}
                disabled={busy}
              />
            </FormField>
            <FormField label="Tolerance">
              <Input
                name="numericTolerance"
                type="number"
                min="0"
                step="any"
                defaultValue={String(key.tolerance ?? 0)}
                disabled={busy}
              />
            </FormField>
            <FormField label="Range minimum">
              <Input
                name="numericMin"
                type="number"
                step="any"
                defaultValue={String(key.min ?? 0)}
                disabled={busy}
              />
            </FormField>
            <FormField label="Range maximum">
              <Input
                name="numericMax"
                type="number"
                step="any"
                defaultValue={String(key.max ?? 0)}
                disabled={busy}
              />
            </FormField>
          </div>
          <p className="muted">
            Only the fields for the selected numeric scoring mode are used.
          </p>
        </>
      ) : null}

      <div className="txk-form-grid-2">
        <FormField label="Points">
          <Input
            name="points"
            type="number"
            min="0.01"
            max="1000"
            step="0.01"
            defaultValue={question?.points ?? 1}
            required
            disabled={busy}
          />
        </FormField>
        <label className="txk-check-field txk-assessment-required-field">
          <input
            name="required"
            type="checkbox"
            defaultChecked={question?.required ?? true}
            disabled={busy}
          />
          <span>Required question</span>
        </label>
      </div>

      <FormField
        label="Correct feedback"
        help="Shown after scoring only when assessment feedback is enabled."
      >
        <Textarea
          name="feedbackCorrect"
          defaultValue={question?.feedbackCorrect ?? ""}
          disabled={busy}
        />
      </FormField>
      <FormField
        label="Incorrect feedback"
        help="Do not include the answer key unless you intentionally want to reveal it after an attempt."
      >
        <Textarea
          name="feedbackIncorrect"
          defaultValue={question?.feedbackIncorrect ?? ""}
          disabled={busy}
        />
      </FormField>

      <div className="txk-form-actions">
        <Button tone="primary" type="submit" disabled={busy}>
          {question ? "Save question" : "Add question"}
        </Button>
        <Button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AssessmentStudentPreview({
  courseId,
  assessmentId,
}: {
  courseId: string;
  assessmentId: string;
}) {
  const [assessment, setAssessment] =
    useState<EmployerLearningStudentAssessment | null>(null);
  const [responses, setResponses] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [result, setResult] =
    useState<EmployerLearningAssessmentScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/employer/learning/courses/${encodeURIComponent(
    courseId,
  )}/assessments/${encodeURIComponent(assessmentId)}/preview`;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const body = await requestJson<{
        assessment: EmployerLearningStudentAssessment;
      }>(base, { method: "GET" });
      setAssessment(body.assessment);
      setResponses({});
      setResult(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load Student Preview.",
      );
    } finally {
      setLoading(false);
    }
  }

  function setResponse(
    questionId: string,
    response: Record<string, unknown>,
  ) {
    setResponses((current) => ({
      ...current,
      [questionId]: response,
    }));
    setResult(null);
  }

  async function score() {
    if (!assessment) return;
    setScoring(true);
    setError(null);
    try {
      const body = await requestJson<{
        result: EmployerLearningAssessmentScoreResult;
      }>(base, {
        method: "POST",
        body: JSON.stringify({
          responses: Object.entries(responses).map(
            ([questionId, response]) => ({
              questionId,
              response,
            }),
          ),
        }),
      });
      setResult(body.result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to score Student Preview.",
      );
    } finally {
      setScoring(false);
    }
  }

  if (!assessment) {
    return (
      <Card className="txk-assessment-preview-launch">
        <EyeIcon aria-hidden="true" />
        <div>
          <h3>Student-safe preview</h3>
          <p>
            Load the learner payload to verify that questions render without
            answer keys. Preview scoring writes no attempt or response records.
          </p>
        </div>
        <Button
          type="button"
          onClick={load}
          disabled={loading}
          tone="primary"
        >
          <EyeIcon aria-hidden="true" />
          {loading ? "Loading…" : "Open preview"}
        </Button>
        {error ? <div className="alert">{error}</div> : null}
      </Card>
    );
  }

  return (
    <Card className="txk-assessment-student-preview">
      <div className="txk-inline-heading">
        <div>
          <p className="txk-eyebrow">Student preview</p>
          <h3>{assessment.title}</h3>
          <p>{assessment.description}</p>
        </div>
        <StatusBadge tone="neutral">
          {assessment.passingScore}% to pass
        </StatusBadge>
      </div>

      <div className="txk-assessment-student-questions">
        {assessment.questions.map((question, index) => {
          const response = responses[question.questionId] ?? {};
          const scored = result?.results.find(
            (item) => item.questionId === question.questionId,
          );
          return (
            <div
              className="txk-assessment-student-question"
              key={question.questionId}
            >
              <div className="txk-assessment-question-heading">
                <span>{index + 1}</span>
                <div>
                  <strong>{question.prompt}</strong>
                  <small>
                    {questionTypeLabel(question.questionType)} ·{" "}
                    {question.points} point
                    {question.points === 1 ? "" : "s"} ·{" "}
                    {question.required ? "Required" : "Optional"}
                  </small>
                </div>
                {scored ? (
                  <StatusBadge
                    tone={scored.isCorrect ? "success" : "danger"}
                  >
                    {scored.isCorrect ? "Correct" : "Incorrect"}
                  </StatusBadge>
                ) : null}
              </div>

              {question.questionType === "single_choice" ? (
                <div className="txk-assessment-choice-list">
                  {question.options.map((option) => (
                    <label key={option.id}>
                      <input
                        type="radio"
                        name={question.questionId}
                        checked={response.optionId === option.id}
                        onChange={() =>
                          setResponse(question.questionId, {
                            optionId: option.id,
                          })
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {question.questionType === "multiple_choice" ? (
                <div className="txk-assessment-choice-list">
                  {question.options.map((option) => {
                    const selected = Array.isArray(response.optionIds)
                      ? response.optionIds.map(String)
                      : [];
                    return (
                      <label key={option.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(option.id)}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...selected, option.id]
                              : selected.filter(
                                  (value) => value !== option.id,
                                );
                            setResponse(question.questionId, {
                              optionIds: next,
                            });
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {question.questionType === "true_false" ? (
                <div className="txk-assessment-choice-list horizontal">
                  {[true, false].map((value) => (
                    <label key={String(value)}>
                      <input
                        type="radio"
                        name={question.questionId}
                        checked={response.value === value}
                        onChange={() =>
                          setResponse(question.questionId, { value })
                        }
                      />
                      <span>{value ? "True" : "False"}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {question.questionType === "acknowledgement" ? (
                <label className="txk-preview-checkpoint-control">
                  <input
                    type="checkbox"
                    checked={response.value === true}
                    onChange={(event) =>
                      setResponse(question.questionId, {
                        value: event.target.checked,
                      })
                    }
                  />
                  <span>I acknowledge</span>
                </label>
              ) : null}

              {question.questionType === "numeric" ? (
                <Input
                  type="number"
                  step="any"
                  aria-label={question.prompt}
                  value={
                    typeof response.value === "number"
                      ? response.value
                      : ""
                  }
                  onChange={(event) =>
                    setResponse(question.questionId, {
                      value:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              ) : null}

              {scored?.feedback ? (
                <p className="txk-assessment-feedback">
                  {scored.feedback}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {result ? (
        <div
          className={`txk-assessment-result ${
            result.passed ? "passed" : "not-passed"
          }`}
        >
          {result.passed ? (
            <CheckCircleIcon aria-hidden="true" />
          ) : (
            <XCircleIcon aria-hidden="true" />
          )}
          <div>
            <strong>
              {result.passed ? "Simulated pass" : "Not passed"}
            </strong>
            <span>
              {result.score}% · {result.pointsEarned}/
              {result.pointsPossible} points · {result.passingScore}% required
            </span>
            {!result.valid ? (
              <small>
                Complete all required questions before this assessment can
                pass.
              </small>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <div className="alert">{error}</div> : null}

      <div className="txk-form-actions">
        <Button
          type="button"
          tone="primary"
          disabled={scoring || assessment.questions.length === 0}
          onClick={score}
        >
          <CheckCircleIcon aria-hidden="true" />
          {scoring ? "Scoring…" : "Score preview"}
        </Button>
        <Button
          type="button"
          onClick={() => {
            setResponses({});
            setResult(null);
          }}
        >
          <ArrowPathIcon aria-hidden="true" />
          Reset
        </Button>
        <Button
          type="button"
          onClick={() => {
            setAssessment(null);
            setResponses({});
            setResult(null);
          }}
        >
          Close preview
        </Button>
      </div>
    </Card>
  );
}

export function AssessmentBuilder({
  course,
  assessment,
  canManage,
}: {
  course: EmployerMicroCertModuleDetail;
  assessment: EmployerLearningAssessmentAuthoringDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [questionModal, setQuestionModal] = useState<
    | { mode: "create"; question: null }
    | { mode: "edit"; question: EmployerLearningAssessmentQuestion }
    | null
  >(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const immutable = ["live", "archived"].includes(course.currentVersion.status);
  const canEdit = canManage && !immutable;
  const questions = [...assessment.questions].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const lesson = assessment.lessonId
    ? course.lessons.find(
        (item) => item.lessonId === assessment.lessonId,
      )
    : null;
  const base = `/api/employer/learning/courses/${encodeURIComponent(
    course.microCertId,
  )}/assessments/${encodeURIComponent(assessment.assessmentId)}`;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const maxAttemptsRaw = String(form.get("maxAttempts") ?? "").trim();
    setBusy("settings");
    setError(null);
    try {
      await requestJson(base, {
        method: "PATCH",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description:
            String(form.get("description") ?? "").trim() || null,
          assessmentType: String(form.get("assessmentType") ?? ""),
          lessonId: String(form.get("lessonId") ?? "").trim() || null,
          passingScore: Number(form.get("passingScore") ?? 80),
          maxAttempts: maxAttemptsRaw
            ? Number(maxAttemptsRaw)
            : null,
          required: form.get("required") === "on",
          randomizeQuestions:
            form.get("randomizeQuestions") === "on",
          showFeedback: form.get("showFeedback") === "on",
          config: assessment.config,
        }),
      });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save assessment settings.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function saveQuestion(
    payload: EmployerLearningAssessmentQuestionInput,
  ) {
    const current = questionModal;
    if (!current) return;
    setBusy("question");
    setError(null);
    try {
      if (current.mode === "create") {
        await requestJson(`${base}/questions`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await requestJson(
          `${base}/questions/${encodeURIComponent(
            current.question.questionId,
          )}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
      }
      setQuestionModal(null);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save assessment question.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function deleteQuestion(
    question: EmployerLearningAssessmentQuestion,
  ) {
    if (
      !window.confirm(
        "Delete this assessment question? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(`delete-${question.questionId}`);
    setError(null);
    try {
      await requestJson(
        `${base}/questions/${encodeURIComponent(question.questionId)}`,
        { method: "DELETE" },
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete question.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function duplicateQuestion(
    question: EmployerLearningAssessmentQuestion,
  ) {
    setBusy(`duplicate-${question.questionId}`);
    setError(null);
    try {
      await requestJson(`${base}/questions`, {
        method: "POST",
        body: JSON.stringify({
          questionType: question.questionType,
          prompt: `${question.prompt} — Copy`,
          options: question.options,
          answerKey: question.answerKey,
          points: question.points,
          required: question.required,
          feedbackCorrect: question.feedbackCorrect,
          feedbackIncorrect: question.feedbackIncorrect,
        }),
      });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to duplicate question.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const ids = questions.map((question) => question.questionId);
    const [questionId] = ids.splice(index, 1);
    ids.splice(target, 0, questionId);
    setBusy("reorder");
    setError(null);
    try {
      await requestJson(`${base}/questions`, {
        method: "PUT",
        body: JSON.stringify({ questionIds: ids }),
      });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to reorder questions.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function duplicateAssessment() {
    setBusy("duplicate-assessment");
    setError(null);
    try {
      const body = await requestJson<{
        assessment: EmployerLearningAssessmentAuthoringDetail;
      }>(`${base}/duplicate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push(
        `/employer/learning/${encodeURIComponent(
          course.microCertId,
        )}/assessments/${encodeURIComponent(body.assessment.assessmentId)}`,
      );
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

  async function deleteAssessment() {
    if (
      !window.confirm(
        `Delete "${assessment.title}" and all questions? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy("delete-assessment");
    setError(null);
    try {
      await requestJson(base, { method: "DELETE" });
      router.push(
        `/employer/learning/${encodeURIComponent(
          course.microCertId,
        )}/assessments`,
      );
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

  const totalPoints = questions.reduce(
    (sum, question) => sum + Number(question.points),
    0,
  );

  return (
    <div className="txk-assessment-builder">
      <div className="txk-assessment-builder-topline">
        <Link
          href={`/employer/learning/${encodeURIComponent(
            course.microCertId,
          )}/assessments`}
        >
          <ArrowLeftIcon aria-hidden="true" />
          All assessments
        </Link>
        <div className="txk-form-actions">
          {canEdit ? (
            <>
              <Button
                size="sm"
                type="button"
                disabled={Boolean(busy)}
                onClick={duplicateAssessment}
              >
                <DocumentDuplicateIcon aria-hidden="true" />
                Duplicate assessment
              </Button>
              <Button
                size="sm"
                tone="danger"
                type="button"
                disabled={Boolean(busy)}
                onClick={deleteAssessment}
              >
                <TrashIcon aria-hidden="true" />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="txk-assessment-builder-metrics">
        <Card>
          <span>Questions</span>
          <strong>{questions.length}</strong>
        </Card>
        <Card>
          <span>Total points</span>
          <strong>{totalPoints}</strong>
        </Card>
        <Card>
          <span>Passing score</span>
          <strong>{assessment.passingScore}%</strong>
        </Card>
        <Card>
          <span>Attempts</span>
          <strong>{assessment.maxAttempts ?? "∞"}</strong>
        </Card>
      </div>

      <details className="txk-assessment-settings">
        <summary>
          <div>
            <strong>Assessment settings</strong>
            <span>
              {assessment.assessmentType.replaceAll("_", " ")}
              {lesson ? ` · ${lesson.title}` : " · Course"}
            </span>
          </div>
          <StatusBadge tone={assessment.required ? "info" : "neutral"}>
            {assessment.required ? "Required" : "Optional"}
          </StatusBadge>
        </summary>
        <Card>
          <form className="txk-form-stack" onSubmit={saveSettings}>
            <FormField label="Title">
              <Input
                name="title"
                defaultValue={assessment.title}
                required
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Description">
              <Textarea
                name="description"
                defaultValue={assessment.description ?? ""}
                disabled={!canEdit}
              />
            </FormField>
            <div className="txk-form-grid-2">
              <FormField label="Assessment type">
                <select
                  className="txk-input"
                  name="assessmentType"
                  defaultValue={assessment.assessmentType}
                  disabled={!canEdit}
                >
                  <option value="checkpoint">Lesson checkpoint</option>
                  <option value="lesson_quiz">Lesson quiz</option>
                  <option value="final_assessment">Final assessment</option>
                </select>
              </FormField>
              <FormField label="Lesson" help="Ignored for Final assessment.">
                <select
                  className="txk-input"
                  name="lessonId"
                  defaultValue={assessment.lessonId ?? ""}
                  disabled={!canEdit}
                >
                  <option value="">Select lesson</option>
                  {course.lessons
                    .filter((item) => item.status !== "archived")
                    .map((item) => (
                      <option key={item.lessonId} value={item.lessonId}>
                        {item.title}
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Passing score (%)">
                <Input
                  name="passingScore"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={assessment.passingScore}
                  required
                  disabled={!canEdit}
                />
              </FormField>
              <FormField label="Maximum attempts">
                <Input
                  name="maxAttempts"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={assessment.maxAttempts ?? ""}
                  disabled={!canEdit}
                />
              </FormField>
            </div>
            <label className="txk-check-field">
              <input
                name="required"
                type="checkbox"
                defaultChecked={assessment.required}
                disabled={!canEdit}
              />
              <span>Required assessment</span>
            </label>
            <label className="txk-check-field">
              <input
                name="randomizeQuestions"
                type="checkbox"
                defaultChecked={assessment.randomizeQuestions}
                disabled={!canEdit}
              />
              <span>Randomize question order</span>
            </label>
            <label className="txk-check-field">
              <input
                name="showFeedback"
                type="checkbox"
                defaultChecked={assessment.showFeedback}
                disabled={!canEdit}
              />
              <span>Show authored feedback after scoring</span>
            </label>
            {canEdit ? (
              <Button
                tone="primary"
                type="submit"
                disabled={Boolean(busy)}
              >
                Save assessment settings
              </Button>
            ) : null}
          </form>
        </Card>
      </details>

      <div className="txk-assessment-question-section">
        <div className="txk-inline-heading">
          <div>
            <p className="txk-eyebrow">Question builder</p>
            <h2>Questions</h2>
            <p>
              Deterministic scoring uses the authored answer key and point
              values. Multiple-choice questions require an exact set match.
            </p>
          </div>
          {canEdit ? (
            <Button
              tone="primary"
              type="button"
              onClick={() =>
                setQuestionModal({ mode: "create", question: null })
              }
            >
              <PlusIcon aria-hidden="true" />
              Add question
            </Button>
          ) : null}
        </div>

        <div className="txk-assessment-question-list">
          {questions.map((question, index) => (
            <Card
              key={question.questionId}
              className="txk-assessment-question-card"
            >
              <div className="txk-assessment-question-heading">
                <span>{index + 1}</span>
                <div>
                  <strong>{question.prompt}</strong>
                  <small>
                    {questionTypeLabel(question.questionType)} ·{" "}
                    {question.points} point
                    {question.points === 1 ? "" : "s"} ·{" "}
                    {question.required ? "Required" : "Optional"}
                  </small>
                </div>
                <StatusBadge tone="warning">Answer key</StatusBadge>
              </div>

              <div className="txk-assessment-answer-summary">
                <span>Correct answer</span>
                <strong>{answerSummary(question) || "Not configured"}</strong>
              </div>

              {question.feedbackCorrect || question.feedbackIncorrect ? (
                <div className="txk-assessment-feedback-summary">
                  {question.feedbackCorrect ? (
                    <p>
                      <strong>Correct:</strong> {question.feedbackCorrect}
                    </p>
                  ) : null}
                  {question.feedbackIncorrect ? (
                    <p>
                      <strong>Incorrect:</strong>{" "}
                      {question.feedbackIncorrect}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {canEdit ? (
                <div className="txk-form-actions">
                  <Button
                    size="sm"
                    type="button"
                    disabled={index === 0 || Boolean(busy)}
                    onClick={() => moveQuestion(index, -1)}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                    <span className="sr-only">Move question up</span>
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    disabled={
                      index === questions.length - 1 || Boolean(busy)
                    }
                    onClick={() => moveQuestion(index, 1)}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                    <span className="sr-only">Move question down</span>
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      setQuestionModal({
                        mode: "edit",
                        question,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => duplicateQuestion(question)}
                  >
                    <DocumentDuplicateIcon aria-hidden="true" />
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    tone="danger"
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => deleteQuestion(question)}
                  >
                    <TrashIcon aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}

          {questions.length === 0 ? (
            <Card className="txk-assessment-empty">
              <h3>No questions yet</h3>
              <p>
                Add at least one scored question before this assessment can
                produce a valid score.
              </p>
              {canEdit ? (
                <Button
                  tone="primary"
                  type="button"
                  onClick={() =>
                    setQuestionModal({
                      mode: "create",
                      question: null,
                    })
                  }
                >
                  <PlusIcon aria-hidden="true" />
                  Add first question
                </Button>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>

      <AssessmentStudentPreview
        courseId={course.microCertId}
        assessmentId={assessment.assessmentId}
      />

      {questionModal ? (
        <div
          className="txk-course-dialog-backdrop txk-assessment-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busy) {
              setQuestionModal(null);
            }
          }}
        >
          <Card
            className="txk-course-dialog txk-assessment-question-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              questionModal.mode === "create"
                ? "Add assessment question"
                : "Edit assessment question"
            }
          >
            <div className="txk-inline-heading">
              <div>
                <p className="txk-eyebrow">Assessment question</p>
                <h2>
                  {questionModal.mode === "create"
                    ? "Add question"
                    : "Edit question"}
                </h2>
              </div>
              <IconButton
                label="Close"
                disabled={Boolean(busy)}
                onClick={() => setQuestionModal(null)}
              >
                <XMarkIcon aria-hidden="true" />
              </IconButton>
            </div>

            <QuestionForm
              key={
                questionModal.question?.questionId ??
                "new-assessment-question"
              }
              question={questionModal.question}
              busy={Boolean(busy)}
              onCancel={() => setQuestionModal(null)}
              onSubmit={saveQuestion}
            />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
