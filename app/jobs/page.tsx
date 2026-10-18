import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicJobsPage() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("wf_ats_public_jobs")
    .select("job_listing_id,title,summary,location_city,location_state,remote_policy,employment_type,employer_display_name,published_at")
    .order("published_at", { ascending: false }).limit(100);

  return <main className="page-wrap" style={{ display: "grid", gap: 18 }}>
    <div className="page-heading">
      <div><p className="eyebrow">TXKPRO Workforce</p><h1>Open opportunities</h1>
        <p className="card-sub">Published opportunities are visible to students and external applicants.</p></div>
    </div>
    {error ? <div className="callout">Listings are temporarily unavailable.</div> :
      !data?.length ? <div className="card empty">No published roles yet. Employer drafts are not visible here.</div> :
        <div className="grid">
          {data.map((job) => <Link className="card" href={"/jobs/" + encodeURIComponent(job.job_listing_id)} key={job.job_listing_id}>
            <p className="eyebrow">{job.employer_display_name}</p>
            <h2>{job.title}</h2><p className="card-sub">{job.summary}</p>
            <p>{[job.location_city, job.location_state].filter(Boolean).join(", ")} · {job.remote_policy.replaceAll("_", " ")} · {job.employment_type.replaceAll("_", " ")}</p>
          </Link>)}
        </div>}
  </main>;
}
