import { classError } from "@/lib/classes/request";
import { incentiveRpc } from "@/lib/incentives/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await incentiveRpc("incentive_bank"), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return classError(e);
  }
}
