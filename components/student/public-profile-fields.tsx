"use client";
import { useId } from "react";
import type { StudentPublicSettings } from "@/lib/student-public-profile/types";
export function PublicProfileFields({ value, onChange, disabled = false, identityOnly = false }: {
  value: Pick<StudentPublicSettings, "visibility" | "slug" | "displayName" | "headline" | "bio">;
  onChange: (name: "visibility" | "slug" | "displayName" | "headline" | "bio", value: string) => void;
  disabled?: boolean;
  identityOnly?: boolean;
}) {
  const id = useId();
  return <fieldset disabled={disabled} className="form-stack" style={{ border: 0, padding: 0, margin: 0 }}>
    <legend>{identityOnly ? "Profile details" : "Public profile and privacy"}</legend>
    {!identityOnly ? <>
    <p className="muted">Public shares your chosen identity and explicitly shared portfolio sections on the web. Private hides this page. Approved Employer discovery is a separate setting.</p>
    <div role="group" aria-label="Choose profile visibility" className="grid grid-2">
      {(["private", "public"] as const).map(visibility => <label className="check-card" key={visibility}><input type="radio" name={`${id}-visibility`} value={visibility} checked={value.visibility === visibility} onChange={() => onChange("visibility", visibility)} required /><span><strong>{visibility === "public" ? "Public" : "Private"}</strong><br />{visibility === "public" ? "Share a curated profile on the web." : "Keep your public page unavailable."}</span></label>)}
    </div>
    </> : null}
    <label><span>Display name</span><input className="input" value={value.displayName} onChange={e => onChange("displayName", e.target.value)} maxLength={100} required autoComplete="nickname" /></label>
    {!identityOnly ? <label><span>Profile URL</span><span className="muted">/students/</span><input className="input" value={value.slug} onChange={e => onChange("slug", e.target.value.toLowerCase())} minLength={3} maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" required autoCapitalize="none" spellCheck={false} aria-describedby={`${id}-slug-help`} /><small id={`${id}-slug-help`}>Use letters, numbers, and single hyphens. Previous URLs redirect while your page is Public.</small></label> : null}
    <label><span>Headline (optional)</span><input className="input" value={value.headline} onChange={e => onChange("headline", e.target.value)} maxLength={160} /></label>
    <label><span>Bio (optional)</span><textarea className="input" value={value.bio} onChange={e => onChange("bio", e.target.value)} maxLength={1000} rows={4} /></label>
    <p className="muted">Include only information you want to share publicly. Instructor Verified Skills remain separate authoritative records.</p>
  </fieldset>;
}
