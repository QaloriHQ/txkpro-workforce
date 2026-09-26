"use client";

import {
  CheckCircleIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
} from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import {
  Button,
  Card,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import { LearningBlockRenderer } from "@/components/employer/learning/learning-block-renderer";
import type { EmployerMicroCertModuleDetail } from "@/lib/employer/learning-types";

export function StudentCoursePreview({
  course,
  initialLessonId,
}: {
  course: EmployerMicroCertModuleDetail;
  initialLessonId?: string | null;
}) {
  const lessons = useMemo(
    () => course.lessons.filter((lesson) => lesson.status !== "archived"),
    [course.lessons],
  );
  const initialIndex = Math.max(
    0,
    lessons.findIndex((lesson) => lesson.lessonId === initialLessonId),
  );
  const hasCheckpointStep = course.checkpoints.length > 0;
  const totalSteps = lessons.length + (hasCheckpointStep ? 1 : 0);

  const [index, setIndex] = useState(initialIndex);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [checkpointResponses, setCheckpointResponses] = useState<
    Record<string, string | boolean>
  >({});
  const [checkpointStepComplete, setCheckpointStepComplete] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const lesson = index < lessons.length ? lessons[index] : null;
  const checkpointView = hasCheckpointStep && index === lessons.length;
  const requiredCheckpoints = course.checkpoints.filter(
    (checkpoint) => checkpoint.required,
  );
  const requiredCheckpointsSatisfied = requiredCheckpoints.every((checkpoint) => {
    const value = checkpointResponses[checkpoint.checkpointId];
    return checkpoint.checkpointType === "reflection"
      ? typeof value === "string" && value.trim().length > 0
      : value === true;
  });

  const completedSteps =
    completed.size + (checkpointStepComplete && hasCheckpointStep ? 1 : 0);
  const progress = totalSteps
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;

  function toggleComplete() {
    if (!lesson) return;
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(lesson.lessonId)) next.delete(lesson.lessonId);
      else next.add(lesson.lessonId);
      return next;
    });
  }

  function resetPreview() {
    setCompleted(new Set());
    setCheckpointResponses({});
    setCheckpointStepComplete(false);
    setIndex(initialIndex);
  }

  return (
    <div className="txk-preview-workspace">
      <div className="txk-preview-toolbar">
        <div>
          <strong>Student Preview</strong>
          <span>
            Simulation only · no assignment, checkpoint-response, completion,
            badge, certification, or Verified Skill records are written.
          </span>
        </div>
        <div className="txk-form-actions">
          <Button
            size="sm"
            type="button"
            tone={device === "desktop" ? "primary" : "default"}
            onClick={() => setDevice("desktop")}
          >
            <ComputerDesktopIcon aria-hidden="true" />
            Desktop
          </Button>
          <Button
            size="sm"
            type="button"
            tone={device === "mobile" ? "primary" : "default"}
            onClick={() => setDevice("mobile")}
          >
            <DevicePhoneMobileIcon aria-hidden="true" />
            Mobile
          </Button>
          <Button size="sm" type="button" onClick={resetPreview}>
            Reset preview
          </Button>
        </div>
      </div>

      <div
        className={`txk-student-preview-frame ${
          device === "mobile" ? "mobile" : ""
        }`}
      >
        <aside className="txk-preview-outline">
          <p className="txk-eyebrow">Course</p>
          <h2>{course.title}</h2>
          <div className="txk-preview-progress">
            <div>
              <span style={{ width: `${progress}%` }} />
            </div>
            <small>{progress}% simulated progress</small>
          </div>
          <nav>
            {lessons.map((item, lessonIndex) => (
              <button
                key={item.lessonId}
                type="button"
                className={lessonIndex === index ? "active" : ""}
                onClick={() => setIndex(lessonIndex)}
              >
                {completed.has(item.lessonId) ? (
                  <CheckCircleIcon aria-hidden="true" />
                ) : (
                  <span>{lessonIndex + 1}</span>
                )}
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.estimatedMinutes ?? 0} min</small>
                </div>
              </button>
            ))}
            {hasCheckpointStep ? (
              <button
                type="button"
                className={checkpointView ? "active" : ""}
                onClick={() => setIndex(lessons.length)}
              >
                {checkpointStepComplete ? (
                  <CheckCircleIcon aria-hidden="true" />
                ) : (
                  <span>{lessons.length + 1}</span>
                )}
                <div>
                  <strong>Course checkpoints</strong>
                  <small>
                    {requiredCheckpoints.length} required ·{" "}
                    {course.checkpoints.length} total
                  </small>
                </div>
              </button>
            ) : null}
          </nav>
        </aside>

        <main className="txk-preview-lesson">
          {lesson ? (
            <>
              <header>
                <p className="txk-eyebrow">
                  Lesson {index + 1} of {lessons.length}
                </p>
                <h1>{lesson.title}</h1>
                {lesson.learningObjective ? <p>{lesson.learningObjective}</p> : null}
                <div className="txk-form-actions">
                  <StatusBadge tone={lesson.required ? "info" : "neutral"}>
                    {lesson.required ? "Required" : "Optional"}
                  </StatusBadge>
                  <span className="muted">
                    {lesson.estimatedMinutes ?? 0} min
                  </span>
                </div>
              </header>

              <div className="txk-preview-content">
                {lesson.blocks.map((block) => (
                  <Card
                    key={block.lessonBlockId}
                    className="txk-preview-block"
                  >
                    <LearningBlockRenderer block={block} />
                  </Card>
                ))}
              </div>

              <footer className="txk-preview-footer">
                <Button
                  type="button"
                  disabled={index === 0}
                  onClick={() =>
                    setIndex((value) => Math.max(0, value - 1))
                  }
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  tone={
                    completed.has(lesson.lessonId) ? "default" : "primary"
                  }
                  onClick={toggleComplete}
                >
                  <CheckCircleIcon aria-hidden="true" />
                  {completed.has(lesson.lessonId)
                    ? "Marked complete"
                    : "Simulate completion"}
                </Button>
                <Button
                  type="button"
                  disabled={
                    index === totalSteps - 1 ||
                    (!hasCheckpointStep && index === lessons.length - 1)
                  }
                  onClick={() =>
                    setIndex((value) =>
                      Math.min(Math.max(totalSteps - 1, 0), value + 1),
                    )
                  }
                >
                  Next
                </Button>
              </footer>
            </>
          ) : checkpointView ? (
            <>
              <header>
                <p className="txk-eyebrow">Interactive checkpoints</p>
                <h1>Course checkpoints</h1>
                <p>
                  Complete the required interactions below. This is only a
                  preview; responses stay in this browser session.
                </p>
              </header>

              <div className="txk-preview-content txk-preview-checkpoints">
                {course.checkpoints.map((checkpoint, checkpointIndex) => {
                  const value =
                    checkpointResponses[checkpoint.checkpointId];
                  return (
                    <Card
                      key={checkpoint.checkpointId}
                      className="txk-preview-block"
                    >
                      <div className="txk-preview-checkpoint-head">
                        <span>{checkpointIndex + 1}</span>
                        <div>
                          <strong>
                            {checkpoint.title ||
                              `Checkpoint ${checkpointIndex + 1}`}
                          </strong>
                          <small>
                            {checkpoint.checkpointType.replaceAll("_", " ")}
                          </small>
                        </div>
                        <StatusBadge
                          tone={checkpoint.required ? "info" : "neutral"}
                        >
                          {checkpoint.required ? "Required" : "Optional"}
                        </StatusBadge>
                      </div>
                      <p>{checkpoint.prompt}</p>

                      {checkpoint.checkpointType === "reflection" ? (
                        <Textarea
                          aria-label={
                            checkpoint.title || checkpoint.prompt
                          }
                          value={
                            typeof value === "string" ? value : ""
                          }
                          placeholder="Enter a simulated response"
                          onChange={(event) =>
                            setCheckpointResponses((current) => ({
                              ...current,
                              [checkpoint.checkpointId]:
                                event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <label className="txk-preview-checkpoint-control">
                          <input
                            type="checkbox"
                            checked={value === true}
                            onChange={(event) =>
                              setCheckpointResponses((current) => ({
                                ...current,
                                [checkpoint.checkpointId]:
                                  event.target.checked,
                              }))
                            }
                          />
                          <span>
                            {String(
                              checkpoint.config.label ??
                                (checkpoint.checkpointType === "confirmation"
                                  ? "Confirm"
                                  : "I acknowledge"),
                            )}
                          </span>
                        </label>
                      )}
                    </Card>
                  );
                })}
              </div>

              <footer className="txk-preview-footer">
                <Button
                  type="button"
                  disabled={lessons.length === 0}
                  onClick={() =>
                    setIndex(Math.max(0, lessons.length - 1))
                  }
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  tone={checkpointStepComplete ? "default" : "primary"}
                  disabled={!requiredCheckpointsSatisfied}
                  onClick={() =>
                    setCheckpointStepComplete((value) => !value)
                  }
                >
                  <CheckCircleIcon aria-hidden="true" />
                  {checkpointStepComplete
                    ? "Checkpoint step complete"
                    : "Simulate checkpoint completion"}
                </Button>
              </footer>
            </>
          ) : (
            <Card>No lessons or checkpoints are available to preview yet.</Card>
          )}
        </main>
      </div>
    </div>
  );
}
