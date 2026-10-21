"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import type { PublicCommunityPost } from "@/lib/community/public-repository";
import { SponsoredPlacement } from "@/components/ads/sponsored-placement";
import { plainCommunityText } from "@/components/community/community-rich-content";

export function ArticleGallery({ items, contentId }: { items: PublicCommunityPost[]; contentId?: string }) {
  const [query, setQuery] = useState("");
  const visible = items.filter(item => `${item.title} ${plainCommunityText(item.body || "")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section aria-label="Article list">
    <label>Search articles<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="student-discovery-grid">{visible.map((item, index) => <Fragment key={item.id}>
      <article className="student-discovery-card"><div className="student-discovery-card-body"><p className="eyebrow">Article</p><h2><Link href={item.canonicalPath!}>{item.title}</Link></h2><p>{plainCommunityText(item.body || "").slice(0, 180)}</p><small>{item.authorName}</small></div></article>
      {index === 2 ? <SponsoredPlacement placement="in_article" contentId={contentId} itemCount={visible.length} listKind="articles" listItemIds={visible.map(item => item.id!)} /> : null}
    </Fragment>)}</div>
    {!visible.length ? <p>No matching articles.</p> : null}
  </section>;
}
