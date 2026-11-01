import Link from "next/link";
import { notFound } from "next/navigation";
import { AtsApplicationForm } from "@/components/ats/application-form";
import { ExternalApplicantAccess } from "@/components/ats/external-applicant-access";
import { applicantForm } from "@/lib/ats/applications-repository";
import { getVerifiedIdentity } from "@/lib/auth";
import type { ApplicantFormDefinition } from "@/lib/ats/applications";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const { id } = await params;
  const { invite } = await searchParams;
  const invitationId = invite && /^[a-f\d-]{36}$/i.test(invite) ? invite : null;
  const next = `/jobs/${encodeURIComponent(id)}/apply${invitationId ? `?invite=${encodeURIComponent(invitationId)}` : ""}`;
  const identity = await getVerifiedIdentity();
  if (!identity) return <main className="page-wrap" style={{ display: "grid", gap: 18, maxWidth: 760 }}>
    <Link className="back-link" href={`/jobs/${encodeURIComponent(id)}`}>← Back to job</Link>
    <ExternalApplicantAccess next={next} />
  </main>;

  let definition: ApplicantFormDefinition | null = null;
  let unavailableMessage: string | null = null;
  try {
    definition = await applicantForm(id, invitationId, identity);
  } catch (error) {
    if (error instanceof Response && error.status === 404) notFound();
    unavailableMessage = error instanceof Response ? await error.text() : "This application is unavailable.";
  }
  if (!definition) return <main className="page-wrap"><div className="card empty">
    <h1>Application unavailable</h1><p>{unavailableMessage}</p>
    <Link className="button button-ghost" href="/jobs">Browse open opportunities</Link>
  </div></main>;
  return <main className="page-wrap" style={{ display: "grid", gap: 18, maxWidth: 760 }}>
    <Link className="back-link" href={`/jobs/${encodeURIComponent(id)}`}>← Back to job</Link>
    <AtsApplicationForm definition={definition} />
  </main>;
}
