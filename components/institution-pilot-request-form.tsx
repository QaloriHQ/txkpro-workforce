"use client";

import { useState } from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

type FormState = "idle" | "submitting" | "success" | "error";

export function InstitutionPilotRequestForm({
  defaultIntent = "pilot",
}: {
  defaultIntent?: "pilot" | "meeting" | "both";
}) {
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());

    try {
      const response = await fetch("/api/marketing/pilot-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? "Unable to submit request.");
      }

      setState("success");
      setMessage(
        result.message ??
          "Your request was received. TXKPRO can now follow up about the pilot.",
      );
      form.reset();
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit your request. Please try again.",
      );
    }
  }

  if (state === "success") {
    return (
      <div className="pilot-form-success" role="status">
        <CheckCircleIcon aria-hidden="true" />
        <div>
          <p className="marketing-kicker">Request received</p>
          <h2>Thank you. Your institution pilot request is in the queue.</h2>
          <p>{message}</p>
          <button
            className="button button-ghost"
            type="button"
            onClick={() => {
              setState("idle");
              setMessage("");
            }}
          >
            Submit another request
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="pilot-request-form" onSubmit={handleSubmit}>
      <input
        aria-hidden="true"
        className="pilot-honeypot"
        tabIndex={-1}
        autoComplete="off"
        name="website"
        type="text"
      />

      <fieldset>
        <legend>Institution</legend>
        <div className="pilot-form-grid">
          <label>
            Institution name
            <input name="institutionName" required maxLength={160} />
          </label>
          <label>
            Institution type
            <select name="institutionType" required defaultValue="">
              <option value="" disabled>Select type</option>
              <option value="technical_college">Technical college</option>
              <option value="community_college">Community college</option>
              <option value="high_school_cte">High school / CTE program</option>
              <option value="workforce_program">Workforce program</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Trade or program
            <input
              name="tradeProgram"
              maxLength={120}
              placeholder="Electrical, HVAC, Welding…"
            />
          </label>
          <label>
            Estimated pilot cohort size
            <input
              name="estimatedCohortSize"
              type="number"
              min={1}
              max={5000}
              inputMode="numeric"
              placeholder="25"
            />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Your contact information</legend>
        <div className="pilot-form-grid">
          <label>
            Name
            <input name="contactName" required maxLength={120} />
          </label>
          <label>
            Role / title
            <input
              name="contactTitle"
              maxLength={120}
              placeholder="Dean, Program Coordinator…"
            />
          </label>
          <label>
            Work email
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>
          <label>
            Phone
            <input
              name="phone"
              type="tel"
              maxLength={40}
              autoComplete="tel"
            />
          </label>
        </div>
        <div className="pilot-form-grid">
          <label>
            Preferred contact
            <select name="contactPreference" defaultValue="email">
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="either">Either</option>
            </select>
          </label>
          <label>
            I want to
            <select name="intent" defaultValue={defaultIntent}>
              <option value="pilot">Request a pilot</option>
              <option value="meeting">Schedule an exploratory meeting</option>
              <option value="both">Discuss both</option>
            </select>
          </label>
          <label>
            Preferred start window
            <input
              name="targetStartWindow"
              maxLength={120}
              placeholder="Spring 2027, next semester…"
            />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>What should we know?</legend>
        <label>
          Goals, programs, employer partners, or questions
          <textarea
            name="message"
            rows={6}
            maxLength={2000}
            placeholder="Tell us what you want the pilot to prove and which program or employer relationships are most important."
          />
        </label>
      </fieldset>

      <input type="hidden" name="sourcePath" value="/institutions/request-pilot" />

      <div className="pilot-form-submit">
        <button
          className="button button-brand"
          type="submit"
          disabled={state === "submitting"}
        >
          {state === "submitting" ? "Submitting…" : "Request pilot / meeting"}
          <ArrowRightIcon aria-hidden="true" />
        </button>
        <p>
          By submitting, you are asking TXKPRO to contact you about this
          institution pilot or meeting request. This is not an SMS marketing
          opt-in.
        </p>
      </div>

      {state === "error" ? (
        <p className="pilot-form-error" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
