import type { Metadata } from "next";
import Link from "next/link";
import { InstitutionPilotRequestForm } from "@/components/institution-pilot-request-form";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { PilotFunnelNav } from "@/components/pilot-funnel-nav";

export const metadata: Metadata = {
  title: "Request a TXKPRO Workforce Institution Pilot",
  description:
    "Request a TXKPRO Workforce pilot or exploratory meeting for your technical college, CTE program, or workforce program.",
  alternates: { canonical: "/institutions/request-pilot" },
  robots: { index: false, follow: true },
};

type PageProps = {
  searchParams: Promise<{ intent?: string }>;
};

export default async function RequestPilotPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const defaultIntent =
    query.intent === "meeting"
      ? "meeting"
      : query.intent === "both"
        ? "both"
        : "pilot";

  return (
    <>
      <MarketingHeader />
      <main className="marketing-main">
        <nav className="marketing-breadcrumb marketing-shell" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span>/</span>
          <Link href="/institutions">Institutions</Link><span>/</span>
          <span>Request pilot</span>
        </nav>

        <div className="marketing-shell">
          <PilotFunnelNav current="request" />
        </div>

        <section className="marketing-hero marketing-shell marketing-hero-single pilot-request-hero">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">Request a pilot or meeting</p>
            <h1>Tell us what you want your institution pilot to prove.</h1>
            <p className="marketing-lede">
              Share the program, approximate cohort size, timing, and the
              outcome you want to validate. TXKPRO can use that context to
              structure the next conversation around your real workforce
              workflow.
            </p>
          </div>
        </section>

        <section className="marketing-section marketing-shell pilot-request-layout">
          <div>
            <p className="marketing-kicker">Pilot request</p>
            <h2>Start with the essential context.</h2>
            <InstitutionPilotRequestForm defaultIntent={defaultIntent} />
          </div>

          <aside className="pilot-request-aside">
            <div className="pilot-request-note">
              <p className="marketing-kicker">What happens next</p>
              <ol>
                <li><strong>Review:</strong> TXKPRO reviews your institution, program, and pilot goals.</li>
                <li><strong>Scope:</strong> We identify the likely cohort, institution owners, and employer-partner needs.</li>
                <li><strong>Meeting:</strong> We use the conversation to confirm fit, timing, success measures, and next steps.</li>
                <li><strong>Pilot plan:</strong> If there is alignment, the implementation sequence follows the 12-week production baseline.</li>
              </ol>
            </div>
            <div className="pilot-request-note">
              <p className="marketing-kicker">Before submitting</p>
              <p>
                You do not need final employer commitments or a completed
                roster to start the conversation. A program, approximate cohort
                size, and a clear workforce problem are enough for an initial
                discussion.
              </p>
            </div>
            <Link className="button button-ghost" href="/institutions/pilot/timeline">
              Review the 12-week timeline
            </Link>
          </aside>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
