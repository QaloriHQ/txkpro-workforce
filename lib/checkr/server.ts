import "server-only";
import { authenticatedRpc } from "@/lib/rewards/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { seal, unseal } from "@/lib/rewards/contracts";
import {
  CHECKR_ORIGIN,
  curatePackage,
  packagesForNode,
  providerId,
  operationalStatus,
  sandboxConfigured,
  type CheckrPackage,
  type CheckrNode,
} from "./contracts";
export type CheckrWorkspace = {
  canManage: boolean;
  canOrder: boolean;
  canReview: boolean;
  connected: boolean;
  credentialed: boolean;
  subjects: { id: string; name: string; audience: string }[];
  orders: {
    id: string;
    name: string;
    packageName: string;
    audience: string;
    status: string;
    invitationStatus: string | null;
    reportStatus: string | null;
    baseCents: number;
    createdAt: string;
    own: boolean;
  }[];
};
type Authority = CheckrWorkspace & { actor: string };
function config() {
  if (!sandboxConfigured(process.env))
    throw new Response(
      "Checkr sandbox setup is awaiting partner credentials.",
      { status: 503 },
    );
  return {
    clientId: process.env.CHECKR_SANDBOX_CLIENT_ID!,
    secret: process.env.CHECKR_SANDBOX_CLIENT_SECRET!,
    key: process.env.REWARDS_ENCRYPTION_KEY!,
  };
}
function ordering() {
  config();
  if (process.env.CHECKR_SANDBOX_ORDERING_ENABLED !== "true")
    throw new Response("Checkr sandbox ordering is awaiting activation.", {
      status: 503,
    });
}
export async function authority(input: Record<string, unknown>) {
  return authenticatedRpc<Authority>("checkr_authority", { p_input: input });
}
async function service<T = Record<string, unknown>>(
  input: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await createAdminClient().rpc("checkr_service", {
    p_input: input,
  });
  if (error)
    throw new Response(
      error.code === "42501"
        ? "Screening permission denied."
        : /^(Adult eligibility details required|Monthly screening limit exceeded|Independent approver required|Independent approval required|Quote or eligibility changed|Submission requires provider reconciliation|Submission in progress|Order cannot be cancelled)$/.test(
              error.message,
            )
          ? error.message
          : "Checkr workflow could not be confirmed. Refresh the same request.",
      { status: error.code === "42501" ? 403 : 409 },
    );
  return data as T;
}
async function api(
  path: string,
  token?: string,
  form?: URLSearchParams,
  key?: string,
) {
  const c = config();
  const r = await fetch(`${CHECKR_ORIGIN}${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${token || c.clientId}:`).toString("base64")}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: form,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new Response(
      "Checkr did not confirm this operation. Resume the same request.",
      { status: 503 },
    );
  return r.json();
}
async function account(employerId: string) {
  const stored = await service<{
    sealed: string;
    accountId: string;
    credentialed: boolean;
  }>({ op: "account", employerId });
  const token = unseal<{ token: string }>(
    stored.sealed,
    config().key,
    `checkr:staging:${employerId}`,
  ).token;
  return { ...stored, token };
}
export async function connect(employerId: string, code: string) {
  const auth = await authority({ op: "connect", employerId });
  const c = config();
  if (!code || code.length > 10000)
    throw new Response("Connection code required", { status: 400 });
  const result = await api(
    "/oauth/tokens",
    undefined,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.clientId,
      client_secret: c.secret,
      code,
    }),
  );
  if (typeof result.access_token !== "string" || !result.access_token)
    throw new Response("Checkr connection not confirmed", { status: 503 });
  const accountId = providerId(result.checkr_account_id);
  await service({
    op: "connect",
    employerId,
    actor: auth.actor,
    accountId,
    sealed: seal(
      { token: result.access_token },
      c.key,
      `checkr:staging:${employerId}`,
    ),
  });
  return { connected: true };
}
export async function setup(employerId: string) {
  await authority({ op: "connect", employerId });
  return { clientId: config().clientId };
}
async function list(path: string, token: string) {
  const data: Record<string, unknown>[] = [];
  for (let page = 1; page <= 10; page++) {
    const result = await api(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}&per_page=100`,
      token,
    );
    if (!Array.isArray(result.data))
      throw new Response("Checkr catalog unavailable", { status: 503 });
    data.push(...result.data);
    if (!result.next_href) return data;
  }
  throw new Response("Checkr catalog is too large; contact support.", {
    status: 503,
  });
}
export async function catalog(employerId: string) {
  await authority({ op: "catalog", employerId });
  const a = await account(employerId);
  const details = await api("/v1/account", a.token);
  if (details.id !== a.accountId)
    throw new Response("Checkr account mismatch", { status: 503 });
  const credentialed =
    details.authorized === true &&
    details.api_authorized === true &&
    details.purpose === "employment";
  await service({ op: "credential", employerId, credentialed });
  if (!credentialed) return { packages: [], nodes: [], credentialed: false };
  const rows = await list("/v1/packages", a.token);
  const packages: CheckrPackage[] = rows
    .filter((x) => !x.deleted_at)
    .map(curatePackage);
  // Only the documented segmentation-disabled response is an empty hierarchy. Fail closed on all other errors.
  const r = await fetch(
    `${CHECKR_ORIGIN}/v1/nodes?include=packages&per_page=100`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${a.token}:`).toString("base64")}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = await r.json();
  let nodes: CheckrNode[] = [];
  if (r.ok)
    nodes = (await list("/v1/nodes?include=packages", a.token)).map((x) => ({
      id: providerId(x.custom_id),
      name: String(x.name || x.custom_id).slice(0, 100),
      packages: Array.isArray(x.packages) ? x.packages.map(providerId) : [],
    }));
  else if (
    result.error !== "Sorry, your account is not enabled for segmentation"
  )
    throw new Response("Checkr account hierarchy unavailable", { status: 503 });
  return { packages, nodes, credentialed };
}
export async function quote(input: Record<string, unknown>) {
  const employerId = String(input.employerId || "");
  const auth = await authority({ ...input, op: "quote" });
  ordering();
  const state = String(input.state || "").toUpperCase(),
    city = String(input.city || "").trim();
  if (
    !/^(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$/.test(
      state,
    ) ||
    !city ||
    city.length > 100
  )
    throw new Response("Select a US work state and city.", { status: 400 });
  const cat = await catalog(employerId),
    node = String(input.node || "");
  let selected: CheckrPackage | undefined;
  try {
    selected = packagesForNode(cat.packages, cat.nodes, node).find(
      (p) => p.slug === input.package,
    );
  } catch {
    throw new Response("Select an available package and account node", {
      status: 400,
    });
  }
  if (!selected) throw new Response("Package unavailable", { status: 409 });
  const a = await account(employerId);
  return service({
    op: "quote",
    employerId,
    actor: auth.actor,
    subject: input.subject,
    audience: input.audience,
    slug: selected.slug,
    name: selected.name,
    price: selected.price,
    node,
    location: { country: "US", state, city },
    accountId: a.accountId,
  });
}
export async function prepare(input: Record<string, unknown>) {
  const employerId = String(input.employerId || "");
  const auth = await authority({ ...input, op: "prepare" });
  ordering();
  return service<{ id: string }>({
    op: "prepare",
    employerId,
    actor: auth.actor,
    quoteId: input.quoteId,
  });
}
export async function dispatch(employerId: string, orderId: string) {
  const auth = await authority({ op: "dispatch", employerId, orderId });
  ordering();
  const current = await catalog(employerId);
  const saved = await service<{
    package: string;
    node: string;
    baseCents: number;
  }>({ op: "read", employerId, orderId });
  let selected: CheckrPackage | undefined;
  try {
    selected = packagesForNode(
      current.packages,
      current.nodes,
      saved.node,
    ).find((p) => p.slug === saved.package);
  } catch {
    throw new Response("Package division changed; contact support.", {
      status: 409,
    });
  }
  if (!selected || selected.price !== saved.baseCents)
    throw new Response(
      "Package or price changed. This order needs review; no new check was created.",
      { status: 409 },
    );
  const a = await account(employerId);
  const claim = await service<{
    done?: boolean;
    candidateId: string | null;
    email: string;
    package: string;
    node: string;
    location: { country: string; state: string; city: string };
  }>({ op: "claim", employerId, orderId, actor: auth.actor });
  if (claim.done) return { id: orderId };
  const base = { employerId, orderId, actor: auth.actor };
  let candidateId = claim.candidateId;
  if (!candidateId) {
    const candidate = await api(
      "/v1/candidates",
      a.token,
      new URLSearchParams({
        email: claim.email,
        custom_id: `txkpro-${orderId}`,
      }),
      `${orderId}-candidate`,
    );
    candidateId = providerId(candidate.id);
    await service({ ...base, op: "candidate", candidateId });
  }
  const payload = new URLSearchParams({
    candidate_id: candidateId,
    package: claim.package,
    "work_locations[][country]": "US",
    "work_locations[][state]": claim.location.state,
    "work_locations[][city]": claim.location.city,
  });
  if (claim.node) payload.set("node", claim.node);
  const invitation = await api(
    "/v1/invitations",
    a.token,
    payload,
    `${orderId}-invitation`,
  );
  if (
    invitation.candidate_id !== candidateId ||
    invitation.package !== claim.package
  )
    throw new Response("Checkr invitation binding mismatch", { status: 503 });
  await service({
    ...base,
    op: "submitted",
    candidateId,
    invitationId: providerId(invitation.id),
  });
  return { id: orderId };
}
export async function reconcile(
  employerId: string,
  orderId: string,
  fromWebhook = false,
) {
  if (!fromWebhook) await authority({ op: "reconcile", employerId, orderId });
  const a = await account(employerId);
  const saved = await service<{
    invitationId: string;
    candidateId: string;
    reportId: string | null;
    package: string;
  }>({ op: "read", employerId, orderId });
  if (!saved.invitationId)
    throw new Response(
      "Submission awaiting confirmation. Resume the same order.",
      { status: 409 },
    );
  const invitation = await api(
    `/v1/invitations/${providerId(saved.invitationId)}`,
    a.token,
  );
  if (
    invitation.id !== saved.invitationId ||
    invitation.candidate_id !== saved.candidateId ||
    invitation.package !== saved.package
  )
    throw new Response("Checkr order binding mismatch", { status: 503 });
  const reportId = invitation.report_id
    ? providerId(invitation.report_id)
    : null;
  let reportStatus: string | null = null;
  if (reportId) {
    const report = await api(`/v1/reports/${reportId}`, a.token);
    if (report.id !== reportId || report.candidate_id !== saved.candidateId)
      throw new Response("Checkr report binding mismatch", { status: 503 });
    reportStatus = operationalStatus(report.status, true);
  }
  await service({
    op: "status",
    employerId,
    orderId,
    invitationId: saved.invitationId,
    candidateId: saved.candidateId,
    invitationStatus: operationalStatus(invitation.status, false),
    reportId,
    reportStatus,
  });
  return { confirmed: true };
}
export async function review(input: Record<string, unknown>) {
  const auth = await authority(input);
  return service({ ...input, actor: auth.actor });
}
export async function processEvent(event: Record<string, unknown>) {
  const data = event.data as { object?: { id?: string } } | undefined;
  const eventId = providerId(event.id),
    accountId = providerId(event.account_id),
    objectId = providerId(data?.object?.id);
  const result = await service<{ employerId?: string; orderId?: string }>({
    op: "event",
    eventId,
    accountId,
    objectId,
    kind: String(event.type),
  });
  if (result.employerId && result.orderId)
    await reconcile(result.employerId, result.orderId, true);
}
