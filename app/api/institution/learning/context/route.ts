import { requireInstitutionContext } from "@/lib/institution/auth";
import { getInstitutionEmployerLearningContext } from "@/lib/institution/learning-repository";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const institutionId = url.searchParams.get("institutionId");
    const context = await requireInstitutionContext({ institutionId });
    const learning = await getInstitutionEmployerLearningContext(context);
    return Response.json({ context, learning });
  } catch (error) {
    return jsonError(error);
  }
}
