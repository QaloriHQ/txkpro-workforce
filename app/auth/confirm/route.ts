import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/onboarding";
  const destination = next.startsWith("/") && !next.startsWith("//")
    ? new URL(next, request.url)
    : new URL("/onboarding", request.url);

  const supabase = await createServerSupabaseClient();
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(destination);
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(destination);
  }

  const errorUrl = new URL("/login", request.url);
  errorUrl.searchParams.set("error", "confirmation");
  return NextResponse.redirect(errorUrl);
}
