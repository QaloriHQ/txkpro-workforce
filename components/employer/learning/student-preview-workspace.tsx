"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@/components/design-system";
import { LearningBlockRenderer } from "@/components/employer/learning/learning-block-renderer";
import type { EmployerMicroCertAuthoringDetail } from "@/lib/employer/learning-types";

export function StudentPreviewWorkspace({
  course,
  initialLessonId,
}: {
  course: EmployerMicroCertAuthoringDetail;
  initialLessonId?: string | null;
}) {
  const lessons = useMemo(
    () =>
      [...course.lessons]
        .filter((lesson) => lesson.status !== "archived")
        .sort((a, b) => a.sequence - b.sequence),
    [course.lessons],
  );

  const initialIndex = Math.max(
    0,
    lessons.findIndex((lesson) => lesson.lessonId === initialLessonId),
  );

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [completed, setCompleted] = useState<string[]>([]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const storageKey = `txk-learning-preview:${course.microCertId}:${course.currentVersion.versionNumber}`;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setCompleted(JSON.parse(stored) as string[]);
    } catch {
      // Browser-only simulation state is optional.
    }
  }, [storageKey]);

  function updateCompleted(next: string[]) {
    setCompleted(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Preview never writes server-side completion evidence.
    }
  }

  const lesson = lessons[currentIndex];
  const percent = lessons.length
    ? Math.round((completed.length / lessons.length) * 100)
    : 0;

  if (!lesson) {
    return (
      <div className="txk-student-preview-empty">
        No active lessons are available to preview yet.
      </div>
    );
  }

  function completeCurrent() {
    if (completed.includes(lesson.lessonId)) return;
    updateCompleted([...completed, lesson.lessonId]);
  }

  return (
    <div className="txk-student-preview-wrap">
      <div className="txk-preview-toolbar">
        <div>
          <strong>Student Preview</strong>
          <span>
            Simulation only · no assignment, assessment, or completion evidence
            is written
          </span>
        </div>
        <div className="txk-reference-row">
          <Button
            type="button"
            size="sm"
            tone={device === "desktop" ? "primary" : "default"}
            onClick={() => setDevice("desktop")}
          >
            <ComputerDesktopIcon aria-hidden="true" />
            Desktop
          </Button>
          <Button
            type="button"
            size="sm"
            tone={device === "mobile" ? "primary" : "default"}
            onClick={() => setDevice("mobile")}
          >
            <DevicePhoneMobileIcon aria-hidden="true" />
            Mobile
          </Button>
          <Button type="button" size="sm" onClick={() => updateCompleted([])}>
            Reset preview
          </Button>
        </div>
      </div>

      <div className={`txk-student-preview-frame is-${device}`}>
        <aside className="txk-preview-outline">
          <div className="txk-preview-progress">
            <span>Course progress</span>
            <strong>{percent}%</strong>
            <div>
              <i style={{ width: `${percent}%` }} />
            </div>
          </div>

          <nav aria-label="Student course lessons">
            {lessons.map((item, index) => (
              <button
                key={item.lessonId}
                type="button"
                className={index === currentIndex ? "active" : ""}
                onClick={() => setCurrentIndex(index)}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {completed.includes(item.lessonId)
                      ? "Complete"
                      : item.required
                        ? "Required"
                        : "Optional"}
                  </small>
                </div>
                {completed.includes(item.lessonId) ? (
                  <CheckCircleIcon aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <main className="txk-preview-lesson">
          <header>
            <div>
              <p className="txk-eyebrow">
                Lesson {currentIndex + 1} of {lessons.length}
              </p>
              <h1>{lesson.title}</h1>
              {lesson.description ? <p>{lesson.description}</p> : null}
            </div>
            <StatusBadge tone={lesson.required ? "info" : "neutral"}>
              {lesson.required ? "Required" : "Optional"}
            </StatusBadge>
          </header>

          {lesson.learningObjective ? (
            <aside className="txk-preview-objective">
              <strong>Learning objective</strong>
              <p>{lesson.learningObjective}</p>
            </aside>
          ) : null}

          <div className="txk-preview-content">
            {lesson.blocks.map((block) => (
              <section
                key={block.lessonBlockId}
                className="txk-preview-block"
              >
                <LearningBlockRenderer block={block} />
              </section>
            ))}
          </div>

          <aside className="txk-preview-assessment-placeholder">
            <strong>Knowledge check preview</strong>
            <p>
              When W11-05A assessments are attached, simulated answers and
              pass/fail behavior will appear here without creating real Student
              evidence.
            </p>
          </aside>

          <footer className="txk-preview-footer">
            <Button
              type="button"
              disabled={currentIndex === 0}
              onClick={() =>
                setCurrentIndex((index) => Math.max(0, index - 1))
              }
            >
              <ArrowLeftIcon aria-hidden="true" />
              Previous
            </Button>

            <Button
              type="button"
              tone={
                completed.includes(lesson.lessonId) ? "default" : "primary"
              }
              onClick={completeCurrent}
            >
              <CheckCircleIcon aria-hidden="true" />
              {completed.includes(lesson.lessonId)
                ? "Completed in preview"
                : "Mark complete"}
            </Button>

            <Button
              type="button"
              disabled={currentIndex === lessons.length - 1}
              onClick={() =>
                setCurrentIndex((index) =>
                  Math.min(lessons.length - 1, index + 1),
                )
              }
            >
              Next
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </footer>
        </main>
      </div>
    </div>
  );
}
