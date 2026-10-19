import "server-only";
import { authenticatedRpc } from "@/lib/rewards/server";
import { candidateInvitation } from "./server";
export type CandidateCheck = {
  id: string; employerId: string; employerName: string; packageName: string;
  status: string; invitationStatus: string | null; reportStatus: string | null;
  createdAt: string; canOpen: boolean;
};
export async function candidateChecks() {
  return authenticatedRpc<CandidateCheck[]>("checkr_candidate_workspace");
}
export async function openCandidateCheck(orderId: string) {
  const checks = await candidateChecks();
  const own = checks.find(c => c.id === orderId && c.canOpen);
  if (!own) throw new Response("Invitation unavailable.", { status: 403 });
  return candidateInvitation(own.employerId, own.id);
}
