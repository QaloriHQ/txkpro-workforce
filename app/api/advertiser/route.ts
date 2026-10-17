import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdvertiserFundingCheckout } from "@/lib/advertiser/funding-server";

function statusFor(message: string) {
  if (/ACCESS_DENIED|AUTHENTICATION_REQUIRED|ADMIN_REQUIRED|APPROVAL_REQUIRED/.test(message)) return 403;
  if (/NOT_FOUND/.test(message)) return 404;
  if (/EXISTS|NOT_EDITABLE|TRANSITION/.test(message)) return 409;
  return 400;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const advertiserId = new URL(request.url).searchParams.get("advertiserId");
  const { data, error } = await supabase.rpc("advertiser_dashboard", { p_advertiser_id: advertiserId });
  if (error) return Response.json({ error: error.message }, { status: statusFor(error.message) });
  const resolvedAdvertiserId = advertiserId ?? data?.account?.advertiserId;
  const enterprise = resolvedAdvertiserId
    ? await supabase.rpc("advertiser_enterprise_context", { p_advertiser_id: resolvedAdvertiserId })
    : { data: null, error: null };
  if (enterprise.error) return Response.json({ error: enterprise.error.message }, { status: statusFor(enterprise.error.message) });
  const manager = resolvedAdvertiserId
    ? await supabase.rpc("advertiser_manager_context", { p_advertiser_id: resolvedAdvertiserId })
    : { data: null, error: null };
  if (manager.error) return Response.json({ error: manager.error.message }, { status: statusFor(manager.error.message) });
  return Response.json({ ...data, enterprise: enterprise.data, manager: manager.data }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const operation = String(body.operation ?? "");
  const supabase = await createServerSupabaseClient();
  let result;
  if (operation === "create-funding-checkout") {
    try {
      const data = await createAdvertiserFundingCheckout(supabase, {
        advertiserId: String(body.advertiserId ?? ""),
        campaignId: body.campaignId ? String(body.campaignId) : null,
        amountMinor: Number(body.amountMinor),
      });
      return Response.json(data);
    } catch (error) {
      if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
      return Response.json({ error: "Funding checkout could not be created." }, { status: 500 });
    }
  } else if (operation === "register") {
    result = await supabase.rpc("advertiser_register", {
      p_display_name: body.displayName,
      p_legal_name: body.legalName || null,
      p_website_url: body.websiteUrl || null,
      p_contact_email: body.contactEmail || null,
    });
  } else if (operation === "invite") {
    result = await supabase.rpc("advertiser_team_invite", { p_advertiser_id: body.advertiserId, p_email: body.email, p_role: body.role });
  } else if (operation === "accept-invite") {
    result = await supabase.rpc("advertiser_invitation_accept");
  } else if (operation === "save-campaign") {
    result = await supabase.rpc("advertiser_campaign_save_v2", {
      p_advertiser_id: body.advertiserId,
      p_campaign_id: body.campaignId || null,
      p_name: body.name,
      p_objective: body.objective || "brand_awareness",
      p_budget_minor: body.budgetMinor,
      p_starts_at: body.startsAt,
      p_ends_at: body.endsAt,
      p_frequency_cap: body.frequencyCap ?? 3,
      p_placements: body.placements,
      p_audience: body.audience,
    });
  } else if (operation === "save-creative") {
    result = await supabase.rpc("advertiser_creative_version_save", {
      p_advertiser_id: body.advertiserId,
      p_campaign_id: body.campaignId,
      p_ad_group_id: body.adGroupId,
      p_creative_id: body.creativeId || null,
      p_headline: body.headline,
      p_body: body.body,
      p_media_url: body.mediaUrl || null,
      p_media_alt: body.mediaAlt || null,
      p_destination_url: body.destinationUrl,
      p_cta_label: body.ctaLabel,
      p_placements: body.placements,
    });
  } else if (operation === "save-ad-group") {
    result = await supabase.rpc("advertiser_ad_group_save", {
      p_advertiser_id: body.advertiserId,
      p_campaign_id: body.campaignId,
      p_ad_group_id: body.adGroupId || null,
      p_name: body.name,
      p_buying_model: body.buyingModel,
      p_bid_minor: body.bidMinor,
      p_pacing_mode: body.pacingMode,
      p_frequency_cap: body.frequencyCap,
      p_role_family: body.roleFamily || null,
      p_topic: body.topic || null,
      p_broad_geography: body.broadGeography || null,
      p_timezone: body.timezone || "UTC",
      p_dayparting: body.dayparting || [],
      p_placements: body.placements,
    });
  } else if (operation === "save-audience") {
    result = await supabase.rpc("advertiser_audience_save", {
      p_advertiser_id: body.advertiserId,
      p_audience_id: body.audienceId || null,
      p_name: body.name,
      p_role_family: body.roleFamily || null,
      p_topic: body.topic || null,
      p_broad_geography: body.broadGeography || null,
      p_mapbox_place_id: body.mapboxPlaceId || null,
      p_neighborhood: body.neighborhood || null,
      p_longitude: body.longitude ?? null,
      p_latitude: body.latitude ?? null,
      p_radius_m: body.radiusM ?? null,
    });
  } else if (operation === "save-creative-set") {
    result = await supabase.rpc("advertiser_creative_set_save", {
      p_advertiser_id: body.advertiserId,
      p_creative_set_id: body.creativeSetId || null,
      p_name: body.name,
      p_variations: body.variations,
    });
  } else if (operation === "register-asset") {
    result = await supabase.rpc("advertiser_asset_register", {
      p_advertiser_id: body.advertiserId,
      p_name: body.name,
      p_media_type: body.mediaType,
      p_storage_path: body.storagePath,
      p_mime_type: body.mimeType,
      p_byte_size: body.byteSize,
      p_alt_text: body.altText || null,
    });
  } else if (operation === "attach-variation") {
    result = await supabase.rpc("advertiser_group_variation_attach", {
      p_advertiser_id: body.advertiserId,
      p_ad_group_id: body.adGroupId,
      p_variation_id: body.variationId,
    });
  } else if (operation === "set-ad-group-audience") {
    result = await supabase.rpc("advertiser_ad_group_audience_set", {
      p_advertiser_id: body.advertiserId,
      p_ad_group_id: body.adGroupId,
      p_audience_id: body.audienceId || null,
    });
  } else if (operation === "save-campaign-budget") {
    result = await supabase.rpc("advertiser_campaign_budget_save", {
      p_advertiser_id: body.advertiserId,
      p_campaign_id: body.campaignId,
      p_daily_spend_cap_minor: body.dailySpendCapMinor,
    });
  } else if (operation === "link-business-manager-account") {
    result = await supabase.rpc("advertiser_business_manager_link", {
      p_business_manager_id: body.businessManagerId,
      p_advertiser_id: body.advertiserId,
    });
  } else if (operation === "bulk-action") {
    result = await supabase.rpc("advertiser_bulk_action", {
      p_advertiser_id: body.advertiserId,
      p_idempotency_key: body.idempotencyKey,
      p_entity_type: body.entityType,
      p_action: body.action,
      p_entity_ids: body.entityIds,
    });
  } else if (operation === "submit-creative-version") {
    result = await supabase.rpc("advertiser_creative_version_submit", {
      p_advertiser_id: body.advertiserId,
      p_creative_version_id: body.creativeVersionId,
    });
  } else if (operation === "campaign-action") {
    result = await supabase.rpc("advertiser_campaign_action_v2", { p_advertiser_id: body.advertiserId, p_campaign_id: body.campaignId, p_action: body.action });
  } else {
    return Response.json({ error: "Unsupported advertiser operation." }, { status: 400 });
  }
  if (result.error) return Response.json({ error: result.error.message }, { status: statusFor(result.error.message) });
  return Response.json(result.data);
}
