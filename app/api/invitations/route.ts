import { NextResponse } from "next/server";
import {
  createAndSendInvitation,
  listManageableInvitations,
} from "@/lib/invitations/service";

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

function errorStatus(error: unknown) {
  return error instanceof Response ? error.status : 500;
}

function errorMessage(error: unknown) {
  if (error instanceof Response) return error.statusText || "Invitation request failed.";
  return error instanceof Error ? error.message : "Invitation request failed.";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const invitations = await listManageableInvitations({
      institutionId: url.searchParams.get("institutionId"),
      contractorId: url.searchParams.get("contractorId"),
      status: url.searchParams.get("status"),
    });
    return Response.json({ invitations });
  } catch (error) {
    return Response.json(
      { error: errorMessage(error) },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  let isForm = false;
  let returnTo = "/institution/students";

  try {
    const parsed = await bodyFromRequest(request);
    isForm = parsed.form;
    const body = parsed.body;
    returnTo = safeReturnTo(body.returnTo);

    const invitation = await createAndSendInvitation(
      {
        email: String(body.email ?? ""),
        role: String(body.role ?? ""),
        scopeType: String(body.scopeType ?? ""),
        scopeId: body.scopeId ? String(body.scopeId) : null,
        institutionId: body.institutionId ? String(body.institutionId) : null,
        contractorId: body.contractorId ? String(body.contractorId) : null,
        source: body.source ? String(body.source) : "individual",
      },
      new URL(request.url).origin,
    );

    if (isForm) {
      const redirectUrl = new URL(returnTo, request.url);
      redirectUrl.searchParams.set("invite", "sent");
      return NextResponse.redirect(redirectUrl, 303);
    }

    return Response.json({ invitation }, { status: 201 });
  } catch (error) {
    if (isForm) {
      const redirectUrl = new URL(returnTo, request.url);
      redirectUrl.searchParams.set("invite", "error");
      return NextResponse.redirect(redirectUrl, 303);
    }
    return Response.json(
      { error: errorMessage(error) },
      { status: errorStatus(error) },
    );
  }
}
