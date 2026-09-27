import { verifyEmployerCertificationCredential } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const credentialId = url.searchParams.get("credentialId")?.trim();
    if (!credentialId) {
      return Response.json(
        { error: "Credential ID is required." },
        { status: 400 },
      );
    }
    const credential = await verifyEmployerCertificationCredential(credentialId);
    return Response.json({ ok: true, credential });
  } catch (error) {
    return jsonError(error);
  }
}
