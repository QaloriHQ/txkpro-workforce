"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsRightLeftIcon,
  Bars3Icon,
  BookmarkSquareIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import {
  FormEvent,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  IconButton,
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

type StructureModal =
  | { kind: "section-create" }
  | { kind: "section-edit"; sectionId: string }
  | { kind: "lesson-create"; sectionId: string | null }
  | { kind: "lesson-move"; lessonId: string }
  | null;

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
    course?: EmployerMicroCertAuthoringDetail;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to update course structure.");
  }
  return body;
}

function initialGroups(course: EmployerMicroCertAuthoringDetail): Group[] {
  const groups: Group[] = course.sections
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((section) => ({
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
  const [optimisticGroups, setOptimisticGroups] = useState<Group[] | null>(null);
  const groups = optimisticGroups ?? initialGroups(course);
  const [modal, setModal] = useState<StructureModal>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const immutable = ["live", "archived"].includes(course.currentVersion.status);
  const canEdit = canManage && !immutable;

  const lessonMap = useMemo(
    () => new Map(course.lessons.map((lesson) => [lesson.lessonId, lesson])),
    [course.lessons],
  );
  const sectionMap = useMemo(
    () =>
      new Map(
        course.sections.map((section) => [section.sectionId, section]),
      ),
    [course.sections],
  );
  const base = `/api/employer/learning/courses/${encodeURIComponent(
    course.microCertId,
  )}`;

  async function persist(next: Group[]) {
    if (!canEdit) return;
    setOptimisticGroups(next);
    setBusy("structure");
    setError(null);
    try {
      await requestJson(`${base}/structure`, {
        method: "PUT",
        body: JSON.stringify({ structure: next }),
      });
      setOptimisticGroups(null);
      router.refresh();
    } catch (cause) {
      setOptimisticGroups(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update structure.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("section-create");
    setError(null);
    try {
      await requestJson(`${base}/sections`, {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description:
            String(form.get("description") ?? "").trim() || null,
          required: form.get("required") === "on",
        }),
      });
      formElement.reset();
      setModal(null);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create section.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function updateSection(
    event: FormEvent<HTMLFormElement>,
    sectionId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(`section-edit-${sectionId}`);
    setError(null);
    try {
      await requestJson(
        `${base}/sections/${encodeURIComponent(sectionId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: String(form.get("title") ?? "").trim(),
            description:
              String(form.get("description") ?? "").trim() || null,
            required: form.get("required") === "on",
          }),
        },
      );
      setModal(null);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update section.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function duplicateSection(sectionId: string) {
    setBusy(`duplicate-${sectionId}`);
    setError(null);
    try {
      await requestJson(
        `${base}/sections/${encodeURIComponent(sectionId)}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to duplicate section.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function deleteSection(sectionId: string) {
    if (
      !window.confirm(
        "Delete this section? Its lessons will be moved to Unsectioned. No lessons will be deleted.",
      )
    ) {
      return;
    }
    setBusy(`delete-${sectionId}`);
    setError(null);
    try {
      await requestJson(
        `${base}/sections/${encodeURIComponent(sectionId)}`,
        {
          method: "DELETE",
          body: JSON.stringify({}),
        },
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete section.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("lesson-create");
    setError(null);
    try {
      await requestJson(`${base}/lessons`, {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description:
            String(form.get("description") ?? "").trim() || null,
          sectionId: String(form.get("sectionId") ?? "") || null,
          required: form.get("required") === "on",
          status: "draft",
        }),
      });
      formElement.reset();
      setModal(null);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create lesson.",
      );
    } finally {
      setBusy(null);
    }
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= groups.length - 1) return;
    const next = groups.map((group) => ({
      ...group,
      lessonIds: [...group.lessonIds],
    }));
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    void persist(next);
  }

  function moveLessonKeyboard(
    groupIndex: number,
    lessonIndex: number,
    direction: -1 | 1,
  ) {
    const group = groups[groupIndex];
    const target = lessonIndex + direction;
    if (target < 0 || target >= group.lessonIds.length) return;
    const next = groups.map((item) => ({
      ...item,
      lessonIds: [...item.lessonIds],
    }));
    const [lessonId] = next[groupIndex].lessonIds.splice(lessonIndex, 1);
    next[groupIndex].lessonIds.splice(target, 0, lessonId);
    void persist(next);
  }

  function moveLessonToSection(
    lessonId: string,
    sectionId: string | null,
  ) {
    const next = removeLesson(groups, lessonId).map((item) => ({
      ...item,
      lessonIds: [...item.lessonIds],
    }));
    const target = next.find((group) => group.sectionId === sectionId);
    if (!target) return;
    target.lessonIds.push(lessonId);
    setModal(null);
    void persist(next);
  }

  function dropLesson(
    lessonId: string,
    groupIndex: number,
    beforeLessonId?: string,
  ) {
    const next = removeLesson(groups, lessonId).map((item) => ({
      ...item,
      lessonIds: [...item.lessonIds],
    }));
    const target = next[groupIndex];
    const index = beforeLessonId
      ? target.lessonIds.indexOf(beforeLessonId)
      : -1;
    if (index >= 0) target.lessonIds.splice(index, 0, lessonId);
    else target.lessonIds.push(lessonId);
    void persist(next);
  }

  async function saveTemplate(lesson: EmployerLearningLesson) {
    const title = window.prompt("Template name", lesson.title);
    if (!title) return;
    setBusy(`template-${lesson.lessonId}`);
    setError(null);
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
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save template.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function insertTemplate(
    templateId: string,
    sectionId: string | null,
  ) {
    setBusy("insert-template");
    setError(null);
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
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to add template.",
      );
    } finally {
      setBusy(null);
    }
  }

  const editSection =
    modal?.kind === "section-edit"
      ? sectionMap.get(modal.sectionId) ?? null
      : null;
  const moveLesson =
    modal?.kind === "lesson-move"
      ? lessonMap.get(modal.lessonId) ?? null
      : null;

  return (
    <div className="txk-structure-layout">
      {error ? <div className="alert txk-structure-alert">{error}</div> : null}

      <div className="txk-structure-main">
        {canEdit ? (
          <div className="txk-structure-toolbar">
            <div>
              <p className="txk-eyebrow">Course architecture</p>
              <span>
                Organize sections and lessons. Detailed content stays in Lesson
                Editor.
              </span>
            </div>
            <div className="txk-form-actions">
              <Button
                type="button"
                onClick={() => setModal({ kind: "section-create" })}
              >
                <PlusIcon aria-hidden="true" />
                Add section
              </Button>
              <Button
                type="button"
                tone="primary"
                onClick={() =>
                  setModal({ kind: "lesson-create", sectionId: null })
                }
              >
                <PlusIcon aria-hidden="true" />
                Add lesson
              </Button>
            </div>
          </div>
        ) : null}

        {groups.map((group, groupIndex) => {
          const section = group.sectionId
            ? sectionMap.get(group.sectionId)
            : null;
          const isUnsectioned = !group.sectionId;

          return (
            <Card
              className="txk-structure-section"
              key={group.sectionId ?? "unsectioned"}
              draggable={canEdit && !isUnsectioned}
              onDragStart={(event) => {
                if (group.sectionId) {
                  event.dataTransfer.setData(
                    "application/x-txk-section",
                    group.sectionId,
                  );
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const lessonId = event.dataTransfer.getData(
                  "application/x-txk-lesson",
                );
                const sectionId = event.dataTransfer.getData(
                  "application/x-txk-section",
                );
                if (lessonId) dropLesson(lessonId, groupIndex);
                if (
                  sectionId &&
                  group.sectionId &&
                  sectionId !== group.sectionId
                ) {
                  const from = groups.findIndex(
                    (item) => item.sectionId === sectionId,
                  );
                  const to = groups.findIndex(
                    (item) => item.sectionId === group.sectionId,
                  );
                  if (from >= 0 && to >= 0) {
                    const next = groups.map((item) => ({
                      ...item,
                      lessonIds: [...item.lessonIds],
                    }));
                    const [item] = next.splice(from, 1);
                    next.splice(to, 0, item);
                    void persist(next);
                  }
                }
              }}
            >
              <div className="txk-structure-section-head">
                <div>
                  <p className="txk-eyebrow">
                    {isUnsectioned
                      ? "Course"
                      : `Section ${groupIndex + 1}`}
                  </p>
                  <h2>
                    {isUnsectioned
                      ? "Unsectioned lessons"
                      : section?.title}
                  </h2>
                  {section?.description ? (
                    <p>{section.description}</p>
                  ) : null}
                </div>

                {canEdit ? (
                  <>
                  <div className="txk-structure-section-actions">
                    <Button
                      size="sm"
                      type="button"
                      tone="primary"
                      onClick={() =>
                        setModal({
                          kind: "lesson-create",
                          sectionId: group.sectionId,
                        })
                      }
                    >
                      <PlusIcon aria-hidden="true" />
                      Add lesson
                    </Button>

                    {!isUnsectioned && section ? (
                      <>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() =>
                            setModal({
                              kind: "section-edit",
                              sectionId: section.sectionId,
                            })
                          }
                        >
                          <PencilSquareIcon aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() =>
                            duplicateSection(section.sectionId)
                          }
                          disabled={Boolean(busy)}
                        >
                          <DocumentDuplicateIcon aria-hidden="true" />
                          Duplicate
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => moveSection(groupIndex, -1)}
                          disabled={
                            groupIndex === 0 || Boolean(busy)
                          }
                        >
                          <ArrowUpIcon aria-hidden="true" />
                          <span className="sr-only">Move section up</span>
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => moveSection(groupIndex, 1)}
                          disabled={
                            groupIndex >= groups.length - 2 ||
                            Boolean(busy)
                          }
                        >
                          <ArrowDownIcon aria-hidden="true" />
                          <span className="sr-only">
                            Move section down
                          </span>
                        </Button>
                        <Button
                          size="sm"
                          tone="danger"
                          type="button"
                          onClick={() =>
                            deleteSection(section.sectionId)
                          }
                          disabled={Boolean(busy)}
                        >
                          <TrashIcon aria-hidden="true" />
                          <span className="sr-only">
                            Delete {section.title}
                          </span>
                        </Button>
                      </>
                    ) : null}
                  </div>
                    <details className="txk-section-mobile-menu">
                      <summary>
                        <EllipsisHorizontalIcon aria-hidden="true" />
                        <span>Section actions</span>
                      </summary>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setModal({
                              kind: "lesson-create",
                              sectionId: group.sectionId,
                            })
                          }
                        >
                          <PlusIcon aria-hidden="true" />
                          Add lesson
                        </button>
                        {!isUnsectioned && section ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setModal({
                                  kind: "section-edit",
                                  sectionId: section.sectionId,
                                })
                              }
                            >
                              <PencilSquareIcon aria-hidden="true" />
                              Edit section
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                duplicateSection(section.sectionId)
                              }
                            >
                              <DocumentDuplicateIcon aria-hidden="true" />
                              Duplicate section
                            </button>
                            <button
                              type="button"
                              disabled={groupIndex === 0 || Boolean(busy)}
                              onClick={() => moveSection(groupIndex, -1)}
                            >
                              <ArrowUpIcon aria-hidden="true" />
                              Move section up
                            </button>
                            <button
                              type="button"
                              disabled={
                                groupIndex >= groups.length - 2 ||
                                Boolean(busy)
                              }
                              onClick={() => moveSection(groupIndex, 1)}
                            >
                              <ArrowDownIcon aria-hidden="true" />
                              Move section down
                            </button>
                            <button
                              type="button"
                              className="danger"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                deleteSection(section.sectionId)
                              }
                            >
                              <TrashIcon aria-hidden="true" />
                              Delete section
                            </button>
                          </>
                        ) : null}
                      </div>
                    </details>
                  </>
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
                      onDragStart={(event) =>
                        event.dataTransfer.setData(
                          "application/x-txk-lesson",
                          lesson.lessonId,
                        )
                      }
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const dragged = event.dataTransfer.getData(
                          "application/x-txk-lesson",
                        );
                        if (
                          dragged &&
                          dragged !== lesson.lessonId
                        ) {
                          dropLesson(
                            dragged,
                            groupIndex,
                            lesson.lessonId,
                          );
                        }
                      }}
                    >
                      <Bars3Icon
                        className="txk-drag-handle"
                        aria-hidden="true"
                      />
                      <div className="txk-structure-lesson-copy">
                        <strong>{lesson.title}</strong>
                        <span>
                          {lesson.blocks.length} blocks ·{" "}
                          {lesson.estimatedMinutes ?? 0} min ·{" "}
                          {lesson.required ? "Required" : "Optional"}
                        </span>
                      </div>
                      <StatusBadge
                        tone={
                          lesson.status === "ready"
                            ? "info"
                            : "neutral"
                        }
                      >
                        {lesson.status}
                      </StatusBadge>
                      <div className="txk-structure-lesson-actions">
                        <Button
                          size="sm"
                          type="button"
                          onClick={() =>
                            moveLessonKeyboard(
                              groupIndex,
                              lessonIndex,
                              -1,
                            )
                          }
                          disabled={
                            !canEdit ||
                            lessonIndex === 0 ||
                            Boolean(busy)
                          }
                        >
                          <ArrowUpIcon aria-hidden="true" />
                          <span className="sr-only">
                            Move lesson up
                          </span>
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() =>
                            moveLessonKeyboard(
                              groupIndex,
                              lessonIndex,
                              1,
                            )
                          }
                          disabled={
                            !canEdit ||
                            lessonIndex ===
                              group.lessonIds.length - 1 ||
                            Boolean(busy)
                          }
                        >
                          <ArrowDownIcon aria-hidden="true" />
                          <span className="sr-only">
                            Move lesson down
                          </span>
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() =>
                            setModal({
                              kind: "lesson-move",
                              lessonId: lesson.lessonId,
                            })
                          }
                          disabled={!canEdit || Boolean(busy)}
                        >
                          <ArrowsRightLeftIcon aria-hidden="true" />
                          Move
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => saveTemplate(lesson)}
                          disabled={!canEdit || Boolean(busy)}
                        >
                          <BookmarkSquareIcon aria-hidden="true" />
                          Template
                        </Button>
                        <Link
                          className="txk-button txk-button-primary txk-button-sm"
                          href={`/employer/learning/${encodeURIComponent(
                            course.microCertId,
                          )}/lessons/${encodeURIComponent(
                            lesson.lessonId,
                          )}`}
                        >
                          Edit lesson
                        </Link>
                      </div>
                    </div>
                  );
                })}

                {group.lessonIds.length === 0 ? (
                  <EmptyState
                    title="No lessons in this section"
                    description={
                      canEdit
                        ? "Drag a lesson here, move an existing lesson, or add a new lesson."
                        : "No lessons are assigned here."
                    }
                    action={
                      canEdit ? (
                        <Button
                          type="button"
                          onClick={() =>
                            setModal({
                              kind: "lesson-create",
                              sectionId: group.sectionId,
                            })
                          }
                        >
                          <PlusIcon aria-hidden="true" />
                          Add lesson
                        </Button>
                      ) : undefined
                    }
                  />
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {canEdit ? (
        <aside className="txk-structure-sidebar">
          <Card>
            <p className="txk-eyebrow">Employer templates</p>
            <h3>Reusable lessons</h3>
            {reusable.lessonTemplates.length ? (
              <div className="txk-template-list">
                {reusable.lessonTemplates.map((template) => (
                  <div key={template.lessonTemplateId}>
                    <strong>{template.title}</strong>
                    <select
                      className="txk-input"
                      defaultValue=""
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) return;
                        void insertTemplate(
                          template.lessonTemplateId,
                          value === "__unsectioned" ? null : value,
                        );
                        event.currentTarget.value = "";
                      }}
                    >
                      <option value="">Add to…</option>
                      {course.sections.map((section) => (
                        <option
                          key={section.sectionId}
                          value={section.sectionId}
                        >
                          {section.title}
                        </option>
                      ))}
                      <option value="__unsectioned">
                        Unsectioned
                      </option>
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Save a lesson as a template to reuse it across this
                Employer&apos;s courses.
              </p>
            )}
          </Card>
        </aside>
      ) : null}

      {modal ? (
        <div
          className="txk-course-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.currentTarget === event.target &&
              !busy
            ) {
              setModal(null);
            }
          }}
        >
          <Card
            className="txk-course-dialog txk-structure-dialog"
            role="dialog"
            aria-modal="true"
          >
            <div className="txk-inline-heading">
              <div>
                <p className="txk-eyebrow">Course structure</p>
                <h2>
                  {modal.kind === "section-create"
                    ? "Add section"
                    : modal.kind === "section-edit"
                      ? "Edit section"
                      : modal.kind === "lesson-create"
                        ? "Add lesson"
                        : "Move lesson"}
                </h2>
              </div>
              <IconButton
                label="Close"
                disabled={Boolean(busy)}
                onClick={() => setModal(null)}
              >
                <XMarkIcon aria-hidden="true" />
              </IconButton>
            </div>

            {modal.kind === "section-create" ? (
              <form
                className="txk-form-stack"
                onSubmit={createSection}
              >
                <FormField label="Section title">
                  <Input name="title" required autoFocus />
                </FormField>
                <FormField label="Description">
                  <Textarea name="description" />
                </FormField>
                <label className="txk-check-field">
                  <input
                    name="required"
                    type="checkbox"
                    defaultChecked
                  />
                  <span>Required section</span>
                </label>
                <div className="txk-form-actions">
                  <Button
                    tone="primary"
                    type="submit"
                    disabled={Boolean(busy)}
                  >
                    <PlusIcon aria-hidden="true" />
                    Add section
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={Boolean(busy)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {modal.kind === "section-edit" && editSection ? (
              <form
                className="txk-form-stack"
                onSubmit={(event) =>
                  updateSection(event, editSection.sectionId)
                }
              >
                <FormField label="Section title">
                  <Input
                    name="title"
                    defaultValue={editSection.title}
                    required
                    autoFocus
                  />
                </FormField>
                <FormField label="Description">
                  <Textarea
                    name="description"
                    defaultValue={editSection.description ?? ""}
                  />
                </FormField>
                <label className="txk-check-field">
                  <input
                    name="required"
                    type="checkbox"
                    defaultChecked={editSection.required}
                  />
                  <span>Required section</span>
                </label>
                <div className="txk-form-actions">
                  <Button
                    tone="primary"
                    type="submit"
                    disabled={Boolean(busy)}
                  >
                    Save section
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={Boolean(busy)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {modal.kind === "lesson-create" ? (
              <form
                className="txk-form-stack"
                onSubmit={createLesson}
              >
                <FormField label="Lesson title">
                  <Input name="title" required autoFocus />
                </FormField>
                <FormField label="Description">
                  <Textarea name="description" />
                </FormField>
                <FormField label="Section">
                  <select
                    className="txk-input"
                    name="sectionId"
                    defaultValue={modal.sectionId ?? ""}
                  >
                    <option value="">Unsectioned</option>
                    {course.sections.map((section) => (
                      <option
                        key={section.sectionId}
                        value={section.sectionId}
                      >
                        {section.title}
                      </option>
                    ))}
                  </select>
                </FormField>
                <label className="txk-check-field">
                  <input
                    name="required"
                    type="checkbox"
                    defaultChecked
                  />
                  <span>Required lesson</span>
                </label>
                <div className="txk-form-actions">
                  <Button
                    tone="primary"
                    type="submit"
                    disabled={Boolean(busy)}
                  >
                    <PlusIcon aria-hidden="true" />
                    Add lesson
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={Boolean(busy)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {modal.kind === "lesson-move" && moveLesson ? (
              <form
                className="txk-form-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const value = String(
                    form.get("sectionId") ?? "",
                  );
                  moveLessonToSection(
                    moveLesson.lessonId,
                    value || null,
                  );
                }}
              >
                <p className="muted">
                  Move <strong>{moveLesson.title}</strong> to another
                  section. The lesson content remains unchanged.
                </p>
                <FormField label="Destination section">
                  <select
                    className="txk-input"
                    name="sectionId"
                    defaultValue={moveLesson.sectionId ?? ""}
                  >
                    <option value="">Unsectioned</option>
                    {course.sections.map((section) => (
                      <option
                        key={section.sectionId}
                        value={section.sectionId}
                      >
                        {section.title}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="txk-form-actions">
                  <Button
                    tone="primary"
                    type="submit"
                    disabled={Boolean(busy)}
                  >
                    <ArrowsRightLeftIcon aria-hidden="true" />
                    Move lesson
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={Boolean(busy)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
