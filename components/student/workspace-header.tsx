"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AcademicCapIcon,
  BellIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  ChevronRightIcon,
  HomeIcon,
  IdentificationIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ForegroundVisit } from "@/components/pro-points/foreground-visit";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { ActionModal } from "@/components/design-system/action-modal";
import { SignOutButton } from "@/components/sign-out-button";
import { CommunityCreateMenu } from "@/components/community/community-create-menu";

type StudentHeaderMode = "workspace" | "community";

const workspaceLinks = [
  { href: "/student", label: "Workspace Home", icon: HomeIcon },
  { href: "/student/employer-training", label: "Training", icon: AcademicCapIcon },
  { href: "/student/opportunities", label: "Career", icon: BriefcaseIcon },
  { href: "/student/messages", label: "Messages", icon: ChatBubbleLeftRightIcon },
  { href: "/student/profile", label: "My profile", icon: IdentificationIcon },
];

const communityLinks = [
  { href: "/student/community", label: "Community Home", icon: HomeIcon },
  { href: "/groups", label: "Groups", icon: UserGroupIcon },
  { href: "/events", label: "Events", icon: CalendarDaysIcon },
  { href: "/polls", label: "Polls", icon: ChartBarSquareIcon },
  { href: "/student/messages", label: "Messages", icon: ChatBubbleLeftRightIcon },
  { href: "/community/safety", label: "Safety & reports", icon: ShieldCheckIcon },
];

export function StudentWorkspaceHeader({
  firstName,
  lastName,
  mode = "workspace",
}: {
  firstName: string;
  lastName: string;
  mode?: StudentHeaderMode;
}) {
  const name = [firstName, lastName].filter(Boolean).join(" ") || "Student";
  const initials = [firstName, lastName].map((part) => part?.trim().slice(0, 1)).join("") || "ME";
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const links = mode === "community" ? communityLinks : workspaceLinks;
  const switchHref = mode === "community" ? "/student" : "/student/community";
  const switchTitle = mode === "community" ? "Return to Workspace" : "Switch to Community";
  const switchHint = mode === "community" ? "Manage your training and career" : "Connect, share, and learn";

  useEffect(() => {
    if (!open) return;
    const triggerElement = trigger.current;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.querySelector<HTMLElement>("button,a")?.focus();

    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer.current) return;
      const items = [...drawer.current.querySelectorAll<HTMLElement>('a,button:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", keydown);
      triggerElement?.focus();
    };
  }, [open]);

  const close = () => setOpen(false);

  return <>
    <ForegroundVisit />
    <header className="student-prototype-header">
      <div className="student-prototype-brand"><Brand /></div>
      <div className="student-prototype-tools student-header-actions">
        {mode === "community" ? <div className="student-community-post-action"><CommunityCreateMenu viewerName={name} triggerText="Post" studentCompact /></div> : null}
        <ThemeToggle />
        <ActionModal title="Notifications" triggerLabel="Notifications" triggerContent={<BellIcon aria-hidden="true" />}>
          <p>Coming soon</p>
          <p className="muted">Review your current interview requests in Career and assigned courses in Training.</p>
          <Link className="button" href="/student/opportunities?view=interviews">View career activity</Link>
        </ActionModal>
        <button
          ref={trigger}
          className="student-profile-trigger"
          type="button"
          aria-label={`Open ${mode} menu for ${name}`}
          aria-expanded={open}
          aria-controls="student-profile-drawer"
          onClick={() => setOpen(true)}
        >
          <span className="student-avatar" aria-hidden="true">{initials}</span>
        </button>
      </div>
    </header>
    <button
      className={`student-drawer-backdrop ${open ? "is-open" : ""}`}
      type="button"
      aria-label="Close profile menu"
      tabIndex={open ? 0 : -1}
      onClick={close}
    />
    <aside
      ref={drawer}
      id="student-profile-drawer"
      className={`student-profile-drawer ${open ? "is-open" : ""}`}
      aria-label={`Student ${mode} menu`}
      aria-hidden={!open}
      inert={!open}
    >
      <button className="student-drawer-close" type="button" aria-label="Close profile menu" onClick={close}>
        <XMarkIcon aria-hidden="true" />
      </button>
      <section className="student-drawer-profile-card">
        <span className="student-drawer-avatar" aria-hidden="true">{initials}</span>
        <div><strong>{name}</strong><span>Student</span><small>{mode === "community" ? "Community mode" : "Workspace mode"}</small></div>
      </section>
      <Link className="student-mode-switch" href={switchHref} onClick={close}>
        <Squares2X2Icon aria-hidden="true" />
        <span><strong>{switchTitle}</strong><small>{switchHint}</small></span>
        <ChevronRightIcon aria-hidden="true" />
      </Link>
      <nav className="student-drawer-nav" aria-label={`Student ${mode} navigation`}>
        {links.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={close}><Icon aria-hidden="true" /><span>{label}</span></Link>)}
      </nav>
      <div className="student-drawer-account">
        <Link href="/account/authcard" onClick={close}><IdentificationIcon aria-hidden="true" />My AuthCard</Link>
        <div className="student-drawer-theme"><span>Appearance</span><ThemeToggle /></div>
        <SignOutButton className="student-drawer-signout" />
      </div>
    </aside>
  </>;
}
