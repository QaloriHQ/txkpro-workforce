"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BriefcaseIcon, MagnifyingGlassIcon, MapPinIcon, PlusIcon, Squares2X2Icon, UserGroupIcon } from "@heroicons/react/24/outline";
import type { JobListing, JobStatus } from "@/lib/employer/job-listings";

const STATUSES: JobStatus[] = ["published", "draft", "paused", "closed", "archived"];
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function JobGallery({ jobs, canCreate }: { jobs: JobListing[]; canCreate: boolean }) {
  const listings = useMemo(() => jobs.filter((job) => !job.isTemplate), [jobs]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | JobStatus>("all");
  const [pipeline, setPipeline] = useState("all");
  const [location, setLocation] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [sort, setSort] = useState("updated");
  const locations = useMemo(() => [...new Set(listings.map((job) => [job.locationCity, job.locationState].filter(Boolean).join(", ")).filter(Boolean))].sort(), [listings]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return listings.filter((job) => {
      const place = [job.locationCity, job.locationState].filter(Boolean).join(", ");
      return (status === "all" || job.status === status) &&
        (pipeline === "all" || (pipeline === "assigned" ? Boolean(job.pipelineVersionId) : !job.pipelineVersionId)) &&
        (location === "all" || place === location) &&
        (assignee === "all" || (assignee === "assigned" ? Boolean(job.assignedHiringManagerUserId) : !job.assignedHiringManagerUserId)) &&
        (!needle || [job.title, job.summary, place, job.jobListingId, ...job.skills].join(" ").toLowerCase().includes(needle));
    }).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "status" ? STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) : sort === "oldest" ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt));
  }, [assignee, listings, location, pipeline, query, sort, status]);
  const count = (value: JobStatus) => listings.filter((job) => job.status === value).length;
  return <div className="job-gallery-page">
    <div className="page-heading"><div><p className="eyebrow">Employer hiring</p><h1>Job listings</h1><p className="card-sub">Organization-wide listings, lifecycle state, pipeline coverage, and hiring ownership.</p></div><div className="job-actions"><Link className="txk-button txk-button-secondary txk-button-md" href="/employer/jobs/templates"><Squares2X2Icon aria-hidden="true" /> Templates</Link>{canCreate ? <Link className="txk-button txk-button-primary txk-button-md" href="/employer/jobs/new"><PlusIcon aria-hidden="true" /> Create job</Link> : null}</div></div>
    <section className="job-metrics" aria-label="Job listing summary"><article className="card"><span>Total listings</span><strong>{listings.length}</strong><small>Templates excluded</small></article><article className="card"><span>Published</span><strong>{count("published")}</strong><small>{count("draft")} private drafts</small></article><article className="card"><span>Paused / closed</span><strong>{count("paused") + count("closed")}</strong><small>{count("archived")} archived</small></article><article className="card"><span>Pipeline assigned</span><strong>{listings.filter((job) => job.pipelineVersionId).length}/{listings.length || 0}</strong><small>Immutable versions</small></article><article className="card"><span>Hiring owner</span><strong>{listings.filter((job) => job.assignedHiringManagerUserId).length}/{listings.length || 0}</strong><small>Primary manager assigned</small></article></section>
    <section className="job-filterbar" aria-label="Filter job listings">
      <label className="job-search"><span>Search listings</span><div><MagnifyingGlassIcon width={20} aria-hidden="true" /><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, skill, location or ID" /></div></label>
      <label><span>Status</span><select className="select" value={status} onChange={(event) => setStatus(event.target.value as "all" | JobStatus)}><option value="all">All statuses</option>{STATUSES.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label><span>Location</span><select className="select" value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">All locations</option>{locations.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Pipeline</span><select className="select" value={pipeline} onChange={(event) => setPipeline(event.target.value)}><option value="all">Any pipeline state</option><option value="assigned">Assigned</option><option value="unassigned">Not assigned</option></select></label>
      <label><span>Hiring owner</span><select className="select" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="all">Any assignment</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
      <label><span>Sort</span><select className="select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="oldest">Oldest updated</option><option value="title">Title A–Z</option><option value="status">Status</option></select></label>
    </section>
    <p className="card-sub" role="status" aria-live="polite">{shown.length} of {listings.length} listings</p>
    {shown.length ? <section className="job-card-grid" aria-label="Job listings">{shown.map((job) => {
      const place = [job.locationCity, job.locationState].filter(Boolean).join(", ") || label(job.remotePolicy);
      return <Link className="job-listing-card card" href={`/employer/jobs/${job.id}`} key={job.id}><div className="job-card-top"><span className={`pill job-status-${job.status}`}>{label(job.status)}</span><BriefcaseIcon width={22} aria-hidden="true" /></div><div><p className="eyebrow">{job.jobListingId}</p><h2>{job.title || "Untitled job"}</h2><p className="card-sub">{job.summary || "Add a summary in the job editor."}</p></div><div className="job-card-facts"><span><MapPinIcon aria-hidden="true" />{place}</span><span><UserGroupIcon aria-hidden="true" />{job.assignedHiringManagerUserId ? "Hiring manager assigned" : "Hiring owner unassigned"}</span></div><dl><div><dt>Pipeline</dt><dd>{job.pipelineVersionId ? "Assigned" : "Not assigned"}</dd></div><div><dt>Updated</dt><dd>{new Date(job.updatedAt).toLocaleDateString()}</dd></div></dl></Link>;
    })}</section> : <section className="card empty"><BriefcaseIcon width={30} aria-hidden="true" /><h2>No matching listings</h2><p>Adjust the filters or create a job to get started.</p></section>}
  </div>;
}
