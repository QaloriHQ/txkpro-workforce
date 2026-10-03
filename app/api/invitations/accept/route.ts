import { jsonError } from "@/lib/http";
import { acceptInvitation } from "@/lib/invitations/repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "");
    const result = await acceptInvitation(token);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
