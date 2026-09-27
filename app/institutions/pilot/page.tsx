import type { Metadata } from "next";
import {
  AcademicCapIcon,
  ArrowRightIcon,
  BuildingOffice2Icon,
  ChartBarSquareIcon,
  CheckBadgeIcon,
  ClockIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { PilotFunnelNav } from "@/components/pilot-funnel-nav";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

export const metadata: Metadata = {
  title: "12-Week Skilled Trades Workforce Pilot for Technical Colleges",
  description:
    "Launch a structured 12-week TXKPRO Workforce pilot with one technical program, one cohort, 5–10 committed employers, verified skills, referrals, interviews, placements, and retention tracking.",
  alternates: { canonical: "/institutions/pilot" },
  openGraph: {
    type: "website",
    url: "/institutions/pilot",
    title: "TXKPRO Workforce 12-Week Institution Pilot",
    description:
      "A focused pilot for technical colleges and workforce programs to validate verified skills, employer engagement, placement, and early retention workflows.",
    images: ["/og/txkpro-workforce.jpg"],
  },
};

const faq = [
  {
    question: "How long is the TXKPRO Workforce institution pilot?",
    answer:
      "The current production pilot baseline is 12 weeks. The pilot is organized around one initial cohort and trade or program, with setup, activation, verified-skills and employer workflows, placement tracking, and a final retrospective.",
  },
  {
    question: "How many employers participate in the pilot?",
    answer:
      "The production pilot plan calls for confirming approximately 5–10 committed employers, including their hiring parameters, contacts, and participation expectations.",
  },
  {
    question: "What does the institution need to provide?",
    answer:
      "The institution identifies the pilot program and cohort, confirms curriculum or syllabus alignment for the Verified Skills Matrix, designates institution and instructor owners, provides the pilot roster, and participates in placement and outcome review.",
  },
  {
    question: "What does TXKPRO measure during the pilot?",
    answer:
      "The pilot tracks activation, verified skill activity, referrals, employer candidate review, interview activity, hires and placements, reporting, and Day 30/60/90 retention schedules without using a hidden employability score.",
  },
];

export default function InstitutionPilotPage() {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      {
        "@type": "ListItem",
        position: 2,
        name: "Institutions",
        item: `${siteUrl}/institutions`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "12-Week Pilot",
        item: `${siteUrl}/institutions/pilot`,
      },
    ],
  };

  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "TXKPRO Workforce 12-Week Institution Pilot",
    serviceType: "Skilled trades workforce pilot",
    provider: {
      "@type": "Organization",
      name: "TXKPRO Workforce",
      url: siteUrl,
    },
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Greater Texarkana",
    },
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "administrator",
      audienceType:
        "Technical colleges, community colleges, career and technical education programs, and workforce programs",
    },
    description:
      "A focused 12-week workforce pilot connecting one institution cohort with verified technical skills, vetted employers, referrals, interviews, placements, reporting, and early retention workflows.",
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
          <Link href="/">Home</Link><span>/</span>
          <Link href="/institutions">Institutions</Link><span>/</span>
          <span>Pilot</span>
        </nav>

        <div className="marketing-shell">
          <PilotFunnelNav current="pilot" />
        </div>

        <section className="marketing-hero marketing-shell marketing-hero-single pilot-hero">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">For technical colleges & workforce programs</p>
            <h1>Prove the workforce loop with one focused 12-week pilot.</h1>
            <p className="marketing-lede">
              Start with one cohort, one trade or technical program, and a
              defined group of committed employers. TXKPRO helps your team
              connect curriculum-aligned verified skills to referrals,
              interviews, placements, and early retention evidence.
            </p>
            <div className="marketing-actions">
              <Link className="button button-brand" href="/institutions/pilot/timeline">
                View the implementation timeline
                <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link className="button button-ghost" href="/institutions/request-pilot">
                Request a pilot
              </Link>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell pilot-summary-grid">
          <article className="pilot-summary-card">
            <span>12</span>
            <h2>Weeks</h2>
            <p>Current production pilot baseline from setup through retrospective.</p>
          </article>
          <article className="pilot-summary-card">
            <span>1</span>
            <h2>Initial cohort</h2>
            <p>Keep scope narrow enough to measure real workflow quality.</p>
          </article>
          <article className="pilot-summary-card">
            <span>5–10</span>
            <h2>Committed employers</h2>
            <p>Define hiring needs and participation expectations up front.</p>
          </article>
          <article className="pilot-summary-card">
            <span>30/60/90</span>
            <h2>Retention milestones</h2>
            <p>Carry placement visibility beyond the date of hire.</p>
          </article>
        </section>

        <section className="marketing-section marketing-section-alt">
          <div className="marketing-shell">
            <div className="marketing-section-heading">
              <p className="marketing-kicker">What the pilot is designed to prove</p>
              <h2>Can the institution-to-employer workflow operate with trusted evidence?</h2>
              <p>
                The pilot is not a broad software rollout. It is a controlled
                implementation designed to test whether the core placement
                loop works for one real cohort and the employers that hire from it.
              </p>
            </div>
            <div className="marketing-feature-grid">
              <article><AcademicCapIcon aria-hidden="true" /><h3>Curricular alignment</h3><p>Map the Verified Skills Matrix to the selected program or syllabus and identify the instructors authorized to verify competency.</p></article>
              <article><CheckBadgeIcon aria-hidden="true" /><h3>Skill trust</h3><p>Verify demonstrated technical skills with provenance while preserving the distinction from self-attestation and Employer Training.</p></article>
              <article><BuildingOffice2Icon aria-hidden="true" /><h3>Employer participation</h3><p>Onboard committed employers with explicit hiring needs and controlled candidate-access scope.</p></article>
              <article><ChartBarSquareIcon aria-hidden="true" /><h3>Outcome visibility</h3><p>Track referral, interview, hire, placement, report, and early retention activity through one auditable workflow.</p></article>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">Shared responsibilities</p>
            <h2>What each pilot partner owns.</h2>
          </div>
          <div className="pilot-partner-grid">
            <article>
              <AcademicCapIcon aria-hidden="true" />
              <h3>Institution</h3>
              <ul>
                <li>Selects the program and cohort.</li>
                <li>Confirms the authoritative skills list.</li>
                <li>Assigns institution and instructor owners.</li>
                <li>Provides and validates the student roster.</li>
                <li>Participates in placement and outcome review.</li>
              </ul>
            </article>
            <article>
              <BuildingOffice2Icon aria-hidden="true" />
              <h3>Employer network</h3>
              <ul>
                <li>Defines hiring needs and target roles.</li>
                <li>Completes employer approval and onboarding.</li>
                <li>Reviews eligible students using explicit criteria.</li>
                <li>Responds to referrals and manages interviews.</li>
                <li>Records hiring and placement outcomes.</li>
              </ul>
            </article>
            <article>
              <ShieldCheckIcon aria-hidden="true" />
              <h3>TXKPRO</h3>
              <ul>
                <li>Configures the pilot workspace and scope.</li>
                <li>Supports onboarding and permissions.</li>
                <li>Maintains auditable workflow boundaries.</li>
                <li>Tracks pilot pipeline and retention signals.</li>
                <li>Facilitates the Week 12 retrospective.</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">Pilot evidence</p>
            <h2>What you should have at the end.</h2>
          </div>
          <div className="marketing-proof-list pilot-proof-list">
            <div><UsersIcon aria-hidden="true" /><span><strong>Activated cohort:</strong> students onboarded with readiness profiles and consent choices.</span></div>
            <div><CheckBadgeIcon aria-hidden="true" /><span><strong>Verified skill evidence:</strong> instructor-verified competencies with provenance.</span></div>
            <div><BuildingOffice2Icon aria-hidden="true" /><span><strong>Employer pipeline evidence:</strong> candidate review, referrals, and interview activity.</span></div>
            <div><ChartBarSquareIcon aria-hidden="true" /><span><strong>Outcome evidence:</strong> hires, placements, reporting, and retention schedules.</span></div>
            <div><ClockIcon aria-hidden="true" /><span><strong>Retrospective:</strong> documented activation, pipeline, operational, retention, and next-release findings.</span></div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">FAQ</p>
            <h2>Institution pilot questions</h2>
          </div>
          <div className="marketing-faq">
            {faq.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="marketing-cta marketing-shell">
          <div>
            <p className="marketing-kicker">Next step</p>
            <h2>See exactly what happens across the 12 weeks.</h2>
            <p>
              Review the implementation sequence, then request a pilot or an
              exploratory meeting for your institution.
            </p>
          </div>
          <div className="marketing-actions">
            <Link className="button button-brand" href="/institutions/pilot/timeline">
              View timeline
            </Link>
            <Link className="button button-ghost" href="/institutions/request-pilot">
              Request pilot
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
