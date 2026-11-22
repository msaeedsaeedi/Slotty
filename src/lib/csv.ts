import Papa from "papaparse";

/** Characters that make a spreadsheet read a cell as a formula, after any leading whitespace. */
const FORMULA_START = /^\s*[=+\-@]/;
/** Tab and carriage return at the start also start a formula or a new cell in some spreadsheet apps. */
const CONTROL_START = /^[\t\r]/;

/**
 * A cell value that spreadsheet apps show as text, never run as a formula (CSV injection).
 * Strings starting with `= + - @` (also after leading spaces), a tab or a carriage return get a
 * leading apostrophe. Numbers are left alone: a spreadsheet reads them as numbers.
 */
export function safeCell<T extends string | number | null | undefined>(value: T): T | string {
  if (typeof value !== "string") return value;
  return FORMULA_START.test(value) || CONTROL_START.test(value) ? `'${value}` : value;
}

/** CSV text with every header and cell passed through `safeCell`. */
export function toSafeCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return Papa.unparse({ fields: headers.map(safeCell), data: rows.map((r) => r.map((v) => safeCell(v ?? ""))) });
}
