import { Brand } from "@/components/brand";
import { EducatorApprovalQueue } from "@/components/admin/educator-approval-queue";
import { EmployerApprovalQueue } from "@/components/admin/employer-approval-queue";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireRole } from "@/lib/auth";
import { listPendingEducatorApprovals } from "@/lib/admin/educator-approvals";
import { listPendingEmployerApprovals } from "@/lib/admin/employer-approvals";
import Link from "next/link";
import { isPlatformSuperAdmin } from "@/lib/institutions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const account = await requireRole(["admin"]);
  const [pendingEmployers, pendingEducators] = await Promise.all([
    listPendingEmployerApprovals(),
    listPendingEducatorApprovals(account),
  ]);
  const pendingCount = pendingEmployers.length + pendingEducators.length;

  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <span className="pill pill-good">Platform Admin</span>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap">
        {isPlatformSuperAdmin(account) ? <Link className="button button-ghost" href="/admin/institutions">Institutions and access requests</Link> : null}
        <Link className="button button-ghost" href="/professional/profile">My professional profile</Link>
        <Link className="button button-ghost" href="/admin/invitations">Manage invitations</Link>
        <Link className="button button-ghost" href="/admin/retention">Retention cases</Link>
        <Link className="button button-ghost" href="/admin/audit">Audit &amp; events</Link>
        <div className="page-heading">
          <div>
            <p className="eyebrow">TXKPRO operations</p>
            <h1>Platform administration</h1>
            <p className="card-sub">
              Review account approvals and manage platform-controlled access.
            </p>
          </div>
          <span className="pill">{pendingCount} approvals waiting</span>
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Server-controlled access</strong>
          Administrator privileges come only from active platform-level role
          membership. User onboarding can never create Admin access.
        </div>

        <EducatorApprovalQueue initialItems={pendingEducators} />
        <EmployerApprovalQueue initialItems={pendingEmployers} />
        <p style={{ marginTop: 24 }}><Link className="txk-button txk-button-default" href="/admin/concierge">Concierge production queue</Link></p>
      </main>
    </>
  );
}
