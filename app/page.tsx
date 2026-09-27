import type { Metadata } from "next";
import {
  AcademicCapIcon,
  ArrowRightIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
  ChartBarSquareIcon,
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
  title: "Skilled Trades Workforce Platform for Greater Texarkana",
  description:
    "TXKPRO Workforce connects technical programs and vetted employers through verified skills, employer training, referrals, placements, and 30/60/90-day retention visibility.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: "TXKPRO Workforce | Greater Texarkana Skilled Trades Platform",
    description:
      "Connect technical programs, verified student capabilities, vetted employers, placements, and early retention in one local workforce platform.",
    images: ["/og/txkpro-workforce.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "TXKPRO Workforce | Greater Texarkana Skilled Trades Platform",
    description:
      "A local lab-to-field workforce network for institutions, students, and skilled-trade employers.",
    images: ["/og/txkpro-workforce.jpg"],
  },
};

const faq = [
  {
    question: "What is TXKPRO Workforce?",
    answer:
      "TXKPRO Workforce is a Greater Texarkana workforce platform that connects technical students, instructors and institutions, and vetted skilled-trade employers around verified skills, employer-specific readiness training, referrals, interviews, placements, and early retention.",
  },
  {
    question: "Who is TXKPRO Workforce built for?",
    answer:
      "The platform supports technical and career education institutions, instructors, students, skilled-trade employers, and TXKPRO workforce administrators. Institutions and employers are the primary organizational partners.",
  },
  {
    question: "Does TXKPRO rank or automatically reject candidates?",
    answer:
      "No. TXKPRO organizes explicit readiness and verified-skill evidence, but final hiring decisions remain with employers. The platform does not use an opaque employability score to automatically accept or reject candidates.",
  },
  {
    question: "How are skills verified?",
    answer:
      "Authorized instructors verify demonstrated curriculum or lab skills. Instructor Verified Skills remain distinct from student self-attestation and from Employer Training or Employer Certifications.",
  },
];

export default function HomePage() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TXKPRO Workforce",
    url: siteUrl,
    logo: `${siteUrl}/txkpro-logo-light.svg`,
    description:
      "A Greater Texarkana workforce platform connecting technical programs, verified student capabilities, and vetted skilled-trade employers.",
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Greater Texarkana",
    },
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TXKPRO Workforce",
    url: siteUrl,
    publisher: {
      "@type": "Organization",
      name: "TXKPRO Workforce",
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <JsonLd data={organizationSchema} />
      <JsonLd data={webSiteSchema} />
      <JsonLd data={faqSchema} />
      <MarketingHeader />

      <main className="marketing-main">
        <section className="marketing-hero marketing-shell">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">
              Greater Texarkana skilled workforce network
            </p>
            <h1>Move skilled-trades talent from the lab to the field.</h1>
            <p className="marketing-lede">
              TXKPRO Workforce gives institutions and vetted employers one
              shared system for verified skills, employer-specific training,
              referrals, interviews, placements, and 30/60/90-day retention
              visibility.
            </p>
            <div className="marketing-actions">
              <Link className="button button-brand" href="/institutions">
                For institutions
                <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link className="button button-ghost" href="/employers">
                For employers
              </Link>
            </div>
            <div className="marketing-trust-row" aria-label="Platform principles">
              <span><CheckBadgeIcon aria-hidden="true" /> Instructor-verified skills</span>
              <span><ShieldCheckIcon aria-hidden="true" /> Vetted employer access</span>
              <span><ClockIcon aria-hidden="true" /> Early retention visibility</span>
            </div>
          </div>

          <aside className="marketing-hero-panel">
            <p className="marketing-kicker">One local workforce loop</p>
            <h2>Evidence travels with the student.</h2>
            <div className="marketing-flow">
              <div>
                <span>01</span>
                <AcademicCapIcon aria-hidden="true" />
                <p><strong>Institution</strong> configures programs, cohorts, skills, and employer partnerships.</p>
              </div>
              <div>
                <span>02</span>
                <CheckBadgeIcon aria-hidden="true" />
                <p><strong>Instructor</strong> verifies demonstrated technical competency.</p>
              </div>
              <div>
                <span>03</span>
                <BuildingOffice2Icon aria-hidden="true" />
                <p><strong>Employer</strong> reviews job-relevant readiness and requests interviews.</p>
              </div>
              <div>
                <span>04</span>
                <ChartBarSquareIcon aria-hidden="true" />
                <p><strong>Institution + TXKPRO</strong> track placement and early retention outcomes.</p>
              </div>
            </div>
          </aside>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">Primary partners</p>
            <h2>Built around institutions and employers.</h2>
            <p>
              Students remain at the center of the workflow, but TXKPRO is
              designed to help institutions and employers coordinate the
              evidence and actions that move students into local careers.
            </p>
          </div>

          <div className="marketing-audience-grid">
            <article className="marketing-audience-card">
              <AcademicCapIcon aria-hidden="true" />
              <p className="marketing-kicker">Institutions</p>
              <h3>See whether classroom competency becomes employment.</h3>
              <p>
                Manage programs and cohorts, scope instructors, verify skills,
                coordinate Employer Training, refer students, and monitor
                placement and retention activity.
              </p>
              <Link href="/institutions">
                Explore institution workflows <ArrowRightIcon aria-hidden="true" />
              </Link>
            </article>

            <article className="marketing-audience-card">
              <BuildingOffice2Icon aria-hidden="true" />
              <p className="marketing-kicker">Employers</p>
              <h3>Find local candidates with explainable readiness evidence.</h3>
              <p>
                Review instructor-verified competencies, explicit job-readiness
                fields, referrals, Employer Training, interviews, hires, and
                early retention milestones.
              </p>
              <Link href="/employers">
                Explore employer workflows <ArrowRightIcon aria-hidden="true" />
              </Link>
            </article>
          </div>
        </section>

        <section className="marketing-section marketing-section-alt">
          <div className="marketing-shell">
            <div className="marketing-section-heading">
              <p className="marketing-kicker">What TXKPRO replaces</p>
              <h2>A clearer alternative to disconnected placement workflows.</h2>
            </div>
            <div className="marketing-feature-grid">
              <article>
                <UserGroupIcon aria-hidden="true" />
                <h3>Living student profiles</h3>
                <p>
                  Connect program identity, readiness preferences, verified
                  skills, Employer Training, referrals, and placement status.
                </p>
              </article>
              <article>
                <CheckBadgeIcon aria-hidden="true" />
                <h3>Verified over self-reported</h3>
                <p>
                  Keep instructor verification visibly separate from
                  self-attestation and employer-specific readiness evidence.
                </p>
              </article>
              <article>
                <BuildingOffice2Icon aria-hidden="true" />
                <h3>Local employer discovery</h3>
                <p>
                  Approved employers filter candidates using explicit,
                  job-relevant criteria instead of a hidden ranking score.
                </p>
              </article>
              <article>
                <ClockIcon aria-hidden="true" />
                <h3>30/60/90-day retention</h3>
                <p>
                  Extend the workflow beyond hire so institutions and TXKPRO can
                  see when an early placement may need human follow-up.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading">
            <p className="marketing-kicker">Common questions</p>
            <h2>TXKPRO Workforce FAQ</h2>
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
            <p className="marketing-kicker">Start locally</p>
            <h2>Build a measurable lab-to-field workforce pipeline.</h2>
            <p>
              Start with an institution program, a defined employer group, and
              the workflows needed to verify skills, create introductions, and
              follow early placement outcomes.
            </p>
          </div>
          <div className="marketing-actions">
            <Link className="button button-brand" href="/signup">
              Create an account
            </Link>
            <Link className="button button-ghost" href="/credentials">
              Verify a credential
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
