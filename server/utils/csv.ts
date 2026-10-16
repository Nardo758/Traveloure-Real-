// One CSV cell: RFC 4180 quoting plus formula neutralisation (a leading =, +, -, @, tab or CR is prefixed with a
// quote so a spreadsheet never evaluates it). Shared by the admin waitlist export and the admin user export.
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
