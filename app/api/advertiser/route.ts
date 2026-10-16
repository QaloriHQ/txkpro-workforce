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
  return Response.json(data, { headers: { "cache-control": "private, no-store" } });
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
    result = await supabase.rpc("advertiser_campaign_save", {
      p_advertiser_id: body.advertiserId,
      p_campaign_id: body.campaignId || null,
      p_name: body.name,
      p_budget_minor: body.budgetMinor,
      p_starts_at: body.startsAt,
      p_ends_at: body.endsAt,
      p_frequency_cap: body.frequencyCap ?? 3,
      p_placements: body.placements,
      p_audience: body.audience,
    });
  } else if (operation === "save-creative") {
    result = await supabase.rpc("advertiser_creative_save", {
      p_advertiser_id: body.advertiserId,
      p_campaign_id: body.campaignId,
      p_creative_id: body.creativeId || null,
      p_headline: body.headline,
      p_body: body.body,
      p_media_url: body.mediaUrl || null,
      p_media_alt: body.mediaAlt || null,
      p_destination_url: body.destinationUrl,
      p_cta_label: body.ctaLabel,
      p_placements: body.placements,
    });
  } else if (operation === "campaign-action") {
    result = await supabase.rpc("advertiser_campaign_action", { p_advertiser_id: body.advertiserId, p_campaign_id: body.campaignId, p_action: body.action });
  } else {
    return Response.json({ error: "Unsupported advertiser operation." }, { status: 400 });
  }
  if (result.error) return Response.json({ error: result.error.message }, { status: statusFor(result.error.message) });
  return Response.json(result.data);
}
