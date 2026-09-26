"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";
import type {
  StudentEmployerTrainingAssessmentRuntime,
  StudentEmployerTrainingAssessmentSubmitResult,
} from "@/lib/student/types";

type AnswerState = Record<string, unknown>;

function errorMessage(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return fallback;
}

export function AssessmentRuntime({
  assignmentId,
  initialAssessment,
  courseHref,
  readOnly = false,
}: {
  assignmentId: string;
  initialAssessment: StudentEmployerTrainingAssessmentRuntime;
  courseHref: string;
  readOnly?: boolean;
}) {
  const [assessment, setAssessment] = useState(initialAssessment);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [result, setResult] =
    useState<StudentEmployerTrainingAssessmentSubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currentAttempt = assessment.currentAttempt;

  async function start() {
    if (busy || readOnly) return;
    setBusy(true);
    setError("");
    setResult(null);
    const response = await fetch(
      "/api/student/employer-training/assignments/" +
        encodeURIComponent(assignmentId) +
        "/assessments/" +
        encodeURIComponent(assessment.definition.assessmentId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(errorMessage(body, "Unable to start assessment."));
      return;
    }
    if (body.assessment) {
      setAssessment(body.assessment);
      setAnswers({});
    }
  }

  function setSingle(questionId: string, optionId: string) {
    setAnswers((current) => ({
      ...current,
      [questionId]: { optionId },
    }));
  }

  function toggleMultiple(questionId: string, optionId: string) {
    setAnswers((current) => {
      const existing = Array.isArray(current[questionId]?.optionIds)
        ? (current[questionId].optionIds as string[])
        : [];
      const next = existing.includes(optionId)
        ? existing.filter((item) => item !== optionId)
        : [...existing, optionId];
      return {
        ...current,
        [questionId]: { optionIds: next },
      };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !currentAttempt || readOnly) return;
    setBusy(true);
    setError("");
    setResult(null);

    const responses = assessment.definition.questions
      .filter((question) => answers[question.questionId] !== undefined)
      .map((question) => ({
        questionId: question.questionId,
        response: answers[question.questionId],
      }));

    const response = await fetch(
      "/api/student/employer-training/assignments/" +
        encodeURIComponent(assignmentId) +
        "/assessments/" +
        encodeURIComponent(assessment.definition.assessmentId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          assessmentAttemptId: currentAttempt.assessmentAttemptId,
          responses,
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(errorMessage(body, "Unable to submit assessment."));
      return;
    }

    const nextResult =
      body.result as StudentEmployerTrainingAssessmentSubmitResult;
    setResult(nextResult);
    setAssessment((current) => ({
      ...current,
      currentAttempt: null,
      eligibility: nextResult.eligibility,
      attempts: [
        {
          assessmentAttemptId: nextResult.attempt.assessmentAttemptId,
          attemptNumber: nextResult.attempt.attemptNumber,
          status: nextResult.attempt.status,
          score: nextResult.attempt.score,
          startedAt: current.currentAttempt?.startedAt ?? new Date().toISOString(),
          submittedAt: new Date().toISOString(),
        },
        ...current.attempts.filter(
          (attempt) =>
            attempt.assessmentAttemptId !==
            nextResult.attempt.assessmentAttemptId,
        ),
      ],
    }));
  }

  const eligibility = assessment.eligibility;
  const passed = eligibility.alreadyPassed || result?.score.passed;

  return (
    <div className="student-assessment-runtime">
      <section className="student-assessment-intro card">
        <div>
          <div className="student-training-kicker">
            {assessment.definition.required ? "Required assessment" : "Optional assessment"}
          </div>
          <h1>{assessment.definition.title}</h1>
          {assessment.definition.description ? (
            <p>{assessment.definition.description}</p>
          ) : null}
        </div>
        <div className="student-assessment-meta">
          <span>
            Passing score <strong>{assessment.definition.passingScore}%</strong>
          </span>
          <span>
            Attempts used <strong>{eligibility.attemptsUsed}</strong>
            {eligibility.maxAttempts !== null
              ? " / " + String(eligibility.maxAttempts)
              : ""}
          </span>
          <span>
            Questions <strong>{assessment.definition.questions.length}</strong>
          </span>
        </div>
      </section>

      {result ? (
        <section
          className={
            "student-assessment-result card " +
            (result.score.passed ? "passed" : "not-passed")
          }
        >
          {result.score.passed ? (
            <CheckCircleIcon aria-hidden="true" />
          ) : (
            <ExclamationTriangleIcon aria-hidden="true" />
          )}
          <div>
            <div className="student-training-kicker">Attempt result</div>
            <h2>
              {result.score.passed ? "Passed" : "Not passed"} ·{" "}
              {result.score.score}%
            </h2>
            <p>
              {result.score.pointsEarned} of {result.score.pointsPossible} points.
              This result is Employer Training evidence, not an Instructor Verified Skill.
            </p>
          </div>
        </section>
      ) : null}

      {result?.score.results.some((item) => item.feedback) ? (
        <section className="card student-assessment-feedback">
          <h2>Feedback</h2>
          {result.score.results
            .filter((item) => item.feedback)
            .map((item) => (
              <div key={item.questionId}>
                <strong>
                  {item.isCorrect ? "Correct" : "Review"} · {item.score}/
                  {item.pointsPossible} points
                </strong>
                <p>{item.feedback}</p>
              </div>
            ))}
        </section>
      ) : null}

      {!currentAttempt ? (
        <section className="card student-assessment-gate">
          {passed ? (
            <>
              <CheckCircleIcon aria-hidden="true" />
              <div>
                <h2>Assessment passed</h2>
                <p>No additional attempt is required.</p>
              </div>
              <Link className="button button-brand" href={courseHref}>
                Return to course
              </Link>
            </>
          ) : eligibility.allowed && !readOnly ? (
            <>
              <PlayIcon aria-hidden="true" />
              <div>
                <h2>Ready for attempt {eligibility.nextAttemptNumber}</h2>
                <p>
                  Your answers are scored deterministically against the Employer-authored assessment.
                </p>
              </div>
              <button className="button button-brand" type="button" onClick={start} disabled={busy}>
                {busy ? "Starting…" : "Start assessment"}
              </button>
            </>
          ) : (
            <>
              <ExclamationTriangleIcon aria-hidden="true" />
              <div>
                <h2>
                  {eligibility.reason === "maximum_attempts_reached"
                    ? "Maximum attempts reached"
                    : readOnly
                      ? "Assessment is read-only"
                      : "Assessment unavailable"}
                </h2>
                <p>
                  {eligibility.reason === "maximum_attempts_reached"
                    ? "No additional attempts are available for this assessment."
                    : "Return to the course for the current assignment status."}
                </p>
              </div>
              <Link className="button button-ghost" href={courseHref}>
                Return to course
              </Link>
            </>
          )}
        </section>
      ) : (
        <form className="student-assessment-form" onSubmit={submit}>
          {assessment.definition.questions.map((question, index) => (
            <fieldset className="card student-assessment-question" key={question.questionId}>
              <legend>
                <span>Question {index + 1}</span>
                {question.required ? <strong>Required</strong> : <em>Optional</em>}
              </legend>
              <h2>{question.prompt}</h2>

              {question.questionType === "single_choice" ? (
                <div className="student-assessment-options">
                  {question.options.map((option) => (
                    <label key={option.id}>
                      <input
                        type="radio"
                        name={question.questionId}
                        checked={answers[question.questionId]?.optionId === option.id}
                        onChange={() => setSingle(question.questionId, option.id)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {question.questionType === "multiple_choice" ? (
                <div className="student-assessment-options">
                  {question.options.map((option) => {
                    const selected = Array.isArray(
                      answers[question.questionId]?.optionIds,
                    )
                      ? (answers[question.questionId].optionIds as string[])
                      : [];
                    return (
                      <label key={option.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(option.id)}
                          onChange={() =>
                            toggleMultiple(question.questionId, option.id)
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {question.questionType === "true_false" ? (
                <div className="student-assessment-options">
                  {[true, false].map((value) => (
                    <label key={String(value)}>
                      <input
                        type="radio"
                        name={question.questionId}
                        checked={answers[question.questionId]?.value === value}
                        onChange={() =>
                          setAnswers((current) => ({
                            ...current,
                            [question.questionId]: { value },
                          }))
                        }
                      />
                      <span>{value ? "True" : "False"}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {question.questionType === "acknowledgement" ? (
                <label className="student-assessment-ack">
                  <input
                    type="checkbox"
                    checked={answers[question.questionId]?.value === true}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.questionId]: { value: event.target.checked },
                      }))
                    }
                  />
                  <span>I acknowledge this statement.</span>
                </label>
              ) : null}

              {question.questionType === "numeric" ? (
                <label className="student-training-field">
                  <span>Numeric answer</span>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    value={
                      typeof answers[question.questionId]?.value === "number"
                        ? String(answers[question.questionId].value)
                        : ""
                    }
                    onChange={(event) => {
                      const raw = event.target.value;
                      setAnswers((current) => {
                        if (!raw) {
                          const next = { ...current };
                          delete next[question.questionId];
                          return next;
                        }
                        return {
                          ...current,
                          [question.questionId]: { value: Number(raw) },
                        };
                      });
                    }}
                  />
                </label>
              ) : null}
            </fieldset>
          ))}

          {error ? <div className="alert">{error}</div> : null}

          <div className="student-assessment-submit">
            <Link className="button button-ghost" href={courseHref}>
              Save for later
            </Link>
            <button className="button button-brand" type="submit" disabled={busy}>
              {busy ? "Scoring…" : "Submit assessment"}
            </button>
          </div>
        </form>
      )}

      {error && !currentAttempt ? <div className="alert">{error}</div> : null}
    </div>
  );
}
