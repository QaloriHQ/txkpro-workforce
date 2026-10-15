"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ActionModal } from "@/components/design-system/action-modal";
import { CalendarDaysIcon, ChartBarSquareIcon, DocumentTextIcon, PencilSquareIcon, PlusIcon } from "@heroicons/react/24/outline";

type PostType = "post" | "article";

export function CommunityCreateMenu({ viewerName }: { viewerName: string }) {
  const [type, setType] = useState<PostType | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type) return;
    setBusy(true); setFeedback("");
    const data = new FormData(event.currentTarget);
    const mediaUrl = String(data.get("media") || "").trim();
    try {
      const response = await fetch("/api/community/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        postType: type, title: String(data.get("title") || ""), body: String(data.get("body") || ""), topic: String(data.get("topic") || ""),
        location: String(data.get("location") || ""), media: mediaUrl ? [mediaUrl] : [], publicAcknowledged: data.get("publicAcknowledged") === "on",
      }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Your post could not be published.");
      setFeedback("Published. Refreshing your Community feed…");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (reason) { setFeedback(reason instanceof Error ? reason.message : "Your post could not be published."); setBusy(false); }
  }

  return <ActionModal title="Create in Community" triggerLabel="Create Community content" triggerContent={<><PlusIcon aria-hidden="true" /> <span>Create</span></>} busy={busy} className="community-create-dialog" onClose={() => { setType(null); setFeedback(""); }}>
    {!type ? <div className="community-create-options">
      <button type="button" onClick={() => setType("post")}><PencilSquareIcon aria-hidden="true" /><span><strong>Post</strong><small>Share an update or question</small></span></button>
      <button type="button" onClick={() => setType("article")}><DocumentTextIcon aria-hidden="true" /><span><strong>Article</strong><small>Publish a longer insight</small></span></button>
      <Link href="/events"><CalendarDaysIcon aria-hidden="true" /><span><strong>Event</strong><small>Invite the community</small></span></Link>
      <Link href="/polls"><ChartBarSquareIcon aria-hidden="true" /><span><strong>Poll</strong><small>Ask and gather votes</small></span></Link>
    </div> : <form className="community-composer" onSubmit={publish}>
      <button className="text-button" type="button" onClick={() => setType(null)}>← Choose another format</button>
      <p className="community-author-note"><strong>Posting as {viewerName}</strong><br />Community content is attributed to your individual TXKPRO account.</p>
      <label>{type === "article" ? "Article title" : "Post title"}<input name="title" maxLength={160} required={type === "article"} placeholder="Add a helpful headline" /></label>
      <label>{type === "article" ? "Article" : "Your update"}<textarea name="body" maxLength={8000} required rows={5} placeholder="Ask a question, share progress, or offer advice…" /></label>
      <div className="community-field-row"><label>Topic<input name="topic" maxLength={64} placeholder="e.g. Electrical" /></label><label>Location<input name="location" maxLength={120} placeholder="e.g. Texarkana, TX" /></label></div>
      <label>Image URL<input name="media" type="url" placeholder="https://… (optional)" /></label>
      <label className="community-public-check"><input name="publicAcknowledged" type="checkbox" required /><span><strong>Public</strong> — visible on TXKPRO and search engines.</span></label>
      <div className="community-composer-actions"><span role="status">{feedback}</span><button className="button" disabled={busy}>{busy ? "Publishing…" : `Publish ${type}`}</button></div>
    </form>}
  </ActionModal>;
}
