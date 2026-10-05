import { inflateRawSync } from "node:zlib";
export type RosterRow = { email: string; firstName: string; lastName: string; program: string; cohort: string; row: number; error?: string };
export const MAX_ROSTER_ROWS = 1000;
export function csvRows(text: string): string[][] {
  const result: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else if (!cell || quoted) quoted = !quoted; else throw new Error("Invalid CSV quote."); }
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some(v => v.trim())) result.push(row); row = []; cell = ""; }
    else cell += c;
    if (result.length > MAX_ROSTER_ROWS + 1 || cell.length > 1000) throw new Error("Roster exceeds row or field limits.");
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  row.push(cell); if (row.some(v => v.trim())) result.push(row); return result;
}
export function validateRoster(rows: string[][]): RosterRow[] {
  if (rows.length < 2 || rows.length > MAX_ROSTER_ROWS + 1) throw new Error("Upload 1–1,000 students.");
  const headers = rows[0].map(v => v.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[ _-]/g, ""));
  if (!headers.includes("email") || new Set(headers).size !== headers.length) throw new Error("Use a unique email column. Optional: first_name, last_name, program, cohort.");
  const seen = new Set<string>();
  return rows.slice(1).map((cells, index) => {
    const get = (key: string) => String(cells[headers.indexOf(key)] ?? "").trim();
    const item: RosterRow = { row: index + 2, email: get("email").toLowerCase(), firstName: get("firstname"), lastName: get("lastname"), program: get("program"), cohort: get("cohort") };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) || item.email.length > 254) item.error = "Valid email required";
    else if (seen.has(item.email)) item.error = "Duplicate email in upload";
    else if ([item.firstName,item.lastName,item.program,item.cohort].some(v => v.length > 120 || /^[=+@]/.test(v))) item.error = "Invalid or oversized field";
    seen.add(item.email); return item;
  });
}
// Validate ZIP central-directory declared expansion before handing XLSX to ExcelJS.
export function assertSafeXlsx(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0; let entries = 0;
  for (let i = Math.max(0,bytes.length-65557); i + 22 <= bytes.length; i++) if (view.getUint32(i,true) === 0x06054b50) {
    const count = view.getUint16(i+10,true); let offset = view.getUint32(i+16,true);
    if (count > 100 || count === 0 || offset >= bytes.length) throw new Error("Unsupported workbook.");
    for (let n=0;n<count;n++) {
      if (offset+46>bytes.length || view.getUint32(offset,true)!==0x02014b50) throw new Error("Invalid workbook archive.");
      const declared = view.getUint32(offset+24,true);
      const compressed = view.getUint32(offset+20,true);
      const local = view.getUint32(offset+42,true);
      const method = view.getUint16(offset+10,true);
      if (view.getUint16(offset+8,true) & 1 || ![0,8].includes(method) || local+30>bytes.length || view.getUint32(local,true)!==0x04034b50) throw new Error("Encrypted or unsupported workbook archive.");
      const start = local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
      if (start+compressed>bytes.length || declared>12_000_000-total) throw new Error("Workbook exceeds safe expansion limits.");
      const expanded = method===0 ? bytes.subarray(start,start+compressed) : inflateRawSync(bytes.subarray(start,start+compressed), {maxOutputLength:Math.max(1,12_000_000-total)});
      if (expanded.length!==declared) throw new Error("Workbook archive size mismatch.");
      total += expanded.length; entries++;
      if (total > 12_000_000) throw new Error("Workbook expands beyond 12 MB. Export roster as CSV.");
      offset += 46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
    }
    break;
  }
  if (!entries) throw new Error("Use a standard XLSX workbook (not XLS or encrypted Excel).");
}
