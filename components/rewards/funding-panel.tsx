"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ActionModal,
  WorkspaceForm,
} from "@/components/design-system/action-modal";
import type { RewardWorkspace } from "@/lib/rewards/server";
const FundingCheckout = dynamic(
  () => import("./funding-checkout").then((m) => m.FundingCheckout),
  { ssr: false },
);
const money = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
type Quote = {
  id: string;
  principalCents: number;
  platformFeeCents: number;
  thirdPartyFeeCents: number;
  totalCents: number;
  status: string;
};
type Checkout = {
  fundingId: string;
  clientSecret: string;
  publishableKey: string;
  returnUrl: string;
};
export function FundingPanel({
  owner,
  account,
  history,
  canFinance,
}: {
  owner: { type: string; id: string; name: string };
  account: RewardWorkspace["accounts"][number] | undefined;
  history: RewardWorkspace["funding"];
  canFinance: boolean;
}) {
  const router = useRouter(),
    key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null),
    [checkout, setCheckout] = useState<Checkout | null>(null);
  async function send(input: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/rewards/funding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Funding unavailable.");
      setMessage(data.message || "Saved. Close this dialog to continue.");
      router.refresh();
      return data;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Funding unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const feedback = (
    <p role="status" aria-live="polite">
      {message}
    </p>
  );
  return (
    <article className="card">
      <h3>
        {owner.name} · {owner.type === "platform" ? "PRO-Mode" : "Intra-Mode"}{" "}
        reward pool
      </h3>
      <p>
        <strong>{money(account?.availableCents || 0)}</strong> available to
        allocate · {money(account?.balanceCents || 0)} total backed funding
      </p>
      {account?.frozen ? (
        <p role="alert">
          Funding is on hold. Balances are retained; contact TXKPRO support.
        </p>
      ) : null}
      <p className="card-sub">
        Reward Credits fund prizes; they do not purchase PRO points, ranks or
        levels. Unawarded funding never expires. Awarded balances have no
        expiration while the recipient account remains open and in good
        standing.
      </p>
      <div className="reward-actions">
        <WorkspaceForm
          modalTitle="Set up reward funding"
          busy={busy}
          feedback={feedback}
          onSubmit={(e) => {
            e.preventDefault();
            void send({
              op: "setup",
              ownerType: owner.type,
              ownerId: owner.id,
              acceptTerms:
                new FormData(e.currentTarget).get("acceptTerms") === "on",
            });
          }}
        >
          <p>
            TXKPRO manages reward delivery through its Tremendous account. Your
            workspace controls its own private budget and program rules.
          </p>
          <p>
            Funding incurs a 10% TXKPRO service fee ($5 minimum), plus
            separately quoted third-party fees. Fees are charged at funding,
            once. Customer payments and provider funding are tracked separately;
            rewards require both to be confirmed.
          </p>
          <label className="pro-field">
            <span>
              <input name="acceptTerms" type="checkbox" required /> I am
              authorized to fund this workspace and accept these funding terms.
            </span>
          </label>
          <button className="button" disabled={busy} type="submit">
            {account?.setup ? "Confirm setup" : "Set up funding"}
          </button>
        </WorkspaceForm>
        {account?.setup && account.connected && !account.frozen ? (
          <ActionModal
            title="Fund reward pool"
            triggerLabel="Add Reward Credits"
            busy={busy}
          >
            {feedback}
            {!quote ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  key.current ??= crypto.randomUUID();
                  void send({
                    op: "quote",
                    ownerType: owner.type,
                    ownerId: owner.id,
                    amount: f.get("amount"),
                    method: f.get("method"),
                    requestKey: key.current,
                  }).then((q) => {
                    if (q) setQuote(q);
                  });
                }}
              >
                <label className="pro-field">
                  <span>Reward funding (USD)</span>
                  <input
                    name="amount"
                    type="number"
                    min="1"
                    max="100000"
                    step="0.01"
                    required
                  />
                </label>
                {owner.type !== "platform" ? (
                  <label className="pro-field">
                    <span>Payment method</span>
                    <select name="method">
                      <option value="card">Card</option>
                      <option value="ach">ACH bank transfer</option>
                    </select>
                  </label>
                ) : (
                  <p>
                    TXKPRO-funded programs use the platform finance workflow.
                  </p>
                )}
                <button className="button" disabled={busy} type="submit">
                  Review funding quote
                </button>
              </form>
            ) : (
              <>
                <dl>
                  <dt>Reward Credits</dt>
                  <dd>{money(quote.principalCents)}</dd>
                  <dt>TXKPRO service fee</dt>
                  <dd>{money(quote.platformFeeCents)}</dd>
                  <dt>Third-party fees</dt>
                  <dd>{money(quote.thirdPartyFeeCents)}</dd>
                  <dt>Total</dt>
                  <dd>
                    <strong>{money(quote.totalCents)}</strong>
                  </dd>
                </dl>
                <p className="card-sub">
                  Only the Reward Credits amount funds prizes. Scores and
                  lifetime levels are unchanged.
                </p>
                {owner.type === "platform" ? (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void send({ op: "backing", fundingId: quote.id })
                    }
                  >
                    Create / reconcile provider backing
                  </button>
                ) : checkout?.fundingId === quote.id ? (
                  <FundingCheckout
                    {...checkout}
                    onDone={() => router.refresh()}
                    onBusy={setBusy}
                  />
                ) : (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void send({ op: "checkout", fundingId: quote.id }).then(
                        (c) => {
                          if (c) setCheckout({ ...c, fundingId: quote.id });
                        },
                      )
                    }
                  >
                    Continue to secure payment
                  </button>
                )}
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    key.current = null;
                    setQuote(null);
                    setCheckout(null);
                  }}
                >
                  Start another funding request
                </button>
              </>
            )}
          </ActionModal>
        ) : null}
        <button
          className="button"
          disabled={busy || !account?.connected}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch("/api/rewards", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  op: "refresh_balance",
                  ownerType: owner.type,
                  ownerId: owner.id,
                }),
              });
              const v = await r.json();
              setMessage(r.ok ? "Provider funding refreshed." : v.error);
              router.refresh();
            } catch {
              setMessage("Provider funding unavailable.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Refresh provider backing
        </button>
      </div>
      {feedback}
      {history.length ? (
        <details>
          <summary>Funding history ({history.length})</summary>
          {history.map((f) => (
            <div className="pro-submission" key={f.id}>
              <strong>{money(f.principalCents)} Reward Credits</strong>
              <span className="pill">
                {f.status === "paid"
                  ? "Payment confirmed · awaiting backing"
                  : f.status.replaceAll("_", " ")}
              </span>
              <p className="card-sub">
                {new Date(f.createdAt).toLocaleDateString()} · {f.method} ·
                total {money(f.totalCents)} (fee {money(f.platformFeeCents)},
                third-party {money(f.thirdPartyFeeCents)})
              </p>
              {["quoted", "pending"].includes(f.status) &&
              f.method !== "platform" ? (
                <ActionModal
                  title="Resume funding payment"
                  triggerLabel="Resume payment"
                  busy={busy}
                >
                  {feedback}
                  {checkout?.fundingId === f.id ? (
                    <FundingCheckout
                      {...checkout}
                      onDone={() => router.refresh()}
                      onBusy={setBusy}
                    />
                  ) : null}
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void send({ op: "checkout", fundingId: f.id }).then(
                        (c) => {
                          if (c) setCheckout({ ...c, fundingId: f.id });
                        },
                      )
                    }
                  >
                    Load secure payment
                  </button>
                </ActionModal>
              ) : null}
              {canFinance && f.status === "paid" ? (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void send({ op: "backing", fundingId: f.id })}
                >
                  Reconcile provider backing
                </button>
              ) : null}
              {f.invoicePending ? (
                <p className="card-sub">
                  Provider invoice requires reconciliation; another invoice will
                  not be created.
                </p>
              ) : null}
            </div>
          ))}
        </details>
      ) : null}
    </article>
  );
}
