import "server-only";
import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { authority, connect } from "./server";
import { sandboxConfigurationIssues } from "./contracts";
import { seal, unseal } from "@/lib/rewards/contracts";

const COOKIE = "__Host-checkr-oauth";
const CONTEXT = "checkr:staging:oauth";
type Pending = { state: string; employerId: string; actor: string; expires: number };
function configuration() {
  const issues = sandboxConfigurationIssues(process.env);
  if (issues.length) {
    console.warn("checkr_sandbox_configuration", { issues });
    throw new Response(`Checkr sandbox setup is unavailable. Staging configuration needs: ${issues.join(", ")}.`, { status: 503 });
  }
  console.info("checkr_sandbox_configuration_ready");
  return { key: process.env.REWARDS_ENCRYPTION_KEY!, clientId: process.env.CHECKR_SANDBOX_CLIENT_ID!, origin: process.env.CHECKR_SANDBOX_APP_ORIGIN! };
}
export async function beginConnection(employerId: string) {
  const auth = await authority({ op: "connect", employerId });
  const c = configuration();
  const state = randomBytes(32).toString("hex");
  const pending: Pending = { state, employerId, actor: auth.actor, expires: Date.now() + 10 * 60 * 1000 };
  (await cookies()).set(COOKIE, seal(pending, c.key, CONTEXT), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600,
  });
  const url = new URL(`https://partners.checkrhq-staging.net/authorize/${encodeURIComponent(c.clientId)}`);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", `${c.origin}/api/checkr/oauth/callback`);
  return { url: url.href };
}
export async function finishConnection(code: string, state: string) {
  let stage = "configuration";
  try {
    const c = configuration();
    stage = "session_cookie";
    const jar = await cookies();
    const saved = jar.get(COOKIE)?.value;
    jar.delete(COOKIE);
    if (!saved || !/^[a-f0-9]{64}$/.test(state)) throw new Response("Checkr connection expired. Start again.", { status: 400 });
    stage = "session_decryption";
    let pending: Pending;
    try { pending = unseal<Pending>(saved, c.key, CONTEXT); }
    catch { throw new Response("Checkr connection could not be verified.", { status: 400 }); }
    stage = "state_and_expiry";
    if (!/^[a-f0-9]{64}$/.test(pending.state) || !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state)) || !Number.isFinite(pending.expires) || pending.expires < Date.now())
      throw new Response("Checkr connection expired. Start again.", { status: 400 });
    stage = "employer_authority";
    const auth = await authority({ op: "connect", employerId: pending.employerId });
    stage = "actor_binding";
    if (auth.actor !== pending.actor) throw new Response("Checkr connection belongs to another session.", { status: 403 });
    console.info("checkr_oauth_session_validated");
    stage = "account_connection";
    await connect(pending.employerId, code);
    console.info("checkr_oauth_callback_connected");
    return pending.employerId;
  } catch (error) {
    console.warn("checkr_oauth_callback_failed", { stage, status: error instanceof Response ? error.status : null });
    throw error;
  }
}
