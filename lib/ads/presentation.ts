import type { AdPlacement } from "@/lib/ads/types";
import type { AdListKind } from "@/lib/ads/list-policy";
export type NativeAdLayout = "feed" | "events" | "polls" | "articles" | "comments" | "sidebar";
export function nativeAdLayout(placement: AdPlacement, kind: AdListKind = "posts"): NativeAdLayout {
  if (placement === "in_comments" || kind === "comments") return "comments";
  if (placement === "multiplex") return "sidebar";
  if (placement === "in_article" || kind === "articles") return "articles";
  if (kind === "events" || kind === "polls") return kind;
  return "feed";
}
export function nativeAdClasses(layout: NativeAdLayout) {
  if (layout === "comments") return "community-comment sponsored-comment";
  if (layout === "feed") return "community-post sponsored-feed";
  if (layout === "sidebar") return "community-card sponsored-sidebar";
  return `student-discovery-card sponsored-gallery sponsored-${layout}`;
}
