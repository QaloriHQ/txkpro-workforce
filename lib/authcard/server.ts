import "server-only";
import Stripe from "stripe";
import { authenticatedRpc } from "@/lib/rewards/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { seal, unseal } from "@/lib/rewards/contracts";
import { fundingDocuments } from "@/lib/rewards/funding-documents";
import { APP_ORIGIN, KYU_FEE_CENTS, adultDate, privateDetails, type PrivateDetails, type CardWorkspace } from "./contracts";
type Card = { adult_verified?: boolean; id: string; user_id: string; status: string; payment_status: string; payment_session: string | null; identity_session: string | null; details_encrypted: string | null; payment_lease: string; identity_lease: string };
export function configured() {
  return Boolean(process.env.STRIPE_SANDBOX_SECRET_KEY?.match(/^(sk|rk)_test_/) && process.env.STRIPE_SANDBOX_PUBLISHABLE_KEY?.startsWith("pk_test_") && process.env.REWARDS_SANDBOX_APP_ORIGIN === APP_ORIGIN && process.env.REWARDS_ENCRYPTION_KEY && Buffer.from(process.env.REWARDS_ENCRYPTION_KEY, "base64").length === 32);
}
function stripeClient() {
  if (!configured()) throw new Response("KYU sandbox configuration is unavailable. No payment was taken.", { status: 503 });
  return new Stripe(process.env.STRIPE_SANDBOX_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 15000 });
}
function identityResultsClient() {
  const key=process.env.STRIPE_IDENTITY_SANDBOX_RESTRICTED_KEY || (process.env.STRIPE_SANDBOX_SECRET_KEY?.startsWith('rk_test_') ? process.env.STRIPE_SANDBOX_SECRET_KEY : undefined);
  if (!key?.startsWith('rk_test_')) throw new Response("Stripe verification results access needs TXKPRO support configuration. Your existing fee and verification session are retained.",{status:503});
  return new Stripe(key,{maxNetworkRetries:2,timeout:15000});
}
async function self(input: Record<string, unknown>) { return authenticatedRpc<CardWorkspace & {actor: string}>("authcard_self", {p_input: input}); }
async function service(input: Record<string, unknown>): Promise<Card> {
  const {data,error} = await createAdminClient().rpc("authcard_service", {p_input: input});
  if (error) throw new Response(error.code === '42501' ? "AuthCard access denied." : "AuthCard request unconfirmed. Resume the same request or contact support.", {status: error.code === '42501' ? 403 : 409});
  return data as Card;
}
async function own() { const {actor} = await self({op: "actor"}); return actor; }
export async function cardWorkspace() { const {actor: _actor, ...view} = await self({op:"workspace"}); void _actor; return view; }
export async function cardAction(input: Record<string, unknown>) { await self(input); return {message: input.op === "revoke" || input.op === "deactivate" ? "Future access and submissions blocked. Already submitted checks and historical authorization cannot be recalled." : "Saved."}; }
export async function editDetails() {
  const actor = await own(), c = await service({op:"read",actor});
  if (!c.details_encrypted) return {details:null,hasSSN:false};
  const details = unseal<PrivateDetails>(c.details_encrypted, process.env.REWARDS_ENCRYPTION_KEY!, `authcard:${actor}`);
  const {ssn,...safe} = details;
  return {details:safe,hasSSN:Boolean(ssn)};
}
export async function saveDetails(input: Record<string, unknown>) {
  if (!configured()) throw new Response("Private storage is unavailable.",{status:503});
  let details: PrivateDetails;
  try { details = privateDetails(input.details); } catch(e) {throw new Response(e instanceof Error ? e.message : "Enter complete US adult test details.",{status:400});}
  const actor = await own(), c = await service({op:"read",actor});
  if (!details.ssn && c.details_encrypted) details.ssn = unseal<PrivateDetails>(c.details_encrypted,process.env.REWARDS_ENCRYPTION_KEY!,`authcard:${actor}`).ssn;
  await service({op:"details",actor,encrypted:seal(details,process.env.REWARDS_ENCRYPTION_KEY!,`authcard:${actor}`),name:`${details.firstName} ${details.lastName}`});
  return {message:"Private details saved. These are candidate-entered claims; Stripe identity data is stored separately and never forwarded."};
}
function matchesPayment(s: Stripe.Checkout.Session,c: Card) {
  return !s.livemode && s.id === c.payment_session && s.client_reference_id === c.id && s.metadata?.kyu_id === c.id && s.amount_total === KYU_FEE_CENTS && s.currency === 'usd';
}
export async function payment() {
  const actor=await own(), stripe=stripeClient();
  const prepared=await service({op:"read",actor});
  if (!prepared.details_encrypted) throw new Response("Save your private test information before paying the KYU fee.",{status:400});
  if (prepared.status==='revoked') throw new Response("AuthCard is deactivated. Contact support before continuing.",{status:409});
  if (prepared.payment_status==='paid') return {message:"Your one-time test fee is already paid. Continue verification."};
  identityResultsClient(); // Require adult-results access before a new fee or provider lease.
  const c=await service({op:"payment_claim",actor});
  if (c.payment_status==='paid') return {message:"Your one-time test fee is already paid. Continue verification."};
  // Detect missing Identity capability before taking the $5 test fee.
  try {await stripe.identity.verificationSessions.list({limit:1});}
  catch {throw new Response("Stripe Identity sandbox is unavailable for this account. No payment was taken. Contact TXKPRO support.",{status:503});}
  const s=c.payment_session ? await stripe.checkout.sessions.retrieve(c.payment_session) : await stripe.checkout.sessions.create({ui_mode:"elements",mode:"payment",client_reference_id:c.id,metadata:{kyu_id:c.id},payment_intent_data:{metadata:{kyu_id:c.id}},invoice_creation:{enabled:true},return_url:`${APP_ORIGIN}/account/authcard`,line_items:[{price_data:{currency:"usd",unit_amount:KYU_FEE_CENTS,product_data:{name:"TXKPRO KYU one-time platform fee (sandbox)"}},quantity:1}]},{idempotencyKey:`txkpro-kyu-fee-${c.id}`});
  if (!matchesPayment(s,{...c,payment_session:s.id})) throw new Response("KYU payment binding mismatch.",{status:409});
  if (!c.payment_session) await service({op:"payment_bind",actor,sessionId:s.id,lease:c.payment_lease});
  if (s.status!=='open' || s.payment_status!=='unpaid' || !s.client_secret) return {message:"Refresh this same payment. No additional fee will be created."};
  return {clientSecret:s.client_secret,publishableKey:process.env.STRIPE_SANDBOX_PUBLISHABLE_KEY};
}
async function observePayment(c: Card,stripe: Stripe,hold=false) {
  if (!c.payment_session) return;
  const s=await stripe.checkout.sessions.retrieve(c.payment_session);
  if (!matchesPayment(s,c)) throw new Response("KYU payment binding mismatch.",{status:409});
  if (hold || s.payment_status==='paid') await service({op:"payment_observe",actor:c.user_id,sessionId:s.id,status:hold?'hold':'paid'});
}
async function observeIdentity(c: Card,stripe: Stripe) {
  if (!c.identity_session) return;
  // Status is available without sensitive expansion; processing must still synchronize.
  const s=await stripe.identity.verificationSessions.retrieve(c.identity_session);
  function bound(session: Stripe.Identity.VerificationSession) {
    return !session.livemode && session.id===c.identity_session && session.client_reference_id===c.id && session.metadata.kyu_id===c.id && session.type==='document';
  }
  if (!bound(s)) throw new Response("KYU verification binding mismatch.",{status:409});
  let adult=false;
  if (s.redaction?.status==='redacted') {
    await service({op:"identity_observe",actor:c.user_id,sessionId:s.id,status:'cancelled',adult:false});return;
  }
  if (s.status==='verified') {
    if(c.status==='verified'&&c.adult_verified) return; // Already observed adult proof; don't repeatedly fetch sensitive DOB.
    let detailed: Stripe.Identity.VerificationSession;
    try {detailed=await identityResultsClient().identity.verificationSessions.retrieve(s.id,{expand:['verified_outputs.dob']});}
    catch(e) {if(e instanceof Response)throw e;throw new Response("Stripe completed verification, but TXKPRO could not access adult-verification results. Contact support; your existing session and fee are retained.",{status:503});}
    if (!bound(detailed) || detailed.status!=='verified') throw new Response("Verification changed. Check status again.",{status:409});
    if (detailed.redaction?.status==='redacted') {
      await service({op:"identity_observe",actor:c.user_id,sessionId:s.id,status:'cancelled',adult:false});return;
    }
    const dob=detailed.verified_outputs?.dob;
    adult=Boolean(dob?.year && dob.month && dob.day && adultDate(`${dob.year}-${String(dob.month).padStart(2,'0')}-${String(dob.day).padStart(2,'0')}`));
    if(!dob) throw new Response("Stripe completed verification, but adult-verification results are unavailable. Contact support; no new payment is required.",{status:503});
  }
  await service({op:"identity_observe",actor:c.user_id,sessionId:s.id,status:s.status==='canceled'?'cancelled':s.status,adult});
}
export async function identity(input: Record<string, unknown>) {
  const actor=await own(),stripe=stripeClient();
  if (input.adultConfirmed!==true) throw new Response("Adult confirmation required. US minors cannot use KYU.",{status:400});
  const c=await service({op:"read",actor});
  if (c.payment_status!=='paid' || !c.details_encrypted || c.status==='revoked') throw new Response("Save private details and confirm the one-time fee before verification.",{status:409});
  const details=unseal<PrivateDetails>(c.details_encrypted!,process.env.REWARDS_ENCRYPTION_KEY!,`authcard:${actor}`);
  if (!adultDate(details.dob)) throw new Response("Adult account required.",{status:403});
  await service({op:"identity_claim",actor}).then(claim=>Object.assign(c,claim));
  const s=c.identity_session ? await stripe.identity.verificationSessions.retrieve(c.identity_session) : await stripe.identity.verificationSessions.create({type:"document",client_reference_id:c.id,metadata:{kyu_id:c.id},options:{document:{require_matching_selfie:true}},return_url:`${APP_ORIGIN}/account/authcard`},{idempotencyKey:`txkpro-kyu-identity-${c.id}`});
  if (s.livemode || s.client_reference_id!==c.id || s.metadata.kyu_id!==c.id) throw new Response("Verification binding mismatch.",{status:409});
  if (!c.identity_session) await service({op:"identity_bind",actor,sessionId:s.id,lease:c.identity_lease});
  if (s.status!=='requires_input' || !s.client_secret) {
    await observeIdentity({...c,identity_session:s.id},stripe);
    return {message:s.status==='processing'?"Stripe is processing your verification. The page will check for the result automatically.":"Stripe status synchronized. Your existing verification and fee are retained."};
  }
  return {identitySecret:s.client_secret,publishableKey:process.env.STRIPE_SANDBOX_PUBLISHABLE_KEY};
}
export async function refresh() {
  const actor=await own(),c=await service({op:"read",actor}),stripe=stripeClient();
  await observePayment(c,stripe);await observeIdentity(c,stripe);
  return {message:"Provider status refreshed. Sandbox verification is simulated, not real identity proof."};
}
export async function paymentStatus() {
  const actor=await own(),c=await service({op:'read',actor}),stripe=stripeClient();
  await observePayment(c,stripe);
  const current=await service({op:'read',actor});
  if (!current.payment_session) return {canResume:false,message:"No KYU payment submitted."};
  const s=await stripe.checkout.sessions.retrieve(current.payment_session);
  return {canResume:current.payment_status!=='hold' && s.status==='open' && s.payment_status==='unpaid',message:current.payment_status==='paid' ? "Stripe confirmed your one-time test fee. Continue KYU verification." : current.payment_status==='hold' ? "Payment reversed or disputed. Contact support." : "Payment unconfirmed. Resume this same request."};
}
export async function documents() {
  const actor=await own(),c=await service({op:"read",actor});
  if (!c.payment_session) return {message:"No fee submitted yet."};
  const s=await stripeClient().checkout.sessions.retrieve(c.payment_session,{expand:['invoice','payment_intent.latest_charge']});
  if (!matchesPayment(s,c)) throw new Response("Document binding mismatch.",{status:409});
  return {...fundingDocuments({id:c.id,total_cents:KYU_FEE_CENTS,stripe_session_id:s.id,status:c.payment_status},{...s,metadata:{funding_id:c.id}}),message:"Stripe sandbox invoice and receipt."};
}
export async function processKyuEvent(event: Stripe.Event,stripe: Stripe) {
  if (event.type.startsWith('identity.verification_session.')) {
    const s=event.data.object as Stripe.Identity.VerificationSession;
    if (!s.metadata.kyu_id) return false;
    if (event.livemode || s.livemode) throw new Response("Live KYU disabled.",{status:400});
    const c=await service({op:'provider_read',id:s.metadata.kyu_id});
    if (s.id!==c.identity_session) throw new Response("Identity event binding mismatch.",{status:409});
    await observeIdentity(c,stripe);return true;
  }
  if (event.type.startsWith('checkout.session.')) {
    const s=event.data.object as Stripe.Checkout.Session;
    if (!s.metadata?.kyu_id) return false;
    if (event.livemode) throw new Response("Live KYU disabled.",{status:400});
    const c=await service({op:'provider_read',id:s.metadata.kyu_id});
    if (!matchesPayment(s,c)) throw new Response("KYU event binding mismatch.",{status:409});
    await observePayment(c,stripe);return true;
  }
  if (['charge.refunded','charge.dispute.created'].includes(event.type)) {
    const obj=event.data.object as Stripe.Charge | Stripe.Dispute;
    const charge='charge' in obj ? await stripe.charges.retrieve(typeof obj.charge==='string'?obj.charge:obj.charge.id) : obj;
    if (!charge.payment_intent) return false;
    const pi=await stripe.paymentIntents.retrieve(typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent.id);
    if (!pi.metadata.kyu_id) return false;
    if (event.livemode || pi.livemode) throw new Response("Live KYU disabled.",{status:400});
    const c=await service({op:'provider_read',id:pi.metadata.kyu_id});
    const s=await stripe.checkout.sessions.retrieve(c.payment_session!);
    if (!matchesPayment(s,c) || (typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id)!==pi.id || pi.amount!==KYU_FEE_CENTS || pi.currency!=='usd') throw new Response("KYU reversal binding mismatch.",{status:409});
    await observePayment(c,stripe,true);return true;
  }
  return false;
}
