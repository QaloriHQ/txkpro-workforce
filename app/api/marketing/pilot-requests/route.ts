import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function textValue(
  value: unknown,
  maxLength: number,
  required = false,
): string | null {
  if (typeof value !== "string") return required ? "" : null;
  const normalized = value.trim();
  if (!normalized) return required ? "" : null;
  return normalized.slice(0, maxLength);
}

function integerValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) return null;
  return parsed;
}

const institutionTypes = new Set([
  "technical_college",
  "community_college",
  "high_school_cte",
  "workforce_program",
  "other",
]);

const contactPreferences = new Set(["email", "phone", "either"]);
const intents = new Set(["pilot", "meeting", "both"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (textValue(body.website, 200)) {
      return NextResponse.json({ ok: true });
    }

    const institutionName = textValue(body.institutionName, 160, true);
    const institutionType = textValue(body.institutionType, 40, true);
    const contactName = textValue(body.contactName, 120, true);
    const email = textValue(body.email, 254, true)?.toLowerCase() ?? "";
    const contactPreference =
      textValue(body.contactPreference, 20) ?? "email";
    const intent = textValue(body.intent, 20) ?? "pilot";

    if (
      !institutionName ||
      !contactName ||
      !emailPattern.test(email) ||
      !institutionType ||
      !institutionTypes.has(institutionType) ||
      !contactPreferences.has(contactPreference) ||
      !intents.has(intent)
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Please complete the required institution, contact, and email fields.",
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const cooldown = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await supabase
      .from("wf_pilot_requests")
      .select("request_id")
      .eq("email", email)
      .gte("created_at", cooldown)
      .limit(1);

    if (recentError) {
      throw new Error(recentError.message);
    }

    if (recent && recent.length > 0) {
      return NextResponse.json({
        ok: true,
        message:
          "We already received a recent request from this email. TXKPRO can follow up from that request.",
      });
    }

    const payload = {
      institution_name: institutionName,
      institution_type: institutionType,
      contact_name: contactName,
      contact_title: textValue(body.contactTitle, 120),
      email,
      phone: textValue(body.phone, 40),
      contact_preference: contactPreference,
      intent,
      trade_program: textValue(body.tradeProgram, 120),
      estimated_cohort_size: integerValue(body.estimatedCohortSize),
      target_start_window: textValue(body.targetStartWindow, 120),
      message: textValue(body.message, 2000),
      source_path:
        textValue(body.sourcePath, 240) ?? "/institutions/request-pilot",
      utm_source: textValue(body.utmSource, 120),
      utm_medium: textValue(body.utmMedium, 120),
      utm_campaign: textValue(body.utmCampaign, 120),
      status: "new",
    };

    const { error } = await supabase.from("wf_pilot_requests").insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          "Your request was received. TXKPRO can now follow up about the pilot.",
      },
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "We could not submit your request right now. Please try again in a few minutes.",
      },
      {
        status: 500,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }
}
