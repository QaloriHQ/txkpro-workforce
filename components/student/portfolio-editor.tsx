"use client";
import Image from "next/image";
import { FileCard, ProjectDescription, SkillPills, portfolioFileUrl } from "./portfolio-cards";
import { useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceForm } from "@/components/design-system/action-modal";
import type {
  PortfolioProject,
  StudentPortfolio,
  PortfolioFile,
} from "@/lib/student-portfolio/types";

type EditorAction = {
  url?: string;
  method?: string;
  upload?: boolean;
  resetOnSave?: boolean;
  input?: (data: FormData) => Record<string, unknown>;
};
function EditModal({
  title,
  trigger,
  children,
  action,
  onSaved,
}: {
  title: string;
  trigger?: string;
  children: ReactNode;
  action: EditorAction;
  onSaved: (data: StudentPortfolio) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback("");
    const formElement = event.currentTarget;
    try {
      const form = new FormData(formElement);
      const result = await fetch(action.url || "/api/student/portfolio", {
        method: action.method || "PUT",
        headers: action.upload
          ? undefined
          : { "Content-Type": "application/json" },
        body:
          action.method === "DELETE"
            ? undefined
            : action.upload
              ? form
              : JSON.stringify(action.input?.(form)),
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "Could not save.");
      if (action.resetOnSave) formElement.reset();
      onSaved(data);
      setFeedback(
        data.cleanupPending
          ? "Removed from your portfolio. Storage cleanup is pending."
          : "Saved. You can close this window.",
      );
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceForm
      modalTitle={title}
      triggerLabel={trigger || title}
      onSubmit={submit}
      busy={busy}
      feedback={feedback ? <p role="status">{feedback}</p> : null}
    >
      <fieldset disabled={busy} className="portfolio-fieldset">
        {children}
        <button className="button button-brand" type="submit">
          {busy ? "Saving…" : action.method === "DELETE" ? "Remove" : "Save"}
        </button>
      </fieldset>
    </WorkspaceForm>
  );
}
function ProjectFields({
  project,
  portfolio,
}: {
  project?: PortfolioProject;
  portfolio: StudentPortfolio;
}) {
  return (
    <>
      <label>
        Project title
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={project?.title || ""}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          maxLength={3000}
          rows={5}
          defaultValue={project?.description || ""}
        />
      </label>
      <fieldset className="portfolio-fieldset"><legend>Skills demonstrated (up to 3)</legend><p className="muted">Student-entered claims. One skill per field; no commas.</p>{[0, 1, 2].map(index => <label key={index}>Skill {index + 1}<input name={`skill${index}`} maxLength={60} pattern="[^,]*" defaultValue={project?.skills.split(",")[index]?.trim() || ""} /></label>)}</fieldset>
      <label>
        Project image
        <select name="imageId" defaultValue={project?.imageId || ""}>
          <option value="">No image</option>
          {portfolio.files
            .filter((f) => f.kind === "project")
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.title} ({f.access})
              </option>
            ))}
        </select>
      </label>
      <p className="muted">
        Upload a Project image first. It must also have Public file access to
        appear on a public project.
      </p>
      <label>
        Visibility
        <select
          name="visibility"
          defaultValue={project?.visibility || "private"}
        >
          <option value="private">Private</option>
          <option value="public">Public when profile is published</option>
        </select>
      </label>
      <p className="muted">
        Your project and skill descriptions are labeled Student-entered.
      </p>
    </>
  );
}
function FileEditor({
  file,
  onSaved,
}: {
  file: PortfolioFile;
  onSaved: (p: StudentPortfolio) => void;
}) {
  return (
    <EditModal
      title={`Manage ${file.title}`}
      trigger="Manage file"
      onSaved={onSaved}
      action={{
        input: (d) => ({
          op: "file_update",
          id: file.id,
          title: d.get("title"),
          access: d.get("access"),
        }),
      }}
    >
      <label>
        Title
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={file.title}
        />
      </label>
      <label>
        Who can access this file?
        <select name="access" defaultValue={file.access}>
          <option value="private">Only me</option>
          <option value="employer">Authorized employers</option>
          <option value="public">Anyone while my profile is public</option>
        </select>
      </label>
      <p className="muted">
        Employer access requires existing talent scope and your discovery
        consent. Public files are accessible to anyone; review documents for
        contact details before sharing.
      </p>
    </EditModal>
  );
}
export function PortfolioEditor({ initial, section = "all" }: { initial: StudentPortfolio; section?: "all" | "projects" | "files" | "settings" | "images" }) {
  const [portfolio, setPortfolio] = useState(initial);
  const [previousInitial, setPreviousInitial] = useState(initial);
  if (previousInitial !== initial) { setPreviousInitial(initial); setPortfolio(initial); }
  const [savedNotice, setSavedNotice] = useState("");
  const [newProjectId, setNewProjectId] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const saved = (data: StudentPortfolio) => {
    setSavedNotice("Portfolio saved.");
    setPortfolio(data);
    setNewProjectId(crypto.randomUUID());
    router.refresh();
  };
  const projectInput = (d: FormData, id?: string) => ({
    op: "project_save",
    id,
    title: d.get("title"),
    description: d.get("description"),
    skills: [0, 1, 2].map(i => String(d.get(`skill${i}`) || "").trim()).filter(Boolean).join(", "),
    imageId: d.get("imageId"),
    visibility: d.get("visibility"),
  });
  const prefs = portfolio.preferences;
  return (
    <section className="card portfolio-editor">
      {savedNotice ? <p role="status">{savedNotice}</p> : null}
      {section === "all" ? <div className="card-header">
        <div>
          <p className="eyebrow">Make it yours</p>
          <h2>Resume & portfolio</h2>
          <p className="card-sub">
            New uploads and projects start private. You choose what to share.
          </p>
        </div>
      </div> : null}
      <div className="portfolio-actions">
        {section === "settings" || section === "images" || section === "all" ? <EditModal
          title={section === "images" ? "Edit profile images" : "Profile appearance & sharing"}
          onSaved={saved}
          action={{
            input: (d) => ({
              op: "preferences",
              rankingScope: section === "images" ? prefs.rankingScope : d.get("rankingScope"),
              photoId: d.get("photoId"),
              coverId: d.get("coverId"),
              ...Object.fromEntries(
                [
                  "showSkills",
                  "showTraining",
                  "showBadges",
                  "showCertifications",
                  "showProgress",
                ].map((k) => [k, section === "images" ? prefs[k as "showSkills"] : d.get(k) === "on"]),
              ),
            }),
          }}
        >
          <label>
            Profile photo
            <select name="photoId" defaultValue={prefs.photoId || ""}>
              <option value="">No photo</option>
              {portfolio.files
                .filter((f) => f.kind === "photo")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} ({f.access})
                  </option>
                ))}
            </select>
          </label>
          <label>
            Cover image
            <select name="coverId" defaultValue={prefs.coverId || ""}>
              <option value="">No cover</option>
              {portfolio.files
                .filter((f) => f.kind === "cover")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} ({f.access})
                  </option>
                ))}
            </select>
          </label>
          <p className="muted">
            Upload photos first, then select them here. A selected image appears
            publicly only when its file access is Public.
          </p>
          {section !== "images" ? <>
          <h3>Public profile sections</h3>
          {(
            [
              ["showSkills", "Instructor Verified Skills"],
              ["showTraining", "Completed Employer Training"],
              ["showBadges", "Company Badges"],
              ["showCertifications", "Employer Certifications"],
              ["showProgress", "Progress & rankings when available"],
            ] as const
          ).map(([key, label]) => (
            <label className="portfolio-checkbox" key={key}>
              <input type="checkbox" name={key} defaultChecked={prefs[key]} />
              {label}
            </label>
          ))}
          <label>
            Default ranking
            <select name="rankingScope" defaultValue={prefs.rankingScope}>
              <option value="cohort">Cohort</option>
              <option value="institution">Institution</option>
              <option value="txkpro">TXKPRO</option>
            </select>
          </label>
          </> : null}
        </EditModal> : null}
        {section === "files" || section === "all" ? <EditModal
          title="Upload a file"
          onSaved={saved}
          action={{
            url: "/api/student/portfolio/files",
            method: "POST",
            upload: true,
            resetOnSave: true,
          }}
        >
          <label>
            Title
            <input name="title" required maxLength={120} />
          </label>
          <label>
            File type
            <select name="kind" defaultValue="resume">
              <option value="resume">Resume</option>
              <option value="certificate">Certificate</option>
              <option value="document">Document</option>
              <option value="photo">Profile photo</option>
              <option value="cover">Cover image</option>
              <option value="project">Project image</option>
            </select>
          </label>
          <label>
            Choose file
            <input
              name="file"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
            />
          </label>
          <p className="muted">
            JPEG, PNG, WebP, PDF or plain text. Maximum 10 MB per file, 40 files
            / 200 MB total. Uploads are private until you change access.
            Uploaded certificates are labeled Student-uploaded.
          </p>
        </EditModal> : null}
        {section === "projects" || section === "all" ? <EditModal
          title="Add a project"
          onSaved={saved}
          action={{
            resetOnSave: true,
            input: (d) => projectInput(d, newProjectId),
          }}
        >
          <ProjectFields portfolio={portfolio} />
        </EditModal> : null}
      </div>
      {section === "projects" || section === "all" ? <>
      <h2>My projects</h2>
      {portfolio.projects.length ? (
        <div className="portfolio-grid">
          {portfolio.projects.map((p) => (
            <article className="portfolio-item" key={p.id}>
              {p.imageId ? <div className="portfolio-project-image"><Image src={`/api/student/portfolio/files/${encodeURIComponent(p.imageId)}`} alt={p.title} width={600} height={360} unoptimized /></div> : null}
              <h4>{p.title}</h4>
              <ProjectDescription text={p.description} />
              <SkillPills skills={p.skills} />
              <p className="muted">{p.visibility} · Student-entered</p>
              <details className="portfolio-item-menu"><summary aria-label={`Actions for ${p.title}`}>•••</summary><div className="portfolio-menu-options">
                <EditModal
                  title={`Edit ${p.title}`}
                  trigger="Edit project"
                  onSaved={saved}
                  action={{ input: (d) => projectInput(d, p.id) }}
                >
                  <ProjectFields project={p} portfolio={portfolio} />
                </EditModal>
                <EditModal
                  title={`Remove ${p.title}`}
                  trigger="Remove project"
                  onSaved={saved}
                  action={{ input: () => ({ op: "project_delete", id: p.id }) }}
                >
                  <p>Remove this project from your portfolio?</p>
                </EditModal>
              </div></details>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty">Add a project to showcase your work.</p>
      )}
      </> : null}
      {section === "files" || section === "all" ? <>
      <h2>My files</h2>
      {portfolio.files.length ? (
        <div className="portfolio-file-gallery">
          {portfolio.files.map((f) => (
            <article className="portfolio-item" key={f.id}>
              <FileCard file={f} />
              <small className="muted">{f.access === "employer" ? "Authorized employers" : f.access}</small>
              <details className="portfolio-item-menu"><summary aria-label={`Actions for ${f.title}`}>•••</summary><div className="portfolio-menu-options">
                <a href={portfolioFileUrl(f.id)} download>Download</a>
                <FileEditor file={f} onSaved={saved} />
                <EditModal
                  title={`Remove ${f.title}`}
                  trigger="Remove file"
                  onSaved={saved}
                  action={{
                    url: `/api/student/portfolio/files/${f.id}`,
                    method: "DELETE",
                  }}
                >
                  <p>
                    Remove this file? It will also be removed from your selected
                    images and projects.
                  </p>
                </EditModal>
              </div></details>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty">
          Upload a resume, certificate, or photo to get started.
        </p>
      )}
      </> : null}
    </section>
  );
}
