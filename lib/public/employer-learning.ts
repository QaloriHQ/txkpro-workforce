import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicLearningPage } from "@/app/employers/public-learning-model";

export const getPublicLearningPage = cache(async (path: string): Promise<PublicLearningPage> => {
  const { data, error } = await createAdminClient().rpc("employer_learning_public_read", { p_path: path });
  if (error) throw new Error("Public learning pages are temporarily unavailable.");
  return data ?? { found: false };
});

export async function getPublicLearningSitemap(): Promise<Array<{ path: string; updatedAt: string }>> {
  const { data, error } = await createAdminClient().rpc("employer_learning_public_sitemap");
  if (error) throw new Error("Public learning sitemap is temporarily unavailable.");
  return data ?? [];
}
