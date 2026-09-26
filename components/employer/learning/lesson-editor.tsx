"use client";

import DOMPurify from "dompurify";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  Bars3Icon,
  BookmarkSquareIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Card,
  FormField,
  Input,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import { LearningBlockRenderer } from "@/components/employer/learning/learning-block-renderer";
import { MediaLibraryPanel } from "@/components/employer/learning/media-library-panel";
import type {
  EmployerLearningLessonBlock,
  EmployerLearningMediaAsset,
  EmployerLearningReusableLibrary,
  EmployerMicroCertAuthoringDetail,
  LessonBlockType,
} from "@/lib/employer/learning-types";

type SaveState = "Saved" | "Unsaved" | "Saving…" | "Save failed";

const palette: Array<{ type: LessonBlockType; label: string; group: string }> = [
  { type: "rich_text", label: "Rich text", group: "Content" },
  { type: "heading", label: "Heading", group: "Content" },
  { type: "list", label: "List", group: "Content" },
  { type: "callout", label: "Callout", group: "Content" },
  { type: "safety_note", label: "Safety note", group: "Content" },
  { type: "image", label: "Image", group: "Media" },
  { type: "video", label: "Video", group: "Media" },
  { type: "audio", label: "Audio", group: "Media" },
  { type: "document", label: "Document", group: "Resources" },
  { type: "download", label: "Download", group: "Resources" },
  { type: "link", label: "Link", group: "Resources" },
  { type: "embed", label: "Embed", group: "Resources" },
  { type: "button", label: "Button", group: "Layout" },
  { type: "divider", label: "Divider", group: "Layout" },
  { type: "accordion", label: "Accordion", group: "Layout" },
  { type: "columns", label: "Columns", group: "Layout" },
];

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await response.json()) as {
    error?: string;
    course?: EmployerMicroCertAuthoringDetail;
    library?: EmployerLearningReusableLibrary;
  };
  if (!response.ok) throw new Error(body.error ?? "Employer Learning request failed.");
  return body;
}

function safeRichHtml(value: unknown) {
  return DOMPurify.sanitize(String(value ?? ""), {
    ALLOWED_TAGS: [
      "p","br","strong","b","em","i","u","s","h2","h3","h4",
      "ul","ol","li","blockquote","code","a",
    ],
    ALLOWED_ATTR: ["href","target","rel"],
  });
}

function defaultPayload(type: LessonBlockType) {
  switch (type) {
    case "rich_text":
      return { title: "Rich text", content: { html: "<p>Start writing…</p>", text: "Start writing…" } };
    case "heading":
      return { title: "Heading", content: { text: "New heading", level: 2 } };
    case "list":
      return { title: "List", content: { items: ["First item"], ordered: false } };
    case "callout":
      return { title: "Callout", content: { text: "Add an important note." } };
    case "safety_note":
      return { title: "Safety note", content: { text: "Add a company-specific safety instruction." } };
    case "divider":
      return { title: "Divider", content: {} };
    case "accordion":
      return { title: "Accordion", content: { title: "More information", body: "Add details." } };
    case "columns":
      return { title: "Columns", content: { columns: [{ text: "Left column" }, { text: "Right column" }] } };
    case "button": {
      const url = window.prompt("Button URL");
      if (!url) return null;
      const label = window.prompt("Button label", "Open resource") || "Open resource";
      return { title: label, content: { label, url } };
    }
    case "image":
    case "video":
    case "audio":
    case "document":
    case "download":
    case "link":
    case "embed": {
      const url = window.prompt(`${type.replaceAll("_", " ")} URL`);
      if (!url) return null;
      return { title: type.replaceAll("_", " "), content: { url, label: "Open resource", alt: "" } };
    }
    default:
      return { title: "Text", content: { text: "Add content." } };
  }
}

function findLesson(course: EmployerMicroCertAuthoringDetail, lessonId: string) {
  return course.lessons.find((item) => item.lessonId === lessonId);
}

export function LessonEditor({
  course: initialCourse,
  lessonId,
  reusable: initialReusable,
  canManage,
}: {
  course: EmployerMicroCertAuthoringDetail;
  lessonId: string;
  reusable: EmployerLearningReusableLibrary;
  canManage: boolean;
}) {
  const [course, setCourse] = useState(initialCourse);
  const [reusable, setReusable] = useState(initialReusable);
  const lesson = findLesson(course, lessonId) ?? initialCourse.lessons[0];
  const [selectedId, setSelectedId] = useState<string | null>(
    lesson?.blocks[0]?.lessonBlockId ?? null,
  );
  const [saveState, setSaveState] = useState<SaveState>("Saved");
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const immutable = ["live", "archived"].includes(course.currentVersion.status);
  const canEdit = canManage && !immutable && lesson?.status !== "archived";
  const selected = lesson?.blocks.find((block) => block.lessonBlockId === selectedId) ?? null;
  const base = `/api/employer/learning/courses/${encodeURIComponent(course.microCertId)}/lessons/${encodeURIComponent(lesson.lessonId)}`;

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState === "Unsaved" || saveState === "Saving…") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  const groupedPalette = useMemo(() => {
    const result = new Map<string, typeof palette>();
    for (const item of palette) {
      result.set(item.group, [...(result.get(item.group) ?? []), item]);
    }
    return [...result.entries()];
  }, []);

  function adopt(body: { course?: EmployerMicroCertAuthoringDetail }) {
    if (body.course) setCourse(body.course);
  }

  async function createBlock(type: LessonBlockType) {
    if (!canEdit) return;
    const payload = defaultPayload(type);
    if (!payload) return;
    setSaveState("Saving…");
    setError(null);
    try {
      const body = await requestJson(`${base}/blocks`, {
        method: "POST",
        body: JSON.stringify({ blockType: type, ...payload, required: true }),
      });
      adopt(body);
      const nextLesson = body.course ? findLesson(body.course, lesson.lessonId) : null;
      setSelectedId(nextLesson?.blocks.at(-1)?.lessonBlockId ?? null);
      setSaveState("Saved");
    } catch (cause) {
      setSaveState("Save failed");
      setError(cause instanceof Error ? cause.message : "Unable to add block.");
    }
  }

  async function saveBlock(
    block: EmployerLearningLessonBlock,
    input: { title?: string | null; content?: Record<string, unknown>; required?: boolean },
  ) {
    setSaveState("Saving…");
    try {
      const body = await requestJson(
        `${base}/blocks/${encodeURIComponent(block.lessonBlockId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      adopt(body);
      setSaveState("Saved");
    } catch (cause) {
      setSaveState("Save failed");
      setError(cause instanceof Error ? cause.message : "Unable to save block.");
    }
  }

  function scheduleRichSave(block: EmployerLearningLessonBlock, rawHtml: string) {
    if (!canEdit) return;
    const html = safeRichHtml(rawHtml);
    const text = editorRef.current?.innerText ?? "";
    setSaveState("Unsaved");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveBlock(block, { content: { ...block.content, html, text } });
    }, 800);
  }

  function richCommand(command: string, value?: string) {
    if (!canEdit) return;
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (selected && selected.blockType === "rich_text" && editorRef.current) {
      scheduleRichSave(selected, editorRef.current.innerHTML);
    }
  }

  function addRichLink() {
    const url = window.prompt("Link URL");
    if (url) richCommand("createLink", url);
  }

  async function reorder(from: number, to: number) {
    if (!canEdit || to < 0 || to >= lesson.blocks.length) return;
    const ids = lesson.blocks.map((block) => block.lessonBlockId);
    const [item] = ids.splice(from, 1);
    ids.splice(to, 0, item);
    setSaveState("Saving…");
    try {
      const body = await requestJson(`${base}/blocks`, {
        method: "PUT",
        body: JSON.stringify({ lessonBlockIds: ids }),
      });
      adopt(body);
      setSaveState("Saved");
    } catch (cause) {
      setSaveState("Save failed");
      setError(cause instanceof Error ? cause.message : "Unable to reorder blocks.");
    }
  }

  async function deleteBlock(block: EmployerLearningLessonBlock) {
    if (!canEdit || !window.confirm("Delete this content block?")) return;
    setSaveState("Saving…");
    try {
      const body = await requestJson(
        `${base}/blocks/${encodeURIComponent(block.lessonBlockId)}`,
        { method: "DELETE", body: JSON.stringify({}) },
      );
      adopt(body);
      setSelectedId(null);
      setSaveState("Saved");
    } catch (cause) {
      setSaveState("Save failed");
      setError(cause instanceof Error ? cause.message : "Unable to delete block.");
    }
  }

  async function duplicateBlock(block: EmployerLearningLessonBlock) {
    if (!canEdit) return;
    setSaveState("Saving…");
    try {
      const body = await requestJson(`${base}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          blockType: block.blockType,
          title: block.title,
          content: block.content,
          required: block.required,
        }),
      });
      adopt(body);
      setSaveState("Saved");
    } catch (cause) {
      setSaveState("Save failed");
      setError(cause instanceof Error ? cause.message : "Unable to duplicate block.");
    }
  }

  async function saveReusable(block: EmployerLearningLessonBlock) {
    const title = window.prompt("Reusable block name", block.title ?? block.blockType.replaceAll("_", " "));
    if (!title) return;
    try {
      const body = await requestJson("/api/employer/learning/reusable", {
        method: "POST",
        body: JSON.stringify({
          action: "save_block",
          microCertId: course.microCertId,
          lessonId: lesson.lessonId,
          blockId: block.lessonBlockId,
          title,
        }),
      });
      if (body.library) setReusable(body.library);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save reusable block.");
    }
  }

  async function saveLessonTemplate() {
    if (!canEdit) return;
    const title = window.prompt("Lesson template name", lesson.title);
    if (!title) return;
    try {
      const body = await requestJson("/api/employer/learning/reusable", {
        method: "POST",
        body: JSON.stringify({
          action: "save_lesson_template",
          microCertId: course.microCertId,
          lessonId: lesson.lessonId,
          title,
        }),
      });
      if (body.library) setReusable(body.library);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save lesson template.",
      );
    }
  }

  async function insertReusable(reusableBlockId: string) {
    if (!canEdit) return;
    setSaveState("Saving…");
    try {
      const body = await requestJson("/api/employer/learning/reusable", {
        method: "POST",
        body: JSON.stringify({
          action: "insert_block",
          microCertId: course.microCertId,
          lessonId: lesson.lessonId,
          reusableBlockId,
        }),
      });
      adopt(body);
      setSaveState("Saved");
    } catch (cause) {
      setSaveState("Save failed");
      setError(cause instanceof Error ? cause.message : "Unable to insert reusable block.");
    }
  }

  async function insertMediaAsset(
    asset: EmployerLearningMediaAsset,
    blockType: LessonBlockType,
  ) {
    if (!canEdit) return;
    const url =
      blockType === "download"
        ? asset.downloadUrl ?? asset.contentUrl
        : asset.contentUrl;
    if (!url) {
      setError("Media delivery URL is unavailable.");
      return;
    }

    setSaveState("Saving…");
    setError(null);
    try {
      const body = await requestJson(`${base}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          blockType,
          title: asset.displayName,
          content: {
            url,
            mediaAssetId: asset.mediaAssetId,
            label: asset.displayName,
            alt: "",
            caption: "",
          },
          required: true,
        }),
      });
      adopt(body);
      const nextLesson = body.course
        ? findLesson(body.course, lesson.lessonId)
        : null;
      setSelectedId(nextLesson?.blocks.at(-1)?.lessonBlockId ?? null);
      setSaveState("Saved");
    } catch (cause) {
      setSaveState("Save failed");
      setError(
        cause instanceof Error ? cause.message : "Unable to insert media.",
      );
    }
  }

  async function replaceSelectedMedia(asset: EmployerLearningMediaAsset) {
    if (!selected || !canEdit) return;
    const blockType = selected.blockType;
    const url =
      blockType === "download"
        ? asset.downloadUrl ?? asset.contentUrl
        : asset.contentUrl;
    if (!url) {
      setError("Media delivery URL is unavailable.");
      return;
    }

    await saveBlock(selected, {
      title: selected.title || asset.displayName,
      content: {
        ...selected.content,
        url,
        mediaAssetId: asset.mediaAssetId,
        label:
          String(selected.content.label ?? "").trim() || asset.displayName,
      },
    });
  }

  async function usePosterAsset(asset: EmployerLearningMediaAsset) {
    if (!selected || selected.blockType !== "video" || !canEdit) return;
    if (!asset.contentUrl) {
      setError("Poster delivery URL is unavailable.");
      return;
    }
    await saveBlock(selected, {
      content: {
        ...selected.content,
        posterUrl: asset.contentUrl,
        posterMediaAssetId: asset.mediaAssetId,
      },
    });
  }

  async function useCaptionAsset(asset: EmployerLearningMediaAsset) {
    if (!selected || selected.blockType !== "video" || !canEdit) return;
    if (asset.extension !== "vtt" || !asset.contentUrl) {
      setError("Select a ready VTT caption file.");
      return;
    }
    await saveBlock(selected, {
      content: {
        ...selected.content,
        captionsUrl: asset.contentUrl,
        captionsMediaAssetId: asset.mediaAssetId,
        captionLanguage:
          String(selected.content.captionLanguage ?? "").trim() || "en",
        captionLabel:
          String(selected.content.captionLabel ?? "").trim() || "English",
      },
    });
  }

  async function saveLessonSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = String(form.get("estimatedMinutes") ?? "").trim();
    setSaveState("Saving…");
    try {
      const body = await requestJson(base, {
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
      });
      adopt(body);
      setSaveState("Saved");
    } catch (cause) {
      setSaveState("Save failed");
      setError(cause instanceof Error ? cause.message : "Unable to save lesson.");
    }
  }

  async function saveSelectedProperties(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !canEdit || selected.blockType === "rich_text") return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim() || null;
    let content: Record<string, unknown> = { ...selected.content };

    switch (selected.blockType) {
      case "heading":
        content = {
          text: String(form.get("text") ?? "").trim(),
          level: Number(form.get("level") ?? 2),
        };
        break;
      case "list":
        content = {
          items: String(form.get("items") ?? "")
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          ordered: form.get("ordered") === "on",
        };
        break;
      case "text":
      case "callout":
      case "safety_note":
        content = { text: String(form.get("text") ?? "").trim() };
        break;
      case "image":
        content = {
          ...selected.content,
          url: String(form.get("url") ?? "").trim(),
          alt: String(form.get("alt") ?? "").trim(),
          caption: String(form.get("caption") ?? "").trim(),
        };
        break;
      case "video":
        content = {
          ...selected.content,
          url: String(form.get("url") ?? "").trim(),
          caption: String(form.get("caption") ?? "").trim(),
          posterUrl: String(form.get("posterUrl") ?? "").trim() || null,
          captionsUrl: String(form.get("captionsUrl") ?? "").trim() || null,
          captionLanguage:
            String(form.get("captionLanguage") ?? "").trim() || "en",
          captionLabel:
            String(form.get("captionLabel") ?? "").trim() || "English",
          transcript: String(form.get("transcript") ?? "").trim() || null,
        };
        break;
      case "audio":
        content = {
          ...selected.content,
          url: String(form.get("url") ?? "").trim(),
          caption: String(form.get("caption") ?? "").trim(),
        };
        break;
      case "document":
      case "download":
        content = {
          ...selected.content,
          url: String(form.get("url") ?? "").trim(),
          label: String(form.get("label") ?? "").trim(),
        };
        break;
      case "link":
      case "embed":
        content = {
          url: String(form.get("url") ?? "").trim(),
          label: String(form.get("label") ?? "").trim(),
        };
        break;
      case "button":
        content = {
          url: String(form.get("url") ?? "").trim(),
          label: String(form.get("label") ?? "").trim(),
        };
        break;
      case "accordion":
        content = {
          title: String(form.get("accordionTitle") ?? "").trim(),
          body: String(form.get("body") ?? "").trim(),
        };
        break;
      case "columns":
        content = {
          columns: [
            { text: String(form.get("column1") ?? "").trim() },
            { text: String(form.get("column2") ?? "").trim() },
          ],
        };
        break;
      case "divider":
        content = {};
        break;
    }

    await saveBlock(selected, {
      title,
      content,
      required: form.get("required") === "on",
    });
  }

  function onDropCanvas(event: React.DragEvent<HTMLElement>, index?: number) {
    event.preventDefault();
    const componentType = event.dataTransfer.getData("application/x-txk-component") as LessonBlockType;
    if (componentType) {
      void createBlock(componentType);
      return;
    }
    const blockId = event.dataTransfer.getData("application/x-txk-block");
    if (blockId) {
      const from = lesson.blocks.findIndex((block) => block.lessonBlockId === blockId);
      const to = index ?? lesson.blocks.length - 1;
      if (from >= 0 && to >= 0 && from !== to) void reorder(from, to);
    }
  }

  if (!lesson) {
    return <Card>No lesson selected.</Card>;
  }

  return (
    <div className="txk-lesson-editor-shell">
      <aside className="txk-editor-outline">
        <p className="txk-eyebrow">Course outline</p>
        <strong>{course.title}</strong>
        <div className="txk-editor-outline-list">
          {course.lessons
            .filter((item) => item.status !== "archived")
            .map((item, index) => (
              <Link
                key={item.lessonId}
                href={`/employer/learning/${encodeURIComponent(course.microCertId)}/lessons/${encodeURIComponent(item.lessonId)}`}
                className={item.lessonId === lesson.lessonId ? "active" : ""}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.blocks.length} blocks</small>
                </div>
              </Link>
            ))}
        </div>
      </aside>

      <main className="txk-editor-canvas-column">
        <div className="txk-editor-statusbar">
          <div>
            <div className="txk-editor-breadcrumb-actions">
              <Link
                href={`/employer/learning/${encodeURIComponent(course.microCertId)}/structure`}
              >
                <ArrowLeftIcon aria-hidden="true" />
                Course structure
              </Link>
            </div>
            <p className="txk-eyebrow">Lesson editor</p>
            <h1>{lesson.title}</h1>
          </div>
          <div className="txk-editor-status-actions">
            <Link
              className="txk-button txk-button-default txk-button-sm"
              href={`/employer/learning/${encodeURIComponent(course.microCertId)}/preview?lesson=${encodeURIComponent(lesson.lessonId)}`}
            >
              <EyeIcon aria-hidden="true" />
              Preview as student
            </Link>
            <StatusBadge tone={saveState === "Save failed" ? "danger" : saveState === "Saved" ? "success" : "warning"}>
              {saveState}
            </StatusBadge>
          </div>
        </div>

        {error ? <div className="alert">{error}</div> : null}

        <details className="txk-collapsed-settings">
          <summary>
            <span><strong>Lesson settings</strong><small>Title, objective, duration and required state</small></span>
            <StatusBadge tone={lesson.status === "ready" ? "info" : "neutral"}>{lesson.status}</StatusBadge>
          </summary>
          <div className="txk-collapsed-settings-body">
            <form className="txk-form-stack" onSubmit={saveLessonSettings}>
              <div className="txk-form-grid-2">
                <FormField label="Lesson title"><Input name="title" defaultValue={lesson.title} disabled={!canEdit} /></FormField>
                <FormField label="Status">
                  <select className="txk-input" name="status" defaultValue={lesson.status === "ready" ? "ready" : "draft"} disabled={!canEdit}>
                    <option value="draft">Draft</option><option value="ready">Ready</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Description"><Textarea name="description" defaultValue={lesson.description ?? ""} disabled={!canEdit} /></FormField>
              <FormField label="Learning objective"><Textarea name="learningObjective" defaultValue={lesson.learningObjective ?? ""} disabled={!canEdit} /></FormField>
              <div className="txk-form-grid-2">
                <FormField label="Estimated minutes"><Input type="number" min="0" name="estimatedMinutes" defaultValue={lesson.estimatedMinutes ?? ""} disabled={!canEdit} /></FormField>
                <label className="txk-check-field"><input type="checkbox" name="required" defaultChecked={lesson.required} disabled={!canEdit} /><span>Required lesson</span></label>
              </div>
              {canEdit ? <Button tone="primary" type="submit">Save lesson settings</Button> : null}
            </form>
          </div>
        </details>

        <div className="txk-editor-canvas" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropCanvas(event)}>
          {lesson.blocks.map((block, index) => (
            <article
              className={`txk-editor-block ${selectedId === block.lessonBlockId ? "selected" : ""}`}
              key={block.lessonBlockId}
              draggable={canEdit}
              onDragStart={(event) => event.dataTransfer.setData("application/x-txk-block", block.lessonBlockId)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDropCanvas(event, index)}
              onClick={() => setSelectedId(block.lessonBlockId)}
            >
              <header>
                <Bars3Icon aria-hidden="true" />
                <span>{block.blockType.replaceAll("_", " ")}</span>
                <div>
                  <Button size="sm" type="button" disabled={!canEdit || index === 0} onClick={(event) => { event.stopPropagation(); void reorder(index, index - 1); }}>
                    <ArrowUpIcon aria-hidden="true" /><span className="sr-only">Move up</span>
                  </Button>
                  <Button size="sm" type="button" disabled={!canEdit || index === lesson.blocks.length - 1} onClick={(event) => { event.stopPropagation(); void reorder(index, index + 1); }}>
                    <ArrowDownIcon aria-hidden="true" /><span className="sr-only">Move down</span>
                  </Button>
                </div>
              </header>

              {block.blockType === "rich_text" ? (
                <div className="txk-rich-editor">
                  {selectedId === block.lessonBlockId && canEdit ? (
                    <div className="txk-rich-toolbar" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => richCommand("bold")}><strong>B</strong></button>
                      <button type="button" onClick={() => richCommand("italic")}><em>I</em></button>
                      <button type="button" onClick={() => richCommand("formatBlock", "h2")}>H2</button>
                      <button type="button" onClick={() => richCommand("formatBlock", "h3")}>H3</button>
                      <button type="button" onClick={() => richCommand("insertUnorderedList")}>• List</button>
                      <button type="button" onClick={() => richCommand("insertOrderedList")}>1. List</button>
                      <button type="button" onClick={addRichLink}>
                        <LinkIcon aria-hidden="true" />
                        Link
                      </button>
                      <button type="button" onClick={() => richCommand("undo")}>Undo</button>
                      <button type="button" onClick={() => richCommand("redo")}>Redo</button>
                    </div>
                  ) : null}
                  <div
                    ref={selectedId === block.lessonBlockId ? editorRef : undefined}
                    className="txk-rich-editable"
                    contentEditable={canEdit && selectedId === block.lessonBlockId}
                    suppressContentEditableWarning
                    dangerouslySetInnerHTML={{ __html: safeRichHtml(block.content.html) }}
                    onInput={(event) => scheduleRichSave(block, event.currentTarget.innerHTML)}
                  />
                </div>
              ) : (
                <div className="txk-editor-block-preview">
                  <LearningBlockRenderer block={block} />
                </div>
              )}
            </article>
          ))}

          {lesson.blocks.length === 0 ? (
            <div className="txk-editor-drop-empty">
              <PlusIcon aria-hidden="true" />
              <strong>Build this lesson</strong>
              <span>Drag a component from the library or choose one to add it.</span>
            </div>
          ) : (
            <div className="txk-editor-drop-tail">Drop a component here to add it to the lesson</div>
          )}
        </div>
      </main>

      <aside className="txk-editor-library">
        <Card>
          <p className="txk-eyebrow">Components</p>
          {groupedPalette.map(([group, items]) => (
            <div className="txk-palette-group" key={group}>
              <strong>{group}</strong>
              <div>
                {items.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    draggable={canEdit}
                    disabled={!canEdit}
                    onDragStart={(event) => event.dataTransfer.setData("application/x-txk-component", item.type)}
                    onClick={() => void createBlock(item.type)}
                  >
                    <PlusIcon aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="txk-palette-future">
            <strong>Assessment</strong>
            <small>Attach assessment/checkpoint references here after W11-05A. Answer keys remain outside lesson content.</small>
          </div>
        </Card>

        {selected ? (
          <Card>
            <p className="txk-eyebrow">Selected block</p>
            <h3>{selected.title || selected.blockType.replaceAll("_", " ")}</h3>

            {selected.blockType !== "rich_text" ? (
              <form className="txk-form-stack" onSubmit={saveSelectedProperties}>
                <FormField label="Block title">
                  <Input name="title" defaultValue={selected.title ?? ""} disabled={!canEdit} />
                </FormField>

                {selected.blockType === "heading" ? (
                  <>
                    <FormField label="Heading text">
                      <Input name="text" defaultValue={String(selected.content.text ?? "")} disabled={!canEdit} />
                    </FormField>
                    <FormField label="Heading level">
                      <select className="txk-input" name="level" defaultValue={String(selected.content.level ?? 2)} disabled={!canEdit}>
                        <option value="2">H2</option>
                        <option value="3">H3</option>
                        <option value="4">H4</option>
                      </select>
                    </FormField>
                  </>
                ) : null}

                {selected.blockType === "list" ? (
                  <>
                    <FormField label="List items" help="One item per line">
                      <Textarea name="items" defaultValue={Array.isArray(selected.content.items) ? selected.content.items.join("\n") : ""} disabled={!canEdit} />
                    </FormField>
                    <label className="txk-check-field"><input type="checkbox" name="ordered" defaultChecked={Boolean(selected.content.ordered)} disabled={!canEdit} /><span>Numbered list</span></label>
                  </>
                ) : null}

                {["text","callout","safety_note"].includes(selected.blockType) ? (
                  <FormField label="Text">
                    <Textarea name="text" defaultValue={String(selected.content.text ?? "")} disabled={!canEdit} />
                  </FormField>
                ) : null}

                {selected.blockType === "image" ? (
                  <>
                    <FormField label="Image URL" help="Use an uploaded Employer asset or an HTTPS image URL.">
                      <Input name="url" defaultValue={String(selected.content.url ?? "")} disabled={!canEdit} />
                    </FormField>
                    <FormField label="Alt text"><Input name="alt" defaultValue={String(selected.content.alt ?? "")} disabled={!canEdit} /></FormField>
                    <FormField label="Caption"><Input name="caption" defaultValue={String(selected.content.caption ?? "")} disabled={!canEdit} /></FormField>
                  </>
                ) : null}

                {selected.blockType === "video" ? (
                  <>
                    <FormField
                      label="Video URL"
                      help="Supports uploaded video plus YouTube, Vimeo, Loom, Wistia and Dailymotion URLs."
                    >
                      <Input name="url" defaultValue={String(selected.content.url ?? "")} disabled={!canEdit} />
                    </FormField>
                    <FormField label="Poster / thumbnail URL">
                      <Input name="posterUrl" defaultValue={String(selected.content.posterUrl ?? "")} disabled={!canEdit} />
                    </FormField>
                    <FormField label="Caption"><Input name="caption" defaultValue={String(selected.content.caption ?? "")} disabled={!canEdit} /></FormField>
                    <FormField
                      label="VTT captions URL"
                      help="Upload a .vtt file in the Employer Media Library and choose Use as captions, or enter an HTTPS/internal VTT URL."
                    >
                      <Input name="captionsUrl" defaultValue={String(selected.content.captionsUrl ?? "")} disabled={!canEdit} />
                    </FormField>
                    <div className="txk-form-grid-2">
                      <FormField label="Caption language">
                        <Input name="captionLanguage" defaultValue={String(selected.content.captionLanguage ?? "en")} disabled={!canEdit} />
                      </FormField>
                      <FormField label="Caption label">
                        <Input name="captionLabel" defaultValue={String(selected.content.captionLabel ?? "English")} disabled={!canEdit} />
                      </FormField>
                    </div>
                    <FormField
                      label="Transcript"
                      help="Optional accessible text transcript. Streaming providers may also provide their own captions."
                    >
                      <Textarea name="transcript" defaultValue={String(selected.content.transcript ?? "")} disabled={!canEdit} />
                    </FormField>
                  </>
                ) : null}

                {selected.blockType === "audio" ? (
                  <>
                    <FormField label="Audio URL">
                      <Input name="url" defaultValue={String(selected.content.url ?? "")} disabled={!canEdit} />
                    </FormField>
                    <FormField label="Caption"><Input name="caption" defaultValue={String(selected.content.caption ?? "")} disabled={!canEdit} /></FormField>
                  </>
                ) : null}

                {["document","download","link","embed","button"].includes(selected.blockType) ? (
                  <>
                    <FormField label="URL"><Input name="url" defaultValue={String(selected.content.url ?? "")} disabled={!canEdit} /></FormField>
                    {selected.blockType !== "embed" ? (
                      <FormField label="Label"><Input name="label" defaultValue={String(selected.content.label ?? "")} disabled={!canEdit} /></FormField>
                    ) : null}
                  </>
                ) : null}

                {selected.blockType === "accordion" ? (
                  <>
                    <FormField label="Accordion title"><Input name="accordionTitle" defaultValue={String(selected.content.title ?? "")} disabled={!canEdit} /></FormField>
                    <FormField label="Body"><Textarea name="body" defaultValue={String(selected.content.body ?? "")} disabled={!canEdit} /></FormField>
                  </>
                ) : null}

                {selected.blockType === "columns" ? (
                  <>
                    <FormField label="Left column"><Textarea name="column1" defaultValue={String(Array.isArray(selected.content.columns) && selected.content.columns[0] && typeof selected.content.columns[0] === "object" && "text" in selected.content.columns[0] ? (selected.content.columns[0] as { text?: unknown }).text ?? "" : "")} disabled={!canEdit} /></FormField>
                    <FormField label="Right column"><Textarea name="column2" defaultValue={String(Array.isArray(selected.content.columns) && selected.content.columns[1] && typeof selected.content.columns[1] === "object" && "text" in selected.content.columns[1] ? (selected.content.columns[1] as { text?: unknown }).text ?? "" : "")} disabled={!canEdit} /></FormField>
                  </>
                ) : null}

                {selected.blockType !== "divider" ? (
                  <label className="txk-check-field"><input type="checkbox" name="required" defaultChecked={selected.required} disabled={!canEdit} /><span>Required content</span></label>
                ) : null}

                {canEdit ? <Button tone="primary" type="submit">Save block properties</Button> : null}
              </form>
            ) : null}

            <div className="txk-form-stack">
              <Button type="button" onClick={() => void duplicateBlock(selected)} disabled={!canEdit}>
                <DocumentDuplicateIcon aria-hidden="true" /> Duplicate
              </Button>
              <Button type="button" onClick={() => void saveReusable(selected)} disabled={!canEdit}>
                <BookmarkSquareIcon aria-hidden="true" /> Save to library
              </Button>
              <Button tone="danger" type="button" onClick={() => void deleteBlock(selected)} disabled={!canEdit}>
                <TrashIcon aria-hidden="true" /> Delete
              </Button>
            </div>
          </Card>
        ) : null}

        <MediaLibraryPanel
          canEdit={canEdit}
          selectedBlock={selected}
          onInsertAsset={insertMediaAsset}
          onReplaceSelected={replaceSelectedMedia}
          onUsePoster={usePosterAsset}
          onUseCaptions={useCaptionAsset}
        />

        <Card>
          <p className="txk-eyebrow">Employer library</p>
          <h3>Reusable content</h3>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void saveLessonTemplate()}
            >
              <BookmarkSquareIcon aria-hidden="true" />
              Save lesson as template
            </Button>
          ) : null}
          <h4 className="txk-library-subheading">Reusable blocks</h4>
          {reusable.blocks.length ? (
            <div className="txk-reusable-list">
              {reusable.blocks.map((block) => (
                <button key={block.reusableBlockId} type="button" disabled={!canEdit} onClick={() => void insertReusable(block.reusableBlockId)}>
                  <span>{block.title}</span><small>{block.blockType.replaceAll("_", " ")}</small>
                </button>
              ))}
            </div>
          ) : <p className="muted">Save a block to reuse it across this Employer&apos;s courses.</p>}
        </Card>
      </aside>
    </div>
  );
}
