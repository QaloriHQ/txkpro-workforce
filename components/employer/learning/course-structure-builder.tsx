"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  Bars3Icon,
  BookmarkSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import type {
  EmployerLearningLesson,
  EmployerLearningReusableLibrary,
  EmployerMicroCertAuthoringDetail,
} from "@/lib/employer/learning-types";

type Group = { sectionId: string | null; lessonIds: string[] };

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await response.json()) as {
    error?: string;
    course?: EmployerMicroCertAuthoringDetail;
  };
  if (!response.ok) throw new Error(body.error ?? "Unable to update course structure.");
  return body;
}

function initialGroups(course: EmployerMicroCertAuthoringDetail): Group[] {
  const groups: Group[] = course.sections.map((section) => ({
    sectionId: section.sectionId,
    lessonIds: course.lessons
      .filter((lesson) => lesson.sectionId === section.sectionId)
      .sort((a, b) => a.sequence - b.sequence)
      .map((lesson) => lesson.lessonId),
  }));
  groups.push({
    sectionId: null,
    lessonIds: course.lessons
      .filter((lesson) => !lesson.sectionId)
      .sort((a, b) => a.sequence - b.sequence)
      .map((lesson) => lesson.lessonId),
  });
  return groups;
}

function removeLesson(groups: Group[], lessonId: string) {
  return groups.map((group) => ({
    ...group,
    lessonIds: group.lessonIds.filter((id) => id !== lessonId),
  }));
}

export function CourseStructureBuilder({
  course,
  reusable,
  canManage,
}: {
  course: EmployerMicroCertAuthoringDetail;
  reusable: EmployerLearningReusableLibrary;
  canManage: boolean;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>(() => initialGroups(course));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const immutable = ["live", "archived"].includes(course.currentVersion.status);
  const canEdit = canManage && !immutable;
  const lessonMap = useMemo(
    () => new Map(course.lessons.map((lesson) => [lesson.lessonId, lesson])),
    [course.lessons],
  );
  const sectionMap = useMemo(
    () => new Map(course.sections.map((section) => [section.sectionId, section])),
    [course.sections],
  );
  const base = `/api/employer/learning/courses/${encodeURIComponent(course.microCertId)}`;

  async function persist(next: Group[]) {
    if (!canEdit) return;
    setGroups(next);
    setBusy("structure");
    setError(null);
    try {
      await requestJson(`${base}/structure`, {
        method: "PUT",
        body: JSON.stringify({ structure: next }),
      });
      router.refresh();
    } catch (cause) {
      setGroups(initialGroups(course));
      setError(cause instanceof Error ? cause.message : "Unable to update structure.");
    } finally {
      setBusy(null);
    }
  }

  async function createSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("section");
    setError(null);
    try {
      await requestJson(`${base}/sections`, {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
        }),
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create section.");
    } finally {
      setBusy(null);
    }
  }

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("lesson");
    setError(null);
    try {
      await requestJson(`${base}/lessons`, {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          sectionId: String(form.get("sectionId") ?? "") || null,
          required: true,
          status: "draft",
        }),
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create lesson.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSection(sectionId: string) {
    if (!window.confirm("Delete this section? Its lessons will become unsectioned.")) return;
    setBusy(`delete-${sectionId}`);
    try {
      await requestJson(`${base}/sections/${encodeURIComponent(sectionId)}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete section.");
    } finally {
      setBusy(null);
    }
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= groups.length - 1) return;
    const next = [...groups];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    void persist(next);
  }

  function moveLessonKeyboard(groupIndex: number, lessonIndex: number, direction: -1 | 1) {
    const group = groups[groupIndex];
    const target = lessonIndex + direction;
    if (target < 0 || target >= group.lessonIds.length) return;
    const next = groups.map((item) => ({ ...item, lessonIds: [...item.lessonIds] }));
    const [lessonId] = next[groupIndex].lessonIds.splice(lessonIndex, 1);
    next[groupIndex].lessonIds.splice(target, 0, lessonId);
    void persist(next);
  }

  function dropLesson(lessonId: string, groupIndex: number, beforeLessonId?: string) {
    const next = removeLesson(groups, lessonId).map((item) => ({ ...item, lessonIds: [...item.lessonIds] }));
    const target = next[groupIndex];
    const index = beforeLessonId ? target.lessonIds.indexOf(beforeLessonId) : -1;
    if (index >= 0) target.lessonIds.splice(index, 0, lessonId);
    else target.lessonIds.push(lessonId);
    void persist(next);
  }

  async function saveTemplate(lesson: EmployerLearningLesson) {
    const title = window.prompt("Template name", lesson.title);
    if (!title) return;
    setBusy(`template-${lesson.lessonId}`);
    try {
      await requestJson("/api/employer/learning/reusable", {
        method: "POST",
        body: JSON.stringify({
          action: "save_lesson_template",
          microCertId: course.microCertId,
          lessonId: lesson.lessonId,
          title,
        }),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save template.");
    } finally {
      setBusy(null);
    }
  }

  async function insertTemplate(templateId: string, sectionId: string | null) {
    setBusy("insert-template");
    try {
      await requestJson("/api/employer/learning/reusable", {
        method: "POST",
        body: JSON.stringify({
          action: "insert_lesson_template",
          microCertId: course.microCertId,
          lessonTemplateId: templateId,
          sectionId,
        }),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add template.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="txk-structure-layout">
      {error ? <div className="alert">{error}</div> : null}

      <div className="txk-structure-main">
        {groups.map((group, groupIndex) => {
          const section = group.sectionId ? sectionMap.get(group.sectionId) : null;
          const isUnsectioned = !group.sectionId;
          return (
            <Card
              className="txk-structure-section"
              key={group.sectionId ?? "unsectioned"}
              draggable={canEdit && !isUnsectioned}
              onDragStart={(event) => {
                if (group.sectionId) event.dataTransfer.setData("application/x-txk-section", group.sectionId);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const lessonId = event.dataTransfer.getData("application/x-txk-lesson");
                const sectionId = event.dataTransfer.getData("application/x-txk-section");
                if (lessonId) dropLesson(lessonId, groupIndex);
                if (sectionId && group.sectionId && sectionId !== group.sectionId) {
                  const from = groups.findIndex((item) => item.sectionId === sectionId);
                  const to = groups.findIndex((item) => item.sectionId === group.sectionId);
                  if (from >= 0 && to >= 0) {
                    const next = [...groups];
                    const [item] = next.splice(from, 1);
                    next.splice(to, 0, item);
                    void persist(next);
                  }
                }
              }}
            >
              <div className="txk-structure-section-head">
                <div>
                  <p className="txk-eyebrow">{isUnsectioned ? "Course" : `Section ${groupIndex + 1}`}</p>
                  <h2>{isUnsectioned ? "Unsectioned lessons" : section?.title}</h2>
                  {section?.description ? <p>{section.description}</p> : null}
                </div>
                {canEdit && !isUnsectioned ? (
                  <div className="txk-form-actions">
                    <Button size="sm" type="button" onClick={() => moveSection(groupIndex, -1)} disabled={groupIndex === 0 || Boolean(busy)}>
                      <ArrowUpIcon aria-hidden="true" /> Up
                    </Button>
                    <Button size="sm" type="button" onClick={() => moveSection(groupIndex, 1)} disabled={groupIndex >= groups.length - 2 || Boolean(busy)}>
                      <ArrowDownIcon aria-hidden="true" /> Down
                    </Button>
                    <Button size="sm" tone="danger" type="button" onClick={() => group.sectionId && deleteSection(group.sectionId)} disabled={Boolean(busy)}>
                      <TrashIcon aria-hidden="true" /> Delete
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="txk-structure-lessons">
                {group.lessonIds.map((lessonId, lessonIndex) => {
                  const lesson = lessonMap.get(lessonId);
                  if (!lesson) return null;
                  return (
                    <div
                      key={lesson.lessonId}
                      className="txk-structure-lesson"
                      draggable={canEdit}
                      onDragStart={(event) => event.dataTransfer.setData("application/x-txk-lesson", lesson.lessonId)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const dragged = event.dataTransfer.getData("application/x-txk-lesson");
                        if (dragged && dragged !== lesson.lessonId) {
                          dropLesson(dragged, groupIndex, lesson.lessonId);
                        }
                      }}
                    >
                      <Bars3Icon className="txk-drag-handle" aria-hidden="true" />
                      <div className="txk-structure-lesson-copy">
                        <strong>{lesson.title}</strong>
                        <span>{lesson.blocks.length} blocks · {lesson.estimatedMinutes ?? 0} min · {lesson.required ? "Required" : "Optional"}</span>
                      </div>
                      <StatusBadge tone={lesson.status === "ready" ? "info" : "neutral"}>{lesson.status}</StatusBadge>
                      <div className="txk-structure-lesson-actions">
                        <Button size="sm" type="button" onClick={() => moveLessonKeyboard(groupIndex, lessonIndex, -1)} disabled={!canEdit || lessonIndex === 0 || Boolean(busy)}>
                          <ArrowUpIcon aria-hidden="true" />
                          <span className="sr-only">Move lesson up</span>
                        </Button>
                        <Button size="sm" type="button" onClick={() => moveLessonKeyboard(groupIndex, lessonIndex, 1)} disabled={!canEdit || lessonIndex === group.lessonIds.length - 1 || Boolean(busy)}>
                          <ArrowDownIcon aria-hidden="true" />
                          <span className="sr-only">Move lesson down</span>
                        </Button>
                        <Button size="sm" type="button" onClick={() => saveTemplate(lesson)} disabled={!canEdit || Boolean(busy)}>
                          <BookmarkSquareIcon aria-hidden="true" />
                          Template
                        </Button>
                        <Link className="txk-button txk-button-primary txk-button-sm" href={`/employer/learning/${encodeURIComponent(course.microCertId)}/lessons/${encodeURIComponent(lesson.lessonId)}`}>
                          Edit lesson
                        </Link>
                      </div>
                    </div>
                  );
                })}
                {group.lessonIds.length === 0 ? (
                  <EmptyState title="No lessons in this section" description={canEdit ? "Drag a lesson here or create one below." : "No lessons are assigned here."} />
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {canEdit ? (
        <aside className="txk-structure-sidebar">
          <Card>
            <p className="txk-eyebrow">Add section</p>
            <form className="txk-form-stack" onSubmit={createSection}>
              <FormField label="Section title"><Input name="title" required /></FormField>
              <FormField label="Description"><Textarea name="description" /></FormField>
              <Button tone="primary" type="submit" disabled={Boolean(busy)}>
                <PlusIcon aria-hidden="true" /> Add section
              </Button>
            </form>
          </Card>

          <Card>
            <p className="txk-eyebrow">Add lesson</p>
            <form className="txk-form-stack" onSubmit={createLesson}>
              <FormField label="Lesson title"><Input name="title" required /></FormField>
              <FormField label="Section">
                <select className="txk-input" name="sectionId" defaultValue="">
                  <option value="">Unsectioned</option>
                  {course.sections.map((section) => <option key={section.sectionId} value={section.sectionId}>{section.title}</option>)}
                </select>
              </FormField>
              <Button tone="primary" type="submit" disabled={Boolean(busy)}>
                <PlusIcon aria-hidden="true" /> Add lesson
              </Button>
            </form>
          </Card>

          <Card>
            <p className="txk-eyebrow">Employer templates</p>
            <h3>Reusable lessons</h3>
            {reusable.lessonTemplates.length ? (
              <div className="txk-template-list">
                {reusable.lessonTemplates.map((template) => (
                  <div key={template.lessonTemplateId}>
                    <strong>{template.title}</strong>
                    <Button size="sm" type="button" onClick={() => insertTemplate(template.lessonTemplateId, null)} disabled={Boolean(busy)}>
                      Add to course
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Save a lesson as a template to reuse it across this Employer's courses.</p>
            )}
          </Card>
        </aside>
      ) : null}
    </div>
  );
}
