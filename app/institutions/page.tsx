import type { Metadata } from "next";
import {
  AcademicCapIcon,
  ArrowRightIcon,
  BuildingLibraryIcon,
  ChartBarSquareIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
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
  title: "Workforce Platform for Technical Colleges & Career Programs",
  description:
    "TXKPRO Workforce helps technical colleges and career programs manage verified skills, employer training, referrals, placements, and 30/60/90-day retention outcomes.",
  alternates: { canonical: "/institutions" },
  openGraph: {
    type: "website",
    url: "/institutions",
    title: "TXKPRO Workforce for Institutions",
    description:
      "Connect programs, instructors, employers, referrals, placements, and early retention in one workforce workflow.",
    images: ["/og/txkpro-workforce.jpg"],
  },
};

const faq = [
  {
    question: "What can an institution manage in TXKPRO Workforce?",
    answer:
      "Institutions can manage technical programs and cohorts, import rosters, scope educator access, monitor Verified Skills activity, coordinate Employer Training, referrals, placements, retention milestones, and reporting.",
  },
  {
    question: "How does TXKPRO distinguish verified skills from other readiness signals?",
    answer:
      "Instructor Verified Skills are authoritative technical competency evidence. Student self-attestations, Employer Training, Company Badges, and Employer Certifications remain separate evidence categories with their own provenance.",
  },
  {
    question: "Can institutions track outcomes after a student is hired?",
    answer:
      "Yes. Placement records can trigger 30/60/90-day retention milestones so authorized institution and TXKPRO users can monitor early outcomes and identify cases that may need human follow-up.",
  },
  {
    question: "Does TXKPRO ingest grades, financial aid, or unrelated student records?",
    answer:
      "The MVP is designed around workforce placement and retention data. It does not require grades, FAFSA or Pell information, raw background reports, or unrelated education records.",
  },
];

export default function InstitutionsPage() {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Institutions", item: `${siteUrl}/institutions` },
    ],
  };

  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "TXKPRO Workforce for Institutions",
    serviceType: "Skilled trades workforce and placement platform",
    provider: { "@type": "Organization", name: "TXKPRO Workforce", url: siteUrl },
    areaServed: { "@type": "AdministrativeArea", name: "Greater Texarkana" },
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "administrator",
      audienceType: "Technical colleges, career and technical education programs, workforce staff, and instructors",
    },
    description:
      "A workforce platform for managing verified skills, employer partnerships, referrals, placements, and early retention outcomes.",
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
          <Link href="/">Home</Link><span>/</span><span>Institutions</span>
        </nav>

        <div className="marketing-shell">
          <PilotFunnelNav current="institution" />
        </div>

        <section className="marketing-hero marketing-shell marketing-hero-single">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">TXKPRO Workforce for Institutions</p>
            <h1>Turn classroom competency into workforce outcomes.</h1>
            <p className="marketing-lede">
              Give administrators, program leaders, instructors, and career
              services one shared view of verified technical skills, employer
              training, referrals, placements, and early retention activity.
            </p>
            <div className="marketing-actions">
              <Link className="button button-brand" href="/institutions/pilot">
                Explore the 12-week pilot <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link className="button button-ghost" href="/institutions/request-pilot?intent=meeting">
                Request a meeting
              </Link>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">Institution outcomes</p>
            <h2>See the path from program participation to local employment.</h2>
            <p>
              TXKPRO replaces fragmented calls, spreadsheets, and duplicate
              placement tracking with a scoped, auditable workforce workflow.
            </p>
          </div>
          <div className="marketing-feature-grid">
            <article><BuildingLibraryIcon aria-hidden="true" /><h3>Programs, cohorts, and rosters</h3><p>Organize technical programs and cohorts, import student rosters, and scope educator access to the right institution context.</p></article>
            <article><CheckBadgeIcon aria-hidden="true" /><h3>Verified Skills Matrix</h3><p>Track demonstrated curriculum and lab competency with instructor verification that remains distinct from self-attestation.</p></article>
            <article><ClipboardDocumentCheckIcon aria-hidden="true" /><h3>Employer Training</h3><p>Assign employer-specific readiness content while preserving the boundary between company training and instructor-verified technical skill.</p></article>
            <article><ChartBarSquareIcon aria-hidden="true" /><h3>Placement and retention reporting</h3><p>Monitor referrals, interviews, hires, placement velocity, and Day 30/60/90 retention activity by program or cohort.</p></article>
          </div>
        </section>

        <section className="marketing-section marketing-section-alt">
          <div className="marketing-shell">
            <div className="marketing-section-heading">
              <p className="marketing-kicker">Workflow</p>
              <h2>A single institution-to-employer loop.</h2>
            </div>
            <ol className="marketing-steps">
              <li><span>01</span><div><h3>Configure a program and cohort</h3><p>Create the institution structure, import a roster, and grant scoped educator access.</p></div></li>
              <li><span>02</span><div><h3>Capture readiness evidence</h3><p>Students complete workforce profiles while instructors verify demonstrated competencies.</p></div></li>
              <li><span>03</span><div><h3>Coordinate employer pathways</h3><p>Use Employer Training, referrals, and interviews to move qualified students toward approved local employers.</p></div></li>
              <li><span>04</span><div><h3>Measure placement and early retention</h3><p>Track hires, active placements, and the first 30/60/90 days without collapsing distinct evidence into a hidden score.</p></div></li>
            </ol>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-split">
            <div>
              <p className="marketing-kicker">Role-aware institution workspace</p>
              <h2>Different responsibilities, one source of workforce truth.</h2>
              <p>
                Institution administrators, department heads, program
                coordinators, instructors, and career services can operate from
                the same platform while server-side permissions preserve role
                and scope boundaries.
              </p>
            </div>
            <div className="marketing-proof-list">
              <div><UsersIcon aria-hidden="true" /><span><strong>Administrators</strong> manage programs, cohorts, teams, and outcomes.</span></div>
              <div><AcademicCapIcon aria-hidden="true" /><span><strong>Instructors</strong> verify demonstrated technical competency.</span></div>
              <div><ClipboardDocumentCheckIcon aria-hidden="true" /><span><strong>Career services</strong> coordinate readiness, referrals, and employer pathways.</span></div>
              <div><ClockIcon aria-hidden="true" /><span><strong>Leadership</strong> monitors placement and retention evidence.</span></div>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">FAQ</p>
            <h2>Questions from institutions</h2>
          </div>
          <div className="marketing-faq">
            {faq.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
          </div>
        </section>

        <section className="marketing-cta marketing-shell">
          <div>
            <p className="marketing-kicker">Pilot-ready</p>
            <h2>Start with one program, one cohort, and a defined employer group.</h2>
            <p>Build the workforce loop around real verification, referral, placement, and retention activity before expanding.</p>
          </div>
          <div className="marketing-actions">
            <Link className="button button-brand" href="/institutions/pilot">View pilot overview</Link>
            <Link className="button button-ghost" href="/institutions/request-pilot">Request pilot / meeting</Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
