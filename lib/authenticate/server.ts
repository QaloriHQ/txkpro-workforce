import "server-only";
import Stripe from "stripe";
import { authenticatedRpc } from "@/lib/rewards/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fundingDocuments } from "@/lib/rewards/funding-documents";
import { ORIGIN, FIXTURE_CODE, PRODUCTS, quoteProducts, mockRequest, mockComplete, sessionMatches, type ProductId } from "./contracts";
import { validPurpose, fixtureOnly } from "@/lib/authcard/contracts";
export type OrderView = {
    id: string;
    name: string;
    audience: string;
    products: ProductId[];
    providerCents: number;
    platformCents: number;
    thirdPartyCents: number;
    totalCents: number;
    status: string;
    payment: string;
    own: boolean;
    createdAt: string;
    card?: {status: string; authorized: boolean; verified: boolean; purpose: string};
    items: {
        product: ProductId;
        status: string;
    }[];
};
export type ScreeningPolicy = {state: "required" | "accepted" | "superseded" | "revoked"; canAccept: boolean; policyId: string; version: number; hash: string; title: string; body: string; history: {id: string; version: number; hash: string; actor: string; acceptedAt: string; revokedAt: string | null; body: string}[]};
export type Workspace = {
    policy?: ScreeningPolicy;
    canManage: boolean;
    canOrder: boolean;
    canReview: boolean;
    subjects: {
        id: string;
        name: string;
        audience: string;
    }[];
    members: {
        id: string;
        name: string;
        canOrder: boolean;
        canReview: boolean;
        limit: number;
        threshold: number;
    }[];
    orders: OrderView[];
    bundles: {
        id: string;
        name: string;
        products: ProductId[];
    }[];
    costs: {
        providerCents: number;
        platformCents: number;
        thirdPartyCents: number;
        totalCents: number;
    } | null;
};
type Authority = Workspace & {
    actor: string;
};
type Order = {
    id: string;
    owner_type: string;
    owner_id: string;
    actor: string;
    subject: string;
    products: ProductId[];
    provider_cents: number;
    platform_cents: number;
    third_party_cents: number;
    total_cents: number;
    payment_status: string;
    status: string;
    pricing_version: string;
    payment_configuration: string;
    stripe_session: string | null;
    checkout_lease: string | null;
    customer_email?: string;
};
const APP_ORIGIN = "https://staging-workforce.txkpro.com";
export function configured() { return Boolean(process.env.AUTHENTICATE_SANDBOX_API_KEY && process.env.REWARDS_SANDBOX_APP_ORIGIN === APP_ORIGIN); }
function config() {
    if (!configured())
        throw new Response("Authenticate sandbox is awaiting configuration.", { status: 503 });
    return process.env.AUTHENTICATE_SANDBOX_API_KEY!;
}
function paymentConfig() {
    const key = process.env.STRIPE_SANDBOX_SECRET_KEY, publishableKey = process.env.STRIPE_SANDBOX_PUBLISHABLE_KEY;
    if (!key?.match(/^(sk|rk)_test_/) || !publishableKey?.startsWith("pk_test_") || process.env.REWARDS_SANDBOX_APP_ORIGIN !== APP_ORIGIN)
        throw new Response("Stripe sandbox is awaiting configuration. No payment was taken.", { status: 503 });
    return { stripe: new Stripe(key, { maxNetworkRetries: 2, timeout: 15000, appInfo: { name: "TXKPRO Authenticate sandbox" } }), publishableKey };
}
function pricing() {
    const b = process.env.REWARDS_CARD_THIRD_PARTY_BPS, f = process.env.REWARDS_CARD_THIRD_PARTY_FIXED_CENTS, configuration = process.env.REWARDS_CARD_PAYMENT_METHOD_CONFIGURATION;
    if (!b?.match(/^\d+$/) || !f?.match(/^\d+$/) || !configuration?.startsWith("pmc_") || !process.env.REWARDS_PRICING_VERSION)
        throw new Response("Sandbox prices are awaiting configuration.", { status: 503 });
    return { bps: Number(b), fixed: Number(f), configuration };
}
export async function authority(input: Record<string, unknown>) { return authenticatedRpc<Authority>("auth_screening_authority", { p_input: input }); }
async function service<T = Order>(input: Record<string, unknown>): Promise<T> {
    const { data, error } = await createAdminClient().rpc("auth_screening_service", { p_input: input });
    if (error)
        throw new Response(error.code === "42501" ? "Screening permission, approval or current Employer policy acceptance changed." : /^(Monthly screening limit exceeded|Independent approver required|Quote expired; cancel and create a new request|Payment setup in progress|Payment requires administrator reconciliation|Provider result unconfirmed; administrator reconciliation required|Order cannot be cancelled|Request binding mismatch)$/.test(error.message) ? error.message : "Screening request could not be confirmed. Resume the same request.", { status: error.code === "42501" ? 403 : 409 });
    return data as T;
}
export async function workspace(input: Record<string, unknown>) {
    const { actor: _actor, ...view } = await authority({ ...input, op: "workspace" }); void _actor;
    const cards = await authenticatedRpc<Record<string, NonNullable<OrderView['card']>>>("authcard_order_status", {p_input: input});
    const policy = input.ownerType === "employer" ? await policyAction({...input,op:"policy"}) : undefined;
    return {...view, policy, orders:view.orders.map(o=>({...o,card:cards[o.id]}))};
}
export async function policyAction(input: Record<string, unknown>) {
    return authenticatedRpc<ScreeningPolicy>("screening_policy", {p_input: input});
}
export async function action(input: Record<string, unknown>) {
    const a = await authority(input);
    return service({ ...input, actor: a.actor });
}
export async function quote(input: Record<string, unknown>) {
    if (!validPurpose(input)) throw new Response("Select the intended transaction use and certify both requirements.", {status:400});
    const a = await authority({ ...input, op: "quote" });
    config();
    paymentConfig();
    const p = pricing();
    let q;
    try {
        q = quoteProducts(input.products, p.bps, p.fixed);
    }
    catch {
        throw new Response("Select available checks.", { status: 400 });
    }
    if (typeof input.requestKey !== "string" || !/^[0-9a-f-]{36}$/i.test(input.requestKey))
        throw new Response("Request key required", { status: 400 });
    const o = await service({ ...input, ...q, paymentConfiguration: p.configuration, actor: a.actor, op: "quote" });
    return { id: o.id, status: o.status };
}
function line(name: string, amount: number) { return { price_data: { currency: "usd", unit_amount: amount, product_data: { name } }, quantity: 1 }; }
export async function checkout(input: Record<string, unknown>) {
    const a = await authority({ ...input, op: "checkout" });
    config();
    const { stripe, publishableKey } = paymentConfig();
    const o = await service({ ...input, actor: a.actor, op: "checkout" });
    const metadata = { screening_order_id: o.id, owner_type: o.owner_type, owner_id: o.owner_id, integration_identifier: "txkauths" };
    const s = o.stripe_session ? await stripe.checkout.sessions.retrieve(o.stripe_session) : await stripe.checkout.sessions.create({
        ui_mode: "elements", mode: "payment", return_url: `${APP_ORIGIN}/${o.owner_type}/screening${o.owner_type === "employer" ? `?employer=${encodeURIComponent(o.owner_id)}` : ""}`,
        payment_method_configuration: o.payment_configuration, client_reference_id: o.id, customer_email: o.customer_email, invoice_creation: { enabled: true }, metadata, payment_intent_data: { metadata },
        line_items: [...o.products.map(id => line(`Sandbox: ${PRODUCTS.find(p => p.id === id)!.name}`, 500)), line("TXKPRO service fee (10%, $5 minimum)", o.platform_cents), ...(o.third_party_cents ? [line("Third-party payment fees", o.third_party_cents)] : [])],
    }, { idempotencyKey: `txkpro-authenticate-${o.id}` });
    if (!sessionMatches(s, { ...o, stripe_session: s.id }) || s.client_reference_id !== o.id)
        throw new Response("Sandbox payment binding mismatch", { status: 503 });
    if (!o.stripe_session)
        await service({ ...input, op: "session", sessionId: s.id, lease: o.checkout_lease });
    if (s.status !== "open" || s.payment_status !== "unpaid" || !s.client_secret)
        return { message: "Payment submitted or expired. Check this same order before paying." };
    return { clientSecret: s.client_secret, publishableKey };
}
async function paymentObservation(o: Order, s: Stripe.Checkout.Session, eventId: string, kind?: string) {
    if (!sessionMatches(s, o) || s.client_reference_id !== o.id)
        throw new Response("Payment binding mismatch", { status: 409 });
    if (s.payment_status === "paid" && kind !== "hold")
        kind = "paid";
    else if (s.status === "expired" && !kind)
        kind = "expired";
    if (kind)
        await service({ op: "payment", orderId: o.id, sessionId: s.id, eventId, kind });
}
export async function status(input: Record<string, unknown>) {
    await authority({ ...input, op: "status" });
    const o = await service({ ...input, op: "read" });
    if (!o.stripe_session)
        return { canResume: false, message: "No payment has been submitted. Open checkout for this order." };
    const { stripe } = paymentConfig(), s = await stripe.checkout.sessions.retrieve(o.stripe_session);
    await paymentObservation(o, s, `retrieve:${s.id}:${s.status}:${s.payment_status}`);
    const updated = await service({ ...input, op: "read" });
    const canResume = s.status === "open" && s.payment_status === "unpaid" && updated.payment_status !== "hold";
    return { canResume, message: updated.payment_status === "hold" ? "Payment needs administrator reconciliation. No additional check will run." : s.payment_status === "paid" ? "Stripe confirmed test payment. You can run the sandbox checks." : canResume ? "No payment confirmed. Resume this same order." : "Stripe has not confirmed payment. Keep this same order for tracking." };
}
export async function documents(input: Record<string, unknown>) {
    await authority({ ...input, op: "documents" });
    const o = await service({ ...input, op: "read" });
    if (!o.stripe_session)
        return { message: "Documents appear after test payment." };
    const { stripe } = paymentConfig(), s = await stripe.checkout.sessions.retrieve(o.stripe_session, { expand: ["payment_intent.latest_charge", "invoice"] });
    if (!sessionMatches(s, o))
        throw new Response("Payment binding mismatch", { status: 409 });
    const result = fundingDocuments({ id: o.id, total_cents: o.total_cents, stripe_session_id: o.stripe_session, status: o.payment_status }, { ...s, metadata: { funding_id: o.id } });
    return { ...result, message: "Stripe test invoices and receipts. Authenticate account billing is tracked separately." };
}
export async function processPaymentEvent(event: Stripe.Event, stripe: Stripe) {
    if (event.livemode)
        throw new Response("Live screening payments disabled", { status: 400 });
    let id: string | undefined, kind: string | undefined;
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) {
        const s = event.data.object as Stripe.Checkout.Session;
        id = s.metadata?.screening_order_id;
        kind = event.type.endsWith("async_payment_failed") ? "failed" : event.type.endsWith("expired") ? "expired" : undefined;
        if (!id)
            return false;
        const o = await service({ op: "read", orderId: id });
        // Bind the signed event AND retrieve current provider state independently.
        if (!sessionMatches(s, o))
            throw new Response("Payment event binding mismatch", { status: 409 });
        await paymentObservation(o, await stripe.checkout.sessions.retrieve(s.id), event.id, kind);
        return true;
    }
    if (["charge.refunded", "charge.dispute.created"].includes(event.type)) {
        const obj = event.data.object as Stripe.Charge | Stripe.Dispute;
        const c = "charge" in obj ? await stripe.charges.retrieve(typeof obj.charge === "string" ? obj.charge : obj.charge.id) : obj;
        if (!c.payment_intent)
            return false;
        const pi = await stripe.paymentIntents.retrieve(typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent.id);
        id = pi.metadata.screening_order_id;
        if (!id)
            return false;
        const o = await service({ op: "read", orderId: id });
        if (!o.stripe_session)
            throw new Response("Payment session unavailable", { status: 409 });
        const s = await stripe.checkout.sessions.retrieve(o.stripe_session);
        if ((typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id) !== pi.id || pi.livemode || pi.amount !== o.total_cents || pi.currency !== "usd")
            throw new Response("Payment intent binding mismatch", { status: 409 });
        await paymentObservation(o, s, event.id, "hold");
        return true;
    }
    return false;
}
async function mockApi(path: string, body: unknown) {
    if (!path.startsWith("/mock/") || !["/mock/user/create", "/mock/user/consent", ...PRODUCTS.map(p => mockRequest(p.id).path)].includes(path))
        throw new Error("Sandbox path denied");
    const expected = path === '/mock/user/create' ? { firstName: "Jonathan", lastName: "Doe", dob: "22-05-1990", email: "sandbox@example.invalid" } : path === '/mock/user/consent' ? { userAccessCode: FIXTURE_CODE, isBackgroundDisclosureAccepted: true, GLBPurposeAndDPPAPurpose: true, FCRAPurpose: true, fullName: "Jonathan Doe" } : PRODUCTS.map(p=>mockRequest(p.id)).find(r=>r.path===path)?.body;
    const safe = fixtureOnly(body,expected);
    const r = await fetch(`${ORIGIN}${path}`, { method: "POST", headers: { Authorization: `Bearer ${config()}`, "Content-Type": "application/json" }, body: JSON.stringify(safe), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!r.ok)
        throw new Response("Authenticate test response unconfirmed. Keep this order for administrator reconciliation.", { status: 503 });
    const data = await r.json();
    if (!data || typeof data !== "object" || data.errorCode || data.errorMessage)
        throw new Response("Authenticate sandbox could not confirm the test request.", { status: 503 });
    return data;
}
export async function dispatch(input: Record<string, unknown>) {
    const a = await authority({ ...input, op: "dispatch" });
    config();
    const o = await service({ ...input, op: "read" });
    // Synthetic fixtures only. Workspace subject PII is never included in any Authenticate request.
    for (const id of o.products) {
        const claim = await service<{
            done?: boolean;
            lease?: string;
        }>({ ...input, op: "claim", actor: a.actor, product: id });
        if (claim.done)
            continue;
        const u = await mockApi("/mock/user/create", { firstName: "Jonathan", lastName: "Doe", dob: "22-05-1990", email: "sandbox@example.invalid" });
        if (u.userAccessCode !== FIXTURE_CODE)
            throw new Response("Authenticate fixture mismatch", { status: 503 });
        const consent = await mockApi("/mock/user/consent", { userAccessCode: FIXTURE_CODE, isBackgroundDisclosureAccepted: true, GLBPurposeAndDPPAPurpose: true, FCRAPurpose: true, fullName: "Jonathan Doe" });
        if (consent.success !== true)
            throw new Response("Synthetic test consent not confirmed", { status: 503 });
        const request = mockRequest(id), r = await mockApi(request.path, request.body);
        if (!mockComplete(id, r))
            throw new Response("Test result needs administrator reconciliation; no check will be resubmitted.", { status: 503 });
        await service({ ...input, op: "finish", actor: a.actor, product: id, lease: claim.lease });
    }
    return { message: "Synthetic checks complete. No real person was screened." };
}
