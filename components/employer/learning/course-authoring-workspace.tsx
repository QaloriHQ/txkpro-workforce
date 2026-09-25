"use client";

import {
  ArchiveBoxIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  DocumentDuplicateIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  Button,
  Card,
  FormField,
  Input,
  RoleViewBanner,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import type {
  EmployerLearningLesson,
  EmployerLearningLessonBlock,
  EmployerMicroCertAuthoringDetail,
  LessonBlockType,
  MicroCertStatus,
} from "@/lib/employer/learning-types";

const editableCourseStatuses: MicroCertStatus[] = [
  "draft",
  "in_production",
  "review",
  "ready",
  "live",
  "archived",
];

const blockTypes: Array<{ value: LessonBlockType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
  { value: "document", label: "Document" },
  { value: "link", label: "Link" },
  { value: "embed", label: "Embed" },
  { value: "safety_note", label: "Safety note" },
];

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
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

function contentValue(block: EmployerLearningLessonBlock) {
  return block.blockType === "text" || block.blockType === "safety_note"
    ? String(block.content.text ?? "")
    : String(block.content.url ?? "");
}

export function CourseAuthoringWorkspace({
  course,
  canManage,
}: {
  course: EmployerMicroCertAuthoringDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const immutable =
    course.currentVersion.status === "live" ||
    course.currentVersion.status === "archived";
  const canEdit = canManage && !immutable;
  const courseBase = `/api/employer/learning/courses/${encodeURIComponent(course.microCertId)}`;

  async function run(key: string, task: () => Promise<unknown>) {
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    try {
      await task();
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Employer Learning request failed.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const durationRaw = String(form.get("durationMinutes") ?? "").trim();
    await run("course", () =>
      requestJson(courseBase, {
        method: "PATCH",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          learningObjective:
            String(form.get("learningObjective") ?? "").trim() || null,
          equipmentProcessContext:
            String(form.get("equipmentProcessContext") ?? "").trim() || null,
          safetyNotes: String(form.get("safetyNotes") ?? "").trim() || null,
          durationMinutes: durationRaw ? Number(durationRaw) : null,
          status: String(form.get("status") ?? "draft"),
          expectedVersionNumber: course.currentVersion.versionNumber,
        }),
      }),
    );
  }

  async function createVersion() {
    await run("version", () =>
      requestJson(`${courseBase}/versions`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
  }

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = String(form.get("estimatedMinutes") ?? "").trim();
    await run("new-lesson", async () => {
      await requestJson(`${courseBase}/lessons`, {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          learningObjective:
            String(form.get("learningObjective") ?? "").trim() || null,
          estimatedMinutes: minutes ? Number(minutes) : null,
          required: form.get("required") === "on",
          status: "draft",
        }),
      });
      event.currentTarget.reset();
    });
  }

  async function saveLesson(
    event: FormEvent<HTMLFormElement>,
    lesson: EmployerLearningLesson,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = String(form.get("estimatedMinutes") ?? "").trim();
    await run(`lesson-${lesson.lessonId}`, () =>
      requestJson(
        `${courseBase}/lessons/${encodeURIComponent(lesson.lessonId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: String(form.get("title") ?? "").trim(),
            description: String(form.get("description") ?? "").trim() || null,
            learningObjective:
              String(form.get("learningObjective") ?? "").trim() || null,
            estimatedMinutes: minutes ? Number(minutes) : null,
            required: form.get("required") === "on",
            status: String(form.get("status") ?? "draft"),
          }),
        },
      ),
    );
  }

  async function reorderLesson(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= course.lessons.length) return;
    const ids = move(course.lessons, index, target).map((lesson) => lesson.lessonId);
    await run("lesson-order", () =>
      requestJson(`${courseBase}/lessons`, {
        method: "PUT",
        body: JSON.stringify({ lessonIds: ids }),
      }),
    );
  }

  async function duplicateLesson(lessonId: string) {
    await run(`duplicate-${lessonId}`, () =>
      requestJson(
        `${courseBase}/lessons/${encodeURIComponent(lessonId)}/duplicate`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    );
  }

  async function archiveLesson(lessonId: string) {
    if (!window.confirm("Archive this lesson from the current course version?")) return;
    await run(`archive-${lessonId}`, () =>
      requestJson(`${courseBase}/lessons/${encodeURIComponent(lessonId)}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      }),
    );
  }

  async function createBlock(
    event: FormEvent<HTMLFormElement>,
    lesson: EmployerLearningLesson,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const blockType = String(form.get("blockType") ?? "text") as LessonBlockType;
    const value = String(form.get("contentValue") ?? "").trim();
    const content =
      blockType === "text" || blockType === "safety_note"
        ? { text: value }
        : { url: value };

    await run(`new-block-${lesson.lessonId}`, async () => {
      await requestJson(
        `${courseBase}/lessons/${encodeURIComponent(lesson.lessonId)}/blocks`,
        {
          method: "POST",
          body: JSON.stringify({
            blockType,
            title: String(form.get("title") ?? "").trim() || null,
            content,
            required: form.get("required") === "on",
          }),
        },
      );
      event.currentTarget.reset();
    });
  }

  async function saveBlock(
    event: FormEvent<HTMLFormElement>,
    lesson: EmployerLearningLesson,
    block: EmployerLearningLessonBlock,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = String(form.get("contentValue") ?? "").trim();
    const content =
      block.blockType === "text" || block.blockType === "safety_note"
        ? { ...block.content, text: value }
        : { ...block.content, url: value };

    await run(`block-${block.lessonBlockId}`, () =>
      requestJson(
        `${courseBase}/lessons/${encodeURIComponent(lesson.lessonId)}/blocks/${encodeURIComponent(block.lessonBlockId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: String(form.get("title") ?? "").trim() || null,
            content,
            required: form.get("required") === "on",
          }),
        },
      ),
    );
  }

  async function reorderBlock(
    lesson: EmployerLearningLesson,
    index: number,
    direction: -1 | 1,
  ) {
    const target = index + direction;
    if (target < 0 || target >= lesson.blocks.length) return;
    const ids = move(lesson.blocks, index, target).map(
      (block) => block.lessonBlockId,
    );
    await run(`block-order-${lesson.lessonId}`, () =>
      requestJson(
        `${courseBase}/lessons/${encodeURIComponent(lesson.lessonId)}/blocks`,
        {
          method: "PUT",
          body: JSON.stringify({ lessonBlockIds: ids }),
        },
      ),
    );
  }

  async function deleteBlock(
    lesson: EmployerLearningLesson,
    block: EmployerLearningLessonBlock,
  ) {
    if (!window.confirm("Delete this content block?")) return;
    await run(`delete-block-${block.lessonBlockId}`, () =>
      requestJson(
        `${courseBase}/lessons/${encodeURIComponent(lesson.lessonId)}/blocks/${encodeURIComponent(block.lessonBlockId)}`,
        { method: "DELETE", body: JSON.stringify({}) },
      ),
    );
  }

  return (
    <div className="txk-authoring-layout">
      {error ? <div className="alert txk-authoring-error">{error}</div> : null}

      {immutable && canManage ? (
        <RoleViewBanner title="Published version is locked">
          Create a new draft version to change lessons or content. The new version
          deep-copies the current lesson hierarchy and blocks.
        </RoleViewBanner>
      ) : null}

      <Card className="txk-authoring-section">
        <div className="txk-inline-heading">
          <div>
            <p className="txk-eyebrow">Course settings</p>
            <h2>Version {course.currentVersion.versionNumber}</h2>
          </div>
          <div className="txk-reference-row">
            <StatusBadge
              tone={
                course.currentVersion.status === "live"
                  ? "success"
                  : course.currentVersion.status === "ready"
                    ? "info"
                    : "neutral"
              }
            >
              {course.currentVersion.status.replaceAll("_", " ")}
            </StatusBadge>
            {canManage ? (
              <Button
                type="button"
                onClick={createVersion}
                disabled={Boolean(busyKey)}
              >
                <DocumentDuplicateIcon aria-hidden="true" />
                New version
              </Button>
            ) : null}
          </div>
        </div>

        <form className="txk-form-stack" onSubmit={saveCourse}>
          <div className="txk-form-grid-2">
            <FormField label="Course title">
              <Input
                name="title"
                defaultValue={course.title}
                required
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Version status">
              <select
                className="txk-input"
                name="status"
                defaultValue={course.currentVersion.status}
                disabled={!canManage}
              >
                {editableCourseStatuses.map((status) => (
                  <option value={status} key={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Description">
            <Textarea
              name="description"
              defaultValue={course.description ?? ""}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Learning objective">
            <Textarea
              name="learningObjective"
              defaultValue={course.currentVersion.learningObjective ?? ""}
              disabled={!canEdit}
            />
          </FormField>
          <div className="txk-form-grid-2">
            <FormField label="Equipment / process context">
              <Textarea
                name="equipmentProcessContext"
                defaultValue={course.currentVersion.equipmentProcessContext ?? ""}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Safety notes">
              <Textarea
                name="safetyNotes"
                defaultValue={course.currentVersion.safetyNotes ?? ""}
                disabled={!canEdit}
              />
            </FormField>
          </div>
          <FormField label="Estimated duration (minutes)">
            <Input
              name="durationMinutes"
              type="number"
              min="0"
              defaultValue={course.currentVersion.durationMinutes ?? ""}
              disabled={!canEdit}
            />
          </FormField>
          {canManage ? (
            <div className="txk-form-actions">
              <Button
                type="submit"
                tone="primary"
                disabled={!canEdit || Boolean(busyKey)}
              >
                {busyKey === "course" ? "Saving…" : "Save course"}
              </Button>
            </div>
          ) : null}
        </form>
      </Card>

      <section className="txk-section">
        <div className="txk-section-heading">
          <div>
            <p className="txk-eyebrow">Lesson builder</p>
            <h2>Course lessons</h2>
            <p>
              Lessons and ordered content blocks belong to this exact course
              version. Instructor Verified Skills are not modified.
            </p>
          </div>
          <StatusBadge tone="neutral">{course.lessons.length} lessons</StatusBadge>
        </div>

        <div className="txk-lesson-stack">
          {course.lessons.map((lesson, index) => (
            <Card
              className={`txk-lesson-card ${lesson.status === "archived" ? "is-archived" : ""}`}
              key={lesson.lessonId}
            >
              <div className="txk-lesson-heading">
                <div className="txk-lesson-number">{index + 1}</div>
                <div className="txk-lesson-title">
                  <strong>{lesson.title}</strong>
                  <span>
                    {lesson.estimatedMinutes
                      ? `${lesson.estimatedMinutes} min · `
                      : ""}
                    {lesson.blocks.length} block{lesson.blocks.length === 1 ? "" : "s"}
                  </span>
                </div>
                <StatusBadge tone={lesson.status === "archived" ? "neutral" : "info"}>
                  {lesson.status}
                </StatusBadge>
              </div>

              {canEdit && lesson.status !== "archived" ? (
                <div className="txk-lesson-actions">
                  <Button
                    size="sm"
                    type="button"
                    aria-label="Move lesson up"
                    disabled={index === 0 || Boolean(busyKey)}
                    onClick={() => reorderLesson(index, -1)}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                    Up
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    aria-label="Move lesson down"
                    disabled={index === course.lessons.length - 1 || Boolean(busyKey)}
                    onClick={() => reorderLesson(index, 1)}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                    Down
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() => duplicateLesson(lesson.lessonId)}
                  >
                    <DocumentDuplicateIcon aria-hidden="true" />
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    tone="danger"
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() => archiveLesson(lesson.lessonId)}
                  >
                    <ArchiveBoxIcon aria-hidden="true" />
                    Archive
                  </Button>
                </div>
              ) : null}

              <details className="txk-authoring-details" open={course.lessons.length <= 2}>
                <summary>Lesson details</summary>
                <form
                  className="txk-form-stack"
                  onSubmit={(event) => saveLesson(event, lesson)}
                >
                  <div className="txk-form-grid-2">
                    <FormField label="Lesson title">
                      <Input
                        name="title"
                        defaultValue={lesson.title}
                        required
                        disabled={!canEdit || lesson.status === "archived"}
                      />
                    </FormField>
                    <FormField label="Lesson status">
                      <select
                        className="txk-input"
                        name="status"
                        defaultValue={lesson.status === "ready" ? "ready" : "draft"}
                        disabled={!canEdit || lesson.status === "archived"}
                      >
                        <option value="draft">Draft</option>
                        <option value="ready">Ready</option>
                      </select>
                    </FormField>
                  </div>
                  <FormField label="Description">
                    <Textarea
                      name="description"
                      defaultValue={lesson.description ?? ""}
                      disabled={!canEdit || lesson.status === "archived"}
                    />
                  </FormField>
                  <FormField label="Learning objective">
                    <Textarea
                      name="learningObjective"
                      defaultValue={lesson.learningObjective ?? ""}
                      disabled={!canEdit || lesson.status === "archived"}
                    />
                  </FormField>
                  <div className="txk-form-grid-2">
                    <FormField label="Estimated minutes">
                      <Input
                        name="estimatedMinutes"
                        type="number"
                        min="0"
                        defaultValue={lesson.estimatedMinutes ?? ""}
                        disabled={!canEdit || lesson.status === "archived"}
                      />
                    </FormField>
                    <label className="txk-check-field">
                      <input
                        name="required"
                        type="checkbox"
                        defaultChecked={lesson.required}
                        disabled={!canEdit || lesson.status === "archived"}
                      />
                      <span>Required lesson</span>
                    </label>
                  </div>
                  {canEdit && lesson.status !== "archived" ? (
                    <Button
                      type="submit"
                      tone="primary"
                      disabled={Boolean(busyKey)}
                    >
                      Save lesson
                    </Button>
                  ) : null}
                </form>
              </details>

              <div className="txk-block-stack">
                {lesson.blocks.map((block, blockIndex) => (
                  <details className="txk-content-block" key={block.lessonBlockId}>
                    <summary>
                      <span className="txk-block-order">{blockIndex + 1}</span>
                      <strong>{block.title || block.blockType.replaceAll("_", " ")}</strong>
                      <span>{block.blockType.replaceAll("_", " ")}</span>
                    </summary>
                    <div className="txk-content-block-body">
                      <form
                        className="txk-form-stack"
                        onSubmit={(event) => saveBlock(event, lesson, block)}
                      >
                        <FormField label="Block title">
                          <Input
                            name="title"
                            defaultValue={block.title ?? ""}
                            disabled={!canEdit || lesson.status === "archived"}
                          />
                        </FormField>
                        <FormField
                          label={
                            block.blockType === "text" ||
                            block.blockType === "safety_note"
                              ? "Text"
                              : "URL"
                          }
                        >
                          {block.blockType === "text" ||
                          block.blockType === "safety_note" ? (
                            <Textarea
                              name="contentValue"
                              defaultValue={contentValue(block)}
                              required
                              disabled={!canEdit || lesson.status === "archived"}
                            />
                          ) : (
                            <Input
                              name="contentValue"
                              type="url"
                              defaultValue={contentValue(block)}
                              required
                              disabled={!canEdit || lesson.status === "archived"}
                            />
                          )}
                        </FormField>
                        <label className="txk-check-field">
                          <input
                            name="required"
                            type="checkbox"
                            defaultChecked={block.required}
                            disabled={!canEdit || lesson.status === "archived"}
                          />
                          <span>Required content block</span>
                        </label>
                        {canEdit && lesson.status !== "archived" ? (
                          <div className="txk-form-actions">
                            <Button type="submit" size="sm" disabled={Boolean(busyKey)}>
                              Save block
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={blockIndex === 0 || Boolean(busyKey)}
                              onClick={() => reorderBlock(lesson, blockIndex, -1)}
                            >
                              <ArrowUpIcon aria-hidden="true" />
                              Up
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                blockIndex === lesson.blocks.length - 1 ||
                                Boolean(busyKey)
                              }
                              onClick={() => reorderBlock(lesson, blockIndex, 1)}
                            >
                              <ArrowDownIcon aria-hidden="true" />
                              Down
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              tone="danger"
                              disabled={Boolean(busyKey)}
                              onClick={() => deleteBlock(lesson, block)}
                            >
                              <TrashIcon aria-hidden="true" />
                              Delete
                            </Button>
                          </div>
                        ) : null}
                      </form>
                    </div>
                  </details>
                ))}
              </div>

              {canEdit && lesson.status !== "archived" ? (
                <details className="txk-add-block">
                  <summary>
                    <PlusIcon aria-hidden="true" />
                    Add content block
                  </summary>
                  <form
                    className="txk-form-stack"
                    onSubmit={(event) => createBlock(event, lesson)}
                  >
                    <div className="txk-form-grid-2">
                      <FormField label="Block type">
                        <select className="txk-input" name="blockType" defaultValue="text">
                          {blockTypes.map((blockType) => (
                            <option value={blockType.value} key={blockType.value}>
                              {blockType.label}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="Block title">
                        <Input name="title" />
                      </FormField>
                    </div>
                    <FormField
                      label="Text or URL"
                      help="Text and safety-note blocks store text. Media, document, link and embed blocks store a URL."
                    >
                      <Textarea name="contentValue" required />
                    </FormField>
                    <label className="txk-check-field">
                      <input name="required" type="checkbox" defaultChecked />
                      <span>Required content block</span>
                    </label>
                    <Button type="submit" tone="primary" disabled={Boolean(busyKey)}>
                      <PlusIcon aria-hidden="true" />
                      Add block
                    </Button>
                  </form>
                </details>
              ) : null}
            </Card>
          ))}
        </div>

        {canEdit ? (
          <Card className="txk-new-lesson-card">
            <div>
              <p className="txk-eyebrow">Add lesson</p>
              <h3>New course lesson</h3>
            </div>
            <form className="txk-form-stack" onSubmit={createLesson}>
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
              <Button type="submit" tone="primary" disabled={Boolean(busyKey)}>
                <PlusIcon aria-hidden="true" />
                Add lesson
              </Button>
            </form>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
