"use client";

import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  Button,
  Card,
  FormField,
  IconButton,
  Input,
  Textarea,
} from "@/components/design-system";

export function CourseCreatePanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const durationRaw = String(form.get("durationMinutes") ?? "").trim();

    try {
      const response = await fetch("/api/employer/learning/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          learningObjective:
            String(form.get("learningObjective") ?? "").trim() || null,
          durationMinutes: durationRaw ? Number(durationRaw) : null,
          contentType: "mixed",
          status: "draft",
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        course?: { microCertId?: string };
      };
      if (!response.ok || !body.course?.microCertId) {
        throw new Error(body.error ?? "Unable to create course.");
      }
      router.push(
        `/employer/learning/${encodeURIComponent(body.course.microCertId)}`,
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create course.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button tone="primary" type="button" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden="true" />
        Create course
      </Button>
    );
  }

  return (
    <Card className="txk-create-course-panel">
      <div className="txk-inline-heading">
        <div>
          <p className="txk-eyebrow">New Micro-Certification</p>
          <h2>Create course</h2>
        </div>
        <IconButton label="Close create course" onClick={() => setOpen(false)}>
          <XMarkIcon aria-hidden="true" />
        </IconButton>
      </div>

      <form className="txk-form-stack" onSubmit={submit}>
        <FormField label="Course title">
          <Input name="title" required maxLength={200} autoFocus />
        </FormField>
        <FormField label="Description">
          <Textarea name="description" maxLength={4000} />
        </FormField>
        <FormField
          label="Learning objective"
          help="Describe the company-specific process or expectation this training prepares learners for."
        >
          <Textarea name="learningObjective" maxLength={4000} />
        </FormField>
        <FormField label="Estimated duration (minutes)">
          <Input name="durationMinutes" type="number" min="0" />
        </FormField>

        {error ? <div className="txk-form-error">{error}</div> : null}

        <div className="txk-form-actions">
          <Button type="submit" tone="primary" disabled={busy}>
            {busy ? "Creating…" : "Create draft course"}
          </Button>
          <Button type="button" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
