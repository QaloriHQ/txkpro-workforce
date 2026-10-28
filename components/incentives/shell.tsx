import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
export function IncentiveShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="incentives" />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap txk-prototype-content incentive-page">
        {children}
      </main>
    </>
  );
}
export function BackToPrograms() {
  return (
    <Link className="link" href="/employer/incentives">
      ← All programs
    </Link>
  );
}
