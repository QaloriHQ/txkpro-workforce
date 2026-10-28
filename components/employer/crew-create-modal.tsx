"use client";

import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { WorkspaceForm } from "@/components/design-system/action-modal";
import {
  CheckField,
  EditorField,
} from "@/components/incentives/field-help";
import { editorHelp } from "@/lib/incentives/field-help";
import type {
  EmployerCrew,
  EmployerCrewPerson,
} from "@/lib/employer/crew-contracts";

export function CrewCreateModal({
  people,
  onCreated,
  triggerClassName,
}: {
  people: EmployerCrewPerson[];
  onCreated: (crew: EmployerCrew) => void | Promise<void>;
  triggerClassName?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberUserIds, setMemberUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(memberSearch.trim().toLowerCase());
  const visiblePeople = useMemo(
    () =>
      people.filter((person) =>
        `${person.name} ${person.role}`.toLowerCase().includes(deferredSearch),
      ),
    [people, deferredSearch],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setMessage("Enter a crew name.");
      return;
    }
    setBusy(true);
    setMessage("Creating crew…");
    try {
      const response = await fetch("/api/employer/crews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          memberUserIds,
        }),
      });
      const result = (await response.json()) as {
        crew?: EmployerCrew;
        error?: string;
      };
      if (!response.ok || !result.crew)
        throw new Error(result.error ?? "Unable to create crew.");
      await onCreated(result.crew);
      form.current?.closest("dialog")?.close();
      setName("");
      setDescription("");
      setMemberSearch("");
      setMemberUserIds([]);
      setMessage(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create crew.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceForm
      ref={form}
      modalTitle="Create crew"
      triggerLabel="Create crew"
      description="Create one reusable organization crew. Selecting members here does not enroll them in an incentive program."
      triggerClassName={triggerClassName}
      busy={busy}
      feedback={
        message ? (
          <div className="alert" role="status">
            {message}
          </div>
        ) : null
      }
      onSubmit={submit}
    >
      <EditorField label="Crew name" help={editorHelp("Crew name")}>
        <input
          value={name}
          maxLength={100}
          required
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </EditorField>
      <EditorField
        label="Crew description"
        help={editorHelp("Crew description")}
      >
        <textarea
          value={description}
          maxLength={500}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
        />
      </EditorField>
      <EditorField
        label="Find organization members"
        help={editorHelp("Find organization members")}
      >
        <input
          type="search"
          value={memberSearch}
          placeholder="Search by name or role"
          onChange={(event) => setMemberSearch(event.target.value)}
        />
      </EditorField>
      <fieldset className="employer-crew-member-picker">
        <legend>
          Members · {memberUserIds.length} selected
        </legend>
        {visiblePeople.map((person) => (
          <CheckField
            key={person.userId}
            label={`${person.name} · ${person.role.replaceAll("_", " ")}`}
            help={editorHelp("Organization crew membership")}
          >
            <input
              type="checkbox"
              checked={memberUserIds.includes(person.userId)}
              onChange={(event) =>
                setMemberUserIds((current) =>
                  event.target.checked
                    ? [...new Set([...current, person.userId])]
                    : current.filter((id) => id !== person.userId),
                )
              }
            />
          </CheckField>
        ))}
        {!visiblePeople.length ? (
          <p className="card-sub">
            No active directory members match this search. You can create an
            empty crew and add members in a future crew-management update.
          </p>
        ) : null}
      </fieldset>
      <button className="button button-dark" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create crew"}
      </button>
    </WorkspaceForm>
  );
}
