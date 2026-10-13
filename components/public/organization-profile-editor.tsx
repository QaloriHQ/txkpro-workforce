"use client";

import { useState } from "react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Button, Card, FormField, Input, Textarea } from "@/components/design-system";
import type { OrganizationSettings } from "@/lib/public/organization-profile";

export function OrganizationProfileEditor({ initial }: { initial: OrganizationSettings }) {
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/organization/public-profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: profile.kind,
        entityId: profile.entityId,
        slug: String(form.get("slug") || ""),
        displayName: String(form.get("displayName") || ""),
        summary: String(form.get("summary") || ""),
        visibility: String(form.get("visibility") || "private"),
        robotsIndex: form.get("robotsIndex") === "on",
        logoUrl: String(form.get("logoUrl") || ""),
        shareImageUrl: String(form.get("shareImageUrl") || ""),
        website: String(form.get("website") || ""),
        city: String(form.get("city") || ""),
        state: String(form.get("state") || ""),
        serviceArea: String(form.get("serviceArea") || ""),
        focusItems: String(form.get("focusItems") || "").split("\n").map(value => value.trim()).filter(Boolean),
        contactAction: { label: String(form.get("contactLabel") || ""), href: String(form.get("contactHref") || "") },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(payload.error || "Profile could not be saved.");
    else { setProfile(payload.profile); setMessage("Public profile settings saved."); }
    setSaving(false);
  }

  return <form onSubmit={save} className="txk-organization-editor">
    <Card><h2>Publication</h2><div className="txk-form-grid">
      <FormField label="Public URL"><Input name="slug" defaultValue={profile.slug} required minLength={3} maxLength={80} /></FormField>
      <FormField label="Visibility"><select className="txk-input" name="visibility" defaultValue={profile.visibility}><option value="private">Private</option><option value="public">Public</option></select></FormField>
      <FormField label="Display name"><Input name="displayName" defaultValue={profile.displayName} required maxLength={160} /></FormField>
      <FormField label="Summary"><Textarea name="summary" defaultValue={profile.summary || ""} maxLength={3000} rows={5} /></FormField>
      <label className="txk-checkbox-row"><input type="checkbox" name="robotsIndex" defaultChecked={profile.robotsIndex} /> Allow search engines to index this public profile</label>
    </div></Card>
    <Card><h2>Public details</h2><div className="txk-form-grid">
      <FormField label="Logo URL" help="HTTPS only"><Input name="logoUrl" type="url" defaultValue={profile.logoUrl || ""} /></FormField>
      <FormField label="Share image URL" help="HTTPS only"><Input name="shareImageUrl" type="url" defaultValue={profile.shareImageUrl || ""} /></FormField>
      <FormField label="Website"><Input name="website" type="url" defaultValue={profile.website || ""} /></FormField>
      <FormField label="City"><Input name="city" defaultValue={profile.city || ""} maxLength={120} /></FormField>
      <FormField label="State"><Input name="state" defaultValue={profile.state || ""} maxLength={80} /></FormField>
      <FormField label="Service area"><Textarea name="serviceArea" defaultValue={profile.serviceArea || ""} maxLength={1000} rows={3} /></FormField>
      <FormField label={profile.kind === "institution" ? "Programs" : "Hiring focus"} help="One item per line"><Textarea name="focusItems" defaultValue={(profile.focusItems || []).join("\n")} rows={6} /></FormField>
      <FormField label="Contact button label"><Input name="contactLabel" defaultValue={profile.contactAction?.label || ""} maxLength={80} /></FormField>
      <FormField label="Contact button URL"><Input name="contactHref" defaultValue={profile.contactAction?.href || ""} maxLength={500} /></FormField>
    </div></Card>
    <div className="txk-form-actions"><Button tone="primary" disabled={saving}>{saving ? "Saving…" : "Save public profile"}</Button>{profile.visibility === "public" && profile.path ? <a className="txk-button txk-button-ghost txk-button-md" href={profile.path} target="_blank" rel="noopener noreferrer"><ArrowTopRightOnSquareIcon aria-hidden="true" />View profile</a> : null}</div>
    {message ? <p className="alert" role="status">{message}</p> : null}
  </form>;
}
