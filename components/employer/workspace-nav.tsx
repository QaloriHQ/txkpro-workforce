"use client";

import Link from "next/link";
import { useState } from "react";

type EmployerSection =
  | "overview"
  | "talent"
  | "saved"
  | "referrals"
  | "interviews"
  | "pipeline"
  | "placements";

const items = [
  ["overview", "/employer", "Overview"],
  ["talent", "/employer/talent", "Talent"],
  ["saved", "/employer/saved", "Saved"],
  ["referrals", "/employer/referrals", "Referrals"],
  ["interviews", "/employer/interviews", "Interviews"],
  ["pipeline", "/employer/pipeline", "Hiring Pipeline"],
  ["placements", "/employer/placements", "Placements"],
] as const;

export function EmployerWorkspaceNav({
  active,
}: {
  active?: EmployerSection;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="employer-mobile-menu"
        type="button"
        aria-expanded={open}
        aria-controls="employer-workspace-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close" : "Menu"}
      </button>

      <nav
        id="employer-workspace-navigation"
        className={`employer-sidebar ${open ? "is-open" : ""}`}
        aria-label="Employer workspace"
      >
        <div className="employer-sidebar-heading">
          <span>Employer workspace</span>
          <strong>Workforce</strong>
          <small>Local hiring and placement operations</small>
        </div>

        <div className="employer-sidebar-links">
          {items.map(([key, href, label]) => (
            <Link
              className={`employer-sidebar-link ${active === key ? "active" : ""}`}
              href={href}
              key={key}
              aria-current={active === key ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <span>{label}</span>
              {active === key ? (
                <span className="employer-sidebar-current" aria-hidden="true" />
              ) : null}
            </Link>
          ))}
        </div>

        <div className="employer-sidebar-footer">
          <span className="employer-sidebar-status" aria-hidden="true" />
          <div>
            <strong>TXKPRO Workforce</strong>
            <small>Verified talent · human hiring decisions</small>
          </div>
        </div>
      </nav>

      <button
        className={`employer-sidebar-backdrop ${open ? "is-open" : ""}`}
        type="button"
        aria-label="Close Employer navigation"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />
    </>
  );
}
