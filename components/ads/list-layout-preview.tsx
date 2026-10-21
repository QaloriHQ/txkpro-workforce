"use client";
import { Fragment, useState } from "react";
import { SponsoredPlacement } from "@/components/ads/sponsored-placement";
const surfaces = [
  { title: "Posts", placement: "in_feed", samples: ["Sample: First week on a worksite", "Sample: Local trade career discussion", "Sample: Community project update"] },
  { title: "Events", placement: "in_feed", samples: ["Sample: Skilled trades open house", "Sample: Resume practice workshop", "Sample: Community networking session"] },
  { title: "Polls", placement: "in_feed", samples: ["Sample: Which workshop topic interests you?", "Sample: Preferred event format?", "Sample: Which trade would you explore?"] },
  { title: "Articles", placement: "in_article", samples: ["Sample: Preparing for your first job", "Sample: Building a project portfolio", "Sample: Learning with a mentor"] },
  { title: "Comments", placement: "in_comments", samples: ["Sample comment: Thanks for sharing this idea.", "Sample comment: A useful topic for a workshop.", "Sample comment: Looking forward to the discussion."] },
  { title: "Feed sidebar", placement: "multiplex", samples: ["Sample: Feed post one", "Sample: Feed post two", "Sample: Feed post three"] },
] as const;
export function ListLayoutPreview() {
  const [count, setCount] = useState(3);
  return <section><h2>List threshold preview</h2><p>Sample content and sample ads only. No provider requests, impressions, clicks, budget charges or engagement points.</p>
    <label>Visible organic items<select value={count} onChange={event => setCount(Number(event.target.value))}>{[0,1,2,3,6].map(n => <option key={n} value={n}>{n} items</option>)}</select></label>
    <p role="status">{count < 3 ? "Ads hidden: fewer than three items." : "One ad follows the third organic item in each list."}</p>
    <div className="ad-preview-grid">{surfaces.map(surface => <section className="card" key={surface.title}><h3>{surface.title}</h3>{Array.from({length:count}, (_, index) => <Fragment key={index}><article className="community-card"><strong>{surface.samples[index % 3]}</strong><p>Staging layout sample {index + 1}.</p></article>{index === 2 ? <SponsoredPlacement key={`${surface.title}:${count}`} placement={surface.placement} itemCount={count} preview /> : null}</Fragment>)}{!count ? <p>No items.</p> : null}</section>)}</div>
  </section>;
}
