import type { Metadata } from "next";
import {
  ArrowRightIcon,
  CheckBadgeIcon,
  DocumentCheckIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

export const metadata: Metadata = {
  title: "Skilled Trades Student Workforce Profiles & Verified Skills",
  description:
    "TXKPRO Workforce helps technical students build living workforce profiles, document instructor-verified skills, complete Employer Training, and connect with approved local employers.",
  alternates: { canonical: "/students" },
};

const faq = [
  {
    question: "Do students need a traditional résumé to use TXKPRO?",
    answer:
      "TXKPRO is designed around a living workforce profile that can show program identity, verified skills, readiness preferences, Employer Training, referrals, interviews, and placement activity. A traditional résumé is not the only evidence source.",
  },
  {
    question: "Can students verify their own technical skills?",
    answer:
      "Students may self-attest skills they can demonstrate, but only authorized instructors create Instructor Verified Skills. Self-attestation and verification remain visibly distinct.",
  },
  {
    question: "Who can see a student profile?",
    answer:
      "Employer discoverability and public profile visibility are controlled separately. Approved employers only see candidates within authorized scope, and private contact information is not treated as public profile content.",
  },
];

export default function StudentsPage() {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Students", item: `${siteUrl}/students` },
    ],
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
      <JsonLd data={faqSchema} />
      <MarketingHeader />
      <main className="marketing-main">
        <nav className="marketing-breadcrumb marketing-shell" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span>/</span><span>Students</span>
        </nav>
        <section className="marketing-hero marketing-shell marketing-hero-single">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">TXKPRO Workforce for Students</p>
            <h1>Show what you can do—not just what a résumé says.</h1>
            <p className="marketing-lede">
              Build a living skilled-trades profile with instructor-verified
              competencies, explicit work preferences, Employer Training,
              referrals, interviews, and placement activity.
            </p>
            <div className="marketing-actions">
              <Link className="button button-brand" href="/request-access">
                Request student access <ArrowRightIcon aria-hidden="true" />
              </Link>
              <Link className="button button-ghost" href="/credentials">Verify a credential</Link>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-feature-grid">
            <article><CheckBadgeIcon aria-hidden="true" /><h3>Instructor Verified Skills</h3><p>Keep demonstrated technical competency separate from self-attestation so employers can see provenance.</p></article>
            <article><DocumentCheckIcon aria-hidden="true" /><h3>Employer Training</h3><p>Complete company-specific readiness content and earn Employer evidence without changing instructor-verified technical skills.</p></article>
            <article><MapPinIcon aria-hidden="true" /><h3>Local opportunities</h3><p>Connect with approved employers through referrals and interview workflows aligned to your program and preferences.</p></article>
            <article><ShieldCheckIcon aria-hidden="true" /><h3>Privacy controls</h3><p>Employer discoverability and public profile visibility are distinct controls; private workflow and contact data do not become public by default.</p></article>
          </div>
        </section>

        <section className="marketing-section marketing-shell">
          <div className="marketing-section-heading"><p className="marketing-kicker">FAQ</p><h2>Questions from students</h2></div>
          <div className="marketing-faq">{faq.map((item)=><details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
