import { Brand } from "@/components/brand";
import { EmployerApprovalQueue } from "@/components/admin/employer-approval-queue";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireRole } from "@/lib/auth";
import { listPendingEmployerApprovals } from "@/lib/admin/employer-approvals";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireRole(["admin"]);
  const pendingEmployers = await listPendingEmployerApprovals();

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
        <div className="page-heading">
          <div>
            <p className="eyebrow">TXKPRO operations</p>
            <h1>Platform administration</h1>
            <p className="card-sub">
              Review account approvals and manage platform-controlled access.
            </p>
          </div>
          <span className="pill">{pendingEmployers.length} approvals waiting</span>
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Server-controlled access</strong>
          Administrator privileges come only from active platform-level role
          membership. User onboarding can never create Admin access.
        </div>

        <EmployerApprovalQueue initialItems={pendingEmployers} />
      </main>
    </>
  );
}
