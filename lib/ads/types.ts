export type AdPlacement = "in_feed" | "in_comments" | "in_article" | "multiplex";

export type NativeAd = {
  provider?: "direct" | "mgid";
  deliveryId: string;
  eventToken: string;
  placement: AdPlacement;
  advertiserName: string;
  headline: string;
  body: string;
  imageUrl: string | null;
  imageAlt: string | null;
  destinationUrl: string;
  ctaLabel: string;
};

export type AdDeliveryResult = {
  ad: NativeAd | null;
  reason?: "disabled" | "no_fill" | "invalid_context";
  externalFallback?: "disabled";
};
