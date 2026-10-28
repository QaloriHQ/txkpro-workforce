import { incentiveMutation } from "@/lib/incentives/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  return incentiveMutation(request, "safety");
}
