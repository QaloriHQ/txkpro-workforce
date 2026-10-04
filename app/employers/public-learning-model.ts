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

export function publicLearningMetadata(page: PublicLearningPage, siteUrl: string) {
  if (!page.found || page.redirectPath || !page.canonicalPath) return { title: "Page unavailable", robots: { index: false, follow: false } };
  const url = `${siteUrl}${page.canonicalPath}`;
  const title = page.seoTitle || page.title || "Employer Learning";
  const description = page.metaDescription || page.description || page.learningObjective || undefined;
  return {
    title, description, alternates: { canonical: url },
    robots: { index: Boolean(page.robotsIndex), follow: page.robotsFollow !== false },
    openGraph: { type: "website" as const, title, description, url, siteName: "TXKPRO Workforce" },
    twitter: { card: "summary" as const, title, description },
  };
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
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
