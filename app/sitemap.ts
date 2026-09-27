import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/institutions`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/employers`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/students`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/platform`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/credentials`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];
}
