import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/institutions",
          "/employers",
          "/students",
          "/platform",
          "/credentials",
        ],
        disallow: [
          "/api/",
          "/auth/",
          "/dashboard",
          "/student/",
          "/institution/",
          "/employer/",
          "/onboarding",
          "/professional/",
          "/demo/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
