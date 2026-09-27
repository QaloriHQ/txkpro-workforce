import type { Metadata } from "next";
import {
  ArrowRightIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

export const metadata: Metadata = {
  title: "TXKPRO Workforce Platform | Verified Skills to Retention",
  description:
    "Explore the TXKPRO Workforce platform: verified skills, Employer Training, referrals, interviews, placements, and early retention workflows for Greater Texarkana.",
  alternates: { canonical: "/platform" },
};

export default function PlatformPage() {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Platform", item: `${siteUrl}/platform` },
    ],
  };
  const software = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "TXKPRO Workforce",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "A Greater Texarkana workforce platform connecting technical programs, verified skills, vetted employers, placements, and early retention workflows.",
    audience: {
      "@type": "Audience",
      audienceType: "Technical institutions, skilled-trade employers, educators, and students",
    },
  };

  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={software} />
      <MarketingHeader />
      <main className="marketing-main">
        <nav className="marketing-breadcrumb marketing-shell" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span>/</span><span>Platform</span>
        </nav>
        <section className="marketing-hero marketing-shell marketing-hero-single">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">TXKPRO Workforce platform</p>
            <h1>A trusted local workflow from verified skill to retained placement.</h1>
            <p className="marketing-lede">
              TXKPRO connects the evidence and actions institutions, students,
              instructors, and employers need to move from classroom capability
              to local employment without becoming a generic ATS, LMS, or
              national job board.
            </p>
            <div className="marketing-actions">
              <Link className="button button-brand" href="/institutions">For institutions <ArrowRightIcon aria-hidden="true" /></Link>
              <Link className="button button-ghost" href="/employers">For employers</Link>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading"><p className="marketing-kicker">Core platform</p><h2>Evidence stays explainable at every stage.</h2></div>
          <div className="marketing-feature-grid">
            <article><CheckBadgeIcon aria-hidden="true" /><h3>Verified Skills</h3><p>Authorized instructor verification remains separate from student self-attestation and all employer-specific evidence.</p></article>
            <article><ClipboardDocumentCheckIcon aria-hidden="true" /><h3>Employer Learning</h3><p>Versioned courses, assessments, Company Badges, and formal Employer Certifications support company-specific readiness.</p></article>
            <article><UserGroupIcon aria-hidden="true" /><h3>Referrals + interviews</h3><p>Institution and employer workflows connect students to opportunities through auditable, role-scoped actions.</p></article>
            <article><ClockIcon aria-hidden="true" /><h3>Placement + retention</h3><p>Carry the workflow through hire and the first 30/60/90 days instead of stopping at the introduction.</p></article>
          </div>
        </section>

        <section className="marketing-section marketing-section-alt">
          <div className="marketing-shell marketing-split">
            <div><p className="marketing-kicker">Trust model</p><h2>Human decisions, explicit evidence, scoped access.</h2><p>TXKPRO can organize candidates using visible job-relevant criteria, but it does not automate final hiring decisions or hide eligibility behind an opaque employability score.</p></div>
            <div className="marketing-proof-list">
              <div><ShieldCheckIcon aria-hidden="true" /><span><strong>Server-controlled authorization</strong> for role and organization scope.</span></div>
              <div><CheckBadgeIcon aria-hidden="true" /><span><strong>Provenance-preserving evidence</strong> for verified skills and Employer Training.</span></div>
              <div><UserGroupIcon aria-hidden="true" /><span><strong>Vetted employer participation</strong> before private talent access.</span></div>
              <div><ClockIcon aria-hidden="true" /><span><strong>Auditable placement activity</strong> through early retention.</span></div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
