import type { Metadata } from "next";
import {
  ArrowRightIcon,
  BuildingOffice2Icon,
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
  title: "12-Week Workforce Pilot Implementation Timeline",
  description:
    "See the TXKPRO Workforce institution pilot timeline: setup and syllabus alignment, roster and employer activation, verified skills and interviews, then placements, reporting, retention, and retrospective.",
  alternates: { canonical: "/institutions/pilot/timeline" },
  openGraph: {
    type: "website",
    url: "/institutions/pilot/timeline",
    title: "TXKPRO Workforce Pilot Implementation Timeline",
    description:
      "A practical 12-week implementation sequence for technical colleges and workforce programs.",
    images: ["/og/txkpro-workforce.jpg"],
  },
};

const phases = [
  {
    weeks: "Weeks 1–2",
    title: "Scope, align, and provision",
    icon: ClipboardDocumentCheckIcon,
    items: [
      "Choose one cohort and first trade or technical program.",
      "Map the Verified Skills Matrix to the syllabus and confirm instructor owners.",
      "Confirm approximately 5–10 committed employers, hiring parameters, contacts, and participation expectations.",
      "Provision institution and instructor access with scoped pilot permissions.",
    ],
  },
  {
    weeks: "Weeks 3–4",
    title: "Activate the cohort and employer network",
    icon: UsersIcon,
    items: [
      "Import and validate the pilot roster.",
      "Activate student accounts and readiness profiles.",
      "Capture student preferences and consent choices.",
      "Onboard pilot employers and configure hiring needs and authorized candidate scope.",
    ],
  },
  {
    weeks: "Weeks 5–8",
    title: "Run the verified-skills and employer pipeline",
    icon: CheckBadgeIcon,
    items: [
      "Instructors verify demonstrated technical competencies with provenance.",
      "Institution users issue referrals to approved employers.",
      "Employers browse and filter eligible candidates using explicit deterministic criteria.",
      "Employers send and manage interview requests.",
      "Track referral views, interview acceptance, and time-to-interview or hire.",
    ],
  },
  {
    weeks: "Weeks 9–12",
    title: "Record placements, report outcomes, and review",
    icon: ChartBarSquareIcon,
    items: [
      "Record hires and create canonical placements once official placement criteria are met.",
      "Generate the first cohort placement and retention dashboard or report.",
      "Create and monitor Day 30/60/90 retention schedules.",
      "Run the Week 12 pilot retrospective and prioritize follow-on improvements.",
    ],
  },
];

export default function PilotTimelinePage() {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Institutions", item: `${siteUrl}/institutions` },
      { "@type": "ListItem", position: 3, name: "Pilot", item: `${siteUrl}/institutions/pilot` },
      { "@type": "ListItem", position: 4, name: "Timeline", item: `${siteUrl}/institutions/pilot/timeline` },
    ],
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "TXKPRO Workforce 12-Week Pilot Implementation Timeline",
    itemListElement: phases.map((phase, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `${phase.weeks}: ${phase.title}`,
      description: phase.items.join(" "),
    })),
  };

  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />
      <MarketingHeader />

      <main className="marketing-main">
        <nav className="marketing-breadcrumb marketing-shell" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span>/</span>
          <Link href="/institutions">Institutions</Link><span>/</span>
          <Link href="/institutions/pilot">Pilot</Link><span>/</span>
          <span>Timeline</span>
        </nav>

        <div className="marketing-shell">
          <PilotFunnelNav current="timeline" />
        </div>

        <section className="marketing-hero marketing-shell marketing-hero-single pilot-timeline-hero">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">12-week implementation timeline</p>
            <h1>A staged rollout built around real workforce activity.</h1>
            <p className="marketing-lede">
              The pilot moves from scope and curricular alignment to student and
              employer activation, then into verified skills, referrals,
              interviews, placements, reporting, and early retention.
            </p>
            <div className="marketing-actions">
              <Link className="button button-brand" href="/institutions/request-pilot?intent=pilot">
                Request a pilot
                <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link className="button button-ghost" href="/institutions/request-pilot?intent=meeting">
                Request a meeting
              </Link>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell pilot-timeline">
          {phases.map((phase, index) => {
            const Icon = phase.icon;
            return (
              <article key={phase.weeks} className="pilot-phase">
                <div className="pilot-phase-marker">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <Icon aria-hidden="true" />
                </div>
                <div className="pilot-phase-body">
                  <p className="marketing-kicker">{phase.weeks}</p>
                  <h2>{phase.title}</h2>
                  <ul>
                    {phase.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </article>
            );
          })}
        </section>

        <section className="marketing-section marketing-section-alt">
          <div className="marketing-shell marketing-split">
            <div>
              <p className="marketing-kicker">Pilot measurement</p>
              <h2>Measure the workflow, not a vanity score.</h2>
              <p>
                The pilot is designed to surface operational evidence:
                activation, verification activity, referral and interview
                movement, placements, reporting, retention schedules, and the
                issues that should shape the next release.
              </p>
            </div>
            <div className="marketing-proof-list">
              <div><CheckBadgeIcon aria-hidden="true" /><span><strong>Skill trust:</strong> verification provenance remains auditable.</span></div>
              <div><BuildingOffice2Icon aria-hidden="true" /><span><strong>Employer activity:</strong> explicit filters, referrals, and interviews remain visible.</span></div>
              <div><ChartBarSquareIcon aria-hidden="true" /><span><strong>Pipeline outcomes:</strong> referral, interview, hire, and placement movement can be reviewed.</span></div>
              <div><ClockIcon aria-hidden="true" /><span><strong>Retention:</strong> Day 30/60/90 milestones continue after the initial placement event.</span></div>
            </div>
          </div>
        </section>

        <section className="marketing-cta marketing-shell">
          <div>
            <p className="marketing-kicker">Ready to scope your cohort?</p>
            <h2>Request a pilot or start with an exploratory meeting.</h2>
            <p>
              Tell us which program, cohort, employers, and start window you
              want to explore. The request form is intentionally short.
            </p>
          </div>
          <div className="marketing-actions">
            <Link className="button button-brand" href="/institutions/request-pilot?intent=pilot">Request pilot</Link>
            <Link className="button button-ghost" href="/institutions/request-pilot?intent=meeting">Request meeting</Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
