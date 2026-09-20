import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });

  if (error) {
    response.headers.set("x-txkpro-signout-warning", "supabase-signout-error");
  }

  return response;
}
