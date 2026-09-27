"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  AcademicCapIcon,
  Bars3Icon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  DocumentChartBarIcon,
  HomeIcon,
  RectangleGroupIcon,
  UserGroupIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export type InstitutionSection =
  | "dashboard"
  | "students"
  | "programs"
  | "readiness"
  | "learning"
  | "assignments"
  | "badges"
  | "employers"
  | "referrals"
  | "placements"
  | "retention"
  | "reports";

type Item = {
  key: InstitutionSection;
  href: string;
  label: string;
  icon: typeof HomeIcon;
};

const groups: Array<{ label: string; items: Item[] }> = [
  {
    label: "Workspace",
    items: [
      { key: "dashboard", href: "/institution", label: "Dashboard", icon: HomeIcon },
      { key: "students", href: "/institution/students", label: "Students", icon: UsersIcon },
      { key: "programs", href: "/institution/programs", label: "Programs & Cohorts", icon: RectangleGroupIcon },
    ],
  },
  {
    label: "Workforce Readiness",
    items: [
      { key: "readiness", href: "/institution/readiness", label: "Readiness", icon: CheckBadgeIcon },
      { key: "learning", href: "/institution/learning", label: "Employer Training", icon: AcademicCapIcon },
      { key: "assignments", href: "/institution/learning/assignments", label: "Assignments", icon: ClipboardDocumentCheckIcon },
      { key: "badges", href: "/institution/learning/badges", label: "Company Badges", icon: WrenchScrewdriverIcon },
    ],
  },
  {
    label: "Employer Connections",
    items: [
      { key: "employers", href: "/institution/employers", label: "Employers", icon: BuildingOffice2Icon },
      { key: "referrals", href: "/institution/referrals", label: "Referrals", icon: UserGroupIcon },
    ],
  },
  {
    label: "Outcomes",
    items: [
      { key: "placements", href: "/institution/placements", label: "Placements", icon: BriefcaseIcon },
      { key: "retention", href: "/institution/retention", label: "Retention", icon: ChartBarIcon },
      { key: "reports", href: "/institution/reports", label: "Reports", icon: DocumentChartBarIcon },
    ],
  },
];

export function InstitutionWorkspaceNav({
  active,
  institutionName,
  roleLabel,
  scopeLabel,
}: {
  active?: InstitutionSection;
  institutionName: string;
  roleLabel?: string;
  scopeLabel?: string;
}) {
  const [open, setOpen] = useState(false);

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
          <Link
            className="institution-sidebar-brand"
            href="/institution"
            aria-label="TXKPRO Workforce Institution dashboard"
            onClick={() => setOpen(false)}
          >
            <span className="brand-logo-wrap" aria-hidden="true">
              <Image
                className="brand-logo brand-logo-light"
                src="/txkpro-logo-light.svg"
                alt=""
                width={786}
                height={192}
                unoptimized
                priority
              />
              <Image
                className="brand-logo brand-logo-dark"
                src="/txkpro-logo-dark.svg"
                alt=""
                width={1575}
                height={385}
                unoptimized
                priority
              />
            </span>
          </Link>
          <div className="institution-sidebar-context">
            <span>Workforce</span>
            <strong>{institutionName}</strong>
            <small>
              {roleLabel ?? "Institution workspace"}
              {scopeLabel ? ` · ${scopeLabel}` : ""}
            </small>
          </div>
        </div>

        <div className="institution-sidebar-links">
          {groups.map((group) => (
            <div className="institution-nav-group" key={group.label}>
              <span className="institution-nav-label">{group.label}</span>
              {group.items.map((item) => {
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
          ))}
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
