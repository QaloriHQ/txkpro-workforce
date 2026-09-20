import { getEmployerContext } from "@/lib/employer/auth";
import { getEmployerCompanyProfile } from "@/lib/employer/repository";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await getEmployerContext(employerId);
    if (!context) {
      return Response.json({ error: "Employer membership required." }, { status: 403 });
    }
    const company = await getEmployerCompanyProfile(context);
    return Response.json({
      context,
      company,
      capabilities: {
        manageCompany: context.role === "employer_owner" || context.role === "employer_admin",
        createHiringNeeds:
          context.approvalStatus === "approved" &&
          ["employer_owner", "employer_admin", "recruiter"].includes(context.role),
        approved: context.approvalStatus === "approved",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
