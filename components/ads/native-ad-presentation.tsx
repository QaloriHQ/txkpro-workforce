/* Provider media is validated upstream and intentionally bypasses image optimization. */
/* eslint-disable @next/next/no-img-element */
import { MegaphoneIcon } from "@heroicons/react/24/outline";
import type { MouseEvent, ReactNode } from "react";
import type { NativeAd } from "@/lib/ads/types";
import type { NativeAdLayout } from "@/lib/ads/presentation";

export function NativeAdPresentation({ ad, layout, preview, onClick, children }: {
  ad: NativeAd; layout: NativeAdLayout; preview: boolean;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void; children?: ReactNode;
}) {
  const comment = layout === "comments";
  const gallery = ["events", "polls", "articles"].includes(layout);
  const identity = <div className="sponsored-identity"><strong>{ad.advertiserName}</strong><span className="sponsored-badge">Sponsored</span>{preview ? <span className="sponsored-preview-label">Preview only</span> : null}</div>;
  const media = ad.imageUrl ? <img className={`sponsored-media sponsored-media-${layout}${gallery ? " student-event-cover" : ""}`} src={ad.imageUrl} alt={ad.imageAlt || ""} loading="lazy" onError={event => { event.currentTarget.hidden = true; }} /> : null;
  const copy = <div className="sponsored-copy">{comment ? <h3>{ad.headline}</h3> : <h2>{ad.headline}</h2>}{ad.body ? <p>{ad.body}</p> : null}</div>;
  const link = <a className={gallery ? "student-discovery-card-link sponsored-cta" : "sponsored-cta"} href={ad.destinationUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={onClick}>{ad.ctaLabel}</a>;
  if (comment) return <><span className="community-avatar sponsored-avatar" aria-hidden="true"><MegaphoneIcon /></span><div className="sponsored-comment-body">{identity}<div className={`sponsored-comment-copy${ad.imageUrl ? " sponsored-has-image" : ""}`}>{media}{copy}</div>{link}{children}</div></>;
  if (gallery) return <>{media}<div className="student-discovery-card-body">{identity}{copy}{link}{children}</div></>;
  if (layout === "feed") return <><header className="sponsored-header"><span className="community-avatar sponsored-avatar" aria-hidden="true"><MegaphoneIcon /></span>{identity}</header><div className="sponsored-content sponsored-main-copy">{copy}</div>{media}<div className="sponsored-content sponsored-footer">{link}{children}</div></>;
  return <><header className="sponsored-header"><span className="community-avatar sponsored-avatar" aria-hidden="true"><MegaphoneIcon /></span>{identity}</header>{media}<div className="sponsored-content">{copy}{link}{children}</div></>;
}
