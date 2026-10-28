"use client";

import { useState } from "react";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { CrewCreateModal } from "@/components/employer/crew-create-modal";
import type {
  EmployerCrew,
  EmployerCrewWorkspace,
} from "@/lib/employer/crew-contracts";

export function EmployerCrewDirectory({
  initialWorkspace,
}: {
  initialWorkspace: EmployerCrewWorkspace;
}) {
  const [crews, setCrews] = useState(initialWorkspace.crews);
  function addCrew(crew: EmployerCrew) {
    setCrews((current) =>
      [...current.filter((item) => item.id !== crew.id), crew].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  }
  return (
    <section className="employer-crew-directory" aria-labelledby="crew-heading">
      <div className="student-section-heading">
        <div>
          <p className="eyebrow">Reusable teams</p>
          <h2 id="crew-heading">Crews</h2>
          <p className="card-sub">
            Build organization crews once, then select them in incentive
            programs without recreating the roster.
          </p>
        </div>
        {initialWorkspace.canManage ? (
          <CrewCreateModal
            people={initialWorkspace.people}
            onCreated={addCrew}
          />
        ) : null}
      </div>
      {crews.length ? (
        <div className="employer-crew-grid">
          {crews.map((crew) => (
            <article className="employer-crew-card" key={crew.id}>
              <div className="employer-crew-card-heading">
                <UserGroupIcon width={22} aria-hidden="true" />
                <div>
                  <h3>{crew.name}</h3>
                  <p className="card-sub">
                    {crew.memberCount} member{crew.memberCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {crew.description ? <p>{crew.description}</p> : null}
              <p className="card-sub">
                {crew.members.length
                  ? crew.members
                      .slice(0, 4)
                      .map((member) => member.name)
                      .join(", ")
                  : "No members assigned yet"}
                {crew.members.length > 4
                  ? ` +${crew.members.length - 4} more`
                  : ""}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="employer-crew-empty">
          <UserGroupIcon width={28} aria-hidden="true" />
          <div>
            <h3>No crews yet</h3>
            <p className="card-sub">
              Create a crew to reuse its membership across incentive programs.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
