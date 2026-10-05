"use client";
import { useState, type ReactNode } from "react";
import { StudentComingSoon } from "@/components/student/coming-soon";
type Item = { id: string; search: string; status: string; content: ReactNode };
export function StudentTrainingLibrary({ items }: { items: Item[] }) {
 const [query,setQuery] = useState("");
 const [tab,setTab] = useState("Employer Training");
 const [status,setStatus] = useState("all");
 const comingSoon = tab === "Recommended" || tab === "My Program";
 const visible = items.filter(i => i.search.toLowerCase().includes(query.trim().toLowerCase()) && (tab !== "In Progress" || i.status === "in_progress") && (status === "all" || i.status === status));
 return <section className="student-home-section" aria-label="Browse training"><h2>Browse training</h2><div className="student-training-search"><label><span className="sr-only">Search assigned training</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search employers, topics, modules…" /></label><label><span className="sr-only">Filter training status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="assigned">Assigned</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div><div className="student-prototype-tabs" aria-label="Training categories">{["Recommended","My Program","Employer Training","In Progress"].map(t=><button key={t} type="button" aria-pressed={tab === t} className={tab === t ? "active" : ""} onClick={()=>setTab(t)}>{t}</button>)}</div>{comingSoon ? <StudentComingSoon title={`${tab} training`} description="This training collection is coming soon. Your assigned company courses are available under Employer Training." /> : <div className="student-training-library">{visible.map(i=><div className="student-training-library-item" key={i.id}>{i.content}</div>)}{!visible.length && <div className="card student-training-empty"><h3>{items.length ? "No training matches these filters" : "No Employer Training assignments yet"}</h3><p>{items.length ? "Try another search or status." : "When your Institution assigns a course, it will appear here."}</p></div>}</div>}</section>;
}
