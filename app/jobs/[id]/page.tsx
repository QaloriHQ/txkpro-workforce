import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("wf_ats_public_jobs").select(
    "job_listing_id,title,summary,description,location_city,location_state,remote_policy,employment_type,pay_min,pay_max,pay_period,shift_text,benefits_json,requirements_json,skills_json,employer_display_name,published_at",
  ).eq("job_listing_id", id).maybeSingle();
  if (error || !data) notFound();
  const requirements: string[] = Array.isArray(data.requirements_json) ? data.requirements_json.filter((item): item is string => typeof item === "string") : [];
  const benefits: string[] = Array.isArray(data.benefits_json) ? data.benefits_json.filter((item): item is string => typeof item === "string") : [];
  const skills: string[] = Array.isArray(data.skills_json) ? data.skills_json.filter((item): item is string => typeof item === "string") : [];
  return <main className="page-wrap">
    <article className="card" style={{ display: "grid", gap: 16, maxWidth: 880, marginInline: "auto" }}>
      <p className="eyebrow">{data.employer_display_name}</p>
      <h1>{data.title}</h1>
      <p>{[data.location_city, data.location_state].filter(Boolean).join(", ")} · {data.remote_policy.replaceAll("_", " ")} · {data.employment_type.replaceAll("_", " ")}</p>
      <strong>{data.summary}</strong>
      <p style={{ whiteSpace: "pre-wrap" }}>{data.description}</p>
      {data.pay_min != null || data.pay_max != null ? <p><strong>Pay:</strong> {data.pay_min ?? "—"} – {data.pay_max ?? "—"} / {data.pay_period}</p> : null}
      <p><strong>Schedule:</strong> {data.shift_text}</p>
      <section><h2>Requirements</h2><ul>{requirements.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
      <section><h2>Skills</h2><ul>{skills.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
      <section><h2>Benefits</h2><ul>{benefits.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
      <p className="card-sub">Applications become available after the ATS application workflow launches.</p>
    </article>
  </main>;
}
