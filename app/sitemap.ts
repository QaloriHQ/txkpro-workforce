import { studentPublicSitemap } from "@/lib/student-public-profile/repository";
import type { MetadataRoute } from "next";
import { getPublicLearningSitemap } from "@/lib/public/employer-learning";
export const dynamic = "force-dynamic";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [learning, students] = await Promise.all([getPublicLearningSitemap(), studentPublicSitemap()]);

  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/institutions`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/institutions/pilot`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${siteUrl}/institutions/pilot/timeline`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/employers`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/students`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/platform`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/credentials`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ...[...learning, ...students].map(page => ({ url: `${siteUrl}${page.path}`, lastModified: page.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
