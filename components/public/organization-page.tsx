import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { Card, PageHeader, StatusBadge } from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";
import { publicOrganization } from "@/lib/public/organization-profile";
import {
  absolutePublicUrl,
  publicPageMetadata,
  serializeJsonLd,
} from "@/lib/public/seo";

export async function organizationMetadata(path: string): Promise<Metadata> {
  const profile = await publicOrganization(path);
  if (!profile.found || profile.redirectPath || !profile.canonicalPath) {
    return { title: "Organization unavailable", robots: { index: false, follow: false } };
  }
  return publicPageMetadata({
    title: profile.seoTitle || `${profile.displayName} | TXKPRO`,
    description: profile.metaDescription || profile.summary,
    path: profile.canonicalPath,
    index: profile.robotsIndex,
    follow: profile.robotsFollow,
    image: profile.shareImageUrl || profile.logoUrl,
  });
}

export async function OrganizationPublicPage({ path }: { path: string }) {
  const profile = await publicOrganization(path);
  if (!profile.found) notFound();
  if (profile.redirectPath) permanentRedirect(profile.redirectPath);
  if (!profile.canonicalPath || !profile.kind) notFound();
  const label = profile.kind === "institution" ? "Institution" : "Employer";
  const location = [profile.city, profile.state].filter(Boolean).join(", ");
  const schema = {
    "@context": "https://schema.org",
    "@type": profile.kind === "institution" ? "EducationalOrganization" : "Organization",
    name: profile.displayName,
    description: profile.summary || undefined,
    url: absolutePublicUrl(profile.canonicalPath),
    logo: profile.logoUrl || undefined,
    areaServed: profile.serviceArea || location || undefined,
    address: location
      ? { "@type": "PostalAddress", addressLocality: profile.city || undefined, addressRegion: profile.state || undefined }
      : undefined,
    sameAs: profile.website ? [profile.website] : undefined,
  };

  return <>
    <header className="topbar">
      <Brand />
      <div className="header-actions"><ThemeToggle /><Link href="/login">Sign in</Link></div>
    </header>
    <main className="page-wrap txk-prototype-content txk-organization-public">
      <nav className="txk-public-learning-breadcrumb" aria-label="Breadcrumb">
        <Link href={profile.kind === "institution" ? "/institutions" : "/employers"}>{label}s</Link>
        <span aria-current="page">{profile.displayName}</span>
      </nav>
      <section className="txk-organization-hero">
        {profile.logoUrl ? <Image src={profile.logoUrl} alt={`${profile.displayName} logo`} width={112} height={112} unoptimized /> : <BuildingOffice2Icon aria-hidden="true" />}
        <PageHeader eyebrow={`Public ${label} profile`} title={profile.displayName || label} description={profile.summary} />
      </section>
      {location || profile.serviceArea ? <Card className="txk-organization-facts">
        <MapPinIcon aria-hidden="true" />
        <div><h2>Location and service area</h2>{location ? <p>{location}</p> : null}{profile.serviceArea ? <p>{profile.serviceArea}</p> : null}</div>
      </Card> : null}
      {profile.focusItems?.length ? <Card><h2>{profile.kind === "institution" ? "Programs" : "Hiring focus"}</h2><div className="txk-chip-list">{profile.focusItems.map(item => <StatusBadge key={item} tone="info">{item}</StatusBadge>)}</div></Card> : null}
      {profile.courses?.length ? <Card><h2>Published courses</h2><ul className="txk-public-learning-list">{profile.courses.map(course => <li key={course.path}><Link href={course.path}>{course.title}</Link>{course.description ? <p>{course.description}</p> : null}</li>)}</ul></Card> : null}
      {profile.credentials?.length ? <Card><h2>Employer Certifications</h2><ul className="txk-public-learning-list">{profile.credentials.map(credential => <li key={credential.path}><Link href={credential.path}>{credential.title}</Link></li>)}</ul></Card> : null}
      <div className="txk-organization-actions">
        {profile.website ? <a className="txk-button txk-button-default txk-button-md" href={profile.website} rel="noopener noreferrer"><ArrowTopRightOnSquareIcon aria-hidden="true" />Website</a> : null}
        {profile.contactAction?.href && profile.contactAction.label ? <a className="txk-button txk-button-primary txk-button-md" href={profile.contactAction.href}>{profile.contactAction.label}</a> : null}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
    </main>
  </>;
}
