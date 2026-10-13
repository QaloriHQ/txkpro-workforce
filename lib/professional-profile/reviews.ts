import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ReviewContext = {
  eligible: boolean;
  reason?: string;
  relationshipContext?: "student" | "educator" | "institution_leadership";
  verifiedRelationship?: boolean;
  review?: null | {
    id: string;
    rating: number;
    title: string | null;
    body: string;
    status: "pending" | "published" | "hidden" | "removed";
    updatedAt: string;
  };
};

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Response("Sign in required.", { status: 401 });
  return client;
}

function rpcError(error: { code?: string; message?: string }) {
  return new Response(error.message || "Review request failed.", {
    status: error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503,
  });
}

export async function professionalReviewContext(path: string): Promise<ReviewContext> {
  const client = await authenticatedClient();
  const { data, error } = await client.rpc("professional_review_context", { p_target_path: path });
  if (error) throw rpcError(error);
  return data as ReviewContext;
}

export async function saveProfessionalReview(path: string, input: { rating: number; title: string; body: string }) {
  const client = await authenticatedClient();
  const { data, error } = await client.rpc("professional_review_save", { p_target_path: path, p_input: input });
  if (error) throw rpcError(error);
  return data as ReviewContext;
}

export async function reportProfessionalReview(reviewId: string, reason: string) {
  const client = await authenticatedClient();
  const { data, error } = await client.rpc("professional_review_report", { p_review_id: reviewId, p_reason: reason });
  if (error) throw rpcError(error);
  return data as { ok: boolean; reportId: string };
}

export async function moderateProfessionalReview(reviewId: string, status: "published" | "hidden" | "removed", note: string) {
  const client = await authenticatedClient();
  const { data, error } = await client.rpc("professional_review_moderate", {
    p_review_id: reviewId,
    p_status: status,
    p_note: note,
  });
  if (error) throw rpcError(error);
  return data as { id: string; status: string };
}
