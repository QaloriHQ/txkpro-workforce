import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  Card,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { verifyEmployerCertificationCredential } from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

type RouteContext = {
  searchParams: Promise<{ credentialId?: string }>;
};

function tone(status?: string) {
  if (status === "active") return "success" as const;
  if (status === "expired") return "warning" as const;
  if (status === "revoked") return "danger" as const;
  return "neutral" as const;
}

export default async function EmployerCertificationVerifyPage({
  searchParams,
}: RouteContext) {
  await requireEmployerContext({ approved: true });
  const query = await searchParams;
  const credentialId = query.credentialId?.trim() ?? "";
  const verification = credentialId
    ? await verifyEmployerCertificationCredential(credentialId)
    : null;

  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="learning" />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Employer Certifications · Verification"
          title="Verify credential"
          description="Verify a formal Employer Certification by credential ID. Public unauthenticated credential pages are implemented separately in W11-09B."
          actions={
            <ButtonLink href="/employer/learning/certifications">
              <ArrowLeftIcon aria-hidden="true" />
              Certifications
            </ButtonLink>
          }
        />

        <Card>
          <form
            className="institution-student-directory-filters"
            method="get"
            action="/employer/learning/certifications/verify"
          >
            <label className="institution-filter-search">
              <span>Credential ID</span>
              <div>
                <MagnifyingGlassIcon aria-hidden="true" />
                <input
                  name="credentialId"
                  type="search"
                  required
                  defaultValue={credentialId}
                  placeholder="CERT-XXXXXXXXXXXX"
                  autoComplete="off"
                />
              </div>
            </label>
            <button
              className="txk-button txk-button-primary txk-button-md"
              type="submit"
            >
              Verify credential
            </button>
          </form>
        </Card>

        {verification ? (
          verification.found ? (
            <Card className="institution-assignment-detail-hero">
              <div className="txk-form-stack">
                <div className="txk-inline-heading">
                  <div>
                    <p className="txk-eyebrow">Credential verification</p>
                    <h2>{verification.certification?.title}</h2>
                    <p>
                      {verification.issuer?.name} · Credential{" "}
                      {verification.credentialId}
                    </p>
                  </div>
                  <StatusBadge tone={tone(verification.status)}>
                    {verification.status ?? "unknown"}
                  </StatusBadge>
                </div>

                <div className="institution-assignment-progress-grid">
                  <div>
                    <span>Learner</span>
                    <strong>{verification.learner?.name}</strong>
                  </div>
                  <div>
                    <span>Course</span>
                    <strong>{verification.course?.title}</strong>
                  </div>
                  <div>
                    <span>Course version</span>
                    <strong>v{verification.course?.versionNumber}</strong>
                  </div>
                  <div>
                    <span>Definition</span>
                    <strong>
                      v{verification.certification?.definitionVersion}
                    </strong>
                  </div>
                </div>

                <dl className="institution-assignment-record-meta">
                  <div>
                    <dt>Issued</dt>
                    <dd>
                      {verification.issuedAt
                        ? new Date(verification.issuedAt).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Expiration</dt>
                    <dd>
                      {verification.expiresAt
                        ? new Date(verification.expiresAt).toLocaleString()
                        : "No automatic expiration"}
                    </dd>
                  </div>
                  <div>
                    <dt>Completion evidence</dt>
                    <dd>{verification.evidence?.completionId ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Verification digest</dt>
                    <dd>
                      {verification.verification?.digestValid
                        ? "Digest matches issuance metadata"
                        : "Digest mismatch"}
                    </dd>
                  </div>
                </dl>

                {verification.status === "revoked" ? (
                  <div className="alert">
                    <NoSymbolIcon aria-hidden="true" />
                    Revoked
                    {verification.revokedAt
                      ? " " +
                        new Date(verification.revokedAt).toLocaleString()
                      : ""}
                    {verification.revokeReason
                      ? " · " + verification.revokeReason
                      : ""}
                  </div>
                ) : verification.status === "expired" ? (
                  <div className="alert">
                    <ExclamationTriangleIcon aria-hidden="true" />
                    This credential has expired. Its issuance and completion
                    provenance remain verifiable.
                  </div>
                ) : (
                  <div className="alert alert-success">
                    <CheckCircleIcon aria-hidden="true" />
                    Credential is active and its stored issuance digest matches
                    the canonical credential metadata.
                  </div>
                )}

                <div className="institution-badge-evidence-card">
                  <ShieldCheckIcon aria-hidden="true" />
                  <div>
                    <strong>Evidence category: Employer Training</strong>
                    <span>
                      Formal Employer Certification · not an Instructor Verified
                      Skill
                    </span>
                    <small>
                      Assignment {verification.evidence?.assignmentId} · exact
                      version {verification.course?.microCertVersionId}
                    </small>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="alert">
                <ExclamationTriangleIcon aria-hidden="true" />
                No Employer Certification was found for credential ID{" "}
                <strong>{credentialId}</strong>.
              </div>
            </Card>
          )
        ) : null}
      </main>
    </>
  );
}
