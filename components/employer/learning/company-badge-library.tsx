"use client";

import {
  CheckBadgeIcon,
  ClockIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { FormEvent, useState } from "react";
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
  EmployerCompanyBadgeAward,
  EmployerCompanyBadgeDefinition,
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
    throw new Error(body.error ?? "Company Badge request failed.");
  }
  return body;
}

function awardTone(status: EmployerCompanyBadgeAward["status"]) {
  if (status === "active") return "success" as const;
  if (status === "expired") return "warning" as const;
  return "neutral" as const;
}

export function CompanyBadgeLibrary({
  badges,
  awards,
  canManage,
}: {
  badges: EmployerCompanyBadgeDefinition[];
  awards: EmployerCompanyBadgeAward[];
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
      setError(cause instanceof Error ? cause.message : "Company Badge request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function createBadge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const expiryRaw = String(form.get("expiresAfterDays") ?? "").trim();

    await run("create", async () => {
      await requestJson("/api/employer/learning/badges", {
        method: "POST",
        body: JSON.stringify({
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

  async function saveBadge(
    event: FormEvent<HTMLFormElement>,
    badge: EmployerCompanyBadgeDefinition,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiryRaw = String(form.get("expiresAfterDays") ?? "").trim();

    const payload = badge.locked
      ? {
          active: form.get("active") === "on",
        }
      : {
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          expiresAfterDays: expiryRaw ? Number(expiryRaw) : null,
          active: form.get("active") === "on",
          criteria: badge.criteria,
        };

    await run(badge.companyBadgeId, async () => {
      await requestJson(
        "/api/employer/learning/badges/" +
          encodeURIComponent(badge.companyBadgeId),
        {
          method: "PATCH",
          body: JSON.stringify(payload),
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
              <p className="txk-eyebrow">Definition</p>
              <h2>Create Company Badge</h2>
              <p>
                A Company Badge is an Employer-specific readiness signal. It can
                be linked to a course version and awarded only from canonical
                passed Employer Training completion evidence.
              </p>
            </div>
            <CheckBadgeIcon className="txk-requirements-icon" aria-hidden="true" />
          </div>

          <form className="txk-form-stack" onSubmit={createBadge}>
            <div className="txk-form-grid-2">
              <FormField label="Badge title">
                <Input name="title" required placeholder="Residential Service Ready" />
              </FormField>
              <FormField
                label="Expiration (days)"
                help="Optional. Leave blank for no automatic expiration."
              >
                <Input name="expiresAfterDays" type="number" min="1" step="1" />
              </FormField>
            </div>
            <FormField label="Description">
              <Textarea
                name="description"
                placeholder="Employer-specific readiness demonstrated by completing the linked training."
              />
            </FormField>
            <div className="txk-form-actions">
              <Button type="submit" tone="primary" disabled={Boolean(busy)}>
                <PlusIcon aria-hidden="true" />
                {busy === "create" ? "Creating…" : "Create badge"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <section className="txk-section">
        <div className="txk-section-heading">
          <div>
            <p className="txk-eyebrow">Badge library</p>
            <h2>Company Badge definitions</h2>
            <p>
              Link an active definition from a course&apos;s Checkpoints page.
              Once a definition is tied to published evidence or has awards, its
              meaning is locked; it can still be deactivated to stop future awards.
            </p>
          </div>
          <StatusBadge tone="info">{badges.length} definitions</StatusBadge>
        </div>

        {badges.length ? (
          <div className="txk-learning-grid">
            {badges.map((badge) => (
              <Card className="txk-course-card" key={badge.companyBadgeId}>
                <div className="txk-course-card-head">
                  <div className="txk-course-icon" aria-hidden="true">
                    <CheckBadgeIcon />
                  </div>
                  <StatusBadge tone={badge.active ? "success" : "neutral"}>
                    {badge.active ? "Active" : "Inactive"}
                  </StatusBadge>
                </div>

                <form className="txk-form-stack" onSubmit={(event) => saveBadge(event, badge)}>
                  <div>
                    <h3>{badge.title}</h3>
                    <p>
                      {badge.description ||
                        "Employer-specific readiness badge from passed training completion."}
                    </p>
                  </div>

                  <dl className="txk-course-facts">
                    <div><dt>Definition</dt><dd>v{badge.version}</dd></div>
                    <div><dt>Linked versions</dt><dd>{badge.linkedVersionCount}</dd></div>
                    <div><dt>Awards</dt><dd>{badge.awardCount}</dd></div>
                    <div>
                      <dt>Expiration</dt>
                      <dd>{badge.expiresAfterDays ? badge.expiresAfterDays + " days" : "None"}</dd>
                    </div>
                  </dl>

                  {canManage ? (
                    <details className="txk-authoring-details">
                      <summary>{badge.locked ? "Definition controls" : "Edit definition"}</summary>
                      <div className="txk-form-stack">
                        {badge.locked ? (
                          <div className="txk-version-lock">
                            Published or awarded definitions are locked to preserve
                            historical meaning and provenance.
                          </div>
                        ) : null}
                        <FormField label="Badge title">
                          <Input
                            name="title"
                            defaultValue={badge.title}
                            required
                            disabled={badge.locked}
                          />
                        </FormField>
                        <FormField label="Description">
                          <Textarea
                            name="description"
                            defaultValue={badge.description ?? ""}
                            disabled={badge.locked}
                          />
                        </FormField>
                        <FormField label="Expiration (days)">
                          <Input
                            name="expiresAfterDays"
                            type="number"
                            min="1"
                            step="1"
                            defaultValue={badge.expiresAfterDays ?? ""}
                            disabled={badge.locked}
                          />
                        </FormField>
                        <label className="txk-check-field">
                          <input
                            name="active"
                            type="checkbox"
                            defaultChecked={badge.active}
                          />
                          <span>Allow future awards</span>
                        </label>
                        <Button type="submit" tone="primary" disabled={Boolean(busy)}>
                          {busy === badge.companyBadgeId ? "Saving…" : "Save badge"}
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
              title="No Company Badge definitions"
              description={
                canManage
                  ? "Create a badge definition, then link it to a draft or editable course version."
                  : "No Company Badges have been configured for this Employer."
              }
            />
          </Card>
        )}
      </section>

      <section className="txk-section">
        <div className="txk-section-heading">
          <div>
            <p className="txk-eyebrow">Award evidence</p>
            <h2>Recent Company Badge awards</h2>
            <p>
              Every award is derived from a canonical passed completion and
              preserves the exact course version, badge revision, issue date,
              expiration, and evidence ID.
            </p>
          </div>
          <StatusBadge tone="neutral">{awards.length} awards</StatusBadge>
        </div>

        {awards.length ? (
          <div className="txk-learning-grid">
            {awards.slice(0, 24).map((award) => (
              <Card className="txk-course-card" key={award.companyBadgeAwardId}>
                <div className="txk-course-card-head">
                  <div className="txk-course-icon" aria-hidden="true">
                    <ShieldCheckIcon />
                  </div>
                  <StatusBadge tone={awardTone(award.status)}>
                    {award.status}
                  </StatusBadge>
                </div>
                <div>
                  <h3>{award.badgeTitle}</h3>
                  <p>{award.courseTitle || "Employer Training completion"}</p>
                </div>
                <dl className="txk-course-facts">
                  <div><dt>Badge version</dt><dd>v{award.badgeVersion}</dd></div>
                  <div><dt>Course version</dt><dd>{award.versionNumber ? "v" + award.versionNumber : "—"}</dd></div>
                  <div><dt>Issued</dt><dd>{new Date(award.issuedAt).toLocaleDateString()}</dd></div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{award.expiresAt ? new Date(award.expiresAt).toLocaleDateString() : "No expiration"}</dd>
                  </div>
                </dl>
                <div className="txk-course-footer">
                  <span><ClockIcon aria-hidden="true" /> Evidence {award.completionId}</span>
                  <span>Student evidence · {award.studentId}</span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No Company Badge awards yet"
              description="Awards appear automatically after a Student passes a course version linked to an active Company Badge."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
