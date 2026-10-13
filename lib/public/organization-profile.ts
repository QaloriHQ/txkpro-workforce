import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OrganizationKind = "employer" | "institution";

export type OrganizationProfile = {
  found: boolean;
  redirectPath?: string;
  kind?: OrganizationKind;
  entityId?: string;
  canonicalPath?: string;
  displayName?: string;
  summary?: string | null;
  logoUrl?: string | null;
  shareImageUrl?: string | null;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
  seoTitle?: string | null;
  metaDescription?: string | null;
  updatedAt?: string;
  website?: string;
  city?: string;
  state?: string;
  serviceArea?: string;
  focusItems?: string[];
  contactAction?: { label?: string; href?: string };
  courses?: Array<{ title: string; path: string; description?: string | null }>;
  credentials?: Array<{ title: string; path: string }>;
};

export type OrganizationSettings = Omit<OrganizationProfile, "found" | "redirectPath"> & {
  chosen: boolean;
  slug: string;
  path: string | null;
  visibility: "public" | "private";
};

export type OrganizationSettingsInput = {
  slug: string;
  displayName: string;
  summary: string;
  visibility: "public" | "private";
  robotsIndex: boolean;
  logoUrl: string;
  shareImageUrl: string;
  website: string;
  city: string;
  state: string;
  serviceArea: string;
  focusItems: string[];
  contactAction: { label: string; href: string };
};

export const publicOrganization = cache(async (path: string): Promise<OrganizationProfile> => {
  const { data, error } = await createAdminClient().rpc("organization_public_read", {
    p_path: path,
  });
  if (error) throw new Error("Organization profile is temporarily unavailable.");
  return (data ?? { found: false }) as OrganizationProfile;
});

export async function organizationSitemap(): Promise<Array<{ path: string; updatedAt: string }>> {
  const { data, error } = await createAdminClient().rpc("organization_public_sitemap");
  if (error) throw new Error("Organization sitemap is temporarily unavailable.");
  return data ?? [];
}

export async function credentialSitemap(): Promise<Array<{ path: string; updatedAt: string }>> {
  const { data, error } = await createAdminClient().rpc("credential_public_sitemap");
  if (error) throw new Error("Credential sitemap is temporarily unavailable.");
  return data ?? [];
}

export async function organizationSettings(
  kind: OrganizationKind,
  entityId: string,
  input: OrganizationSettingsInput | null = null,
): Promise<OrganizationSettings> {
  const client = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Response("Sign in required.", { status: 401 });
  const { data, error } = await client.rpc("organization_public_profile_settings", {
    p_kind: kind,
    p_entity_id: entityId,
    p_input: input,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "23505" ? 409 : 400;
    throw new Response(error.message || "Organization profile could not be saved.", { status });
  }
  return data as OrganizationSettings;
}
