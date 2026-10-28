import { incentiveMutation } from "@/lib/incentives/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return incentiveMutation(
    request,
    ["verify", "decline_case", "review_event"],
    { caseId: id, eventId: id },
  );
}
