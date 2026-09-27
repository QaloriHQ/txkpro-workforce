"use client";

import {
  ArrowPathIcon,
  DocumentCheckIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import type {
  EmployerCertificationAward,
  EmployerCertificationDefinition,
  EmployerMicroCertSummary,
} from "@/lib/employer/learning-types";

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Employer Certification request failed.");
  }
  return body;
}

function statusTone(status: EmployerCertificationAward["status"]) {
  if (status === "active") return "success" as const;
  if (status === "expired") return "warning" as const;
  return "danger" as const;
}

export function EmployerCertificationLibrary({
  definitions,
  awards,
  courses,
  canManage,
}: {
  definitions: EmployerCertificationDefinition[];
  awards: EmployerCertificationAward[];
  courses: EmployerMicroCertSummary[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await task();
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Employer Certification request failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const expiryRaw = String(form.get("expiresAfterDays") ?? "").trim();

    await run("create", async () => {
      await requestJson("/api/employer/learning/certifications", {
        method: "POST",
        body: JSON.stringify({
          microCertId: String(form.get("microCertId") ?? ""),
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          expiresAfterDays: expiryRaw ? Number(expiryRaw) : null,
          criteria: {
            criteriaVersion: 1,
            evidenceType: "micro_cert_completion",
            requiredOutcome: "passed",
          },
        }),
      });
      formElement.reset();
    });
  }

  async function saveDefinition(
    event: FormEvent<HTMLFormElement>,
    definition: EmployerCertificationDefinition,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiryRaw = String(form.get("expiresAfterDays") ?? "").trim();
    const payload = definition.locked
      ? { active: form.get("active") === "on" }
      : {
          title: String(form.get("title") ?? "").trim(),
          description:
            String(form.get("description") ?? "").trim() || null,
          expiresAfterDays: expiryRaw ? Number(expiryRaw) : null,
          active: form.get("active") === "on",
          criteria: definition.criteria,
        };

    await run(definition.certificationDefinitionId, async () => {
      await requestJson(
        "/api/employer/learning/certifications/" +
          encodeURIComponent(definition.certificationDefinitionId),
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
    });
  }

  async function revokeCredential(award: EmployerCertificationAward) {
    const reason = window.prompt(
      `Revoke credential ${award.credentialId}? Enter the revocation reason.`,
      "",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A revocation reason is required.");
      return;
    }

    await run("revoke-" + award.credentialId, async () => {
      await requestJson(
        "/api/employer/learning/certifications/awards/" +
          encodeURIComponent(award.credentialId) +
          "/revoke",
        {
          method: "POST",
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
    });
  }

  return (
    <div className="txk-form-stack">
      {error ? <div className="alert">{error}</div> : null}

      {canManage ? (
        <Card>
          <div className="txk-inline-heading">
            <div>
              <p className="txk-eyebrow">Formal credential</p>
              <h2>Create Employer Certification</h2>
              <p>
                Certification is a formal Employer-issued credential derived
                from canonical passed Employer Training completion evidence.
                It is separate from Company Badges and Instructor Verified
                Skills.
              </p>
            </div>
            <DocumentCheckIcon
              className="txk-requirements-icon"
              aria-hidden="true"
            />
          </div>

          <form className="txk-form-stack" onSubmit={createDefinition}>
            <div className="txk-form-grid-2">
              <FormField label="Course">
                <select className="txk-input" name="microCertId" required>
                  <option value="">Select course</option>
                  {courses.map((course) => (
                    <option key={course.microCertId} value={course.microCertId}>
                      {course.title} · v{course.versionNumber}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Expiration (days)"
                help="Optional. Leave blank for a credential that does not automatically expire."
              >
                <Input
                  name="expiresAfterDays"
                  type="number"
                  min="1"
                  step="1"
                />
              </FormField>
            </div>
            <FormField label="Certification title">
              <Input
                name="title"
                required
                placeholder="Acme Residential Safety Certification"
              />
            </FormField>
            <FormField label="Description">
              <Textarea
                name="description"
                placeholder="Formal Employer-issued credential earned by successfully completing the linked course version."
              />
            </FormField>
            <div className="txk-form-actions">
              <Button type="submit" tone="primary" disabled={Boolean(busy)}>
                <PlusIcon aria-hidden="true" />
                {busy === "create"
                  ? "Creating…"
                  : "Create certification definition"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <section className="txk-section">
        <div className="txk-section-heading">
          <div>
            <p className="txk-eyebrow">Definitions</p>
            <h2>Employer Certification definitions</h2>
            <p>
              Link an active definition to an editable course version from the
              course Checkpoints page. Published or issued definitions are
              locked to preserve credential meaning.
            </p>
          </div>
          <StatusBadge tone="info">
            {definitions.length} definitions
          </StatusBadge>
        </div>

        {definitions.length ? (
          <div className="txk-learning-grid">
            {definitions.map((definition) => (
              <Card
                className="txk-course-card"
                key={definition.certificationDefinitionId}
              >
                <div className="txk-course-card-head">
                  <div className="txk-course-icon" aria-hidden="true">
                    <DocumentCheckIcon />
                  </div>
                  <StatusBadge
                    tone={definition.active ? "success" : "neutral"}
                  >
                    {definition.active ? "Active" : "Inactive"}
                  </StatusBadge>
                </div>

                <form
                  className="txk-form-stack"
                  onSubmit={(event) => saveDefinition(event, definition)}
                >
                  <div>
                    <p className="txk-eyebrow">{definition.courseTitle}</p>
                    <h3>{definition.title}</h3>
                    <p>
                      {definition.description ||
                        "Formal Employer-issued credential from passed course completion evidence."}
                    </p>
                  </div>

                  <dl className="txk-course-facts">
                    <div>
                      <dt>Definition</dt>
                      <dd>v{definition.version}</dd>
                    </div>
                    <div>
                      <dt>Linked versions</dt>
                      <dd>{definition.linkedVersionCount}</dd>
                    </div>
                    <div>
                      <dt>Credentials</dt>
                      <dd>{definition.awardCount}</dd>
                    </div>
                    <div>
                      <dt>Expiration</dt>
                      <dd>
                        {definition.expiresAfterDays
                          ? definition.expiresAfterDays + " days"
                          : "None"}
                      </dd>
                    </div>
                  </dl>

                  {canManage ? (
                    <details className="txk-authoring-details">
                      <summary>
                        {definition.locked
                          ? "Definition controls"
                          : "Edit definition"}
                      </summary>
                      <div className="txk-form-stack">
                        {definition.locked ? (
                          <div className="txk-version-lock">
                            Published or issued credential definitions are
                            immutable. Create another definition revision to
                            change credential semantics.
                          </div>
                        ) : null}
                        <FormField label="Certification title">
                          <Input
                            name="title"
                            defaultValue={definition.title}
                            required
                            disabled={definition.locked}
                          />
                        </FormField>
                        <FormField label="Description">
                          <Textarea
                            name="description"
                            defaultValue={definition.description ?? ""}
                            disabled={definition.locked}
                          />
                        </FormField>
                        <FormField label="Expiration (days)">
                          <Input
                            name="expiresAfterDays"
                            type="number"
                            min="1"
                            step="1"
                            defaultValue={definition.expiresAfterDays ?? ""}
                            disabled={definition.locked}
                          />
                        </FormField>
                        <label className="txk-check-field">
                          <input
                            name="active"
                            type="checkbox"
                            defaultChecked={definition.active}
                          />
                          <span>Allow future credential issuance</span>
                        </label>
                        <Button
                          type="submit"
                          tone="primary"
                          disabled={Boolean(busy)}
                        >
                          <ArrowPathIcon aria-hidden="true" />
                          {busy === definition.certificationDefinitionId
                            ? "Saving…"
                            : "Save definition"}
                        </Button>
                      </div>
                    </details>
                  ) : null}
                </form>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No Employer Certification definitions"
              description={
                canManage
                  ? "Create a formal credential definition, then link it to a draft or otherwise editable course version."
                  : "No formal Employer Certification definitions are configured."
              }
            />
          </Card>
        )}
      </section>

      <section className="txk-section">
        <div className="txk-section-heading">
          <div>
            <p className="txk-eyebrow">Issued credentials</p>
            <h2>Employer Certifications</h2>
            <p>
              Credentials preserve the issuer, learner, exact course version,
              completion evidence, issue date, optional expiration, and
              revocation history.
            </p>
          </div>
          <Link
            className="txk-button txk-button-default txk-button-md"
            href="/employer/learning/certifications/verify"
          >
            <MagnifyingGlassIcon aria-hidden="true" />
            Verify credential
          </Link>
        </div>

        {awards.length ? (
          <div className="txk-learning-grid">
            {awards.map((award) => (
              <Card
                className="txk-course-card"
                key={award.certificationAwardId}
              >
                <div className="txk-course-card-head">
                  <div className="txk-course-icon" aria-hidden="true">
                    <ShieldCheckIcon />
                  </div>
                  <StatusBadge tone={statusTone(award.status)}>
                    {award.status}
                  </StatusBadge>
                </div>
                <div>
                  <h3>{award.certificationTitle}</h3>
                  <p>
                    {award.studentName} · {award.courseTitle}
                  </p>
                </div>
                <dl className="txk-course-facts">
                  <div>
                    <dt>Credential ID</dt>
                    <dd>{award.credentialId}</dd>
                  </div>
                  <div>
                    <dt>Definition</dt>
                    <dd>v{award.certificationVersion}</dd>
                  </div>
                  <div>
                    <dt>Course version</dt>
                    <dd>v{award.courseVersionNumber}</dd>
                  </div>
                  <div>
                    <dt>Issued</dt>
                    <dd>
                      {new Date(award.issuedAt).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
                <div className="txk-course-footer">
                  <span>
                    {award.expiresAt
                      ? "Expires " +
                        new Date(award.expiresAt).toLocaleDateString()
                      : "No automatic expiration"}
                  </span>
                  <span>Completion {award.completionId}</span>
                </div>
                <div className="txk-form-actions">
                  <Link
                    className="txk-button txk-button-default txk-button-sm"
                    href={
                      "/employer/learning/certifications/verify?credentialId=" +
                      encodeURIComponent(award.credentialId)
                    }
                  >
                    <ShieldCheckIcon aria-hidden="true" />
                    Verify
                  </Link>
                  <Link
                    className="txk-button txk-button-default txk-button-sm"
                    href={
                      "/credentials/" +
                      encodeURIComponent(award.credentialId)
                    }
                  >
                    Public page
                  </Link>
                  {canManage && award.status !== "revoked" ? (
                    <Button
                      type="button"
                      tone="danger"
                      size="sm"
                      disabled={busy === "revoke-" + award.credentialId}
                      onClick={() => revokeCredential(award)}
                    >
                      <NoSymbolIcon aria-hidden="true" />
                      {busy === "revoke-" + award.credentialId
                        ? "Revoking…"
                        : "Revoke"}
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No Employer Certifications issued yet"
              description="A credential is issued automatically after a Student passes a course version linked to an active Employer Certification definition."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
