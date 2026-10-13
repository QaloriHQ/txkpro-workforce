import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { publicProfessional } from "@/lib/professional-profile/repository";
import { ProfessionalProfileView } from "./profile-view";
import { Brand } from "@/components/brand";
import Link from "next/link";
import { ReviewComposer } from "@/components/professional/review-composer";
import { absolutePublicUrl, publicPageMetadata, serializeJsonLd } from "@/lib/public/seo";
export async function professionalMetadata(path: string): Promise<Metadata> {
  const p = await publicProfessional(path); if (!p.found || !("displayName" in p)) return { title: "Profile unavailable", robots: { index: false, follow: false } };
  return publicPageMetadata({ title: `${p.displayName} | TXKPRO`, description: p.headline || "TXKPRO professional profile", path: p.path || path, index: p.robotsIndex, follow: p.robotsFollow, type: "profile" });
}
export async function ProfessionalPublicPage({ path }: { path: string }) {
  const p = await publicProfessional(path); if (!p.found || !("displayName" in p)) notFound(); if (p.redirect && p.path) permanentRedirect(p.path);
  const schema = { "@context": "https://schema.org", "@type": "ProfilePage", url: absolutePublicUrl(p.path || path), mainEntity: { "@type": "Person", name: p.displayName, description: p.headline, affiliation: p.affiliations.map(a => ({ "@type": "Organization", name: a.name })) } };
  return <><header className="topbar"><Brand /></header><main className="page-wrap professional-workspace"><nav className="txk-public-learning-breadcrumb" aria-label="Breadcrumb"><Link href={p.kind === "staff" ? "/staff" : "/educators"}>{p.kind === "staff" ? "Staff" : "Educators"}</Link><span aria-current="page">{p.displayName}</span></nav><ProfessionalProfileView profile={p} />{p.kind === "educator" && p.path ? <ReviewComposer targetPath={p.path} /> : null}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} /></main></>;
}
