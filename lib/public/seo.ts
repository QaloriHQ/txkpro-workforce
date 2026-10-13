import type { Metadata } from "next";

export const publicSiteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://staging-workforce.txkpro.com"
).replace(/\/+$/, "");

export function absolutePublicUrl(path: string) {
  return new URL(path, `${publicSiteUrl}/`).toString();
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function publicPageMetadata(input: {
  title: string;
  description?: string | null;
  path: string;
  baseUrl?: string;
  index?: boolean;
  follow?: boolean;
  image?: string | null;
  type?: "website" | "profile";
}): Metadata {
  const canonical = input.baseUrl
    ? new URL(input.path, `${input.baseUrl.replace(/\/+$/, "")}/`).toString()
    : absolutePublicUrl(input.path);
  const image = input.image
    ? input.baseUrl
      ? new URL(input.image, `${input.baseUrl.replace(/\/+$/, "")}/`).toString()
      : absolutePublicUrl(input.image)
    : undefined;
  return {
    title: input.title,
    description: input.description || undefined,
    alternates: { canonical },
    robots: { index: Boolean(input.index), follow: input.follow !== false },
    openGraph: {
      type: input.type ?? "website",
      title: input.title,
      description: input.description || undefined,
      url: canonical,
      siteName: "TXKPRO Workforce",
      images: image ? [{ url: image, alt: input.title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description || undefined,
      images: image ? [image] : undefined,
    },
  };
}
