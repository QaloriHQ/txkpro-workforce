"use client";
import { useState } from "react";
import Image from "next/image";
import { DocumentIcon } from "@heroicons/react/24/outline";
import type { PortfolioFile } from "@/lib/student-portfolio/types";
export const portfolioFileUrl = (id: string) => `/api/student/portfolio/files/${encodeURIComponent(id)}`;
export function ProjectDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const characters = Array.from(text);
  return <div><p className="portfolio-text">{expanded || characters.length <= 120 ? text : `${characters.slice(0, 120).join("")}…`}</p>{characters.length > 120 ? <button type="button" className="portfolio-read-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Read less" : "Read more"}</button> : null}</div>;
}
export function SkillPills({ skills }: { skills: string }) {
  const tags = skills.split(",").map(s => s.trim()).filter(Boolean).slice(0, 3);
  return tags.length ? <div className="portfolio-skill-pills" aria-label="Student-entered skills demonstrated">{tags.map((tag, index) => <span className="pill" key={`${index}-${tag}`}>{tag}</span>)}</div> : null;
}
export function FileCard({ file }: { file: PortfolioFile }) {
  return <a className="portfolio-file-card" href={`${portfolioFileUrl(file.id)}?view=1`} target="_blank" rel="noopener noreferrer" aria-label={`View ${file.title} (opens in a new tab)`}>
    <div className="portfolio-file-preview">{file.mime.startsWith("image/") ? <Image src={portfolioFileUrl(file.id)} alt="" fill sizes="(max-width: 600px) 40vw, 180px" unoptimized /> : <><DocumentIcon aria-hidden="true" /><span>{file.mime === "application/pdf" ? "PDF" : "TXT"}</span></>}</div>
    <strong>{file.title}</strong><small>Student-uploaded {file.kind} · {Math.ceil(file.size / 1024)} KB</small>
  </a>;
}
