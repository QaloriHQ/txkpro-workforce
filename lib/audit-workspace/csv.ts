import type { AuditRecord } from "./types";

// Neutralize spreadsheet formulas even after leading whitespace/control characters.
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function auditCsv(items: AuditRecord[]) {
  const keys: (keyof AuditRecord)[] = ["recordId", "source", "eventType", "createdAt", "actorUserId", "targetType",
    "targetId", "result", "institutionId", "studentId", "correlationId", "beforeStatus", "afterStatus"];
  return [keys.map(csvCell).join(","), ...items.map(item => keys.map(key => csvCell(item[key])).join(","))].join("\r\n") + "\r\n";
}
