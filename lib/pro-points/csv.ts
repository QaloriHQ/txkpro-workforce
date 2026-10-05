/** Quote delimiters/newlines and neutralize spreadsheet formula cells, including leading whitespace. */
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^\s*[=+@-]|^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function activityCsv(
  records: {
    name: string;
    kind: string;
    status: string;
    points: number;
    approved: number;
  }[],
) {
  const rows = [
    [
      "Participant",
      "Participation",
      "Status",
      "Private points",
      "Approved activities",
    ],
    ...records.map((r) => [r.name, r.kind, r.status, r.points, r.approved]),
  ];
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
