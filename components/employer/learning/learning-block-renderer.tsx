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

function externalVideoEmbedUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);

    if (host === "youtu.be") {
      const id = parts[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      const id =
        url.searchParams.get("v") ||
        (["embed", "shorts", "live"].includes(parts[0] ?? "")
          ? parts[1]
          : null);
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = [...parts].reverse().find((part) => /^\d+$/.test(part));
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }

    if (host === "loom.com") {
      const marker = parts.findIndex((part) => part === "share" || part === "embed");
      const id = marker >= 0 ? parts[marker + 1] : null;
      return id ? `https://www.loom.com/embed/${encodeURIComponent(id)}` : null;
    }

    if (host === "dai.ly") {
      const id = parts[0];
      return id ? `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}` : null;
    }

    if (host === "dailymotion.com") {
      const marker = parts.findIndex((part) => part === "video");
      const id = marker >= 0 ? parts[marker + 1] : null;
      return id ? `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}` : null;
    }

    if (
      host.endsWith("wistia.com") ||
      host === "fast.wistia.net" ||
      host === "wi.st"
    ) {
      const marker = parts.findIndex(
        (part) => part === "medias" || part === "iframe",
      );
      const id = marker >= 0 ? parts[marker + 1] : parts.at(-1);
      return id ? `https://fast.wistia.net/embed/iframe/${encodeURIComponent(id)}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function EmbeddedVideo({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  return (
    <div className="txk-learner-video-embed">
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

type RenderableLearningBlock = Pick<
  EmployerLearningLessonBlock,
  "blockType" | "content" | "title"
>;

export function LearningBlockRenderer({
  block,
}: {
  block: RenderableLearningBlock;
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
    return (
      <List>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </List>
    );
  }

  if (block.blockType === "callout" || block.blockType === "safety_note") {
    return (
      <aside
        className={`txk-learner-callout ${
          block.blockType === "safety_note" ? "safety" : ""
        }`}
      >
        {block.title ? <strong>{block.title}</strong> : null}
        <p>{String(content.text ?? "")}</p>
      </aside>
    );
  }

  if (block.blockType === "image") {
    return (
      <figure className="txk-learner-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={String(content.url ?? "")}
          alt={String(content.alt ?? "")}
        />
        {content.caption ? (
          <figcaption>{String(content.caption)}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (block.blockType === "video") {
    const src = String(content.url ?? "");
    const embed = externalVideoEmbedUrl(src);
    const captionsUrl = String(content.captionsUrl ?? "").trim();
    const transcript = String(content.transcript ?? "").trim();
    return (
      <div className="txk-learner-media">
        {embed ? (
          <EmbeddedVideo
            src={embed}
            title={String(block.title ?? content.title ?? "Training video")}
          />
        ) : (
          <video
            controls
            preload="metadata"
            src={src}
            poster={content.posterUrl ? String(content.posterUrl) : undefined}
          >
            {captionsUrl ? (
              <track
                kind="captions"
                src={captionsUrl}
                srcLang={String(content.captionLanguage ?? "en")}
                label={String(content.captionLabel ?? "English")}
                default
              />
            ) : null}
            Your browser does not support video playback.
          </video>
        )}
        {content.caption ? <p>{String(content.caption)}</p> : null}
        {transcript ? (
          <details className="txk-learner-transcript">
            <summary>Transcript</summary>
            <p>{transcript}</p>
          </details>
        ) : null}
      </div>
    );
  }

  if (block.blockType === "audio") {
    return (
      <div className="txk-learner-audio">
        {block.title ? <strong>{block.title}</strong> : null}
        <audio controls preload="metadata" src={String(content.url ?? "")}>
          Your browser does not support audio playback.
        </audio>
        {content.caption ? <p>{String(content.caption)}</p> : null}
      </div>
    );
  }

  if (block.blockType === "embed") {
    const src = String(content.url ?? "");
    const videoEmbed = externalVideoEmbedUrl(src);
    return videoEmbed ? (
      <EmbeddedVideo
        src={videoEmbed}
        title={String(block.title ?? "Embedded training resource")}
      />
    ) : (
      <div className="txk-learner-embed">
        <a href={src} target="_blank" rel="noreferrer">
          {String(content.label ?? "Open embedded resource")}
        </a>
      </div>
    );
  }

  if (block.blockType === "document" || block.blockType === "download") {
    return (
      <a
        className="txk-learner-resource"
        href={String(content.url ?? "")}
        target="_blank"
        rel="noreferrer"
      >
        {String(content.label ?? block.title ?? "Open resource")}
      </a>
    );
  }

  if (block.blockType === "link") {
    return (
      <a
        href={String(content.url ?? "")}
        target="_blank"
        rel="noreferrer"
      >
        {String(
          content.label ?? block.title ?? content.url ?? "Open link",
        )}
      </a>
    );
  }

  if (block.blockType === "button") {
    return (
      <a
        className="txk-button txk-button-primary txk-button-md"
        href={String(content.url ?? "")}
        target="_blank"
        rel="noreferrer"
      >
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
        <summary>
          {String(content.title ?? block.title ?? "More information")}
        </summary>
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
            {typeof column === "object" &&
            column &&
            "html" in column ? (
              <div
                dangerouslySetInnerHTML={{
                  __html: cleanHtml(
                    (column as { html?: unknown }).html,
                  ),
                }}
              />
            ) : (
              <p>
                {String(
                  typeof column === "object" &&
                    column &&
                    "text" in column
                    ? (column as { text?: unknown }).text ?? ""
                    : column ?? "",
                )}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

  return <p>{String(content.text ?? "")}</p>;
}
