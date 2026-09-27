import {
  DocumentCheckIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card, PageHeader } from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

type RouteContext = {
  searchParams: Promise<{ credentialId?: string }>;
};

export default async function PublicCredentialsPage({
  searchParams,
}: RouteContext) {
  const query = await searchParams;
  const credentialId = query.credentialId?.trim();

  if (credentialId) {
    redirect(`/credentials/${encodeURIComponent(credentialId)}`);
  }

  return (
    <>
      <header className="topbar public-credential-topbar">
        <Brand />
        <nav className="topnav" aria-label="Public credential navigation">
          <Link className="nav-link active" href="/credentials">
            Verify credential
          </Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Link className="button button-ghost button-small" href="/login">
            Sign in
          </Link>
        </div>
      </header>

      <main className="page-wrap public-credential-page">
        <PageHeader
          eyebrow="TXKPRO Workforce · Employer Certifications"
          title="Verify an Employer Certification"
          description="Enter a TXKPRO credential ID to verify a formal Employer-issued certification from canonical Employer Training completion evidence."
        />

        <section className="public-credential-search-grid">
          <Card className="public-credential-search-card">
            <div className="public-credential-icon">
              <MagnifyingGlassIcon aria-hidden="true" />
            </div>
            <div>
              <p className="txk-eyebrow">Credential lookup</p>
              <h2>Enter the credential ID</h2>
              <p>
                Credential IDs appear on TXKPRO Employer Certification records
                and can be verified without signing in.
              </p>
            </div>

            <form className="public-credential-search-form" method="get">
              <label htmlFor="credentialId">Credential ID</label>
              <div>
                <input
                  id="credentialId"
                  name="credentialId"
                  type="search"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="CERT-XXXXXXXXXXXX"
                  aria-describedby="credential-help"
                />
                <button className="button button-brand" type="submit">
                  <ShieldCheckIcon aria-hidden="true" />
                  Verify
                </button>
              </div>
              <small id="credential-help">
                The lookup is case-insensitive. Only publishable credential
                fields are returned.
              </small>
            </form>
          </Card>

          <Card className="public-credential-trust-card">
            <DocumentCheckIcon aria-hidden="true" />
            <div>
              <p className="txk-eyebrow">What verification confirms</p>
              <h2>Formal Employer-issued evidence</h2>
              <p>
                A verified page confirms the issuing Employer, privacy-safe
                learner identity, exact source course version, issue and
                expiration dates, current status, and TXKPRO record integrity.
              </p>
            </div>
            <div className="public-credential-boundary">
              Employer Certifications are company-specific readiness evidence.
              They do not become Instructor Verified Skills and are not a
              general employability score.
            </div>
          </Card>
        </section>
      </main>
    </>
  );
}
