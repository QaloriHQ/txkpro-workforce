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
} from "@/components/design-system";
import { LearningBlockRenderer } from "@/components/employer/learning/learning-block-renderer";
import type { EmployerMicroCertAuthoringDetail } from "@/lib/employer/learning-types";

export function StudentCoursePreview({
  course,
  initialLessonId,
}: {
  course: EmployerMicroCertAuthoringDetail;
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
  const [index, setIndex] = useState(initialIndex);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const lesson = lessons[index];
  const progress = lessons.length ? Math.round((completed.size / lessons.length) * 100) : 0;

  function toggleComplete() {
    if (!lesson) return;
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(lesson.lessonId)) next.delete(lesson.lessonId);
      else next.add(lesson.lessonId);
      return next;
    });
  }

  return (
    <div className="txk-preview-workspace">
      <div className="txk-preview-toolbar">
        <div>
          <strong>Student Preview</strong>
          <span>Simulation only · no assignment, completion, badge or credential records are written.</span>
        </div>
        <div className="txk-form-actions">
          <Button size="sm" type="button" tone={device === "desktop" ? "primary" : "default"} onClick={() => setDevice("desktop")}>
            <ComputerDesktopIcon aria-hidden="true" /> Desktop
          </Button>
          <Button size="sm" type="button" tone={device === "mobile" ? "primary" : "default"} onClick={() => setDevice("mobile")}>
            <DevicePhoneMobileIcon aria-hidden="true" /> Mobile
          </Button>
          <Button
            size="sm"
            type="button"
            onClick={() => {
              setCompleted(new Set());
              setIndex(initialIndex);
            }}
          >
            Reset preview
          </Button>
        </div>
      </div>

      <div className={`txk-student-preview-frame ${device === "mobile" ? "mobile" : ""}`}>
        <aside className="txk-preview-outline">
          <p className="txk-eyebrow">Course</p>
          <h2>{course.title}</h2>
          <div className="txk-preview-progress">
            <div><span style={{ width: `${progress}%` }} /></div>
            <small>{progress}% simulated progress</small>
          </div>
          <nav>
            {lessons.map((item, lessonIndex) => (
              <button key={item.lessonId} type="button" className={lessonIndex === index ? "active" : ""} onClick={() => setIndex(lessonIndex)}>
                {completed.has(item.lessonId) ? <CheckCircleIcon aria-hidden="true" /> : <span>{lessonIndex + 1}</span>}
                <div><strong>{item.title}</strong><small>{item.estimatedMinutes ?? 0} min</small></div>
              </button>
            ))}
          </nav>
        </aside>

        <main className="txk-preview-lesson">
          {lesson ? (
            <>
              <header>
                <p className="txk-eyebrow">Lesson {index + 1} of {lessons.length}</p>
                <h1>{lesson.title}</h1>
                {lesson.learningObjective ? <p>{lesson.learningObjective}</p> : null}
                <div className="txk-form-actions">
                  <StatusBadge tone={lesson.required ? "info" : "neutral"}>{lesson.required ? "Required" : "Optional"}</StatusBadge>
                  <span className="muted">{lesson.estimatedMinutes ?? 0} min</span>
                </div>
              </header>

              <div className="txk-preview-content">
                {lesson.blocks.map((block) => (
                  <Card key={block.lessonBlockId} className="txk-preview-block">
                    <LearningBlockRenderer block={block} />
                  </Card>
                ))}
              </div>

              <footer className="txk-preview-footer">
                <Button type="button" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous</Button>
                <Button type="button" tone={completed.has(lesson.lessonId) ? "default" : "primary"} onClick={toggleComplete}>
                  <CheckCircleIcon aria-hidden="true" />
                  {completed.has(lesson.lessonId) ? "Marked complete" : "Simulate completion"}
                </Button>
                <Button type="button" disabled={index === lessons.length - 1} onClick={() => setIndex((value) => Math.min(lessons.length - 1, value + 1))}>Next</Button>
              </footer>
            </>
          ) : (
            <Card>No lessons are available to preview yet.</Card>
          )}
        </main>
      </div>
    </div>
  );
}
