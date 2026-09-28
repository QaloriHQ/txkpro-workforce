import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicEmployerCertification = {
  found: boolean;
  redirectPath?: string;
  canonicalPath?: string;
  credentialId?: string;
  status?: "active" | "expired" | "revoked";
  issuedAt?: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  issuer?: {
    name: string;
    publicPath: string | null;
  };
  learner?: {
    name: string;
    publicPath: string | null;
  };
  certification?: {
    title: string;
    description: string | null;
    definitionVersion: number;
  };
  course?: {
    title: string;
    versionNumber: number;
    publicPath: string | null;
  };
  evidence?: {
    type: "Employer Training completion";
    category: "employer_training";
    outcome: "passed";
    completedAt: string | null;
    summary: string;
    technicalSkillVerified: false;
  };
  verification?: {
    integrityVerified: boolean;
    method: "TXKPRO canonical credential record";
  };
  page?: {
    visibility: "public" | "unlisted";
    robotsIndex: boolean;
    robotsFollow: boolean;
    locale: string;
    seoTitle: string | null;
    metaDescription: string | null;
    shareImageUrl: string | null;
  };
};

async function readPublicEmployerCertification(
  lookup: string,
): Promise<PublicEmployerCertification> {
  const normalized = lookup.trim();
  if (!normalized) return { found: false };

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "employer_certification_public_verify",
    {
      p_lookup: normalized,
    },
  );

  if (error) {
    // Provider errors may contain request headers; never echo secrets to logs.
    throw new Error("Employer Certification verification is unavailable.");
  }

  return (data ?? { found: false }) as PublicEmployerCertification;
}

export const getPublicEmployerCertification = cache(
  readPublicEmployerCertification,
);
