import { notFound, redirect } from "next/navigation";
import { getEmployerContext, canManageCompany } from "@/lib/employer/auth";
import { IncentiveShell, BackToPrograms } from "@/components/incentives/shell";
import { TemplateGallery } from "@/components/incentives/template-gallery";
import {
  INCENTIVE_TEMPLATES,
  EMPLOYER_SIZES,
  PROGRAM_GOALS,
} from "@/lib/incentives/templates";
export const dynamic = "force-dynamic";
export default async function Templates() {
  const c = await getEmployerContext();
  if (!c) redirect("/login");
  if (
    c.approvalStatus !== "approved" ||
    ["suspended", "closed"].includes(c.accountStatus)
  )
    notFound();
  return (
    <IncentiveShell>
      <BackToPrograms />
      <TemplateGallery
        templates={INCENTIVE_TEMPLATES}
        sizes={EMPLOYER_SIZES}
        goals={PROGRAM_GOALS}
        canCreate={canManageCompany(c.role)}
      />
    </IncentiveShell>
  );
}
