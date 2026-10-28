import { requireEmployerContext, canManageCompany } from "@/lib/employer/auth";
import { IncentiveShell, BackToPrograms } from "@/components/incentives/shell";
import { ProgramEditor } from "@/components/incentives/editor";
export const dynamic = "force-dynamic";
export default async function Create() {
  const c = await requireEmployerContext({ approved: true });
  if (!canManageCompany(c.role))
    throw new Response("Program management required", { status: 403 });
  return (
    <IncentiveShell>
      <BackToPrograms />
      <ProgramEditor ownerId={c.employerId} />
    </IncentiveShell>
  );
}
