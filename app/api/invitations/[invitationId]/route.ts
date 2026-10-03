import { NextResponse } from "next/server";
import {
  closeInvitation,
  resendInvitation,
} from "@/lib/invitations/service";

type RouteContext = {
  params: Promise<{ invitationId: string }>;
};

function safeReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/institution/students";
}

async function bodyFromRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return { body: (await request.json()) as Record<string, unknown>, form: false };
  }
  const formData = await request.formData();
  return {
    body: Object.fromEntries(formData.entries()) as Record<string, unknown>,
    form: true,
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  const { invitationId } = await params;
  let isForm = false;
  let returnTo = "/institution/students";

  try {
    const parsed = await bodyFromRequest(request);
    isForm = parsed.form;
    const body = parsed.body;
    returnTo = safeReturnTo(body.returnTo);
    const action = String(body.action ?? "").toLowerCase();

    const invitation =
      action === "resend"
        ? await resendInvitation(invitationId)
        : action === "revoke" || action === "cancel"
          ? await closeInvitation(invitationId, action)
          : null;

    if (!invitation) {
      return Response.json(
        { error: "Unsupported invitation action." },
        { status: 400 },
      );
    }

    if (isForm) {
      const redirectUrl = new URL(returnTo, request.url);
      redirectUrl.searchParams.set(
        "invite",
        action === "resend" ? "resent" : action,
      );
      return NextResponse.redirect(redirectUrl, 303);
    }
    return Response.json({ invitation });
  } catch (error) {
    if (isForm) {
      const redirectUrl = new URL(returnTo, request.url);
      redirectUrl.searchParams.set("invite", "error");
      return NextResponse.redirect(redirectUrl, 303);
    }
    return Response.json(
      {
        error:
          error instanceof Response
            ? error.statusText || "Invitation action failed."
            : error instanceof Error
              ? error.message
              : "Invitation action failed.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
