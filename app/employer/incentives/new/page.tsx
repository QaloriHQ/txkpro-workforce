import { notFound } from "next/navigation";
import {
  findIncentiveTemplate,
  templateDefinition,
} from "@/lib/incentives/templates";
import { requireEmployerContext, canManageCompany } from "@/lib/employer/auth";
import { IncentiveShell, BackToPrograms } from "@/components/incentives/shell";
import { ProgramEditor } from "@/components/incentives/editor";
export const dynamic = "force-dynamic";
export default async function Create({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const c = await requireEmployerContext({ approved: true });
  if (!canManageCompany(c.role))
    throw new Response("Program management required", { status: 403 });
  const { template: id } = await searchParams;
  const template = id ? findIncentiveTemplate(id) : undefined;
  if (id && !template) notFound();
  return (
    <IncentiveShell>
      <BackToPrograms />
      <ProgramEditor
        key={template?.id ?? "blank"}
        ownerId={c.employerId}
        initialDraft={template ? templateDefinition(template) : undefined}
        templateName={template?.name}
        initialMode={template?.recommendedMode}
      />
    </IncentiveShell>
  );
}
