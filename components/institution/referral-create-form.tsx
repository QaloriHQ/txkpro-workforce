"use client";

import { WorkspaceForm } from "@/components/design-system/action-modal";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Button,
  FormField,
  StatusBadge,
  Textarea,
} from "@/components/design-system";
import type {
  InstitutionReferralCreateContext,
  InstitutionReferralCreateResult,
} from "@/lib/institution/types";

type Props = InstitutionReferralCreateContext & {
  institutionId: string;
  canCreate: boolean;
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

export function InstitutionReferralCreateForm({
  institutionId,
  students,
  employers,
  hiringNeeds,
  canCreate,
}: Props) {
  const [studentId, setStudentId] = useState("");
  const [employerId, setEmployerId] = useState("");
  const [hiringNeedId, setHiringNeedId] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InstitutionReferralCreateResult | null>(
    null,
  );

  const selectedStudent = students.find((student) => student.studentId === studentId);
  const selectedConsent = selectedStudent?.referralConsent;
  const availableNeeds = useMemo(
    () => hiringNeeds.filter((need) => need.employerId === employerId),
    [employerId, hiringNeeds],
  );
  const canSubmit =
    canCreate &&
    Boolean(studentId) &&
    Boolean(employerId) &&
    selectedConsent?.allowed === true &&
    !pending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/institution/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionId,
          studentId,
          employerId,
          hiringNeedId: hiringNeedId || null,
          note,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Referral could not be created.");
      }
      setResult(payload.data);
      setNote("");
      setHiringNeedId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Referral could not be created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="institution-action-bar">
      {!canCreate ? <p>Your role can review referrals. Sending requires management access.</p> : null}
      {canCreate ? <WorkspaceForm modalTitle="Send referral" busy={Boolean(pending)} className="institution-assignment-form" onSubmit={submit}>
        <FormField
          label="Student"
          help={
            selectedConsent
              ? `Consent: ${label(selectedConsent.status)} via ${label(selectedConsent.source)}`
              : "Only students in your authorized scope are listed."
          }
          error={
            selectedConsent && !selectedConsent.allowed
              ? "Referral consent is required before sending."
              : null
          }
        >
          <select
            className="txk-input"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            disabled={!canCreate || pending}
            required
          >
            <option value="">Select a Student</option>
            {students.map((student) => (
              <option key={student.studentId} value={student.studentId}>
                {student.displayName} · {student.programName ?? "Program"} ·{" "}
                {student.referralConsent.allowed ? "consent OK" : "consent needed"}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Employer" help="Only approved Employers in shared talent scope appear.">
          <select
            className="txk-input"
            value={employerId}
            onChange={(event) => {
              setEmployerId(event.target.value);
              setHiringNeedId("");
            }}
            disabled={!canCreate || pending}
            required
          >
            <option value="">Select an Employer</option>
            {employers.map((employer) => (
              <option key={employer.employerId} value={employer.employerId}>
                {employer.employerName}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Shared hiring need" help="Optional. Employer-private needs are excluded.">
          <select
            className="txk-input"
            value={hiringNeedId}
            onChange={(event) => setHiringNeedId(event.target.value)}
            disabled={!canCreate || pending || !employerId}
          >
            <option value="">Direct referral</option>
            {availableNeeds.map((need) => (
              <option key={need.hiringNeedId} value={need.hiringNeedId}>
                {need.title} {need.tradeId ? `· ${need.tradeId}` : ""}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Institution-shared note"
          help="Optional. Use policy-approved readiness context only; no protected details, contact data, or private evaluations."
        >
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1200}
            rows={5}
            disabled={!canCreate || pending}
          />
        </FormField>

        {!canCreate ? (
          <div className="txk-empty-state">
            <strong>Read-only referral access</strong>
            <p>Your current role can monitor referrals but cannot send new ones.</p>
          </div>
        ) : null}

        {error ? (
          <div className="callout callout-danger">
            <strong>Referral blocked</strong>
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="callout">
            <strong>Referral delivered</strong>
            <span>
              {" "}
              Status: <StatusBadge tone="success">{label(result.status)}</StatusBadge>{" "}
              · <Link href={`/institution/referrals/${encodeURIComponent(result.referralId)}`}>Open detail</Link>
            </span>
          </div>
        ) : null}

        <div className="hero-actions">
          <Button type="submit" tone="primary" disabled={!canSubmit}>
            {pending ? "Sending…" : "Send referral"}
          </Button>
        </div>
      </WorkspaceForm> : null}
    </div>
  );
}
