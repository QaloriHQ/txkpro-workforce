"use client";

import {
  ArrowDownIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  MetricCard,
  RoleViewBanner,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import type {
  EmployerLearningCheckpoint,
  EmployerLearningCheckpointType,
  EmployerLearningPassingRequirement,
  EmployerMicroCertModuleDetail,
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
    throw new Error(body.error ?? "Employer Learning request failed.");
  }
  return body;
}

function normalizedRequirement(
  course: EmployerMicroCertModuleDetail,
): EmployerLearningPassingRequirement {
  const raw = course.currentVersion.passingRequirement ?? {};
  return {
    completionRuleVersion: 1,
    checkpointMode:
      raw.checkpointMode === "weighted_percent"
        ? "weighted_percent"
        : "all_required",
    minimumCheckpointPercent: Number(raw.minimumCheckpointPercent ?? 100),
    requireAllRequiredLessons: raw.requireAllRequiredLessons !== false,
    requireAllRequiredAssessments: raw.requireAllRequiredAssessments !== false,
  };
}

function checkpointLabel(type: EmployerLearningCheckpointType) {
  return type.replaceAll("_", " ");
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function CourseCheckpointsWorkspace({
  course,
  canManage,
}: {
  course: EmployerMicroCertModuleDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const immutable = ["live", "archived"].includes(course.currentVersion.status);
  const canEdit = canManage && !immutable;
  const base = `/api/employer/learning/courses/${encodeURIComponent(course.microCertId)}`;

  const requirement = useMemo(() => normalizedRequirement(course), [course]);
  const requiredCheckpointCount = course.checkpoints.filter(
    (checkpoint) => checkpoint.required,
  ).length;
  const totalWeight = course.checkpoints.reduce(
    (sum, checkpoint) => sum + Number(checkpoint.weight || 0),
    0,
  );

  async function run(key: string, task: () => Promise<unknown>) {
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
          : "Employer Learning request failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createCheckpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const checkpointType = String(
      form.get("checkpointType") ?? "acknowledgement",
    ) as EmployerLearningCheckpointType;
    const label = String(form.get("interactionLabel") ?? "").trim();

    await run("create-checkpoint", async () => {
      await requestJson(`${base}/checkpoints`, {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim() || null,
          prompt: String(form.get("prompt") ?? "").trim(),
          checkpointType,
          config: label ? { label } : {},
          required: form.get("required") === "on",
          weight: Number(form.get("weight") ?? 1),
        }),
      });
      formElement.reset();
    });
  }

  async function saveCheckpoint(
    event: FormEvent<HTMLFormElement>,
    checkpoint: EmployerLearningCheckpoint,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = String(form.get("interactionLabel") ?? "").trim();

    await run(`checkpoint-${checkpoint.checkpointId}`, () =>
      requestJson(
        `${base}/checkpoints/${encodeURIComponent(checkpoint.checkpointId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: String(form.get("title") ?? "").trim() || null,
            prompt: String(form.get("prompt") ?? "").trim(),
            checkpointType: String(form.get("checkpointType") ?? checkpoint.checkpointType),
            config: label ? { label } : {},
            required: form.get("required") === "on",
            weight: Number(form.get("weight") ?? 1),
          }),
        },
      ),
    );
  }

  async function deleteCheckpoint(checkpointId: string) {
    if (!window.confirm("Delete this checkpoint from the current course version?")) {
      return;
    }
    await run(`delete-${checkpointId}`, () =>
      requestJson(
        `${base}/checkpoints/${encodeURIComponent(checkpointId)}`,
        { method: "DELETE" },
      ),
    );
  }

  async function reorderCheckpoint(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= course.checkpoints.length) return;
    const ids = move(course.checkpoints, index, target).map(
      (checkpoint) => checkpoint.checkpointId,
    );
    await run("checkpoint-order", () =>
      requestJson(`${base}/checkpoints`, {
        method: "PUT",
        body: JSON.stringify({ checkpointIds: ids }),
      }),
    );
  }

  async function saveRequirements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next: EmployerLearningPassingRequirement = {
      completionRuleVersion: 1,
      checkpointMode:
        String(form.get("checkpointMode")) === "weighted_percent"
          ? "weighted_percent"
          : "all_required",
      minimumCheckpointPercent: Number(
        form.get("minimumCheckpointPercent") ?? 100,
      ),
      requireAllRequiredLessons:
        form.get("requireAllRequiredLessons") === "on",
      requireAllRequiredAssessments:
        form.get("requireAllRequiredAssessments") === "on",
    };

    await run("requirements", () =>
      requestJson(`${base}/requirements`, {
        method: "PUT",
        body: JSON.stringify({
          requirement: next,
          companyBadgeId: course.currentVersion.companyBadgeId,
          certificationDefinitionId:
            course.currentVersion.certificationDefinitionId,
        }),
      }),
    );
  }

  const safePrimaryUrl =
    course.resourceSummary.primaryContentUrl &&
    /^https?:\/\//i.test(course.resourceSummary.primaryContentUrl)
      ? course.resourceSummary.primaryContentUrl
      : null;

  return (
    <div className="txk-checkpoint-workspace">
      {error ? <div className="alert">{error}</div> : null}

      {immutable && canManage ? (
        <RoleViewBanner title="Published requirements are locked">
          Create a new draft version from Overview before changing checkpoints
          or completion requirements.
        </RoleViewBanner>
      ) : null}

      <section
        className="txk-metric-grid txk-checkpoint-metrics"
        aria-label="Module detail summary"
      >
        <MetricCard
          label="Checkpoints"
          value={course.checkpoints.length}
          detail={`${requiredCheckpointCount} required`}
        />
        <MetricCard
          label="Checkpoint weight"
          value={totalWeight}
          detail={requirement.checkpointMode.replaceAll("_", " ")}
        />
        <MetricCard
          label="Assessments"
          value={course.assessmentSummary.length}
          detail="Summary only in W11-05"
        />
        <MetricCard
          label="Completion"
          value={course.metrics.completionRate + "%"}
          detail={`${course.metrics.completedCount} completed`}
        />
      </section>

      <div className="txk-module-detail-grid">
        <Card>
          <p className="txk-eyebrow">Module detail</p>
          <h2>Field-readiness context</h2>
          <dl className="txk-module-detail-list">
            <div>
              <dt>Learning objective</dt>
              <dd>{course.currentVersion.learningObjective || "Not configured"}</dd>
            </div>
            <div>
              <dt>Primary content</dt>
              <dd>
                <span>{course.currentVersion.contentType || "Not configured"}</span>
                {safePrimaryUrl ? (
                  <a href={safePrimaryUrl} target="_blank" rel="noreferrer">
                    Open resource
                    <ArrowTopRightOnSquareIcon aria-hidden="true" />
                  </a>
                ) : course.resourceSummary.primaryContentUrl ? (
                  <small>Stored resource URL is not rendered as an external link.</small>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Equipment / process context</dt>
              <dd>{course.currentVersion.equipmentProcessContext || "Not configured"}</dd>
            </div>
            <div>
              <dt>Safety notes</dt>
              <dd>{course.currentVersion.safetyNotes || "Not configured"}</dd>
            </div>
            <div>
              <dt>Company Badge</dt>
              <dd>{course.companyBadge?.title || "Not linked"}</dd>
            </div>
            <div>
              <dt>Employer Certification</dt>
              <dd>{course.certification?.title || "Not linked"}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className="txk-inline-heading">
            <div>
              <p className="txk-eyebrow">Content resources</p>
              <h2>Lesson resources</h2>
            </div>
            <StatusBadge tone="neutral">
              {course.resourceSummary.resources.length}
            </StatusBadge>
          </div>
          {course.resourceSummary.resources.length ? (
            <div className="txk-resource-summary-list">
              {course.resourceSummary.resources.slice(0, 8).map((resource) => (
                <div key={resource.lessonBlockId}>
                  <strong>{resource.title || resource.blockType.replaceAll("_", " ")}</strong>
                  <span>{resource.lessonTitle}</span>
                  <small>{resource.blockType.replaceAll("_", " ")}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No linked lesson resources"
              description="Add video, image, document, link, embed, download, or button resources in Lesson Editor."
            />
          )}
        </Card>
      </div>

      <section className="txk-section">
        <div className="txk-section-heading">
          <div>
            <p className="txk-eyebrow">Interactive checkpoints</p>
            <h2>Course checkpoints</h2>
            <p>
              Checkpoints are simple course interactions. Full quizzes,
              questions, scoring, and answer keys are managed separately by the
              Assessment Builder.
            </p>
          </div>
          <StatusBadge tone="info">
            {requiredCheckpointCount} required
          </StatusBadge>
        </div>

        <div className="txk-checkpoint-list">
          {course.checkpoints.map((checkpoint, index) => (
            <Card className="txk-checkpoint-card" key={checkpoint.checkpointId}>
              <div className="txk-checkpoint-card-head">
                <div className="txk-checkpoint-sequence">{index + 1}</div>
                <div>
                  <strong>{checkpoint.title || `Checkpoint ${index + 1}`}</strong>
                  <span>
                    {checkpointLabel(checkpoint.checkpointType)} · Weight{" "}
                    {checkpoint.weight}
                  </span>
                </div>
                <StatusBadge tone={checkpoint.required ? "info" : "neutral"}>
                  {checkpoint.required ? "Required" : "Optional"}
                </StatusBadge>
              </div>

              <details className="txk-authoring-details">
                <summary>Checkpoint settings</summary>
                <form
                  className="txk-form-stack"
                  onSubmit={(event) => saveCheckpoint(event, checkpoint)}
                >
                  <div className="txk-form-grid-2">
                    <FormField label="Title">
                      <Input
                        name="title"
                        defaultValue={checkpoint.title ?? ""}
                        disabled={!canEdit}
                      />
                    </FormField>
                    <FormField label="Interaction type">
                      <select
                        className="txk-input"
                        name="checkpointType"
                        defaultValue={checkpoint.checkpointType}
                        disabled={!canEdit}
                      >
                        <option value="acknowledgement">Acknowledgement</option>
                        <option value="confirmation">Confirmation</option>
                        <option value="reflection">Reflection</option>
                      </select>
                    </FormField>
                  </div>
                  <FormField label="Prompt">
                    <Textarea
                      name="prompt"
                      defaultValue={checkpoint.prompt}
                      required
                      disabled={!canEdit}
                    />
                  </FormField>
                  <div className="txk-form-grid-2">
                    <FormField
                      label="Interaction label"
                      help="Optional learner-facing button or confirmation label."
                    >
                      <Input
                        name="interactionLabel"
                        defaultValue={String(checkpoint.config.label ?? "")}
                        disabled={!canEdit}
                      />
                    </FormField>
                    <FormField label="Weight">
                      <Input
                        name="weight"
                        type="number"
                        min="0"
                        max="1000"
                        step="0.1"
                        defaultValue={checkpoint.weight}
                        disabled={!canEdit}
                      />
                    </FormField>
                  </div>
                  <label className="txk-check-field">
                    <input
                      name="required"
                      type="checkbox"
                      defaultChecked={checkpoint.required}
                      disabled={!canEdit}
                    />
                    <span>Required checkpoint</span>
                  </label>

                  {canEdit ? (
                    <div className="txk-form-actions">
                      <Button type="submit" tone="primary" disabled={Boolean(busy)}>
                        Save checkpoint
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={index === 0 || Boolean(busy)}
                        onClick={() => reorderCheckpoint(index, -1)}
                      >
                        <ArrowUpIcon aria-hidden="true" />
                        Up
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          index === course.checkpoints.length - 1 ||
                          Boolean(busy)
                        }
                        onClick={() => reorderCheckpoint(index, 1)}
                      >
                        <ArrowDownIcon aria-hidden="true" />
                        Down
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        tone="danger"
                        disabled={Boolean(busy)}
                        onClick={() => deleteCheckpoint(checkpoint.checkpointId)}
                      >
                        <TrashIcon aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </form>
              </details>
            </Card>
          ))}
        </div>

        {canEdit ? (
          <Card className="txk-new-checkpoint-card">
            <p className="txk-eyebrow">Add checkpoint</p>
            <h3>New interactive checkpoint</h3>
            <form className="txk-form-stack" onSubmit={createCheckpoint}>
              <div className="txk-form-grid-2">
                <FormField label="Title">
                  <Input name="title" />
                </FormField>
                <FormField label="Interaction type">
                  <select
                    className="txk-input"
                    name="checkpointType"
                    defaultValue="acknowledgement"
                  >
                    <option value="acknowledgement">Acknowledgement</option>
                    <option value="confirmation">Confirmation</option>
                    <option value="reflection">Reflection</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Prompt">
                <Textarea name="prompt" required />
              </FormField>
              <div className="txk-form-grid-2">
                <FormField label="Interaction label">
                  <Input
                    name="interactionLabel"
                    placeholder="I acknowledge"
                  />
                </FormField>
                <FormField label="Weight">
                  <Input
                    name="weight"
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    defaultValue="1"
                  />
                </FormField>
              </div>
              <label className="txk-check-field">
                <input name="required" type="checkbox" defaultChecked />
                <span>Required checkpoint</span>
              </label>
              <Button type="submit" tone="primary" disabled={Boolean(busy)}>
                <PlusIcon aria-hidden="true" />
                Add checkpoint
              </Button>
            </form>
          </Card>
        ) : null}
      </section>

      <section className="txk-section txk-requirements-grid">
        <Card>
          <div className="txk-inline-heading">
            <div>
              <p className="txk-eyebrow">Passing requirement</p>
              <h2>Deterministic completion rules</h2>
            </div>
            <ShieldCheckIcon className="txk-requirements-icon" aria-hidden="true" />
          </div>

          <form className="txk-form-stack" onSubmit={saveRequirements}>
            <FormField
              label="Checkpoint rule"
              help="Required checkpoints always remain mandatory. Weighted mode additionally requires the configured percentage of total checkpoint weight."
            >
              <select
                className="txk-input"
                name="checkpointMode"
                defaultValue={requirement.checkpointMode}
                disabled={!canEdit}
              >
                <option value="all_required">Complete all required checkpoints</option>
                <option value="weighted_percent">Required checkpoints + weighted threshold</option>
              </select>
            </FormField>

            <FormField label="Minimum checkpoint percentage">
              <Input
                name="minimumCheckpointPercent"
                type="number"
                min="0"
                max="100"
                step="1"
                defaultValue={requirement.minimumCheckpointPercent}
                disabled={!canEdit}
              />
            </FormField>

            <label className="txk-check-field">
              <input
                name="requireAllRequiredLessons"
                type="checkbox"
                defaultChecked={requirement.requireAllRequiredLessons}
                disabled={!canEdit}
              />
              <span>Require all required lessons</span>
            </label>

            <label className="txk-check-field">
              <input
                name="requireAllRequiredAssessments"
                type="checkbox"
                defaultChecked={requirement.requireAllRequiredAssessments}
                disabled={!canEdit}
              />
              <span>Require all required assessments</span>
            </label>

            {canEdit ? (
              <Button type="submit" tone="primary" disabled={Boolean(busy)}>
                <CheckCircleIcon aria-hidden="true" />
                Save completion rules
              </Button>
            ) : null}
          </form>
        </Card>

        <Card>
          <p className="txk-eyebrow">Assessment summary</p>
          <h2>Version assessments</h2>
          {course.assessmentSummary.length ? (
            <div className="txk-assessment-summary-list">
              {course.assessmentSummary.map((assessment) => (
                <div key={assessment.assessmentId}>
                  <div>
                    <strong>{assessment.title}</strong>
                    <span>
                      {assessment.assessmentType.replaceAll("_", " ")} ·{" "}
                      {assessment.questionCount} questions
                    </span>
                  </div>
                  <div>
                    <strong>{assessment.passingScore}%</strong>
                    <small>{assessment.required ? "Required" : "Optional"}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No assessments configured"
              description="W11-05A adds assessment and question authoring. This page intentionally exposes summary metadata only and never answer keys."
            />
          )}
        </Card>
      </section>
    </div>
  );
}
