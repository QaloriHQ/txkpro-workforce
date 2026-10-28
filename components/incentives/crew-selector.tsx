"use client";

import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ActionModal } from "@/components/design-system/action-modal";
import { CheckField, EditorField } from "@/components/incentives/field-help";
import { editorHelp } from "@/lib/incentives/field-help";
import type { EmployerCrew } from "@/lib/employer/crew-contracts";

export function CrewSelector({
  crews,
  selectedIds,
  maxSelected,
  onChange,
}: {
  crews: EmployerCrew[];
  selectedIds: string[];
  maxSelected: number;
  onChange: (ids: string[]) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(selectedIds);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const visible = useMemo(
    () =>
      crews.filter((crew) =>
        `${crew.name} ${crew.description ?? ""} ${crew.members
          .map((member) => member.name)
          .join(" ")}`
          .toLowerCase()
          .includes(deferredSearch),
      ),
    [crews, deferredSearch],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onChange(pending);
    form.current?.closest("dialog")?.close();
  }

  return (
    <ActionModal
      title="Select existing crews"
      triggerLabel="Select existing crews"
      description="Choose reusable organization crews. Program enrollment remains a separate step."
      triggerClassName="txk-button txk-button-default txk-button-md"
      onOpen={() => {
        setPending(selectedIds);
        setSearch("");
      }}
    >
      <form ref={form} onSubmit={submit}>
        <EditorField
          label="Find existing crews"
          help={editorHelp("Find existing crews")}
        >
          <input
            type="search"
            value={search}
            placeholder="Search crews or members"
            onChange={(event) => setSearch(event.target.value)}
          />
        </EditorField>
        <fieldset className="employer-crew-member-picker">
          <legend>
            Crews · {pending.length} of {maxSelected} selected
          </legend>
          {visible.map((crew) => (
            <CheckField
              key={crew.id}
              label={`${crew.name} · ${crew.memberCount} member${crew.memberCount === 1 ? "" : "s"}`}
              help={editorHelp("Existing crew selection")}
            >
              <input
                type="checkbox"
                checked={pending.includes(crew.id)}
                disabled={
                  !pending.includes(crew.id) && pending.length >= maxSelected
                }
                onChange={(event) =>
                  setPending((current) =>
                    event.target.checked
                      ? [...new Set([...current, crew.id])]
                      : current.filter((id) => id !== crew.id),
                  )
                }
              />
            </CheckField>
          ))}
          {!visible.length ? (
            <p className="card-sub">
              {crews.length
                ? "No crews match this search."
                : "No organization crews exist yet. Close this dialog and create one."}
            </p>
          ) : null}
        </fieldset>
        <button className="button button-dark" type="submit">
          Use selected crews
        </button>
      </form>
    </ActionModal>
  );
}
