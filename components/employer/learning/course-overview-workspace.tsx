"use client";

import { WorkspaceForm } from "@/components/design-system/action-modal";

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
  EmployerMicroCertModuleDetail,
  LearningPublicSettings,
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
  publicSettings,
}: {
  course: EmployerMicroCertModuleDetail;
  canManage: boolean;
  publicSettings?: LearningPublicSettings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publicationSaved, setPublicationSaved] = useState(false);
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
    course.checkpoints.length === 0
      ? "Add at least one interactive checkpoint."
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
          contentType: String(form.get("contentType") ?? "mixed"),
          contentUrl: String(form.get("contentUrl") ?? "").trim() || null,
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

  async function savePublication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("publication"); setError(null); setPublicationSaved(false);
    try {
      const isPublic = form.get("public") === "on";
      const slug = String(form.get("courseSlug") ?? "").trim();
      await requestJson(`${base}/public`, { method: "PATCH", body: JSON.stringify({
        employerSlug: String(form.get("employerSlug") ?? "").trim(), courseSlug: slug,
        publishEmployerPage: form.get("publishEmployerPage") === "on",
        expectedCurrentVersionId: course.currentVersionId,
        visibility: isPublic ? "public" : "private", publicationStatus: isPublic ? "published" : "unpublished",
        robotsIndex: form.get("index") === "on",
        seoTitle: String(form.get("seoTitle") ?? "").trim() || null,
        metaDescription: String(form.get("metaDescription") ?? "").trim() || null,
        lessons: course.lessons.filter(l => l.status !== "archived").map(l => ({
          lessonId: l.lessonId, slug: String(form.get(`slug:${l.lessonId}`) ?? "").trim(),
          visibility: form.get(`public:${l.lessonId}`) === "on" ? "public" : "private",
          publicationStatus: form.get(`public:${l.lessonId}`) === "on" ? "published" : "unpublished",
          robotsIndex: form.get(`index:${l.lessonId}`) === "on",
        })),
      }) });
      setPublicationSaved(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save publication settings."); }
    finally { setBusy(null); }
  }

  return (
    <div className="txk-authoring-layout">
      {error ? <div className="alert">{error}</div> : null}

      {canManage ? <Card>
        <h2>Public course page</h2>
        <p>Share the live course and selected lessons. Private media, assessments, and student completion records remain in assigned training.</p>
        {publicSettings?.course?.canonicalPath ? <p><a href={publicSettings.course.canonicalPath}>View public URL</a> · {publicSettings.course.visibility} / {publicSettings.course.publicationStatus}</p> : null}
        <WorkspaceForm modalTitle="Public page settings" triggerLabel="Manage public pages" busy={busy === "publication"} onSubmit={savePublication}
          description="Public courses need a published Employer Learning page showing your business name. Renaming a course or lesson preserves its previous URLs."
          feedback={<>{error ? <p role="alert">{error}</p> : null}{publicationSaved ? <p role="status">Public page settings saved.</p> : null}</>}>
          <FormField label="Employer URL slug"><Input name="employerSlug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} defaultValue={publicSettings?.employerSlug ?? ""} readOnly={Boolean(publicSettings?.employerSlug)} /></FormField>
          {!publicSettings?.employerPublished ? <label><input name="publishEmployerPage" type="checkbox" /> Publish Employer Learning page displaying our business name</label> : <p>Employer Learning page is published.</p>}
          <FormField label="Course URL slug"><Input name="courseSlug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} defaultValue={publicSettings?.course?.slug ?? ""} /></FormField>
          <label><input name="public" type="checkbox" defaultChecked={publicSettings?.course?.visibility === "public" && publicSettings?.course?.publicationStatus === "published"} /> Publish course publicly (requires a live version)</label>
          <label><input name="index" type="checkbox" defaultChecked={publicSettings?.course?.robotsIndex ?? false} /> Allow search engines to index this course</label>
          <FormField label="SEO title"><Input name="seoTitle" maxLength={200} defaultValue={publicSettings?.course?.seoTitle ?? ""} /></FormField>
          <FormField label="Search description"><Textarea name="metaDescription" maxLength={500} defaultValue={publicSettings?.course?.metaDescription ?? ""} /></FormField>
          <h3>Lesson publication</h3>
          {course.lessons.filter(l => l.status !== "archived").map(l => {
            const saved = publicSettings?.lessons.find(s => s.lessonId === l.lessonId);
            return <fieldset key={l.lessonId}><legend>{l.title} · {l.status}</legend>
              <FormField label="Lesson URL slug"><Input name={`slug:${l.lessonId}`} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} defaultValue={saved?.slug ?? l.lessonId.toLowerCase().replace(/[^a-z0-9-]/g, "-")} /></FormField>
              <label><input name={`public:${l.lessonId}`} type="checkbox" defaultChecked={saved?.visibility === "public" && saved?.publicationStatus === "published"} disabled={l.status === "draft"} /> Publish lesson publicly (requires ready or published state)</label>
              <label><input name={`index:${l.lessonId}`} type="checkbox" defaultChecked={saved?.robotsIndex ?? false} /> Allow search engines to index this lesson</label>
            </fieldset>;
          })}
          <Button type="submit" tone="primary" disabled={Boolean(busy)}>{busy === "publication" ? "Saving…" : "Save publication settings"}</Button>
        </WorkspaceForm>
      </Card> : null}

      <section className="txk-metric-grid txk-course-overview-metrics">
        <MetricCard label="Lessons" value={activeLessons.length} detail={`${course.sections.length} section${course.sections.length === 1 ? "" : "s"}`} />
        <MetricCard label="Checkpoints" value={course.checkpoints.length} detail={`${course.checkpoints.filter((checkpoint) => checkpoint.required).length} required`} />
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

          <WorkspaceForm feedback={error ? <div className="alert" role="alert">{error}</div> : null} modalTitle="Edit course" busy={Boolean(busy)} className="txk-form-stack" onSubmit={saveCourse}>
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
            <div className="txk-form-grid-2">
              <FormField label="Primary content type">
                <select
                  className="txk-input"
                  name="contentType"
                  defaultValue={course.currentVersion.contentType || "mixed"}
                  disabled={!canEdit}
                >
                  <option value="mixed">Mixed</option>
                  <option value="video">Video</option>
                  <option value="embed">Embed</option>
                  <option value="document">Document</option>
                  <option value="link">Link</option>
                </select>
              </FormField>
              <FormField label="Primary content URL">
                <Input
                  name="contentUrl"
                  type="url"
                  defaultValue={course.currentVersion.contentUrl ?? ""}
                  disabled={!canEdit}
                />
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
          </WorkspaceForm>
        </div>
      </details>
    </div>
  );
}
