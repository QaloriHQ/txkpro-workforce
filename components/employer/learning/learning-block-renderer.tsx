"use client";

import DOMPurify from "dompurify";
import type { EmployerLearningLessonBlock } from "@/lib/employer/learning-types";

function cleanHtml(value: unknown) {
  return DOMPurify.sanitize(String(value ?? ""), {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "a",
    ],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}

export function LearningBlockRenderer({
  block,
}: {
  block: EmployerLearningLessonBlock;
}) {
  const content = block.content ?? {};

  if (block.blockType === "rich_text") {
    return (
      <div
        className="txk-learner-rich-text"
        dangerouslySetInnerHTML={{ __html: cleanHtml(content.html) }}
      />
    );
  }

  if (block.blockType === "heading") {
    const level = Number(content.level ?? 2);
    const text = String(content.text ?? "");
    if (level === 4) return <h4>{text}</h4>;
    if (level === 3) return <h3>{text}</h3>;
    return <h2>{text}</h2>;
  }

  if (block.blockType === "list") {
    const items = Array.isArray(content.items)
      ? content.items.map((item) => String(item))
      : [];
    const List = content.ordered ? "ol" : "ul";
    return <List>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</List>;
  }

  if (block.blockType === "callout" || block.blockType === "safety_note") {
    return (
      <aside className={`txk-learner-callout ${block.blockType === "safety_note" ? "safety" : ""}`}>
        {block.title ? <strong>{block.title}</strong> : null}
        <p>{String(content.text ?? "")}</p>
      </aside>
    );
  }

  if (block.blockType === "image") {
    return (
      <figure className="txk-learner-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={String(content.url ?? "")} alt={String(content.alt ?? "")} />
        {content.caption ? <figcaption>{String(content.caption)}</figcaption> : null}
      </figure>
    );
  }

  if (block.blockType === "video") {
    return (
      <div className="txk-learner-media">
        <video controls src={String(content.url ?? "")}>
          Your browser does not support video playback.
        </video>
        {content.caption ? <p>{String(content.caption)}</p> : null}
      </div>
    );
  }

  if (block.blockType === "embed") {
    return (
      <div className="txk-learner-embed">
        <a href={String(content.url ?? "")} target="_blank" rel="noreferrer">
          Open embedded resource
        </a>
      </div>
    );
  }

  if (block.blockType === "document" || block.blockType === "download") {
    return (
      <a className="txk-learner-resource" href={String(content.url ?? "")} target="_blank" rel="noreferrer">
        {String(content.label ?? block.title ?? "Open resource")}
      </a>
    );
  }

  if (block.blockType === "link") {
    return (
      <a href={String(content.url ?? "")} target="_blank" rel="noreferrer">
        {String(content.label ?? block.title ?? content.url ?? "Open link")}
      </a>
    );
  }

  if (block.blockType === "button") {
    return (
      <a className="txk-button txk-button-primary txk-button-md" href={String(content.url ?? "")} target="_blank" rel="noreferrer">
        {String(content.label ?? "Open")}
      </a>
    );
  }

  if (block.blockType === "divider") {
    return <hr className="txk-learner-divider" />;
  }

  if (block.blockType === "accordion") {
    return (
      <details className="txk-learner-accordion">
        <summary>{String(content.title ?? block.title ?? "More information")}</summary>
        <div>{String(content.body ?? "")}</div>
      </details>
    );
  }

  if (block.blockType === "columns") {
    const columns = Array.isArray(content.columns) ? content.columns : [];
    return (
      <div className="txk-learner-columns">
        {columns.map((column, index) => (
          <div key={index}>
            {typeof column === "object" && column && "html" in column ? (
              <div dangerouslySetInnerHTML={{ __html: cleanHtml((column as { html?: unknown }).html) }} />
            ) : (
              <p>{String(typeof column === "object" && column && "text" in column ? (column as { text?: unknown }).text ?? "" : column ?? "")}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  return <p>{String(content.text ?? "")}</p>;
}
