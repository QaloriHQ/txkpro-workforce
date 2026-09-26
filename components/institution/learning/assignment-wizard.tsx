"use client";

import {
  ArrowLeftIcon,
  BellAlertIcon,
  CheckCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Button,
  Card,
  FormField,
  Input,
  RoleViewBanner,
  StatusBadge,
} from "@/components/design-system";
import type {
  InstitutionAssignmentPreview,
  InstitutionAssignmentResult,
  InstitutionAssignmentTargetType,
  InstitutionEmployerLearningContext,
  InstitutionLearningCourse,
} from "@/lib/institution/types";

async function postJson<T>(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to complete assignment request.");
  }
  return body;
}

export function InstitutionAssignmentWizard({
  learning,
  course,
  canManage,
}: {
  learning: InstitutionEmployerLearningContext;
  course: InstitutionLearningCourse;
  canManage: boolean;
}) {
  const [targetType, setTargetType] =
    useState<InstitutionAssignmentTargetType>("cohort");
  const [programKey, setProgramKey] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(
    () => new Set(),
  );
  const [search, setSearch] = useState("");
  const [notifyStudents, setNotifyStudents] = useState(true);
  const [preview, setPreview] = useState<InstitutionAssignmentPreview | null>(
    null,
  );
  const [result, setResult] = useState<InstitutionAssignmentResult | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return learning.students.filter((student) => {
      if (!student.canAssign) return false;
      if (!query) return true;
      return [
        student.displayName,
        student.programName ?? "",
        student.cohortName,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [learning.students, search]);

  const payload = {
    institutionId: learning.institution.institutionId,
    microCertId: course.microCertId,
    targetType,
    programKey: targetType === "program" ? programKey : null,
    cohortId: targetType === "cohort" ? cohortId : null,
    studentIds:
      targetType === "students" ? Array.from(selectedStudents) : [],
    notifyStudents,
  };

  function resetReview() {
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function review() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = await postJson<{ preview: InstitutionAssignmentPreview }>(
        "/api/institution/learning/assignments/preview",
        payload,
      );
      setPreview(body.preview);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to preview assignment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const body = await postJson<{ result: InstitutionAssignmentResult }>(
        "/api/institution/learning/assignments",
        payload,
      );
      setResult(body.result);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to assign training.",
      );
    } finally {
      setBusy(false);
    }
  }

  const previewEligible =
    preview?.students.filter(
      (student) => student.eligible && !student.activeAssignmentId,
    ) ?? [];
  const previewAlreadyAssigned =
    preview?.students.filter((student) => student.activeAssignmentId) ?? [];
  const previewIneligible =
    preview?.students.filter((student) => !student.eligible) ?? [];

  return (
    <div className="institution-assignment-wizard">
      <div className="institution-assignment-back">
        <Link href="/institution/learning">
          <ArrowLeftIcon aria-hidden="true" />
          Employer Training
        </Link>
      </div>

      {!canManage ? (
        <RoleViewBanner title="Read-only Employer Training">
          Your Institution role can inspect Employer Training, but assignment
          creation is limited to Institution Admin, Department Head, Program
          Coordinator, and Career Services within their authorized scope.
        </RoleViewBanner>
      ) : null}

      <Card className="institution-assignment-course">
        <div>
          <p className="txk-eyebrow">{course.employerName}</p>
          <h2>{course.title}</h2>
          <p>{course.learningObjective ?? course.description}</p>
        </div>
        <div className="institution-assignment-course-meta">
          <StatusBadge tone={course.status === "live" ? "success" : "info"}>
            {course.status}
          </StatusBadge>
          <span>Version {course.versionNumber}</span>
          <span>{course.durationMinutes ?? 0} min</span>
          <span>{course.eligibleStudentCount} eligible</span>
        </div>
      </Card>

      {course.status === "ready" ? (
        <RoleViewBanner title="Ready for assignment · not yet live">
          You can prepare assignments now. Student notifications are held until
          this exact course version becomes Live, then released once.
        </RoleViewBanner>
      ) : null}

      {canManage ? (
        <div className="institution-assignment-grid">
          <Card>
            <p className="txk-eyebrow">1 · Select audience</p>
            <h3>Assignment target</h3>
            <div className="institution-target-tabs">
              {(["program", "cohort", "students"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={targetType === type ? "active" : ""}
                  onClick={() => {
                    setTargetType(type);
                    resetReview();
                  }}
                >
                  {type === "students"
                    ? "Selected Students"
                    : type[0].toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            {targetType === "program" ? (
              <FormField
                label="Program"
                help="Assigns the current course version to every eligible Student in the authorized program scope."
              >
                <select
                  className="txk-input"
                  value={programKey}
                  onChange={(event) => {
                    setProgramKey(event.target.value);
                    resetReview();
                  }}
                >
                  <option value="">Select program</option>
                  {learning.programs.map((program) => (
                    <option
                      key={program.programKey}
                      value={program.programKey}
                    >
                      {program.programName} · {program.studentCount} students
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}

            {targetType === "cohort" ? (
              <FormField
                label="Cohort"
                help="Assigns the current course version to every eligible Student in the authorized cohort scope."
              >
                <select
                  className="txk-input"
                  value={cohortId}
                  onChange={(event) => {
                    setCohortId(event.target.value);
                    resetReview();
                  }}
                >
                  <option value="">Select cohort</option>
                  {learning.cohorts
                    .filter((cohort) => cohort.canAssign)
                    .map((cohort) => (
                      <option key={cohort.cohortId} value={cohort.cohortId}>
                        {cohort.programName ?? "Program"} · {cohort.name} ·{" "}
                        {cohort.studentCount} students
                      </option>
                    ))}
                </select>
              </FormField>
            ) : null}

            {targetType === "students" ? (
              <div className="institution-student-picker">
                <FormField label="Find Students">
                  <Input
                    value={search}
                    placeholder="Search name, program, or cohort"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </FormField>
                <div className="institution-student-picker-actions">
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => {
                      setSelectedStudents(
                        new Set(visibleStudents.map((student) => student.studentId)),
                      );
                      resetReview();
                    }}
                  >
                    Select visible
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => {
                      setSelectedStudents(new Set());
                      resetReview();
                    }}
                  >
                    Clear
                  </Button>
                  <span>{selectedStudents.size} selected</span>
                </div>
                <div className="institution-student-list">
                  {visibleStudents.map((student) => (
                    <label key={student.studentId}>
                      <input
                        type="checkbox"
                        checked={selectedStudents.has(student.studentId)}
                        onChange={(event) => {
                          setSelectedStudents((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(student.studentId);
                            else next.delete(student.studentId);
                            return next;
                          });
                          resetReview();
                        }}
                      />
                      <span>
                        <strong>{student.displayName}</strong>
                        <small>
                          {student.programName ?? "Program"} ·{" "}
                          {student.cohortName}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="txk-check-field">
              <input
                type="checkbox"
                checked={notifyStudents}
                onChange={(event) => setNotifyStudents(event.target.checked)}
              />
              <span>Notify Students when the assignment is available</span>
            </label>

            <Button
              tone="primary"
              type="button"
              disabled={
                busy ||
                (targetType === "program" && !programKey) ||
                (targetType === "cohort" && !cohortId) ||
                (targetType === "students" && selectedStudents.size === 0)
              }
              onClick={review}
            >
              <UserGroupIcon aria-hidden="true" />
              Review assignment
            </Button>
          </Card>

          <Card>
            <p className="txk-eyebrow">2 · Review</p>
            <h3>Assignment impact</h3>
            {!preview ? (
              <div className="institution-assignment-placeholder">
                Select an audience and choose Review assignment. No assignment
                records are written until you confirm.
              </div>
            ) : (
              <>
                <div className="institution-assignment-review-metrics">
                  <div>
                    <strong>{preview.students.length}</strong>
                    <span>In scope</span>
                  </div>
                  <div>
                    <strong>{previewEligible.length}</strong>
                    <span>Will assign</span>
                  </div>
                  <div>
                    <strong>{previewAlreadyAssigned.length}</strong>
                    <span>Already assigned</span>
                  </div>
                  <div>
                    <strong>{previewIneligible.length}</strong>
                    <span>Not eligible</span>
                  </div>
                </div>

                <div className="institution-assignment-review-list">
                  {preview.students.map((student) => (
                    <div key={student.studentId}>
                      <span>
                        <strong>{student.displayName}</strong>
                        <small>
                          {student.programName ?? "Program"} ·{" "}
                          {student.cohortName}
                        </small>
                      </span>
                      <StatusBadge
                        tone={
                          student.activeAssignmentId
                            ? "neutral"
                            : student.eligible
                              ? "success"
                              : "warning"
                        }
                      >
                        {student.activeAssignmentId
                          ? "Already assigned"
                          : student.eligible
                            ? "Will assign"
                            : "Not eligible"}
                      </StatusBadge>
                    </div>
                  ))}
                </div>

                <Button
                  tone="primary"
                  type="button"
                  disabled={busy || previewEligible.length === 0 || Boolean(result)}
                  onClick={assign}
                >
                  <CheckCircleIcon aria-hidden="true" />
                  Confirm & assign {previewEligible.length}
                </Button>
              </>
            )}
          </Card>
        </div>
      ) : null}

      {error ? <div className="alert">{error}</div> : null}

      {result ? (
        <Card className="institution-assignment-result">
          <CheckCircleIcon aria-hidden="true" />
          <div>
            <p className="txk-eyebrow">Assignment complete</p>
            <h3>{result.createdCount} Student assignments created</h3>
            <p>
              {result.skippedCount} skipped · {result.notificationCount} Student
              notifications queued
              {result.notificationsDeferred
                ? " · notifications will release when this course becomes Live"
                : ""}
              .
            </p>
            <div className="txk-form-actions">
              <Link
                className="txk-button txk-button-primary txk-button-md"
                href="/institution/learning/assignments"
              >
                View assignments
              </Link>
              <Link
                className="txk-button txk-button-default txk-button-md"
                href="/institution/learning"
              >
                Back to Employer Training
              </Link>
            </div>
          </div>
          {notifyStudents ? <BellAlertIcon aria-hidden="true" /> : null}
        </Card>
      ) : null}
    </div>
  );
}
