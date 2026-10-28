import { notFound, redirect } from "next/navigation";
import {
  findIncentiveTemplate,
  templateDefinition,
} from "@/lib/incentives/templates";
import { getEmployerContext, canManageCompany } from "@/lib/employer/auth";
import { IncentiveShell, BackToPrograms } from "@/components/incentives/shell";
import { ProgramEditor } from "@/components/incentives/editor";
import { employerCrewWorkspace } from "@/lib/employer/crews";
export const dynamic = "force-dynamic";
export default async function Create({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const c = await getEmployerContext();
  if (!c) redirect("/login");
  if (
    c.approvalStatus !== "approved" ||
    ["suspended", "closed"].includes(c.accountStatus)
  )
    notFound();
  if (!canManageCompany(c.role)) notFound();
  const { template: id } = await searchParams;
  const template = id ? findIncentiveTemplate(id) : undefined;
  if (id && !template) notFound();
  const crews = await employerCrewWorkspace(c.employerId);
  return (
    <IncentiveShell>
      <BackToPrograms />
      <ProgramEditor
        key={template?.id ?? "blank"}
        ownerId={c.employerId}
        initialDraft={template ? templateDefinition(template) : undefined}
        templateName={template?.name}
        initialMode={template?.recommendedMode}
        crewWorkspace={crews}
      />
    </IncentiveShell>
  );
}
