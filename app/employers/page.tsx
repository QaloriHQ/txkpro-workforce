import type { Metadata } from "next";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
  ClockIcon,
  DocumentCheckIcon,
  FunnelIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

export const metadata: Metadata = {
  title: "Hire Local Skilled-Trades Talent with Verified Skills",
  description:
    "TXKPRO Workforce helps vetted employers discover local skilled-trades candidates using instructor-verified skills, explicit readiness filters, Employer Training, interviews, and retention tracking.",
  alternates: { canonical: "/employers" },
  openGraph: {
    type: "website",
    url: "/employers",
    title: "TXKPRO Workforce for Employers",
    description:
      "Find local skilled-trades candidates with explainable readiness evidence and instructor-verified competencies.",
    images: ["/og/txkpro-workforce.jpg"],
  },
};

const faq = [
  {
    question: "What can employers see in TXKPRO Workforce?",
    answer:
      "Approved employers can review candidates within their authorized scope using verified skills, explicit readiness fields, work and shift preferences, instructor referrals, Employer Training evidence, interview activity, and placement status.",
  },
  {
    question: "Does TXKPRO automatically rank or reject candidates?",
    answer:
      "No. Employers use explicit filters and visible evidence. TXKPRO does not use a hidden employability score or make the final hiring decision.",
  },
  {
    question: "What is Employer Training?",
    answer:
      "Employer Training is company-specific readiness content that can include Micro-Certifications, assessments, Company Badges, and formal Employer Certifications. It remains distinct from Instructor Verified Skills.",
  },
  {
    question: "Can employers track hires after placement?",
    answer:
      "Yes. Employer and authorized workforce users can monitor placement status and configured retention milestones, supporting human follow-up during the first 90 days.",
  },
];

export default function EmployersPage() {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Employers", item: `${siteUrl}/employers` },
    ],
  };
  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "TXKPRO Workforce for Employers",
    serviceType: "Skilled trades talent discovery and workforce pipeline platform",
    provider: { "@type": "Organization", name: "TXKPRO Workforce", url: siteUrl },
    areaServed: { "@type": "AdministrativeArea", name: "Greater Texarkana" },
    audience: {
      "@type": "BusinessAudience",
      audienceType: "Skilled-trade employers and contractors",
    },
    description:
      "A local workforce platform for discovering candidates through instructor-verified skills, explicit readiness evidence, employer training, interviews, placements, and early retention.",
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={service} />
      <JsonLd data={faqSchema} />
      <MarketingHeader />

      <main className="marketing-main">
        <nav className="marketing-breadcrumb marketing-shell" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span>/</span><span>Employers</span>
        </nav>

        <section className="marketing-hero marketing-shell marketing-hero-single">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">TXKPRO Workforce for Employers</p>
            <h1>Find local skilled-trades talent with evidence you can understand.</h1>
            <p className="marketing-lede">
              Discover candidates through instructor-verified skills,
              transparent readiness fields, employer-specific training,
              referrals, interviews, placements, and early retention
              visibility—without handing hiring decisions to an opaque score.
            </p>
            <div className="marketing-actions">
              <Link className="button button-brand" href="/signup">
                Create employer account <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link className="button button-ghost" href="/institutions">
                See institution workflows
              </Link>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">Employer workflow</p>
            <h2>From local talent discovery to early retention.</h2>
          </div>
          <div className="marketing-feature-grid">
            <article><FunnelIcon aria-hidden="true" /><h3>Explicit talent filters</h3><p>Filter authorized candidates by program, verified skills, graduation timing, shift needs, work preferences, and other visible job-relevant criteria.</p></article>
            <article><CheckBadgeIcon aria-hidden="true" /><h3>Instructor verification</h3><p>See which technical competencies were verified by an authorized instructor instead of treating every claim as equivalent.</p></article>
            <article><UserPlusIcon aria-hidden="true" /><h3>Referrals and interviews</h3><p>Receive instructor referrals, review candidate evidence, request interviews, and track responses through a shared workflow.</p></article>
            <article><ClockIcon aria-hidden="true" /><h3>Placement and retention</h3><p>Record hires and keep visibility into the first 30/60/90 days so early issues can become a human follow-up instead of silent turnover.</p></article>
          </div>
        </section>

        <section className="marketing-section marketing-section-alt">
          <div className="marketing-shell">
            <div className="marketing-section-heading">
              <p className="marketing-kicker">Company-specific readiness</p>
              <h2>Teach your methods without redefining technical skill.</h2>
              <p>
                Employer Training lets your company prepare students for
                company-specific expectations while Instructor Verified Skills
                remain the authoritative technical competency evidence.
              </p>
            </div>
            <div className="marketing-audience-grid">
              <article className="marketing-audience-card">
                <DocumentCheckIcon aria-hidden="true" />
                <h3>Employer Micro-Certifications</h3>
                <p>Create structured readiness content with lessons, checkpoints, assessments, passing requirements, and versioned evidence.</p>
              </article>
              <article className="marketing-audience-card">
                <BriefcaseIcon aria-hidden="true" />
                <h3>Company Badges + Certifications</h3>
                <p>Award company-specific readiness signals and formal Employer Certifications tied to canonical passed completion evidence.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-split">
            <div>
              <p className="marketing-kicker">Local by design</p>
              <h2>Build a pipeline before students reach the open market.</h2>
              <p>
                TXKPRO is optimized for dense regional participation rather than
                national job-board scale. Approved employers connect directly
                to nearby technical programs and student pipelines.
              </p>
            </div>
            <div className="marketing-proof-list">
              <div><BuildingOffice2Icon aria-hidden="true" /><span><strong>Vetted access</strong> before private candidate browsing.</span></div>
              <div><CheckBadgeIcon aria-hidden="true" /><span><strong>Explainable evidence</strong> instead of a hidden fit score.</span></div>
              <div><UserPlusIcon aria-hidden="true" /><span><strong>Instructor referrals</strong> with visible provenance.</span></div>
              <div><ClockIcon aria-hidden="true" /><span><strong>Early retention visibility</strong> after the hire.</span></div>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">FAQ</p>
            <h2>Questions from employers</h2>
          </div>
          <div className="marketing-faq">
            {faq.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
          </div>
        </section>

        <section className="marketing-cta marketing-shell">
          <div>
            <p className="marketing-kicker">Build your local pipeline</p>
            <h2>Start with the roles, skills, and programs you actually hire for.</h2>
            <p>Use transparent readiness evidence and human hiring decisions to connect with local technical talent.</p>
          </div>
          <div className="marketing-actions">
            <Link className="button button-brand" href="/signup">Create employer account</Link>
            <Link className="button button-ghost" href="/credentials">Verify a credential</Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
