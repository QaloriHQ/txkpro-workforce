import type { Metadata } from "next";
import {
  CheckCircleIcon,
  ClockIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Brand } from "@/components/brand";
import {
  Card,
  MetricCard,
  StatusBadge,
} from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getPublicEmployerCertification,
  type PublicEmployerCertification,
} from "@/lib/public/employer-certification";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ issuerSlug: string; credentialSlug: string }>;
};

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://staging-workforce.txkpro.com";

function credentialPath(
  issuerSlug: string,
  credentialSlug: string,
) {
  return `/credentials/${issuerSlug}/${credentialSlug}`;
}

function statusTone(status: PublicEmployerCertification["status"]) {
  if (status === "active") return "success" as const;
  if (status === "expired") return "warning" as const;
  if (status === "revoked") return "danger" as const;
  return "neutral" as const;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusMessage(credential: PublicEmployerCertification) {
  if (!credential.verification?.integrityVerified) {
    return {
      title: "Verification integrity issue",
      description:
        "The stored issuance metadata does not match the canonical credential record.",
      icon: ExclamationTriangleIcon,
      tone: "danger" as const,
    };
  }
  if (credential.status === "revoked") {
    return {
      title: "Credential revoked",
      description:
        "The issuing Employer has revoked this credential. Its historical issuance and course provenance remain verifiable.",
      icon: NoSymbolIcon,
      tone: "danger" as const,
    };
  }
  if (credential.status === "expired") {
    return {
      title: "Credential expired",
      description:
        "This credential has passed its configured expiration date. Its original issuance and completion provenance remain verifiable.",
      icon: ClockIcon,
      tone: "warning" as const,
    };
  }
  return {
    title: "Credential verified",
    description:
      "This active Employer Certification matches the canonical TXKPRO credential record.",
    icon: CheckCircleIcon,
    tone: "success" as const,
  };
}

async function loadCredential(path: string) {
  const credential = await getPublicEmployerCertification(path);
  if (!credential.found) notFound();
  if (credential.redirectPath) permanentRedirect(credential.redirectPath);
  if (!credential.canonicalPath) notFound();
  return credential;
}

export async function generateMetadata({
  params,
}: RouteContext): Promise<Metadata> {
  const { issuerSlug, credentialSlug } = await params;
  const path = credentialPath(issuerSlug, credentialSlug);
  const credential = await getPublicEmployerCertification(path);

  if (!credential.found || credential.redirectPath) {
    return {
      title: "Employer Certification",
      robots: { index: false, follow: false },
    };
  }

  const title =
    credential.page?.seoTitle ??
    `${credential.certification?.title ?? "Employer Certification"} — ${credential.learner?.name ?? "Credential holder"}`;
  const description =
    credential.page?.metaDescription ??
    `Verify a TXKPRO Employer Certification issued by ${credential.issuer?.name ?? "an Employer"}.`;
  const canonical = credential.canonicalPath ?? path;
  const image =
    credential.page?.shareImageUrl ?? "/og/txkpro-workforce.jpg";

  return {
    title,
    description,
    alternates: { canonical },
    robots: {
      index: credential.page?.robotsIndex ?? false,
      follow: credential.page?.robotsFollow ?? true,
    },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: "TXKPRO Workforce",
      images: [{ url: image, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PublicEmployerCredentialPage({
  params,
}: RouteContext) {
  const { issuerSlug, credentialSlug } = await params;
  const path = credentialPath(issuerSlug, credentialSlug);
  const credential = await loadCredential(path);
  const status = statusMessage(credential);
  const StatusIcon = status.icon;
  const canonicalUrl = `${siteUrl}${credential.canonicalPath}`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "EducationalOccupationalCredential",
    name: credential.certification?.title,
    description: credential.certification?.description,
    identifier: {
      "@type": "PropertyValue",
      propertyID: "TXKPRO Credential ID",
      value: credential.credentialId,
    },
    credentialCategory: "Employer Certification",
    creator: {
      "@type": "Organization",
      name: credential.issuer?.name,
    },
    recognizedBy: {
      "@type": "Organization",
      name: credential.issuer?.name,
    },
    dateCreated: credential.issuedAt,
    ...(credential.expiresAt ? { expires: credential.expiresAt } : {}),
    creativeWorkStatus: credential.status,
    url: canonicalUrl,
    about: [
      {
        "@type": "Person",
        name: credential.learner?.name,
      },
      {
        "@type": "Course",
        name: credential.course?.title,
      },
    ],
  };

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />

        <section className="public-credential-hero">
          <div className="public-credential-hero-copy">
            <p className="txk-eyebrow">TXKPRO Employer Certification</p>
            <h1>{credential.certification?.title}</h1>
            <p>
              Issued by <strong>{credential.issuer?.name}</strong> to{" "}
              <strong>{credential.learner?.name}</strong>.
            </p>
            <div className="public-credential-id">
              <span>Credential ID</span>
              <code>{credential.credentialId}</code>
            </div>
          </div>
          <div className="public-credential-seal" aria-hidden="true">
            <ShieldCheckIcon />
          </div>
        </section>

        <Card className={`public-credential-status public-credential-status-${status.tone}`}>
          <StatusIcon aria-hidden="true" />
          <div>
            <div className="public-credential-status-heading">
              <h2>{status.title}</h2>
              <StatusBadge tone={statusTone(credential.status)}>
                {credential.status}
              </StatusBadge>
            </div>
            <p>{status.description}</p>
          </div>
        </Card>

        <section className="txk-metric-grid public-credential-metrics">
          <MetricCard
            label="Issuer"
            value={credential.issuer?.name ?? "Employer"}
            detail="Employer-issued credential"
          />
          <MetricCard
            label="Learner"
            value={credential.learner?.name ?? "Credential holder"}
            detail="Privacy-safe public identity"
          />
          <MetricCard
            label="Course version"
            value={`v${credential.course?.versionNumber ?? "—"}`}
            detail={credential.course?.title ?? "Employer Training"}
          />
          <MetricCard
            label="Record integrity"
            value={
              credential.verification?.integrityVerified
                ? "Confirmed"
                : "Review"
            }
            detail={credential.verification?.method ?? "TXKPRO record"}
          />
        </section>

        <section className="public-credential-detail-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Credential details</p>
                <h2>Issuance and validity</h2>
              </div>
            </div>
            <dl className="public-credential-facts">
              <div>
                <dt>Credential ID</dt>
                <dd>{credential.credentialId}</dd>
              </div>
              <div>
                <dt>Definition version</dt>
                <dd>v{credential.certification?.definitionVersion}</dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>{dateLabel(credential.issuedAt)}</dd>
              </div>
              <div>
                <dt>Expiration</dt>
                <dd>
                  {credential.expiresAt
                    ? dateLabel(credential.expiresAt)
                    : "No automatic expiration"}
                </dd>
              </div>
              {credential.revokedAt ? (
                <div>
                  <dt>Revoked</dt>
                  <dd>{dateLabel(credential.revokedAt)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Current status</dt>
                <dd className="public-credential-capitalize">
                  {credential.status}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Source evidence</p>
                <h2>Employer Training completion</h2>
                <p>{credential.evidence?.summary}</p>
              </div>
              <DocumentCheckIcon
                className="public-credential-section-icon"
                aria-hidden="true"
              />
            </div>

            <dl className="public-credential-facts">
              <div>
                <dt>Course</dt>
                <dd>{credential.course?.title}</dd>
              </div>
              <div>
                <dt>Exact version</dt>
                <dd>v{credential.course?.versionNumber}</dd>
              </div>
              <div>
                <dt>Outcome</dt>
                <dd>Passed</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{dateLabel(credential.evidence?.completedAt)}</dd>
              </div>
            </dl>

            <div className="public-credential-boundary">
              This credential is Employer Training evidence. It does not
              represent an Instructor Verified Skill and is not a general
              employability score.
            </div>
          </Card>
        </section>

        <Card className="public-credential-privacy">
          <ShieldCheckIcon aria-hidden="true" />
          <div>
            <p className="txk-eyebrow">Privacy by design</p>
            <h2>Only publishable verification facts appear here</h2>
            <p>
              TXKPRO does not publish Student email or phone information,
              private readiness attestations, assessment answers, assignment
              workflow data, interviews, retention/case information, private
              notes, or Employer-private data on credential pages.
            </p>
          </div>
          <Link className="button button-ghost" href="/credentials">
            Verify another credential
          </Link>
        </Card>
      </main>
    </>
  );
}
