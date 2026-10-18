"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import {
  AcademicCapIcon,
  Bars3Icon,
  BookmarkIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  HomeIcon,
  PaperAirplaneIcon,
  QueueListIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  GlobeAltIcon,
  XMarkIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

type EmployerSection =
  | "overview"
  | "talent"
  | "saved"
  | "referrals"
  | "interviews"
  | "pipeline-builder"
  | "pipeline"
  | "jobs"
  | "placements"
  | "incentives"
  | "screening"
  | "learning"
  | "team"
  | "public-profile";

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
    label: "Programs",
    items: [
      {
        key: "incentives",
        href: "/employer/incentives",
        label: "Incentives",
        icon: AcademicCapIcon,
      },
    ],
  },
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
      { key: "jobs", href: "/employer/jobs", label: "Job listings", icon: BriefcaseIcon },
      {
        key: "screening",
        href: "/employer/screening",
        label: "Background checks",
        icon: ShieldCheckIcon,
      },
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
      {
        key: "team",
        href: "/employer/directory",
        label: "Directory",
        icon: UserGroupIcon,
      },
      {
        key: "public-profile",
        href: "/employer/public-profile",
        label: "Public profile",
        icon: GlobeAltIcon,
      },
    ],
  },
];

export function EmployerWorkspaceNav({ active }: { active?: EmployerSection }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pipelineExpanded, setPipelineExpanded] = useState(active === "pipeline" || active === "pipeline-builder");
  useEffect(() => {
    if (!open) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

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
        className={`employer-sidebar ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
        aria-label="Employer workspace"
      >
        <div className="employer-sidebar-heading">
          <div className="employer-sidebar-identity">
            <span>Workforce</span>
            <strong>Employer workspace</strong>
            <small>Talent, learning and placement operations</small>
          </div>
          <button type="button" className="employer-sidebar-collapse" onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand Employer sidebar" : "Collapse Employer sidebar"}
            aria-expanded={!collapsed} title={collapsed ? "Expand navigation" : "Collapse navigation"}>
            {collapsed ? <ChevronDoubleRightIcon aria-hidden="true" /> : <ChevronDoubleLeftIcon aria-hidden="true" />}
          </button>
          <button className="employer-sidebar-mobile-close" type="button" aria-label="Close Employer drawer" onClick={() => setOpen(false)}>
            <XMarkIcon aria-hidden="true" />
          </button>
        </div>

        <div className="employer-sidebar-links">
          <Link className="employer-sidebar-link employer-community-switch" href="/employer/community" onClick={() => setOpen(false)}>
            <UserGroupIcon className="employer-sidebar-icon" aria-hidden="true" />
            <span>Switch to Community</span>
          </Link>
          {groups.map((group) => (
            <div className="employer-nav-group" key={group.label}>
              <span className="employer-nav-label">{group.label}</span>
              {group.items.map((item) => {
                const IconComponent = item.icon;
                if (item.key === "pipeline") {
                  return <div className="employer-nav-parent" key={item.key}>
                    <div className="employer-nav-parent-row">
                      <Link
                        className={`employer-sidebar-link employer-nav-parent-link ${active === "pipeline" || active === "pipeline-builder" ? "active" : ""}`}
                        href={item.href} title={collapsed ? item.label : undefined}
                        aria-current={active === "pipeline" ? "page" : undefined}
                        onClick={() => setOpen(false)}>
                        <IconComponent className="employer-sidebar-icon" aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                      <button type="button" className="employer-nav-expand"
                        title="Show Hiring Pipeline subpages"
                        aria-label={pipelineExpanded ? "Collapse Hiring Pipeline subpages" : "Expand Hiring Pipeline subpages"}
                        aria-expanded={pipelineExpanded}
                        onClick={() => setPipelineExpanded((value) => !value)}>
                        {pipelineExpanded ? <ChevronDownIcon aria-hidden="true"/> : <ChevronRightIcon aria-hidden="true"/>}
                      </button>
                    </div>
                    {pipelineExpanded ? <Link
                      className={`employer-sidebar-link employer-nav-child ${active === "pipeline-builder" ? "active" : ""}`}
                      href="/employer/pipeline-builder" title={collapsed ? "Pipeline editor" : undefined}
                      aria-current={active === "pipeline-builder" ? "page" : undefined}
                      onClick={() => setOpen(false)}>
                      <QueueListIcon className="employer-sidebar-icon" aria-hidden="true" />
                      <span>Pipeline editor</span>
                    </Link> : null}
                  </div>;
                }
                return (
                  <Link className={`employer-sidebar-link ${active === item.key ? "active" : ""}`}
                    href={item.href} key={item.key} title={collapsed ? item.label : undefined}
                    aria-current={active === item.key ? "page" : undefined}
                    onClick={() => setOpen(false)}>
                    <IconComponent className="employer-sidebar-icon" aria-hidden="true" />
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
