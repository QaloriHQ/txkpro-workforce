"use client";

import {
  CheckCircleIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  Button,
  Card,
  FormField,
  Input,
  MetricCard,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import type {
  EmployerMicroCertAuthoringDetail,
  MicroCertStatus,
} from "@/lib/employer/learning-types";

const statuses: MicroCertStatus[] = [
  "draft",
  "in_production",
  "review",
  "ready",
  "live",
  "archived",
];

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Employer Learning request failed.");
  return body;
}

export function CourseOverviewWorkspace({
  course,
  canManage,
}: {
  course: EmployerMicroCertAuthoringDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const immutable =
    course.currentVersion.status === "live" ||
    course.currentVersion.status === "archived";
  const canEdit = canManage && !immutable;
  const base = `/api/employer/learning/courses/${encodeURIComponent(course.microCertId)}`;

  const activeLessons = course.lessons.filter((lesson) => lesson.status !== "archived");
  const totalMinutes = activeLessons.reduce(
    (sum, lesson) => sum + (lesson.estimatedMinutes ?? 0),
    0,
  );
  const issues = [
    !course.currentVersion.learningObjective
      ? "Add a course learning objective."
      : null,
    activeLessons.length === 0 ? "Add at least one lesson." : null,
    activeLessons.some((lesson) => lesson.blocks.length === 0)
      ? "One or more lessons have no content."
      : null,
    Object.keys(course.currentVersion.passingRequirement ?? {}).length === 0
      ? "Completion/passing requirements are not configured yet."
      : null,
  ].filter(Boolean) as string[];

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const duration = String(form.get("durationMinutes") ?? "").trim();
    setBusy("save");
    setError(null);
    try {
      await requestJson(base, {
        method: "PATCH",
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          learningObjective:
            String(form.get("learningObjective") ?? "").trim() || null,
          equipmentProcessContext:
            String(form.get("equipmentProcessContext") ?? "").trim() || null,
          safetyNotes: String(form.get("safetyNotes") ?? "").trim() || null,
          durationMinutes: duration ? Number(duration) : null,
          status: String(form.get("status") ?? "draft"),
          expectedVersionNumber: course.currentVersion.versionNumber,
        }),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save course.");
    } finally {
      setBusy(null);
    }
  }

  async function createVersion() {
    setBusy("version");
    setError(null);
    try {
      await requestJson(`${base}/versions`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create version.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="txk-authoring-layout">
      {error ? <div className="alert">{error}</div> : null}

      <section className="txk-metric-grid txk-course-overview-metrics">
        <MetricCard label="Version" value={course.currentVersion.versionNumber} detail={course.currentVersion.status.replaceAll("_", " ")} />
        <MetricCard label="Lessons" value={activeLessons.length} detail={`${course.sections.length} section${course.sections.length === 1 ? "" : "s"}`} />
        <MetricCard label="Duration" value={totalMinutes ? `${totalMinutes}m` : "—"} detail="Lesson estimates" />
        <MetricCard label="Assignments" value={course.metrics.assignmentCount} detail={`${course.metrics.completionRate}% completion`} />
      </section>

      <div className="txk-overview-grid">
        <Card>
          <div className="txk-inline-heading">
            <div>
              <p className="txk-eyebrow">Readiness</p>
              <h2>Course readiness</h2>
            </div>
            <StatusBadge tone={issues.length ? "warning" : "success"}>
              {issues.length ? `${issues.length} item${issues.length === 1 ? "" : "s"}` : "Ready"}
            </StatusBadge>
          </div>

          {issues.length ? (
            <ul className="txk-readiness-list">
              {issues.map((issue) => (
                <li key={issue}>
                  <ExclamationTriangleIcon aria-hidden="true" />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="txk-readiness-ok">
              <CheckCircleIcon aria-hidden="true" />
              <span>The current version has the core content needed for review.</span>
            </div>
          )}
        </Card>

        <Card>
          <p className="txk-eyebrow">Outcomes</p>
          <h2>Credentials & evidence</h2>
          <dl className="txk-overview-facts">
            <div><dt>Company Badge</dt><dd>{course.companyBadge?.title ?? "Not linked"}</dd></div>
            <div><dt>Formal certification</dt><dd>{course.currentVersion.certificationDefinitionId ? "Configured" : "Not configured"}</dd></div>
            <div><dt>Eligibility rules</dt><dd>{course.eligibility.length}</dd></div>
            <div><dt>Completions</dt><dd>{course.metrics.completedCount}</dd></div>
          </dl>
        </Card>
      </div>

      <details className="txk-collapsed-settings">
        <summary>
          <span>
            <strong>Course settings</strong>
            <small>Title, objectives, status, process context and safety notes</small>
          </span>
          <StatusBadge tone={course.currentVersion.status === "live" ? "success" : "neutral"}>
            {course.currentVersion.status.replaceAll("_", " ")}
          </StatusBadge>
        </summary>

        <div className="txk-collapsed-settings-body">
          {immutable && canManage ? (
            <div className="txk-version-lock">
              This published version is locked. Create a new draft version to revise it.
            </div>
          ) : null}

          <form className="txk-form-stack" onSubmit={saveCourse}>
            <div className="txk-form-grid-2">
              <FormField label="Course title">
                <Input name="title" defaultValue={course.title} required disabled={!canEdit} />
              </FormField>
              <FormField label="Version status">
                <select className="txk-input" name="status" defaultValue={course.currentVersion.status} disabled={!canManage}>
                  {statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Description">
              <Textarea name="description" defaultValue={course.description ?? ""} disabled={!canEdit} />
            </FormField>
            <FormField label="Learning objective">
              <Textarea name="learningObjective" defaultValue={course.currentVersion.learningObjective ?? ""} disabled={!canEdit} />
            </FormField>
            <div className="txk-form-grid-2">
              <FormField label="Equipment / process context">
                <Textarea name="equipmentProcessContext" defaultValue={course.currentVersion.equipmentProcessContext ?? ""} disabled={!canEdit} />
              </FormField>
              <FormField label="Safety notes">
                <Textarea name="safetyNotes" defaultValue={course.currentVersion.safetyNotes ?? ""} disabled={!canEdit} />
              </FormField>
            </div>
            <FormField label="Estimated duration (minutes)">
              <Input name="durationMinutes" type="number" min="0" defaultValue={course.currentVersion.durationMinutes ?? ""} disabled={!canEdit} />
            </FormField>
            {canManage ? (
              <div className="txk-form-actions">
                <Button tone="primary" type="submit" disabled={!canEdit || Boolean(busy)}>
                  {busy === "save" ? "Saving…" : "Save settings"}
                </Button>
                <Button type="button" onClick={createVersion} disabled={Boolean(busy)}>
                  <DocumentDuplicateIcon aria-hidden="true" />
                  {busy === "version" ? "Creating…" : "Create new version"}
                </Button>
              </div>
            ) : null}
          </form>
        </div>
      </details>
    </div>
  );
}
