import { notFound } from "next/navigation";
import { requireEmployerContext } from "@/lib/employer/auth";
import { employerIncentives } from "@/lib/incentives/server";
import { IncentiveShell, BackToPrograms } from "@/components/incentives/shell";
import { ProgramEditor } from "@/components/incentives/editor";
export const dynamic = "force-dynamic";
export default async function Edit({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const c = await requireEmployerContext({ approved: true });
  const { points, extension } = await employerIncentives(c.employerId);
  const program = points.programs.find(
    (p) => p.id === programId && p.canManage,
  );
  if (!program) notFound();
  return (
    <IncentiveShell>
      <BackToPrograms />
      <ProgramEditor
        key={programId}
        ownerId={c.employerId}
        program={program}
        configuration={extension.configs.find((c) => c.programId === programId)}
      />
    </IncentiveShell>
  );
}
