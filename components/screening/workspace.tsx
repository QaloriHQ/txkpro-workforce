"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { ActionModal } from "@/components/design-system/action-modal";
import { ScreeningPolicyPanel } from "./policy";
import { PURPOSES } from "@/lib/authcard/contracts";
import { PRODUCTS, PACKAGES, matchingPackage, quoteProducts, type ProductId } from "@/lib/authenticate/contracts";
import type { Workspace, OrderView } from "@/lib/authenticate/server";
const Checkout = dynamic(() => import("./checkout").then(m => m.ScreeningCheckout), { ssr: false });
const money = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
type Session = {
    clientSecret: string;
    publishableKey: string;
};
type Docs = {
    message: string;
    receiptUrl?: string | null;
    invoiceUrl?: string | null;
    invoicePdfUrl?: string | null;
};
function Breakdown({ o }: {
    o: OrderView;
}) { return <dl className="screening-prices"><div><dt>Provider base prices (test)</dt><dd>{money(o.providerCents)}</dd></div><div><dt>TXKPRO fee · 10%, $5 minimum</dt><dd>{money(o.platformCents)}</dd></div><div><dt>Third-party payment fees</dt><dd>{money(o.thirdPartyCents)}</dd></div><div><dt>Test total</dt><dd>{money(o.totalCents)}</dd></div></dl>; }
export function ScreeningWorkspace({ initial, ownerType, ownerId, configured }: {
    initial: Workspace;
    ownerType: "institution" | "employer";
    ownerId: string;
    configured: boolean;
}) {
    const [data, setData] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
    const [products, setProducts] = useState<ProductId[]>([]), [subject, setSubject] = useState(""), [requestKey, setRequestKey] = useState(""), [locked, setLocked] = useState(false), [orderId, setOrderId] = useState("");
    const [purpose,setPurpose]=useState(""), [transaction,setTransaction]=useState(false), [nonEligibility,setNonEligibility]=useState(false), [description,setDescription]=useState("");
    const [session, setSession] = useState<Session | null>(null), [sessionOrder, setSessionOrder] = useState(""), [docs, setDocs] = useState<Docs | null>(null);
    async function api(op: string, extra: Record<string, unknown> = {}) { const r = await fetch("/api/screening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ownerType, ownerId, ...extra }) }); const d = await r.json(); if (!r.ok)
        throw Error(d.error || "Request unconfirmed. Keep this same order."); return d; }
    async function refresh() { setData(await api("workspace")); }
    async function run(op: string, extra: Record<string, unknown> = {}) { setBusy(true); setMessage(""); try {
        const d = await api(op, extra);
        await refresh();
        setMessage(d.message || "Saved.");
        return d;
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "Request unconfirmed.");
    }
    finally {
        setBusy(false);
    } }
    async function pay(id: string) { setBusy(true); setSession(null); setSessionOrder(id); setMessage(""); try {
        const d = await api("checkout", { orderId: id });
        if (d.clientSecret)
            setSession(d);
        else
            setMessage(d.message);
        await refresh();
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "Payment unavailable");
    }
    finally {
        setBusy(false);
    } }
    const policyReady = ownerType !== "employer" || data.policy?.state === "accepted";
    const current = data.orders.find(o => o.id === orderId), base = products.reduce((total, id) => total + PRODUCTS.find(p => p.id === id)!.cents, 0);
    function orderControls(o: OrderView) {
        return <><Breakdown o={o}/><p className="card-sub">Context: {o.name} · {o.audience}. Authenticate uses its fixed adult test identity. This does not screen this workspace member.</p>
 <p className="funding-notice">AuthCard: {o.card?.status || "Not requested"} · {o.card?.verified ? "TXKPRO KYU verified (sandbox)" : "Not shared or not verified"} · {o.card?.authorized ? "Order authorized" : "Candidate authorization required before checkout"}. Platform identity status is not background clearance.</p>
 <div className="screening-actions">
 {o.status === "pending_approval" && data.canReview && !o.own ? <button className="button button-dark" disabled={busy || !policyReady} onClick={() => void run("approve", { orderId: o.id })}>Approve test order</button> : null}
 {o.status === "reserved" && o.own && data.canOrder && !['paid', 'hold', 'failed', 'expired'].includes(o.payment) ? <button className="button button-dark" disabled={busy || !configured || !policyReady || !o.card?.authorized} onClick={() => void pay(o.id)}>Open / resume test checkout</button> : null}
 {o.own && data.canOrder && o.payment === "paid" && ['reserved', 'processing'].includes(o.status) ? <button className="button button-dark" disabled={busy || !configured || !policyReady || !o.card?.authorized} onClick={() => void run("dispatch", { orderId: o.id })}>Run synthetic checks</button> : null}
 <button className="button" disabled={busy} onClick={() => void run("status", { orderId: o.id })}>Refresh payment</button>
 <button className="button" disabled={busy} onClick={async () => { setBusy(true); setDocs(null); try {
            setDocs(await api("documents", { orderId: o.id }));
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "Documents unavailable");
        }
        finally {
            setBusy(false);
        } }}>Invoices / receipts</button>
 {['pending_approval', 'reserved'].includes(o.status) && o.payment === "quoted" && (o.own || data.canReview) ? <button className="button" disabled={busy} onClick={() => void run("cancel", { orderId: o.id })}>Cancel unpaid order</button> : null}
 </div>
 {o.items?.length ? <ul className="screening-items">{o.items.map(item => <li key={item.product}><span>{PRODUCTS.find(p => p.id === item.product)?.name}</span><span className="pill">{item.status === "complete" ? "Test complete" : item.status === "ready" ? "Not submitted" : "Needs reconciliation"}</span></li>)}</ul> : null}
 {session && sessionOrder === o.id ? <Checkout key={session.clientSecret} {...session} ownerType={ownerType} ownerId={ownerId} orderId={o.id} onBusy={setBusy} onDone={() => void refresh().catch(() => setMessage("Refresh this same order to see payment status."))} onResume={() => void pay(o.id)}/> : null}
 {docs ? <div className="funding-notice"><p>{docs.message}</p><div className="screening-actions">{[["View invoice", docs.invoiceUrl], ["Invoice PDF", docs.invoicePdfUrl], ["View receipt", docs.receiptUrl]].map(([label, url]) => url ? <a key={label} className="button" href={url} target="_blank" rel="noopener noreferrer">{label}</a> : null)}</div></div> : null}
 </>;
    }
    return <div className="screening-workspace">
 <section className="screening-overview card"><div><span className="eyebrow">TXKPRO managed account</span><h2>Background checks</h2><p>Choose a package or individual checks, save bundles and track costs in your workspace.</p></div><span className="pill">Sandbox only</span></section>
 <p className="funding-notice">Synthetic checks and Stripe test payments. No real student, employee or applicant is screened. Public provider base prices are used for this test catalog; additional provider charges are simulated at $0. Real checks and minor screening remain unavailable.</p>
 <p className="card-sub">Results must not be used by TXKPRO or workspaces to determine employment eligibility. Package names describe included checks, not clearance or suitability.</p>
 {!configured ? <p role="status">Authenticate sandbox configuration is unavailable.</p> : null}
 {data.costs ? <div className="screening-costs">{[["Workspace test charges", data.costs.totalCents], ["Provider base costs", data.costs.providerCents], ["TXKPRO fees", data.costs.platformCents], ["Third-party payment fees", data.costs.thirdPartyCents]].map(([label, value]) => <div className="card" key={label}><span className="card-sub">{label}</span><strong>{money(Number(value))}</strong></div>)}</div> : null}
 {data.policy ? <ScreeningPolicyPanel policy={data.policy} busy={busy} onAction={async(op,extra)=>{return Boolean(await run(op,extra));}}/> : null}
 <div className="screening-actions">
 {data.canOrder && policyReady ? <ActionModal title="Choose a screening package" triggerLabel="Choose package / checks" busy={busy} onOpen={() => { setPurpose(""); setTransaction(false); setNonEligibility(false); setDescription(""); setProducts([]); setSubject(""); setRequestKey(crypto.randomUUID()); setLocked(false); setOrderId(""); setSession(null); setDocs(null); setMessage(""); }}>
 {!current ? <><p className="card-sub">Choose a package, then customize the included checks if needed. Your administrator sets spending limits and independent approval requirements.</p><fieldset className="screening-package-picker"><legend>Screening packages</legend><div className="screening-packages">{PACKAGES.map(p => <label key={p.id} className={`screening-product ${matchingPackage(products)?.id === p.id ? "is-selected" : ""}`}><input type="radio" name="screening-package" checked={matchingPackage(products)?.id === p.id} disabled={busy || locked} onChange={() => setProducts([...p.products])}/><span><strong>{p.name}</strong><small>{p.description}</small><ul>{p.products.map(id => <li key={id}>{PRODUCTS.find(product => product.id === id)?.name}</li>)}</ul><b>{money(quoteProducts([...p.products], 0, 0).totalCents)} estimated</b><small>Includes TXKPRO fee; payment fees additional.</small></span></label>)}</div></fieldset><p className="card-sub" role="status">{matchingPackage(products)?.name || (products.length ? "Custom selection" : "No package selected")}. Sandbox estimates; extra provider charges simulated at $0.</p><h3>Customize checks</h3><div className="screening-gallery">{PRODUCTS.map(p => <label key={p.id} className={`screening-product ${products.includes(p.id) ? "is-selected" : ""}`}><input type="checkbox" checked={products.includes(p.id)} disabled={busy || locked} onChange={e => setProducts(e.target.checked ? [...products, p.id] : products.filter(id => id !== p.id))}/><span><strong>{p.name}</strong><small>{p.description}</small><b>{money(p.cents)}</b></span></label>)}</div>
 {data.bundles.length ? <label className="screening-field">Use a saved bundle<select disabled={locked || busy} defaultValue="" onChange={e => { const b = data.bundles.find(b => b.id === e.target.value); if (b)
                setProducts(b.products); }}><option value="">Choose bundle</option>{data.bundles.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label> : null}
 <label className="screening-field">Workspace member (context only)<select required value={subject} disabled={busy || locked} onChange={e => setSubject(e.target.value)}><option value="">Select member</option>{data.subjects.map(s => <option key={`${s.id}:${s.audience}`} value={`${s.id}:${s.audience}`}>{s.name} · {s.audience}</option>)}</select></label>
 <fieldset className="screening-permission card"><legend>Intended transaction use</legend><p className="card-sub">These choices reflect Authenticate’s documented transaction purposes. Checks cannot determine employment eligibility. Employer information and these certifications stay inside TXKPRO.</p><label className="screening-field">Purpose<select required value={purpose} disabled={busy || locked} onChange={e=>setPurpose(e.target.value)}><option value="">Select intended use</option>{PURPOSES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label><label className="screening-field">Describe the transaction (optional)<textarea maxLength={500} value={description} disabled={busy || locked} onChange={e=>setDescription(e.target.value)}/></label><label><input type="checkbox" checked={transaction} disabled={busy || locked} onChange={e=>setTransaction(e.target.checked)}/> I certify this is necessary to effect, administer or enforce a transaction requested or authorized by the candidate for the selected purpose.</label><label><input type="checkbox" checked={nonEligibility} disabled={busy || locked} onChange={e=>setNonEligibility(e.target.checked)}/> I certify that TXKPRO and this workspace will not use the results for credit, insurance, employment eligibility or another FCRA purpose.</label></fieldset>
 <p className="card-sub">Test estimate: {money(base + Math.max(500, Math.ceil(base / 10)))} plus configured payment fees. Review the exact total on the saved order before paying.</p>
 <button className="button button-dark" disabled={busy || !configured || !products.length || !subject || !purpose || !transaction || !nonEligibility} onClick={async () => { setBusy(true); setLocked(true); try {
                const [id, audience] = subject.split(":");
                const d = await api("quote", { subject: id, audience, products, requestKey, purpose, description, transactionCertified:transaction, nonEligibilityCertified:nonEligibility });
                setOrderId(d.id);
                await refresh();
                setMessage(d.status === "pending_approval" ? "Saved. An independent reviewer must approve before checkout." : "Saved. The candidate must share their AuthCard and authorize this order in My AuthCard before checkout.");
            }
            catch (e) {
                setMessage(e instanceof Error ? e.message : "Save unconfirmed. Retry this same request.");
            }
            finally {
                setBusy(false);
            } }}>{locked ? "Resume same request" : "Save order & review total"}</button>
 <form className="screening-bundle" onSubmit={async (e) => { e.preventDefault(); const form = new FormData(e.currentTarget); await run("bundle", { name: form.get("name"), products }); }}><label className="screening-field">Save selection as a bundle<input name="name" maxLength={80} required disabled={busy}/></label><button className="button" disabled={busy || !products.length}>Save bundle</button></form></> : orderControls(current)}
 {message ? <p className="funding-notice" role="status">{message}</p> : null}</ActionModal> : null}
 {data.canManage ? <ActionModal title="Screening access & budgets" triggerLabel="Manage permissions" busy={busy}>
 <p>Grant ordering and review separately. Approval must come from a different authorized person. Monthly limits include all order fees.</p>
 {data.members.map(m => <form key={m.id} className="screening-permission card" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await run("permission", { userId: m.id, canOrder: f.has("order"), canReview: f.has("review"), limit: Math.round(Number(f.get("limit")) * 100), threshold: Math.round(Number(f.get("threshold")) * 100) }); }}><h3>{m.name}</h3><div className="screening-actions"><label><input type="checkbox" name="order" defaultChecked={m.canOrder}/> May order</label><label><input type="checkbox" name="review" defaultChecked={m.canReview}/> May review</label></div><div className="screening-gallery"><label className="screening-field">Monthly budget (USD)<input type="number" min="0" max="10000" step="0.01" name="limit" defaultValue={m.limit / 100} required/></label><label className="screening-field">Approval above (USD)<input type="number" min="0" max="10000" step="0.01" name="threshold" defaultValue={m.threshold / 100} required/></label></div><button className="button" disabled={busy}>Save permissions</button></form>)}{message ? <p role="status">{message}</p> : null}
 </ActionModal> : null}
 <button className="button" disabled={busy} onClick={() => void run("workspace")}>Refresh orders</button></div>
 {message ? <p className="funding-notice" role="status">{message}</p> : null}
 <p className="card-sub">Candidates review requests at <a href="/account/authcard">My AuthCard</a> in their own account. Sharing is separate from check authorization.</p><h2>Order history</h2>{!data.orders.length ? <div className="card"><p>No test orders yet.</p><p className="card-sub">Administrators grant ordering access under Manage permissions.</p></div> : <div className="screening-orders">{data.orders.map(o => <article className="card screening-order" key={o.id}><div className="screening-order-head"><div><h3>{o.products.map(id => PRODUCTS.find(p => p.id === id)?.name).join(" + ")}</h3><p className="card-sub">{o.name} · {o.audience} · {new Date(o.createdAt).toLocaleDateString()}</p></div><strong>{money(o.totalCents)}</strong></div><div className="screening-actions"><span className="pill">{o.status.replaceAll("_", " ")}</span><span className="pill">Payment: {o.payment}</span></div><ActionModal title="Test order details" triggerLabel="View / manage order" busy={busy} onOpen={() => { setOrderId(o.id); setSession(null); setDocs(null); setMessage(""); }}>{orderControls(data.orders.find(x => x.id === o.id) || o)}{message ? <p className="funding-notice" role="status">{message}</p> : null}</ActionModal></article>)}</div>}
 </div>;
}
