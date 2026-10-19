import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { CheckrPanel } from "@/components/rewards/checkr-panel";
import { requireEmployerContext } from "@/lib/employer/auth";
import { authority } from "@/lib/checkr/server";
import { sandboxConfigured } from "@/lib/checkr/contracts";
export const dynamic = "force-dynamic";
export default async function CheckrWorkspace({ searchParams }: { searchParams: Promise<{ employer?: string; connection?: string }> }) {
  const query = await searchParams;
  let context;
  try { context = await requireEmployerContext({ approved: true, employerId: query.employer }); }
  catch (e) {
    if (e instanceof Response && e.status === 403) return <main className="page-wrap"><h1>Checkr sandbox</h1>
      <p>Sign in with an approved employer account to manage Checkr.</p>
      <Link className="button button-dark" href="/login">Sign in</Link>
      <Link className="button button-ghost" href="/dashboard">My workspace</Link>
    </main>;
    throw e;
  }
  let data;
  try { data = await authority({ op: "workspace", employerId: context.employerId }); }
  catch (e) {
    if (e instanceof Response && e.status === 403) return <main className="page-wrap"><h1>Checkr sandbox</h1><p>Your employer administrator must grant screening access.</p><Link href="/employer/pipeline-builder">Return to pipeline editor</Link></main>;
    throw e;
  }
  return <><header className="topbar"><Brand /><EmployerWorkspaceNav active="screening" /></header>
    <main className="page-wrap"><h1>Checkr sandbox</h1>
      <Link className="button button-ghost" href="/employer/pipeline-builder">Return to pipeline editor</Link>
      {query.connection === "retry" ? <p role="alert">Checkr connection could not be verified. Start the connection again.</p> : null}
      {query.connection === "connected" ? <p role="status">Checkr account connected. Ordering remains subject to Checkr credentialing and sandbox activation.</p> : null}
      <CheckrPanel employerId={context.employerId} data={{ canManage: data.canManage, canOrder: data.canOrder, canReview: data.canReview, connected: data.connected, credentialed: data.credentialed, subjects: data.subjects, orders: data.orders }} configured={sandboxConfigured(process.env)} orderingEnabled={process.env.CHECKR_SANDBOX_ORDERING_ENABLED === "true"} />
    </main></>;
}
