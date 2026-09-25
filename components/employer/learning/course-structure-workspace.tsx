"use client";

import {
  ArchiveBoxIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  Bars3Icon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  Button,
  Card,
  FormField,
  Input,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import type {
  EmployerLearningCourseSection,
  EmployerLearningLesson,
  EmployerLearningLessonTemplate,
  EmployerMicroCertAuthoringDetail,
} from "@/lib/employer/learning-types";

type StructureGroup = {
  sectionId: string | null;
  title: string;
  description?: string | null;
  required?: boolean;
  lessons: EmployerLearningLesson[];
};

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Employer Learning request failed.");
  return body;
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function CourseStructureWorkspace({
  course,
  canManage,
  lessonTemplates,
}: {
  course: EmployerMicroCertAuthoringDetail;
  canManage: boolean;
  lessonTemplates: EmployerLearningLessonTemplate[];
}) {
  const router = useRouter();
  const immutable =
    course.currentVersion.status === "live" ||
    course.currentVersion.status === "archived";
  const canEdit = canManage && !immutable;
  const base = `/api/employer/learning/courses/${encodeURIComponent(course.microCertId)}`;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragLessonId, setDragLessonId] = useState<string | null>(null);
  const [dragSectionId, setDragSectionId] = useState<string | null>(null);

  const groups = useMemo<StructureGroup[]>(() => {
    const orderedSections = [...course.sections].sort((a, b) => a.sequence - b.sequence);
    const map = new Map<string | null, EmployerLearningLesson[]>();
    map.set(null, []);
    for (const section of orderedSections) map.set(section.sectionId, []);
    for (const lesson of [...course.lessons].sort((a, b) => a.sequence - b.sequence)) {
      const key =
        lesson.sectionId && map.has(lesson.sectionId) ? lesson.sectionId : null;
      map.get(key)?.push(lesson);
    }
    const result: StructureGroup[] = orderedSections.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      description: section.description,
      required: section.required,
      lessons: map.get(section.sectionId) ?? [],
    }));
    if ((map.get(null) ?? []).length || orderedSections.length === 0) {
      result.push({
        sectionId: null,
        title: orderedSections.length ? "Unsectioned lessons" : "Course lessons",
        lessons: map.get(null) ?? [],
      });
    }
    return result;
  }, [course.lessons, course.sections]);

  async function run(key: string, task: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await task();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update course structure.");
    } finally {
      setBusy(null);
    }
  }

  function serialize(nextGroups: StructureGroup[]) {
    const sectionGroups = nextGroups.filter((group) => group.sectionId !== null);
    const unsectioned = nextGroups.find((group) => group.sectionId === null);
    return [
      ...sectionGroups.map((group) => ({
        sectionId: group.sectionId,
        lessonIds: group.lessons.map((lesson) => lesson.lessonId),
      })),
      {
        sectionId: null,
        lessonIds: unsectioned?.lessons.map((lesson) => lesson.lessonId) ?? [],
      },
    ];
  }

  async function saveStructure(nextGroups: StructureGroup[]) {
    await run("structure", () =>
      requestJson(`${base}/structure`, {
        method: "PUT",
        body: JSON.stringify({ structure: serialize(nextGroups) }),
      }),
    );
  }

  async function createSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run("new-section", async () => {
      await requestJson(`${base}/sections`, {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          required: form.get("required") === "on",
        }),
      });
      event.currentTarget.reset();
    });
  }

  async function updateSection(
    event: FormEvent<HTMLFormElement>,
    section: EmployerLearningCourseSection,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(`section-${section.sectionId}`, () =>
      requestJson(`${base}/sections/${encodeURIComponent(section.sectionId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          required: form.get("required") === "on",
        }),
      }),
    );
  }

  async function deleteSection(sectionId: string) {
    if (!window.confirm("Delete this section? Its lessons will become unsectioned.")) return;
    await run(`delete-section-${sectionId}`, () =>
      requestJson(`${base}/sections/${encodeURIComponent(sectionId)}`, {
        method: "DELETE",
      }),
    );
  }

  async function createLesson(event: FormEvent<HTMLFormElement>, sectionId: string | null) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = String(form.get("estimatedMinutes") ?? "").trim();
    await run("new-lesson", async () => {
      await requestJson(`${base}/lessons`, {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          learningObjective:
            String(form.get("learningObjective") ?? "").trim() || null,
          estimatedMinutes: minutes ? Number(minutes) : null,
          required: form.get("required") === "on",
          status: "draft",
          sectionId,
        }),
      });
      event.currentTarget.reset();
    });
  }

  async function duplicateLesson(lessonId: string) {
    await run(`duplicate-${lessonId}`, () =>
      requestJson(`${base}/lessons/${encodeURIComponent(lessonId)}/duplicate`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
  }

  async function archiveLesson(lessonId: string) {
    if (!window.confirm("Archive this lesson from the current course version?")) return;
    await run(`archive-${lessonId}`, () =>
      requestJson(`${base}/lessons/${encodeURIComponent(lessonId)}`, {
        method: "DELETE",
      }),
    );
  }

  async function moveLesson(
    groupIndex: number,
    lessonIndex: number,
    direction: -1 | 1,
  ) {
    const next = groups.map((group) => ({ ...group, lessons: [...group.lessons] }));
    const group = next[groupIndex];
    const target = lessonIndex + direction;
    if (target < 0 || target >= group.lessons.length) return;
    group.lessons = move(group.lessons, lessonIndex, target);
    await saveStructure(next);
  }

  async function moveLessonToSection(lessonId: string, targetSectionId: string | null) {
    const next = groups.map((group) => ({ ...group, lessons: [...group.lessons] }));
    let lesson: EmployerLearningLesson | undefined;
    for (const group of next) {
      const index = group.lessons.findIndex((item) => item.lessonId === lessonId);
      if (index >= 0) {
        [lesson] = group.lessons.splice(index, 1);
        break;
      }
    }
    if (!lesson) return;
    let target = next.find((group) => group.sectionId === targetSectionId);
    if (!target) {
      target = {
        sectionId: null,
        title: "Unsectioned lessons",
        lessons: [],
      };
      next.push(target);
    }
    target.lessons.push({ ...lesson, sectionId: targetSectionId });
    await saveStructure(next);
  }

  async function moveSection(index: number, direction: -1 | 1) {
    const sectionGroups = groups.filter((group) => group.sectionId !== null);
    const target = index + direction;
    if (target < 0 || target >= sectionGroups.length) return;
    const reordered = move(sectionGroups, index, target);
    const unsectioned = groups.find((group) => group.sectionId === null);
    await saveStructure(unsectioned ? [...reordered, unsectioned] : reordered);
  }

  async function insertTemplate(templateId: string, sectionId: string | null) {
    await run(`template-${templateId}`, () =>
      requestJson("/api/employer/learning/reusable", {
        method: "POST",
        body: JSON.stringify({
          action: "insert_lesson_template",
          microCertId: course.microCertId,
          lessonTemplateId: templateId,
          sectionId,
        }),
      }),
    );
  }

  function handleLessonDrop(targetSectionId: string | null) {
    if (!dragLessonId || !canEdit) return;
    void moveLessonToSection(dragLessonId, targetSectionId);
    setDragLessonId(null);
  }

  return (
    <div className="txk-structure-workspace">
      {error ? <div className="alert">{error}</div> : null}

      <div className="txk-structure-toolbar">
        <div>
          <p className="txk-eyebrow">Course architecture</p>
          <h2>Sections & lessons</h2>
          <p>
            Organize the course here. Open a lesson to edit its detailed content.
          </p>
        </div>
        <StatusBadge tone={immutable ? "warning" : "info"}>
          {immutable ? "Version locked" : "Draft architecture"}
        </StatusBadge>
      </div>

      {canEdit ? (
        <Card className="txk-structure-add-section">
          <details>
            <summary>
              <PlusIcon aria-hidden="true" />
              Add section
            </summary>
            <form className="txk-form-stack" onSubmit={createSection}>
              <FormField label="Section title">
                <Input name="title" required maxLength={200} />
              </FormField>
              <FormField label="Description">
                <Textarea name="description" />
              </FormField>
              <label className="txk-check-field">
                <input name="required" type="checkbox" defaultChecked />
                <span>Required section</span>
              </label>
              <Button tone="primary" type="submit" disabled={Boolean(busy)}>
                Create section
              </Button>
            </form>
          </details>
        </Card>
      ) : null}

      <div className="txk-structure-groups">
        {groups.map((group, groupIndex) => {
          const section = group.sectionId
            ? course.sections.find((item) => item.sectionId === group.sectionId)
            : null;
          const sectionIndex = groups
            .filter((item) => item.sectionId !== null)
            .findIndex((item) => item.sectionId === group.sectionId);

          return (
            <Card
              key={group.sectionId ?? "unsectioned"}
              className={`txk-structure-group ${dragSectionId === group.sectionId ? "is-dragging" : ""}`}
              draggable={Boolean(canEdit && group.sectionId)}
              onDragStart={(event) => {
                if (!group.sectionId) return;
                if ((event.target as HTMLElement).closest(".txk-structure-lesson")) {
                  event.preventDefault();
                  return;
                }
                setDragSectionId(group.sectionId);
              }}
              onDragEnd={() => setDragSectionId(null)}
              onDragOver={(event) => {
                if (dragLessonId) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleLessonDrop(group.sectionId);
              }}
            >
              <div className="txk-structure-group-head">
                <div className="txk-structure-drag" aria-hidden="true">
                  <Bars3Icon />
                </div>
                <div>
                  <p className="txk-eyebrow">
                    {group.sectionId ? `Section ${sectionIndex + 1}` : "Unsectioned"}
                  </p>
                  <h3>{group.title}</h3>
                  {group.description ? <p>{group.description}</p> : null}
                </div>
                <StatusBadge tone="neutral">
                  {group.lessons.length} lesson{group.lessons.length === 1 ? "" : "s"}
                </StatusBadge>
              </div>

              {section && canEdit ? (
                <details className="txk-section-settings">
                  <summary>Edit section</summary>
                  <form
                    className="txk-form-stack"
                    onSubmit={(event) => updateSection(event, section)}
                  >
                    <FormField label="Title">
                      <Input name="title" defaultValue={section.title} required />
                    </FormField>
                    <FormField label="Description">
                      <Textarea name="description" defaultValue={section.description ?? ""} />
                    </FormField>
                    <label className="txk-check-field">
                      <input
                        name="required"
                        type="checkbox"
                        defaultChecked={section.required}
                      />
                      <span>Required section</span>
                    </label>
                    <div className="txk-form-actions">
                      <Button type="submit" size="sm" disabled={Boolean(busy)}>
                        Save section
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={sectionIndex === 0 || Boolean(busy)}
                        onClick={() => moveSection(sectionIndex, -1)}
                      >
                        <ArrowUpIcon aria-hidden="true" />
                        Move up
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          sectionIndex === course.sections.length - 1 || Boolean(busy)
                        }
                        onClick={() => moveSection(sectionIndex, 1)}
                      >
                        <ArrowDownIcon aria-hidden="true" />
                        Move down
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        tone="danger"
                        disabled={Boolean(busy)}
                        onClick={() => deleteSection(section.sectionId)}
                      >
                        <TrashIcon aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  </form>
                </details>
              ) : null}

              <div className="txk-structure-lessons">
                {group.lessons.map((lesson, lessonIndex) => (
                  <div
                    key={lesson.lessonId}
                    className={`txk-structure-lesson ${lesson.status === "archived" ? "is-archived" : ""}`}
                    draggable={canEdit && lesson.status !== "archived"}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      setDragLessonId(lesson.lessonId);
                    }}
                    onDragEnd={() => setDragLessonId(null)}
                  >
                    <div className="txk-structure-lesson-drag" aria-hidden="true">
                      <Bars3Icon />
                    </div>
                    <div className="txk-structure-lesson-main">
                      <strong>{lesson.title}</strong>
                      <span>
                        {lesson.estimatedMinutes ? `${lesson.estimatedMinutes} min · ` : ""}
                        {lesson.blocks.length} block{lesson.blocks.length === 1 ? "" : "s"}
                        {lesson.required ? " · required" : " · optional"}
                      </span>
                    </div>
                    <StatusBadge tone={lesson.status === "ready" ? "info" : "neutral"}>
                      {lesson.status}
                    </StatusBadge>
                    <div className="txk-structure-lesson-actions">
                      <Link
                        className="txk-button txk-button-primary txk-button-sm"
                        href={`/employer/learning/${encodeURIComponent(course.microCertId)}/lessons/${encodeURIComponent(lesson.lessonId)}/edit`}
                      >
                        <PencilSquareIcon aria-hidden="true" />
                        Edit lesson
                      </Link>
                      {canEdit && lesson.status !== "archived" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            aria-label={`Move ${lesson.title} up`}
                            disabled={lessonIndex === 0 || Boolean(busy)}
                            onClick={() => moveLesson(groupIndex, lessonIndex, -1)}
                          >
                            <ArrowUpIcon aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            aria-label={`Move ${lesson.title} down`}
                            disabled={
                              lessonIndex === group.lessons.length - 1 || Boolean(busy)
                            }
                            onClick={() => moveLesson(groupIndex, lessonIndex, 1)}
                          >
                            <ArrowDownIcon aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            aria-label={`Duplicate ${lesson.title}`}
                            disabled={Boolean(busy)}
                            onClick={() => duplicateLesson(lesson.lessonId)}
                          >
                            <DocumentDuplicateIcon aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            tone="danger"
                            aria-label={`Archive ${lesson.title}`}
                            disabled={Boolean(busy)}
                            onClick={() => archiveLesson(lesson.lessonId)}
                          >
                            <ArchiveBoxIcon aria-hidden="true" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {canEdit ? (
                <details className="txk-structure-add-lesson">
                  <summary>
                    <PlusIcon aria-hidden="true" />
                    Add lesson to {group.sectionId ? group.title : "course"}
                  </summary>
                  <form
                    className="txk-form-stack"
                    onSubmit={(event) => createLesson(event, group.sectionId)}
                  >
                    <div className="txk-form-grid-2">
                      <FormField label="Lesson title">
                        <Input name="title" required />
                      </FormField>
                      <FormField label="Estimated minutes">
                        <Input name="estimatedMinutes" type="number" min="0" />
                      </FormField>
                    </div>
                    <FormField label="Description">
                      <Textarea name="description" />
                    </FormField>
                    <FormField label="Learning objective">
                      <Textarea name="learningObjective" />
                    </FormField>
                    <label className="txk-check-field">
                      <input name="required" type="checkbox" defaultChecked />
                      <span>Required lesson</span>
                    </label>
                    <Button tone="primary" type="submit" disabled={Boolean(busy)}>
                      <PlusIcon aria-hidden="true" />
                      Add lesson
                    </Button>
                  </form>

                  {lessonTemplates.length ? (
                    <div className="txk-template-picker">
                      <span>Or start from an Employer template</span>
                      <div>
                        {lessonTemplates.map((template) => (
                          <Button
                            key={template.lessonTemplateId}
                            type="button"
                            size="sm"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              insertTemplate(template.lessonTemplateId, group.sectionId)
                            }
                          >
                            {template.title}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </details>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
