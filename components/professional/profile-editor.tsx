"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { WorkspaceForm } from "@/components/design-system/action-modal";
import { CustomizationEditor } from "./customization-editor";
import { ProfessionalProfileView } from "./profile-view";
import type { Preferences, Post, Settings } from "@/lib/professional-profile/types";
const labels: Record<keyof Preferences, string> = { reviews: "Published reviews", ratings: "Rating summary", posts: "Published posts", activity: "Activity history", likes: "Likes", comments: "Comments", shares: "Shares", reposts: "Reposts" };
function PostForm({ post, busy, feedback, save }: { post?: Post; busy: boolean; feedback: string; save: (input: Record<string, unknown>, post: boolean) => Promise<boolean> }) {
  const draftId = useRef(post?.id ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    draftId.current ||= `POST-${crypto.randomUUID()}`;
    if (await save({ id: draftId.current, title: data.get("title"), body: data.get("body"), status: data.get("status") }, true)) {
      if (!post) { form.reset(); draftId.current = ""; }
    }
  }
  return <WorkspaceForm modalTitle={post ? "Edit post" : "Create post"} triggerLabel={post ? `Edit ${post.title || "update"}` : "Create post"} busy={busy} onSubmit={submit} feedback={<p role="status">{feedback}</p>}>
    <label>Title<input name="title" maxLength={160} defaultValue={post?.title ?? ""} /></label><label>Post<textarea name="body" maxLength={8000} required defaultValue={post?.body ?? ""} rows={8} /></label>
    <label>Status<select name="status" defaultValue={post?.status ?? "draft"}><option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option>{post ? <option value="removed">Remove permanently</option> : null}</select></label>
    <p className="card-sub">Only published posts appear publicly. Removal cannot be undone.</p><button className="button" disabled={busy} type="submit">{busy ? "Saving…" : "Save post"}</button>
  </WorkspaceForm>;
}
export function ProfessionalProfileEditor({ initial }: { initial: Settings[] }) {
  const [profiles, setProfiles] = useState(initial); const [selected, setSelected] = useState(initial[0].kind); const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState(""); const [preview, setPreview] = useState(false);
  const profile = profiles.find(p => p.kind === selected)!;
  async function save(input: Record<string, unknown>, post = false) {
    setBusy(true); setFeedback("");
    try { const response = await fetch(`/api/professional/profile?kind=${selected}`, { method: post ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to save."); setProfiles(all => all.map(p => p.kind === selected ? result : p)); setFeedback("Saved. Close the editor to return to your profile."); return true; }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to save."); return false; } finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const preferences = Object.fromEntries(Object.keys(labels).map(key => [key, data.get(key) === "on"])); await save({ slug: data.get("slug"), displayName: data.get("displayName"), headline: data.get("headline"), bio: data.get("bio"), specialties: data.get("specialties"), credentials: data.get("credentials"), visibility: data.get("visibility"), preferences }); }
  return <>
    <div className="professional-controls">{profiles.length > 1 ? profiles.map(p => <button type="button" className="button button-ghost" key={p.kind} aria-pressed={selected === p.kind} disabled={busy} onClick={() => { setSelected(p.kind); setFeedback(""); }}>{p.kind === "staff" ? "Staff profile" : "Educator profile"}</button>) : null}<span className="pill">{profile.visibility === "public" ? "Public" : "Private"}</span>
      <WorkspaceForm key={selected} modalTitle="Edit professional profile" busy={busy} onSubmit={submit} feedback={<p role="status">{feedback}</p>}>
        <label>Display name<input name="displayName" defaultValue={profile.displayName} required maxLength={100} /></label><label>Profile URL<input name="slug" defaultValue={profile.slug} required minLength={3} maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" /></label><p className="card-sub">/{selected === "educator" ? "educators" : "staff"}/your-name. Previous URLs redirect while public.</p>
        <label>Headline<input name="headline" defaultValue={profile.headline} maxLength={160} /></label><label>Bio<textarea name="bio" defaultValue={profile.bio} rows={6} maxLength={2000} /></label><label>Specialties (one per line)<textarea name="specialties" defaultValue={profile.specialties} maxLength={1000} rows={4} /></label><label>Credential descriptions<textarea name="credentials" defaultValue={profile.credentials} maxLength={2000} rows={4} /></label><p className="card-sub">Specialties and credentials are self-entered claims. Affiliations come from authorized memberships.</p>
        <label>Profile visibility<select name="visibility" defaultValue={profile.visibility}><option value="private">Private</option><option value="public">Public</option></select></label><p className="card-sub">Public profiles can be viewed without signing in and indexed by search engines. Private profiles and old URLs are unavailable to visitors.</p>
        <fieldset><legend>Show on public profile</legend>{Object.entries(labels).map(([key, label]) => <label className="professional-checkbox" key={key}><input name={key} type="checkbox" defaultChecked={profile.preferences[key as keyof Preferences]} />{label}</label>)}</fieldset><p className="card-sub">Activity requires both Activity history and its category. Only activity on currently public professional posts is shown.</p><button type="submit" className="button" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      </WorkspaceForm><button type="button" className="button button-ghost" aria-pressed={preview} onClick={() => setPreview(v => !v)}>{preview ? "Return to editing" : "Preview saved profile"}</button>{profile.visibility === "public" && profile.path ? <Link href={profile.path} className="button button-ghost">View public profile</Link> : null}
    </div>
    {!profile.chosen ? <p className="callout">Create your profile with the edit button. It stays private until you choose Public.</p> : null}
    {!preview && profile.chosen ? <CustomizationEditor key={selected} kind={selected} value={profile.customization} update={customization => setProfiles(all => all.map(p => p.kind === selected ? { ...p, customization } : p))} /> : null}
    <ProfessionalProfileView profile={{ ...profile, posts: profile.preferences.posts ? profile.posts.filter(p => p.status === "published") : [] }} />
    {!preview && profile.chosen ? <section className="card"><div className="professional-controls"><h2>Manage posts</h2><PostForm key={selected} busy={busy} feedback={feedback} save={save} /></div>{profile.posts.map(p => <div className="professional-item" key={p.id}><h3>{p.title || "Update"}</h3><span className="pill">{p.status}</span><p className="professional-text">{p.body.length > 120 ? `${p.body.slice(0, 120)}…` : p.body}</p><PostForm post={p} busy={busy} feedback={feedback} save={save} /></div>)}</section> : null}
    {preview ? <p className="card-sub">Preview shows saved bio, claims and posts. Published reviews and shared activity appear on the public page according to your settings.</p> : null}
  </>;
}
