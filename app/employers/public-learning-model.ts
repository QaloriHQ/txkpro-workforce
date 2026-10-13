export type PublicLearningLink = { title: string; canonicalPath: string; description?: string | null; durationMinutes?: number | null };
export type PublicLearningPage = {
  found: boolean; redirectPath?: string; kind?: "course" | "lesson" | "employer";
  canonicalPath?: string; title?: string; description?: string | null;
  learningObjective?: string | null; durationMinutes?: number | null; versionNumber?: number;
  robotsIndex?: boolean; robotsFollow?: boolean; seoTitle?: string | null; metaDescription?: string | null;
  employer?: { name: string; canonicalPath: string }; course?: PublicLearningLink;
  lessons?: PublicLearningLink[]; courses?: PublicLearningLink[];
  blocks?: Array<{ type: string; title: string | null; text: string | null }>;
};

import { publicPageMetadata, serializeJsonLd } from "@/lib/public/seo";

export function publicLearningMetadata(page: PublicLearningPage, siteUrl?: string) {
  if (!page.found || page.redirectPath || !page.canonicalPath) return { title: "Page unavailable", robots: { index: false, follow: false } };
  const title = page.seoTitle || page.title || "Employer Learning";
  const description = page.metaDescription || page.description || page.learningObjective || undefined;
  return publicPageMetadata({ title, description, path: page.canonicalPath, baseUrl: siteUrl, index: page.robotsIndex, follow: page.robotsFollow });
}

export function publicLearningStructuredData(page: PublicLearningPage, siteUrl: string) {
  if (!page.found || page.redirectPath || !page.canonicalPath) return null;
  return {
    "@context": "https://schema.org", "@type": page.kind === "course" ? "Course" : page.kind === "lesson" ? "LearningResource" : "Organization",
    name: page.title, description: page.description || page.learningObjective || undefined,
    url: `${siteUrl}${page.canonicalPath}`,
    provider: page.employer ? { "@type": "Organization", name: page.employer.name, url: `${siteUrl}${page.employer.canonicalPath}` } : undefined,
    isPartOf: page.kind === "lesson" && page.course ? { "@type": "Course", name: page.course.title, url: `${siteUrl}${page.course.canonicalPath}` } : undefined,
  };
}

export function serializePublicJsonLd(value: unknown) {
  return serializeJsonLd(value);
}
