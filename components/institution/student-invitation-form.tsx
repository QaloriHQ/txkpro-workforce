"use client";

import { FormEvent, useState } from "react";
import { UserPlusIcon } from "@heroicons/react/24/outline";

type Target = {
  value: string;
  label: string;
};

export function StudentInvitationForm({
  institutionId,
  targets,
}: {
  institutionId: string;
  targets: Target[];
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState(targets[0]?.value ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!targets.length) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const [scopeType, ...scopeIdParts] = target.split("|");
    const scopeId = scopeIdParts.join("|");
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        role: "student",
        institutionId,
        scopeType,
        scopeId,
        idempotencyKey: `institution-student:${institutionId}:${scopeType}:${scopeId}:${email
          .trim()
          .toLowerCase()}`,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      data?: Array<{
        invitation?: { created?: boolean; invitationId?: string };
        delivery?: { delivered?: boolean; errorCode?: string } | null;
      }>;
    };
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Student invitation failed.");
      return;
    }

    const result = payload.data?.[0];
    if (result?.delivery && !result.delivery.delivered) {
      setMessage(
        `Invitation was recorded, but email delivery failed (${
          result.delivery.errorCode ?? "delivery_failed"
        }). Use Resend after delivery configuration is corrected.`,
      );
      window.setTimeout(() => window.location.reload(), 1400);
      return;
    }

    setMessage(
      result?.invitation?.created === false
        ? "An active invitation already exists. No duplicate invitation was created."
        : "Invitation sent.",
    );
    window.setTimeout(() => window.location.reload(), 700);
  }

  return (
    <section className="card institution-invitation-card">
      <div className="card-header">
        <div>
          <h2>Invite Student</h2>
          <p className="card-sub">
            Add a Student by email to an authorized Institution or Cohort
            scope. Access remains pending until the recipient accepts.
          </p>
        </div>
        <UserPlusIcon aria-hidden="true" width={24} height={24} />
      </div>
      <form className="form-stack" onSubmit={submit}>
        <div className="grid grid-2">
          <label>
            <span>First name</span>
            <input
              className="input"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              maxLength={100}
              autoComplete="given-name"
            />
          </label>
          <label>
            <span>Last name</span>
            <input
              className="input"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              maxLength={100}
              autoComplete="family-name"
            />
          </label>
        </div>
        <label>
          <span>Email</span>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          <span>Student scope</span>
          <select
            className="select"
            required
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            {targets.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-dark" disabled={busy}>
          <UserPlusIcon aria-hidden="true" width={20} height={20} />
          {busy ? "Sending…" : "Send invitation"}
        </button>
      </form>
      {message ? (
        <div className="alert" role="status" style={{ marginTop: 14 }}>
          {message}
        </div>
      ) : null}
    </section>
  );
}
