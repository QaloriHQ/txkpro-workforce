"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { CommunityCreateMenu } from "@/components/community/community-create-menu";
import {
  BellIcon, CalendarDaysIcon, ChatBubbleLeftRightIcon, ChevronRightIcon,
  HomeIcon, IdentificationIcon, ShieldCheckIcon, Squares2X2Icon, UserGroupIcon,
  XMarkIcon, ChartBarSquareIcon,
} from "@heroicons/react/24/outline";

type Props = { name: string; workspaceHref: string; communityHref?: string; profileHref?: string | null; roleLabel?: string };

function defaults(workspaceHref: string) {
  if (workspaceHref === "/student") return { communityHref: "/student/community", profileHref: "/student/profile", roleLabel: "Student" };
  if (workspaceHref === "/institution") return { communityHref: "/institution/community", profileHref: "/professional/profile", roleLabel: "Institution faculty" };
  if (workspaceHref === "/employer") return { communityHref: "/employer/community", profileHref: null, roleLabel: "Employer" };
  return { communityHref: "/community", profileHref: "/professional/profile", roleLabel: "Member" };
}

export function CommunityHeader({ name, workspaceHref, communityHref, profileHref, roleLabel }: Props) {
  const fallback = defaults(workspaceHref);
  const homeHref = communityHref ?? fallback.communityHref;
  const profile = profileHref === undefined ? fallback.profileHref : profileHref;
  const label = roleLabel ?? fallback.roleLabel;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("") || "ME";
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const triggerElement = trigger.current;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.querySelector<HTMLElement>("a,button")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab" || !drawer.current) return;
      const items = [...drawer.current.querySelectorAll<HTMLElement>('a,button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener("keydown", keydown); triggerElement?.focus(); };
  }, [open]);

  const close = () => setOpen(false);
  const links = [
    { href: homeHref, label: "Community Home", icon: HomeIcon },
    { href: "/groups", label: "Groups", icon: UserGroupIcon },
    { href: "/events", label: "Events", icon: CalendarDaysIcon },
    { href: "/polls", label: "Polls", icon: ChartBarSquareIcon },
    { href: "/messages", label: "Messages", icon: ChatBubbleLeftRightIcon },
    { href: "/community/safety", label: "Safety & reports", icon: ShieldCheckIcon },
  ];

  return <>
    <header className="community-header">
      <Brand />
      <nav aria-label="Community actions">
        <CommunityCreateMenu viewerName={name} />
        <button className="community-icon-button" type="button" aria-label="Notifications"><BellIcon aria-hidden="true" /></button>
        <button ref={trigger} className="community-profile-trigger" type="button" aria-label={`Open profile menu for ${name}`} aria-expanded={open} aria-controls="community-profile-drawer" onClick={() => setOpen(true)}><span className="student-avatar" aria-hidden="true">{initials}</span></button>
      </nav>
    </header>
    <button className={`community-drawer-backdrop ${open ? "is-open" : ""}`} type="button" aria-label="Close profile menu" tabIndex={open ? 0 : -1} onClick={close} />
    <aside ref={drawer} id="community-profile-drawer" className={`community-profile-drawer ${open ? "is-open" : ""}`} aria-label="Community profile menu" aria-hidden={!open} inert={!open}>
      <button className="community-drawer-close" type="button" aria-label="Close profile menu" onClick={close}><XMarkIcon aria-hidden="true" /></button>
      <section className="community-profile-card"><span className="community-profile-avatar" aria-hidden="true">{initials}</span><div><strong>{name}</strong><span>{label}</span><small>Community mode</small></div></section>
      <Link className="community-mode-switch" href={workspaceHref} onClick={close}><Squares2X2Icon aria-hidden="true" /><span><strong>Return to Workspace</strong><small>Manage your work and tools</small></span><ChevronRightIcon aria-hidden="true" /></Link>
      <nav className="community-drawer-nav" aria-label="Community menu">{links.map(({ href, label: itemLabel, icon: Icon }) => <Link href={href} key={href} onClick={close}><Icon aria-hidden="true" /><span>{itemLabel}</span></Link>)}</nav>
      <div className="community-account-menu">
        {profile ? <Link href={profile} onClick={close}><IdentificationIcon aria-hidden="true" />My profile</Link> : null}
        <Link href="/account/authcard" onClick={close}><IdentificationIcon aria-hidden="true" />My AuthCard</Link>
        <div className="community-theme-row"><span>Appearance</span><ThemeToggle /></div>
        <SignOutButton className="community-signout" />
      </div>
    </aside>
  </>;
}
