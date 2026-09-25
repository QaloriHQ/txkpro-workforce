"use client";

import Link from "next/link";
import { useState, type ComponentType, type SVGProps } from "react";
import {
  AcademicCapIcon,
  Bars3Icon,
  BookmarkIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  HomeIcon,
  PaperAirplaneIcon,
  QueueListIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

type EmployerSection =
  | "overview"
  | "talent"
  | "saved"
  | "referrals"
  | "interviews"
  | "pipeline"
  | "placements"
  | "learning";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  key: EmployerSection;
  href: string;
  label: string;
  icon: Icon;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        key: "overview",
        href: "/employer",
        label: "Overview",
        icon: HomeIcon,
      },
    ],
  },
  {
    label: "Talent & Hiring",
    items: [
      {
        key: "talent",
        href: "/employer/talent",
        label: "Talent",
        icon: UserGroupIcon,
      },
      {
        key: "saved",
        href: "/employer/saved",
        label: "Saved",
        icon: BookmarkIcon,
      },
      {
        key: "referrals",
        href: "/employer/referrals",
        label: "Referrals",
        icon: PaperAirplaneIcon,
      },
      {
        key: "interviews",
        href: "/employer/interviews",
        label: "Interviews",
        icon: CalendarDaysIcon,
      },
      {
        key: "pipeline",
        href: "/employer/pipeline",
        label: "Hiring Pipeline",
        icon: QueueListIcon,
      },
      {
        key: "placements",
        href: "/employer/placements",
        label: "Placements",
        icon: BriefcaseIcon,
      },
    ],
  },
  {
    label: "Readiness & Outcomes",
    items: [
      {
        key: "learning",
        href: "/employer/learning",
        label: "Employer Learning",
        icon: AcademicCapIcon,
      },
    ],
  },
];

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
        aria-label={open ? "Close Employer menu" : "Open Employer menu"}
        aria-expanded={open}
        aria-controls="employer-workspace-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <XMarkIcon aria-hidden="true" />
        ) : (
          <Bars3Icon aria-hidden="true" />
        )}
      </button>

      <nav
        id="employer-workspace-navigation"
        className={`employer-sidebar ${open ? "is-open" : ""}`}
        aria-label="Employer workspace"
      >
        <div className="employer-sidebar-heading">
          <span>Workforce</span>
          <strong>Employer workspace</strong>
          <small>Talent, learning and placement operations</small>
        </div>

        <div className="employer-sidebar-links">
          {groups.map((group) => (
            <div className="employer-nav-group" key={group.label}>
              <span className="employer-nav-label">{group.label}</span>
              {group.items.map((item) => {
                const IconComponent = item.icon;
                return (
                  <Link
                    className={`employer-sidebar-link ${active === item.key ? "active" : ""}`}
                    href={item.href}
                    key={item.key}
                    aria-current={active === item.key ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <IconComponent
                      className="employer-sidebar-icon"
                      aria-hidden="true"
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
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
