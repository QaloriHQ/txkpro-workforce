"use client";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  Bars3Icon,
  BookmarkIcon,
  DocumentDuplicateIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DragEvent, FormEvent, useMemo, useState } from "react";
import {
  Button,
  Card,
  FormField,
  Input,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import { LearningBlockRenderer } from "@/components/employer/learning/learning-block-renderer";
import { RichTextEditor } from "@/components/employer/learning/rich-text-editor";
import type {
  EmployerLearningLesson,
  EmployerLearningLessonBlock,
  EmployerLearningReusableLibrary,
  EmployerMicroCertAuthoringDetail,
  LessonBlockType,
} from "@/lib/employer/learning-types";

type LibraryItem = {
  type: LessonBlockType;
  label: string;
  description: string;
};

const componentLibrary: LibraryItem[] = [
  { type: "rich_text", label: "Rich text", description: "Formatted body copy, links and lists" },
  { type: "heading", label: "Heading", description: "Section heading inside a lesson" },
  { type: "list", label: "List", description: "Bulleted procedural or reference list" },
  { type: "callout", label: "Callout", description: "Important process note or reminder" },
  { type: "safety_note", label: "Safety note", description: "Safety-specific instruction" },
  { type: "image", label: "Image", description: "Instructional image with alt text" },
  { type: "video", label: "Video", description: "Hosted training or demonstration video" },
  { type: "document", label: "Document", description: "PDF or supporting document" },
  { type: "link", label: "Link", description: "External reference link" },
  { type: "embed", label: "Embed", description: "Sandboxed external embed" },
  { type: "divider", label: "Divider", description: "Visual content separator" },
  { type: "button", label: "Button", description: "Prominent external action" },
  { type: "download", label: "Download", description: "Downloadable file resource" },
  { type: "accordion", label: "Accordion", description: "Expandable supporting content" },
  { type: "columns", label: "Columns", description: "Two-column comparison or steps" },
];

function defaultContent(type: LessonBlockType) {
  switch (type) {
    case "rich_text":
      return {
        html: "<p>Start writing lesson content…</p>",
        text: "Start writing lesson content…",
      };
    case "heading":
      return { text: "New heading", level: 2 };
    case "list":
      return { items: ["First item", "Second item"] };
    case "callout":
      return { text: "Important information for the learner." };
    case "safety_note":
      return { text: "Add the required safety guidance." };
    case "image":
      return {
        url: "https://example.com/image.jpg",
        alt: "Describe this instructional image",
        caption: "",
      };
    case "video":
      return { url: "https://example.com/video.mp4", caption: "" };
    case "document":
    case "link":
    case "download":
      return {
        url: "https://example.com/resource",
        label: "Open resource",
        caption: "",
      };
    case "embed":
      return { url: "https://example.com/embed" };
    case "button":
      return { url: "https://example.com", label: "Open resource" };
    case "accordion":
      return { title: "More information", body: "Add supporting content." };
    case "columns":
      return {
        columns: [{ text: "Left column" }, { text: "Right column" }],
      };
    case "divider":
      return {};
    default:
      return { text: "Start writing…" };
  }
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Employer Learning request failed.");
  }
  return body;
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function blockPrimaryValue(block: EmployerLearningLessonBlock) {
  const content = block.content ?? {};
  if (
    block.blockType === "heading" ||
    block.blockType === "callout" ||
    block.blockType === "safety_note"
  ) {
    return String(content.text ?? "");
  }
  if (block.blockType === "list") {
    return Array.isArray(content.items)
      ? content.items.map(String).join("\n")
      : "";
  }
  if (block.blockType === "accordion") {
    return String(content.body ?? "");
  }
  if (block.blockType === "columns") {
    const columns = Array.isArray(content.columns) ? content.columns : [];
    return columns
      .map((column) =>
        typeof column === "object" && column !== null && "text" in column
          ? String((column as { text?: unknown }).text ?? "")
          : String(column),
      )
      .join("\n");
  }
  return String(content.url ?? "");
}

export function LessonEditorWorkspace({
  course,
  lesson,
  canManage,
  reusableLibrary,
}: {
  course: EmployerMicroCertAuthoringDetail;
  lesson: EmployerLearningLesson;
  canManage: boolean;
  reusableLibrary: EmployerLearningReusableLibrary;
}) {
  const router = useRouter();
  const immutable =
    course.currentVersion.status === "live" ||
    course.currentVersion.status === "archived";
  const canEdit = canManage && !immutable && lesson.status !== "archived";
  const courseBase = `/api/employer/learning/courses/${encodeURIComponent(course.microCertId)}`;
  const lessonBase = `${courseBase}/lessons/${encodeURIComponent(lesson.lessonId)}`;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);

  const outline = useMemo(
    () => [...course.lessons].sort((a, b) => a.sequence - b.sequence),
    [course.lessons],
  );

  async function run(
    key: string,
    task: () => Promise<unknown>,
    refresh = true,
  ) {
    if (busy && key !== "autosave") return;
    if (key !== "autosave") setBusy(key);
    setError(null);
    try {
      await task();
      if (refresh) router.refresh();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unable to update lesson.";
      setError(message);
      throw cause;
    } finally {
      if (key !== "autosave") setBusy(null);
    }
  }

  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = String(form.get("estimatedMinutes") ?? "").trim();
    await run("lesson", () =>
      requestJson(lessonBase, {
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
      }),
    );
  }

  async function createBlock(type: LessonBlockType) {
    await run(`new-${type}`, () =>
      requestJson(`${lessonBase}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          blockType: type,
          title:
            componentLibrary.find((item) => item.type === type)?.label ?? null,
          content: defaultContent(type),
          required: true,
        }),
      }),
    );
  }

  async function updateBlock(
    block: EmployerLearningLessonBlock,
    input: Record<string, unknown>,
    refresh = true,
  ) {
    await run(
      refresh ? `block-${block.lessonBlockId}` : "autosave",
      () =>
        requestJson(
          `${lessonBase}/blocks/${encodeURIComponent(block.lessonBlockId)}`,
          {
            method: "PATCH",
            body: JSON.stringify(input),
          },
        ),
      refresh,
    );
  }

  async function saveGenericBlock(
    event: FormEvent<HTMLFormElement>,
    block: EmployerLearningLessonBlock,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const primary = String(form.get("primary") ?? "");
    const url = String(form.get("url") ?? "");
    const label = String(form.get("label") ?? "");
    const alt = String(form.get("alt") ?? "");
    const caption = String(form.get("caption") ?? "");
    const level = Number(form.get("level") ?? 2);

    let content: Record<string, unknown> = { ...block.content };
    switch (block.blockType) {
      case "heading":
        content = { text: primary, level };
        break;
      case "list":
        content = {
          items: primary
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        };
        break;
      case "callout":
      case "safety_note":
        content = { text: primary };
        break;
      case "image":
        content = { url, alt, caption };
        break;
      case "video":
        content = { url, caption };
        break;
      case "document":
      case "link":
      case "download":
        content = { url, label, caption };
        break;
      case "embed":
        content = { url };
        break;
      case "button":
        content = { url, label };
        break;
      case "accordion":
        content = { title: label, body: primary };
        break;
      case "columns":
        content = {
          columns: primary
            .split("\n")
            .map((text) => ({ text: text.trim() }))
            .filter((column) => column.text),
        };
        break;
      case "divider":
        content = {};
        break;
      default:
        content = { text: primary };
    }

    await updateBlock(block, {
      title: String(form.get("title") ?? "").trim() || null,
      content,
      required: form.get("required") === "on",
    });
  }

  async function deleteBlock(blockId: string) {
    if (!window.confirm("Delete this content block?")) return;
    await run(`delete-${blockId}`, () =>
      requestJson(
        `${lessonBase}/blocks/${encodeURIComponent(blockId)}`,
        { method: "DELETE" },
      ),
    );
  }

  async function reorderBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lesson.blocks.length) return;
    const ids = move(lesson.blocks, index, target).map(
      (block) => block.lessonBlockId,
    );
    await run("reorder", () =>
      requestJson(`${lessonBase}/blocks`, {
        method: "PUT",
        body: JSON.stringify({ lessonBlockIds: ids }),
      }),
    );
  }

  async function moveDraggedBlock(targetIndex: number) {
    if (!dragBlockId) return;
    const from = lesson.blocks.findIndex(
      (block) => block.lessonBlockId === dragBlockId,
    );
    if (from < 0 || from === targetIndex) return;
    const ids = move(lesson.blocks, from, targetIndex).map(
      (block) => block.lessonBlockId,
    );
    setDragBlockId(null);
    await run("reorder", () =>
      requestJson(`${lessonBase}/blocks`, {
        method: "PUT",
        body: JSON.stringify({ lessonBlockIds: ids }),
      }),
    );
  }

  async function saveReusable(block: EmployerLearningLessonBlock) {
    const title = window.prompt(
      "Reusable block name",
      block.title ?? "Reusable block",
    );
    if (!title) return;
    await run(`reuse-${block.lessonBlockId}`, () =>
      requestJson("/api/employer/learning/reusable", {
        method: "POST",
        body: JSON.stringify({
          action: "save_block",
          microCertId: course.microCertId,
          lessonId: lesson.lessonId,
          blockId: block.lessonBlockId,
          title,
        }),
      }),
    );
  }

  async function insertReusable(reusableBlockId: string) {
    await run(`insert-${reusableBlockId}`, () =>
      requestJson("/api/employer/learning/reusable", {
        method: "POST",
        body: JSON.stringify({
          action: "insert_block",
          microCertId: course.microCertId,
          lessonId: lesson.lessonId,
          reusableBlockId,
        }),
      }),
    );
  }

  async function saveLessonTemplate() {
    const title = window.prompt("Lesson template name", lesson.title);
    if (!title) return;
    await run("lesson-template", () =>
      requestJson("/api/employer/learning/reusable", {
        method: "POST",
        body: JSON.stringify({
          action: "save_lesson_template",
          microCertId: course.microCertId,
          lessonId: lesson.lessonId,
          title,
        }),
      }),
    );
  }

  function onLibraryDragStart(
    event: DragEvent<HTMLButtonElement>,
    type: LessonBlockType,
  ) {
    event.dataTransfer.setData("application/x-txk-block-type", type);
    event.dataTransfer.effectAllowed = "copy";
  }

  function onCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const type = event.dataTransfer.getData(
      "application/x-txk-block-type",
    ) as LessonBlockType;
    if (type && canEdit) void createBlock(type);
  }

  return (
    <div className="txk-lesson-editor-shell">
      {error ? <div className="alert txk-editor-alert">{error}</div> : null}

      <aside className="txk-editor-outline">
        <div className="txk-editor-panel-title">
          <Link
            href={`/employer/learning/${encodeURIComponent(course.microCertId)}/structure`}
          >
            <ArrowLeftIcon aria-hidden="true" />
            Course structure
          </Link>
          <strong>{course.title}</strong>
        </div>
        <nav aria-label="Course lesson outline">
          {outline.map((item, index) => (
            <Link
              key={item.lessonId}
              className={item.lessonId === lesson.lessonId ? "active" : ""}
              href={`/employer/learning/${encodeURIComponent(course.microCertId)}/lessons/${encodeURIComponent(item.lessonId)}/edit`}
            >
              <span>{index + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.blocks.length} blocks</small>
              </div>
            </Link>
          ))}
        </nav>
      </aside>

      <main
        className="txk-editor-canvas"
        onDragOver={(event) => {
          if (canEdit) event.preventDefault();
        }}
        onDrop={onCanvasDrop}
      >
        <div className="txk-editor-canvas-head">
          <div>
            <p className="txk-eyebrow">Lesson editor</p>
            <h1>{lesson.title}</h1>
            <span>
              Version {course.currentVersion.versionNumber} ·{" "}
              {lesson.required ? "Required" : "Optional"}
            </span>
          </div>
          <div className="txk-reference-row">
            <StatusBadge
              tone={lesson.status === "ready" ? "info" : "neutral"}
            >
              {lesson.status}
            </StatusBadge>
            <Link
              className="txk-button txk-button-default txk-button-sm"
              href={`/employer/learning/${encodeURIComponent(course.microCertId)}/preview?lesson=${encodeURIComponent(lesson.lessonId)}`}
            >
              Preview lesson
            </Link>
          </div>
        </div>

        {!lesson.blocks.length ? (
          <Card className="txk-editor-drop-empty">
            <strong>Build this lesson</strong>
            <p>
              Drag a component from the library or choose one to add it to the
              canvas.
            </p>
          </Card>
        ) : null}

        <div className="txk-editor-blocks">
          {lesson.blocks.map((block, index) => (
            <article
              key={block.lessonBlockId}
              className="txk-editor-block"
              draggable={canEdit}
              onDragStart={() => setDragBlockId(block.lessonBlockId)}
              onDragEnd={() => setDragBlockId(null)}
              onDragOver={(event) => {
                if (dragBlockId) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!dragBlockId) return;
                event.preventDefault();
                event.stopPropagation();
                void moveDraggedBlock(index);
              }}
            >
              <header>
                <Bars3Icon className="txk-block-handle" aria-hidden="true" />
                <div>
                  <strong>
                    {block.title || block.blockType.replaceAll("_", " ")}
                  </strong>
                  <span>{block.blockType.replaceAll("_", " ")}</span>
                </div>
                {canEdit ? (
                  <div className="txk-editor-block-actions">
                    <Button
                      size="sm"
                      type="button"
                      aria-label="Move block up"
                      disabled={index === 0 || Boolean(busy)}
                      onClick={() => reorderBlock(index, -1)}
                    >
                      <ArrowUpIcon aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      aria-label="Move block down"
                      disabled={
                        index === lesson.blocks.length - 1 || Boolean(busy)
                      }
                      onClick={() => reorderBlock(index, 1)}
                    >
                      <ArrowDownIcon aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      aria-label="Save as reusable block"
                      disabled={Boolean(busy)}
                      onClick={() => saveReusable(block)}
                    >
                      <BookmarkIcon aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      tone="danger"
                      type="button"
                      aria-label="Delete block"
                      disabled={Boolean(busy)}
                      onClick={() => deleteBlock(block.lessonBlockId)}
                    >
                      <TrashIcon aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </header>

              <div className="txk-editor-block-body">
                {block.blockType === "rich_text" ? (
                  <RichTextEditor
                    initialHtml={String(block.content.html ?? "")}
                    disabled={!canEdit}
                    onAutosave={async (html, text) => {
                      await updateBlock(
                        block,
                        {
                          content: {
                            ...block.content,
                            html,
                            text,
                          },
                        },
                        false,
                      );
                    }}
                  />
                ) : (
                  <>
                    <div className="txk-editor-preview-block">
                      <LearningBlockRenderer block={block} />
                    </div>
                    {canEdit ? (
                      <details className="txk-block-properties">
                        <summary>Edit block settings</summary>
                        <form
                          className="txk-form-stack"
                          onSubmit={(event) =>
                            saveGenericBlock(event, block)
                          }
                        >
                          <FormField label="Block title">
                            <Input
                              name="title"
                              defaultValue={block.title ?? ""}
                            />
                          </FormField>

                          {block.blockType === "heading" ? (
                            <>
                              <FormField label="Heading text">
                                <Input
                                  name="primary"
                                  defaultValue={blockPrimaryValue(block)}
                                  required
                                />
                              </FormField>
                              <FormField label="Heading level">
                                <select
                                  className="txk-input"
                                  name="level"
                                  defaultValue={String(
                                    block.content.level ?? 2,
                                  )}
                                >
                                  <option value="2">Heading 2</option>
                                  <option value="3">Heading 3</option>
                                  <option value="4">Heading 4</option>
                                </select>
                              </FormField>
                            </>
                          ) : null}

                          {[
                            "list",
                            "callout",
                            "safety_note",
                            "accordion",
                            "columns",
                          ].includes(block.blockType) ? (
                            <FormField
                              label={
                                block.blockType === "list"
                                  ? "List items (one per line)"
                                  : block.blockType === "columns"
                                    ? "Columns (one per line)"
                                    : "Content"
                              }
                            >
                              <Textarea
                                name="primary"
                                defaultValue={blockPrimaryValue(block)}
                                required
                              />
                            </FormField>
                          ) : null}

                          {block.blockType === "accordion" ? (
                            <FormField label="Accordion heading">
                              <Input
                                name="label"
                                defaultValue={String(
                                  block.content.title ?? block.title ?? "",
                                )}
                                required
                              />
                            </FormField>
                          ) : null}

                          {[
                            "image",
                            "video",
                            "document",
                            "link",
                            "embed",
                            "button",
                            "download",
                          ].includes(block.blockType) ? (
                            <FormField label="URL">
                              <Input
                                name="url"
                                type="url"
                                defaultValue={String(
                                  block.content.url ?? "",
                                )}
                                required
                              />
                            </FormField>
                          ) : null}

                          {block.blockType === "image" ? (
                            <FormField label="Alt text">
                              <Input
                                name="alt"
                                defaultValue={String(
                                  block.content.alt ?? "",
                                )}
                                required
                              />
                            </FormField>
                          ) : null}

                          {[
                            "document",
                            "link",
                            "button",
                            "download",
                          ].includes(block.blockType) ? (
                            <FormField label="Link label">
                              <Input
                                name="label"
                                defaultValue={String(
                                  block.content.label ?? block.title ?? "",
                                )}
                                required
                              />
                            </FormField>
                          ) : null}

                          {[
                            "image",
                            "video",
                            "document",
                            "link",
                            "download",
                          ].includes(block.blockType) ? (
                            <FormField label="Caption">
                              <Input
                                name="caption"
                                defaultValue={String(
                                  block.content.caption ?? "",
                                )}
                              />
                            </FormField>
                          ) : null}

                          <label className="txk-check-field">
                            <input
                              name="required"
                              type="checkbox"
                              defaultChecked={block.required}
                            />
                            <span>Required content</span>
                          </label>
                          <Button
                            tone="primary"
                            type="submit"
                            disabled={Boolean(busy)}
                          >
                            Save block
                          </Button>
                        </form>
                      </details>
                    ) : null}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>

      <aside className="txk-editor-library">
        <div className="txk-editor-library-scroll">
          <section>
            <p className="txk-eyebrow">Components</p>
            <h2>Element library</h2>
            <div className="txk-component-library">
              {componentLibrary.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className="txk-component-library-item"
                  draggable={canEdit}
                  disabled={!canEdit || Boolean(busy)}
                  onDragStart={(event) =>
                    onLibraryDragStart(event, item.type)
                  }
                  onClick={() => createBlock(item.type)}
                >
                  <PlusIcon aria-hidden="true" />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="txk-eyebrow">Reusable</p>
            <h2>Employer library</h2>
            {reusableLibrary.blocks.length ? (
              <div className="txk-reusable-list">
                {reusableLibrary.blocks.map((item) => (
                  <button
                    key={item.reusableBlockId}
                    type="button"
                    disabled={!canEdit || Boolean(busy)}
                    onClick={() =>
                      insertReusable(item.reusableBlockId)
                    }
                  >
                    <DocumentDuplicateIcon aria-hidden="true" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.blockType.replaceAll("_", " ")}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="txk-library-empty">
                Save any lesson block here to reuse it across this Employer&apos;s
                courses.
              </p>
            )}
          </section>

          <section>
            <p className="txk-eyebrow">Lesson properties</p>
            <h2>Settings</h2>
            <form className="txk-form-stack" onSubmit={saveLesson}>
              <FormField label="Lesson title">
                <Input
                  name="title"
                  defaultValue={lesson.title}
                  required
                  disabled={!canEdit}
                />
              </FormField>
              <FormField label="Description">
                <Textarea
                  name="description"
                  defaultValue={lesson.description ?? ""}
                  disabled={!canEdit}
                />
              </FormField>
              <FormField label="Learning objective">
                <Textarea
                  name="learningObjective"
                  defaultValue={lesson.learningObjective ?? ""}
                  disabled={!canEdit}
                />
              </FormField>
              <div className="txk-form-grid-2">
                <FormField label="Minutes">
                  <Input
                    name="estimatedMinutes"
                    type="number"
                    min="0"
                    defaultValue={lesson.estimatedMinutes ?? ""}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="Status">
                  <select
                    className="txk-input"
                    name="status"
                    defaultValue={
                      lesson.status === "ready" ? "ready" : "draft"
                    }
                    disabled={!canEdit}
                  >
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                  </select>
                </FormField>
              </div>
              <label className="txk-check-field">
                <input
                  name="required"
                  type="checkbox"
                  defaultChecked={lesson.required}
                  disabled={!canEdit}
                />
                <span>Required lesson</span>
              </label>
              {canEdit ? (
                <Button
                  tone="primary"
                  type="submit"
                  disabled={Boolean(busy)}
                >
                  Save lesson settings
                </Button>
              ) : null}
            </form>

            {canEdit ? (
              <Button
                type="button"
                className="txk-template-save"
                disabled={Boolean(busy)}
                onClick={saveLessonTemplate}
              >
                <DocumentDuplicateIcon aria-hidden="true" />
                Save lesson as Employer template
              </Button>
            ) : null}
          </section>

          <section className="txk-assessment-reserved">
            <p className="txk-eyebrow">Assessment</p>
            <h2>Knowledge checks</h2>
            <p>
              Assessment authoring is handled by W11-05A. Lesson Editor will
              attach those canonical assessments here without exposing answer
              keys.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
