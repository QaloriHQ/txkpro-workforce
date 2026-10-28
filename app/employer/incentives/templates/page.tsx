import { requireEmployerContext, canManageCompany } from "@/lib/employer/auth";
import { IncentiveShell, BackToPrograms } from "@/components/incentives/shell";
import { TemplateGallery } from "@/components/incentives/template-gallery";
import {
  INCENTIVE_TEMPLATES,
  EMPLOYER_SIZES,
  PROGRAM_GOALS,
} from "@/lib/incentives/templates";
export const dynamic = "force-dynamic";
export default async function Templates() {
  const c = await requireEmployerContext({ approved: true });
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
