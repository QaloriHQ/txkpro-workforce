"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AcademicCapIcon,
  Bars3Icon,
  ClipboardDocumentCheckIcon,
  HomeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

type InstitutionSection = "overview" | "learning" | "assignments";

export function InstitutionWorkspaceNav({
  active,
  institutionName,
}: {
  active?: InstitutionSection;
  institutionName: string;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    {
      key: "overview" as const,
      href: "/institution/learning",
      label: "Overview",
      icon: HomeIcon,
    },
    {
      key: "learning" as const,
      href: "/institution/learning",
      label: "Employer Training",
      icon: AcademicCapIcon,
    },
    {
      key: "assignments" as const,
      href: "/institution/learning/assignments",
      label: "Assignments",
      icon: ClipboardDocumentCheckIcon,
    },
  ];

  return (
    <>
      <button
        className="institution-mobile-menu"
        type="button"
        aria-label={open ? "Close Institution menu" : "Open Institution menu"}
        aria-expanded={open}
        aria-controls="institution-workspace-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <XMarkIcon aria-hidden="true" /> : <Bars3Icon aria-hidden="true" />}
      </button>

      <nav
        id="institution-workspace-navigation"
        className={`institution-sidebar ${open ? "is-open" : ""}`}
        aria-label="Institution workspace"
      >
        <div className="institution-sidebar-heading">
          <span>Workforce</span>
          <strong>Institution workspace</strong>
          <small>{institutionName}</small>
        </div>

        <div className="institution-sidebar-links">
          <span className="institution-nav-label">Workforce Readiness</span>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`institution-sidebar-link ${
                  active === item.key ? "active" : ""
                }`}
                aria-current={active === item.key ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon className="institution-sidebar-icon" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="institution-sidebar-footer">
          <span className="institution-sidebar-status" aria-hidden="true" />
          <div>
            <strong>TXKPRO Workforce</strong>
            <small>Verified skills remain authoritative</small>
          </div>
        </div>
      </nav>

      <button
        className={`institution-sidebar-backdrop ${open ? "is-open" : ""}`}
        type="button"
        aria-label="Close Institution navigation"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />
    </>
  );
}
