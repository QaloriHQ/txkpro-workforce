import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/institutions";
import { listPlatformAccounts } from "@/lib/admin/platform-users";
import { PlatformUserDirectory } from "@/components/admin/platform-user-directory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireRole(["admin"]);
  if (!isPlatformSuperAdmin(actor)) notFound();
  const rawPage = (await searchParams).page ?? "1";
  const page = Number(rawPage);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) notFound();
  const data = await listPlatformAccounts(page);
  return <main className="page-wrap">
    <p className="txk-admin-small"><Link href="/admin">Administration</Link> / All users</p>
    <div className="page-heading"><div><p className="eyebrow">People & access</p>
      <h1>All users</h1>
      <p className="card-sub">Verified account directory across Workforce and advertiser-only Auth users. Read-only until an explicitly authorized support action.</p>
    </div></div>
    <PlatformUserDirectory accounts={data.accounts} />
    <nav className="txk-admin-user-tools" aria-label="Directory pages">
      {page > 1 ? <Link className="button button-ghost" href={`/admin/users?page=${page - 1}`}>Previous page</Link> : null}
      <span className="txk-admin-small">Page {page} · {data.accounts.length} accounts</span>
      {data.hasNext ? <Link className="button button-ghost" href={`/admin/users?page=${page + 1}`}>Next page</Link> : null}
    </nav>
    <p className="txk-admin-small">Search and filters apply to the displayed page. Use pagination to browse all authenticated accounts. Scoped and global search enhancements require a separately approved server-side directory index.</p>
  </main>;
}
