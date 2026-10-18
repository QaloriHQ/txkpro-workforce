import { EducatorApprovalQueue } from "@/components/admin/educator-approval-queue";
import { EmployerApprovalQueue } from "@/components/admin/employer-approval-queue";
import { requireRole } from "@/lib/auth";
import { listPendingEducatorApprovals } from "@/lib/admin/educator-approvals";
import { listPendingEmployerApprovals } from "@/lib/admin/employer-approvals";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const account = await requireRole(["admin"]);
  void account;
  const [pendingEmployers, pendingEducators] = await Promise.all([
    listPendingEmployerApprovals(),
    listPendingEducatorApprovals(account),
  ]);
  const pendingCount = pendingEmployers.length + pendingEducators.length;

  return (
    <>
      <main className="page-wrap" id="admin-overview">
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

        <section className="txk-admin-grid" aria-label="Platform overview">
          <div className="card"><span>Pending approvals</span><strong>{pendingCount}</strong><p>Educator and Employer requests awaiting review</p></div>
          <div className="card"><span>Access controls</span><strong>Role + scope</strong><p>Platform access remains server-authorized</p></div>
          <div className="card"><span>Audit evidence</span><strong>Enabled</strong><p>Review events using the sidebar</p></div>
        </section>
        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Server-controlled access</strong>
          Administrator privileges come only from active platform-level role
          membership. User onboarding can never create Admin access.
        </div>

        <EducatorApprovalQueue initialItems={pendingEducators} />
        <EmployerApprovalQueue initialItems={pendingEmployers} />
      </main>
    </>
  );
}
