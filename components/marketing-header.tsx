"use client";

import {
  Bars3Icon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

const nav = [
  { href: "/institutions", label: "Institutions" },
  { href: "/employers", label: "Employers" },
  { href: "/students", label: "Students" },
  { href: "/platform", label: "Platform" },
  { href: "/credentials", label: "Verify credential" },
];

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <div className="marketing-header-inner">
        <Brand />

        <nav className="marketing-desktop-nav" aria-label="Primary navigation">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="marketing-header-actions">
          <ThemeToggle />
          <Link className="button button-ghost button-small marketing-signin" href="/login">
            Sign in
          </Link>
          <Link className="button button-dark button-small marketing-create" href="/signup">
            Create account
          </Link>

          <details className="marketing-mobile-menu">
            <summary aria-label="Open navigation menu">
              <Bars3Icon aria-hidden="true" />
              <span>Menu</span>
              <ChevronDownIcon className="marketing-menu-chevron" aria-hidden="true" />
            </summary>
            <nav aria-label="Mobile navigation">
              {nav.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
              <Link href="/signup">Create account</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
