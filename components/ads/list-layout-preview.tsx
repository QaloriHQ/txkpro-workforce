"use client";
/* Local sample media is used only for presentation previews. */
/* eslint-disable @next/next/no-img-element */
import { Fragment, useState } from "react";
import { SponsoredPlacement } from "@/components/ads/sponsored-placement";
const surfaces = [
  { title: "Posts", kind: "posts", placement: "in_feed", samples: ["Sample: First week on a worksite", "Sample: Local trade career discussion", "Sample: Community project update"] },
  { title: "Events", kind: "events", placement: "in_feed", samples: ["Sample: Skilled trades open house", "Sample: Resume practice workshop", "Sample: Community networking session"] },
  { title: "Polls", kind: "polls", placement: "in_feed", samples: ["Sample: Which workshop topic interests you?", "Sample: Preferred event format?", "Sample: Which trade would you explore?"] },
  { title: "Articles", kind: "articles", placement: "in_article", samples: ["Sample: Preparing for your first job", "Sample: Building a project portfolio", "Sample: Learning with a mentor"] },
  { title: "Comments", kind: "comments", placement: "in_comments", samples: ["Sample comment: Thanks for sharing this idea.", "Sample comment: A useful topic for a workshop.", "Sample comment: Looking forward to the discussion."] },
  { title: "Feed sidebar", kind: "posts", placement: "multiplex", samples: ["Sample: Feed post one", "Sample: Feed post two", "Sample: Feed post three"] },
] as const;
export function ListLayoutPreview() {
  const [count, setCount] = useState(3);
  const [media, setMedia] = useState<"image" | "text">("image");
  return <section><h2>List threshold preview</h2><p>Sample content and sample ads only. No provider requests, impressions, clicks, budget charges or engagement points.</p>
    <label>Visible organic items<select value={count} onChange={event => setCount(Number(event.target.value))}>{[0,1,2,3,6].map(n => <option key={n} value={n}>{n} items</option>)}</select></label>
    <label>Ad creative<select value={media} onChange={event => setMedia(event.target.value as "image" | "text")}><option value="image">With images</option><option value="text">Text only</option></select></label>
    <p role="status">{count < 3 ? "Ads hidden: fewer than three items." : "One ad follows the third organic item in each list."}</p>
    <div className="ad-preview-grid">{surfaces.map(surface => {
      const gallery = ["events", "polls", "articles"].includes(surface.kind);
      const comments = surface.kind === "comments";
      const itemClass = comments ? "community-comment" : gallery ? "student-discovery-card" : surface.placement === "multiplex" ? "community-card" : "community-post";
      return <section className="card ad-layout-example" key={surface.title}><h3>{surface.title}</h3><div className={comments ? "community-comments" : gallery ? "student-discovery-grid" : "community-post-list"}>
        {Array.from({length:count}, (_, index) => <Fragment key={index}>
          <article className={itemClass}>
            {comments ? <span className="community-avatar" aria-hidden="true">DS</span> : null}
            {gallery && media === "image" ? <img className="student-event-cover" src="/ads/list-sample.svg" alt="Sample organic list media" /> : null}
            <div className={gallery ? "student-discovery-card-body" : comments ? undefined : "ad-example-copy"}><strong>{surface.samples[index % 3]}</strong><p>Fictional organic item {index + 1}. This item is not an ad.</p></div>
          </article>
          {index === 2 ? <SponsoredPlacement key={`${surface.title}:${count}:${media}`} placement={surface.placement} listKind={surface.kind} itemCount={count} preview previewMedia={media} /> : null}
        </Fragment>)}{!count ? <p>No items.</p> : null}
      </div></section>;
    })}</div>
  </section>;
}
