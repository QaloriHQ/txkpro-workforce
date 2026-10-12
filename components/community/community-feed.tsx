"use client";
/* Community media uses user-supplied HTTPS sources and remains unoptimized to avoid durable image caching. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  BookmarkIcon, ChatBubbleOvalLeftIcon, HandThumbUpIcon, MapPinIcon,
  PaperAirplaneIcon, ShareIcon, UserPlusIcon, FlagIcon, ArrowPathRoundedSquareIcon,
} from "@heroicons/react/24/outline";
import type { CommunityComment, CommunityFeedResult, CommunityFilter, CommunityPost } from "@/lib/community/types";

type ApiFeed = Omit<CommunityFeedResult, "nextCursor"> & { nextCursor: string | null };
const filters: { key: CommunityFilter; label: string }[] = [
  { key: "recent", label: "Recent" }, { key: "following", label: "Following" },
  { key: "nearby", label: "Nearby" }, { key: "topic", label: "Topics" },
];

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Something went wrong.");
  return body as T;
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function PostComments({ post, onCount }: { post: CommunityPost; onCount: (count: number) => void }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [feedback, setFeedback] = useState("");

  async function load() {
    setLoading(true); setFeedback("");
    try { const result = await json<CommunityComment[]>(`/api/community/posts/${post.id}/comments`); setComments(result); onCount(result.length); }
    catch (reason) { setFeedback(reason instanceof Error ? reason.message : "Comments could not be loaded."); }
    finally { setLoading(false); }
  }

  async function toggle() {
    const next = !open; setOpen(next);
    if (next && comments.length === 0) await load();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setFeedback("");
    try {
      await json(`/api/community/posts/${post.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: data.get("body"), parentId: replyTo?.id ?? null }) });
      form.reset(); setReplyTo(null); await load(); setFeedback("Comment published.");
    } catch (reason) { setFeedback(reason instanceof Error ? reason.message : "The comment could not be published."); }
  }

  return <>
    <button type="button" aria-expanded={open} aria-controls={`comments-${post.id}`} onClick={() => void toggle()}><ChatBubbleOvalLeftIcon aria-hidden="true" /> Comment</button>
    {open ? <section id={`comments-${post.id}`} className="community-comments" aria-label={`Comments on ${post.title || "post"}`}>
      {loading ? <p role="status">Loading comments…</p> : null}
      {!loading && comments.length === 0 ? <p className="card-sub">No comments yet. Start the conversation.</p> : null}
      {comments.map(comment => <article className={comment.parentId ? "community-comment community-comment-reply" : "community-comment"} key={comment.id}>
        <span className="community-avatar">{comment.authorImageUrl ? <img src={comment.authorImageUrl} alt="" /> : comment.authorName.slice(0,2).toUpperCase()}</span>
        <div><strong>{comment.authorName}</strong><p>{comment.body}</p><small>{relativeTime(comment.createdAt)}</small> <button type="button" onClick={() => setReplyTo(comment)}>Reply</button></div>
      </article>)}
      <form className="community-comment-form" onSubmit={submit}>
        {replyTo ? <p>Replying to <strong>{replyTo.authorName}</strong> <button type="button" onClick={() => setReplyTo(null)}>Cancel</button></p> : null}
        <label><span className="sr-only">{replyTo ? "Write a reply" : "Write a comment"}</span><textarea name="body" required maxLength={2000} rows={2} placeholder={replyTo ? "Write a reply…" : "Write a comment…"} /></label>
        <button className="button" type="submit">Publish</button>
      </form>
      <p role="status" className="card-sub">{feedback}</p>
    </section> : null}
  </>;
}

export function CommunityFeed({ viewerName }: { viewerName: string }) {
  const [filter, setFilter] = useState<CommunityFilter>("recent");
  const [topic, setTopic] = useState("");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nearbyConfigured, setNearbyConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async (append = false, next?: string | null) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ filter });
      if (filter === "topic" && topic.trim()) params.set("topic", topic.trim());
      if (next) params.set("cursor", next);
      const data = await json<ApiFeed>(`/api/community/posts?${params}`);
      setPosts((current) => append ? [...current, ...data.items] : data.items);
      setCursor(data.nextCursor); setNearbyConfigured(data.nearbyConfigured);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The feed could not be loaded."); }
    finally { setLoading(false); }
  }, [filter, topic]);

  useEffect(() => {
    const scheduled = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(scheduled);
  }, [load]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPublishing(true); setFeedback("");
    const form = event.currentTarget; const data = new FormData(form);
    const mediaUrl = String(data.get("media") || "").trim();
    try {
      await json("/api/community/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        postType: String(data.get("postType") || "post"), title: String(data.get("title") || ""), body: String(data.get("body") || ""), topic: String(data.get("topic") || ""),
        location: String(data.get("location") || ""), media: mediaUrl ? [mediaUrl] : [], publicAcknowledged: data.get("publicAcknowledged") === "on",
      }) });
      form.reset(); setFeedback("Your post is live."); setFilter("recent"); await load();
    } catch (reason) { setFeedback(reason instanceof Error ? reason.message : "Your post could not be published."); }
    finally { setPublishing(false); }
  }

  async function toggle(post: CommunityPost, action: "like" | "save") {
    try {
      const result = await json<{ active: boolean; count?: number }>(`/api/community/posts/${post.id}/${action}`, { method: "POST" });
      setPosts((items) => items.map((item) => item.id === post.id ? { ...item,
        ...(action === "like" ? { viewerLiked: result.active, likeCount: result.count ?? item.likeCount } : { viewerSaved: result.active }),
      } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The action could not be completed."); }
  }

  async function follow(post: CommunityPost) {
    try {
      const result = await json<{ active: boolean }>(`/api/community/authors/${post.authorUserId}/follow`, { method: "POST" });
      setPosts((items) => items.map((item) => item.authorUserId === post.authorUserId ? { ...item, viewerFollowsAuthor: result.active } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The action could not be completed."); }
  }

  async function share(post: CommunityPost, shareType: "share" | "repost") {
    if (!window.confirm(shareType === "repost" ? "Add this post to your repost activity?" : "Share this post to your TXKPRO activity?")) return;
    try {
      const result = await json<{ active: boolean; count: number }>(`/api/community/posts/${post.id}/${shareType}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setPosts(items => items.map(item => item.id === post.id ? { ...item, shareCount: result.count,
        ...(shareType === "share" ? { viewerShared: result.active } : { viewerReposted: result.active }),
      } : item));
      if (shareType === "share" && result.active) await navigator.clipboard.writeText(`${window.location.origin}/community?post=${encodeURIComponent(post.id)}`).catch(() => undefined);
      setFeedback(result.active ? (shareType === "repost" ? "Repost added to your activity." : "Shared to your activity. The link was copied when permitted.") : `${shareType === "repost" ? "Repost" : "Share"} withdrawn.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The share action could not be completed."); }
  }

  async function report(post: CommunityPost) {
    if (!window.confirm("Report this post for review?")) return;
    try { await json(`/api/community/posts/${post.id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "other" }) }); setFeedback("Report submitted for review."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The report could not be submitted."); }
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const location = String(new FormData(event.currentTarget).get("location") || "");
    try { await json("/api/community/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location }) }); setFeedback("Nearby location saved."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Location could not be saved."); }
  }

  return <div className="community-layout">
    <aside className="community-rail" aria-label="Community navigation">
      <h2>Community</h2>
      <p>Connect with the TXKPRO workforce network.</p>
      <a href="#composer">Create a post</a><a href="#feed">Your feed</a>
    </aside>
    <section className="community-main">
      <form id="composer" className="community-composer" onSubmit={publish}>
        <div className="community-composer-lead"><span className="student-avatar">{viewerName.slice(0, 1) || "M"}</span><strong>Share with the workforce community</strong></div>
        <label>Format<select name="postType" defaultValue="post"><option value="post">Post</option><option value="update">Update</option><option value="article">Article</option></select></label>
        <label>Post title <input name="title" maxLength={160} placeholder="Add a helpful headline" /></label>
        <label>Your update <textarea name="body" maxLength={8000} required rows={4} placeholder="Ask a question, share progress, or offer advice…" /></label>
        <div className="community-field-row"><label>Topic <input name="topic" maxLength={64} placeholder="e.g. Electrical" /></label><label>Location <input name="location" maxLength={120} placeholder="e.g. Texarkana, TX" /></label></div>
        <label>Image URL <input name="media" type="url" placeholder="https://… (optional)" /></label>
        <label className="community-public-check"><input name="publicAcknowledged" type="checkbox" required /> <span><strong>Public</strong> — visible on TXKPRO and search engines.</span></label>
        <div className="community-composer-actions"><span role="status">{feedback}</span><button className="button" disabled={publishing}>{publishing ? "Publishing…" : <><PaperAirplaneIcon aria-hidden="true" /> Publish</>}</button></div>
      </form>

      <div id="feed" className="community-filter-bar">
        <div role="tablist" aria-label="Filter community feed">{filters.map((item) => <button role="tab" aria-selected={filter === item.key} key={item.key} onClick={() => setFilter(item.key)}>{item.label}</button>)}</div>
        {filter === "topic" ? <label className="community-topic-filter">Topic <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Type a topic" /></label> : null}
      </div>

      {filter === "nearby" && !nearbyConfigured ? <form className="community-empty" onSubmit={saveLocation}><MapPinIcon aria-hidden="true" /><h2>Set your nearby location</h2><p>Use a city or service area to see relevant public posts.</p><input name="location" required maxLength={120} placeholder="Texarkana, TX" /><button className="button">Save location</button></form> : null}
      {error ? <div className="community-error" role="alert"><p>{error}</p><button onClick={() => void load()}>Try again</button></div> : null}
      {loading && posts.length === 0 ? <div className="community-loading" aria-label="Loading community posts"><span /><span /><span /></div> : null}
      {!loading && !error && posts.length === 0 && (filter !== "nearby" || nearbyConfigured) ? <div className="community-empty"><h2>No posts here yet</h2><p>{filter === "following" ? "Follow people from the Recent feed to build this view." : "Start the conversation with a public post."}</p></div> : null}
      <div className="community-post-list">{posts.map((post) => <article className="community-post" key={post.id}>
        <header><span className="community-avatar">{post.authorImageUrl ? <img src={post.authorImageUrl} alt="" /> : post.authorName.slice(0, 2).toUpperCase()}</span><div><strong>{post.authorName}</strong>{post.authorHeadline ? <small>{post.authorHeadline}</small> : null}<small>{relativeTime(post.publishedAt)}{post.location ? ` · ${post.location}` : ""}</small></div>{!post.isOwn ? <button className="community-follow" onClick={() => void follow(post)}><UserPlusIcon aria-hidden="true" />{post.viewerFollowsAuthor ? "Following" : "Follow"}</button> : null}</header>
        <span className="community-content-type">{post.postType}</span>{post.topic ? <span className="community-topic">{post.topic}</span> : null}{post.title ? <h2>{post.title}</h2> : null}<p className="community-post-body">{post.body}</p>
        {post.media[0] ? <img className="community-post-media" src={post.media[0]} alt="Post attachment" /> : null}
        <div className="community-counts"><span>{post.likeCount} likes</span><span>{post.commentCount} comments · {post.shareCount} shares</span></div>
        <footer><button type="button" className={post.viewerLiked ? "active" : ""} onClick={() => void toggle(post, "like")}><HandThumbUpIcon aria-hidden="true" /> Like</button><PostComments post={post} onCount={count => setPosts(items => items.map(item => item.id === post.id ? { ...item, commentCount: count } : item))} /><button type="button" className={post.viewerShared ? "active" : ""} onClick={() => void share(post, "share")}><ShareIcon aria-hidden="true" /> Share</button><button type="button" className={post.viewerReposted ? "active" : ""} onClick={() => void share(post, "repost")}><ArrowPathRoundedSquareIcon aria-hidden="true" /> Repost</button><button type="button" className={post.viewerSaved ? "active" : ""} onClick={() => void toggle(post, "save")}><BookmarkIcon aria-hidden="true" /> Save</button><button type="button" aria-label="Report post" onClick={() => void report(post)}><FlagIcon aria-hidden="true" /></button></footer>
      </article>)}</div>
      {cursor ? <button className="community-load-more" disabled={loading} onClick={() => void load(true, cursor)}>{loading ? "Loading…" : "Load more"}</button> : null}
    </section>
    <aside className="community-rail community-guidelines"><h2>Community standards</h2><p>Be useful, respectful, and mindful that public posts may appear in search engines.</p><strong>Private messaging, groups, polls, and events are coming in later community releases.</strong></aside>
  </div>;
}
