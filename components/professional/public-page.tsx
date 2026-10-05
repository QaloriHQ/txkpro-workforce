import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { publicProfessional } from "@/lib/professional-profile/repository";
import { ProfessionalProfileView } from "./profile-view";
import { Brand } from "@/components/brand";
export async function professionalMetadata(path: string): Promise<Metadata> {
  const p = await publicProfessional(path); if (!p.found || !("displayName" in p)) return { title: "Profile unavailable", robots: { index: false, follow: false } };
  return { title: `${p.displayName} | TXKPRO`, description: p.headline || "TXKPRO professional profile", alternates: { canonical: p.path || path }, robots: { index: p.robotsIndex ?? false, follow: p.robotsFollow ?? false }, openGraph: { title: `${p.displayName} | TXKPRO`, description: p.headline || "TXKPRO professional profile", url: p.path || path, type: "profile" } };
}
export async function ProfessionalPublicPage({ path }: { path: string }) {
  const p = await publicProfessional(path); if (!p.found || !("displayName" in p)) notFound(); if (p.redirect && p.path) permanentRedirect(p.path);
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://staging-workforce.txkpro.com";
  const schema = { "@context": "https://schema.org", "@type": "ProfilePage", url: `${site}${p.path}`, mainEntity: { "@type": "Person", name: p.displayName, description: p.headline, affiliation: p.affiliations.map(a => ({ "@type": "Organization", name: a.name })) } };
  return <><header className="topbar"><Brand /></header><main className="page-wrap professional-workspace"><ProfessionalProfileView profile={p} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} /></main></>;
}
