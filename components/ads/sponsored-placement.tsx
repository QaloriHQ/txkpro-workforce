"use client";
/* Approved sponsored media is remote HTTPS content and intentionally bypasses image optimization. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FlagIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { AdDeliveryResult, AdPlacement, NativeAd } from "@/lib/ads/types";

const previewAd: NativeAd = {
  deliveryId: "00000000-0000-4000-8000-000000000000",
  eventToken: "00000000-0000-4000-8000-000000000001",
  placement: "in_feed",
  advertiserName: "Example workforce partner",
  headline: "Reach skilled local talent",
  body: "This preview shows how approved native sponsorship appears without resembling member content.",
  imageUrl: null,
  imageAlt: null,
  destinationUrl: "https://example.com",
  ctaLabel: "Learn more",
};

async function sendEvent(ad: NativeAd, eventType: "viewable" | "clicked") {
  await fetch(`/api/ads/delivery/${ad.deliveryId}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventToken: ad.eventToken, eventType }), keepalive: true }).catch(() => undefined);
}

export function SponsoredPlacement({ placement, contentId, preview = false }: { placement: AdPlacement; contentId?: string; preview?: boolean }) {
  const [ad, setAd] = useState<NativeAd | null>(preview ? { ...previewAd, placement } : null);
  const [hidden, setHidden] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const card = useRef<HTMLElement>(null);
  const viewable = useRef(false);

  useEffect(() => {
    if (preview) return;
    const requestKey = crypto.randomUUID();
    const params = new URLSearchParams({ placement, requestKey });
    if (contentId) params.set("contentId", contentId);
    const controller = new AbortController();
    void fetch(`/api/ads/delivery?${params}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<AdDeliveryResult> : { ad: null })
      .then(result => setAd(result.ad))
      .catch(() => undefined);
    return () => controller.abort();
  }, [contentId, placement, preview]);

  useEffect(() => {
    if (!ad || preview || !card.current) return;
    let timer: number | undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && entries[0].intersectionRatio >= 0.5 && !viewable.current) {
        timer = window.setTimeout(() => { viewable.current = true; void sendEvent(ad, "viewable"); }, 1000);
      } else if (timer) { window.clearTimeout(timer); timer = undefined; }
    }, { threshold: [0.5] });
    observer.observe(card.current);
    return () => { if (timer) window.clearTimeout(timer); observer.disconnect(); };
  }, [ad, preview]);

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ad || preview) return; const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/ads/delivery/${ad.deliveryId}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventToken: ad.eventToken, reason: data.get("reason"), details: data.get("details") }) });
    if (response.ok) { setFeedback("Report received."); setReporting(false); setHidden(true); }
    else setFeedback("The report could not be submitted.");
  }

  if (!ad || hidden) return null;
  return <aside ref={card} className={`sponsored-placement sponsored-${placement}`} aria-label={`Sponsored content from ${ad.advertiserName}`}>
    <div className="sponsored-label"><strong>Sponsored</strong>{preview ? <span>Preview only</span> : null}<span>{ad.advertiserName}</span></div>
    {ad.imageUrl ? <img src={ad.imageUrl} alt={ad.imageAlt || ""} /> : null}
    <div className="sponsored-copy"><h2>{ad.headline}</h2><p>{ad.body}</p><a href={ad.destinationUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={() => { if (!preview) void sendEvent(ad, "clicked"); }}>{ad.ctaLabel}</a></div>
    <div className="sponsored-controls"><button type="button" onClick={() => setHidden(true)}><XMarkIcon aria-hidden="true" /> Hide</button><button type="button" onClick={() => setReporting(true)} disabled={preview}><FlagIcon aria-hidden="true" /> Report</button></div>
    {reporting ? <form className="sponsored-report" onSubmit={report}><label>Reason<select name="reason" defaultValue="spam"><option value="spam">Spam</option><option value="scam">Scam or fraud</option><option value="misinformation">Misinformation</option><option value="unsafe">Unsafe content</option><option value="other">Other</option></select></label><label>Details<textarea name="details" maxLength={2000} rows={2} /></label><div><button type="submit">Submit report</button><button type="button" onClick={() => setReporting(false)}>Cancel</button></div></form> : null}
    {feedback ? <p role="status">{feedback}</p> : null}
  </aside>;
}
