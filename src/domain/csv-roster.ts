import Papa from "papaparse";

export type RosterRole = "STUDENT" | "TA" | "INSTRUCTOR";

export interface RosterRow {
  /** Line in the pasted text or file (1-based). */
  line: number;
  email: string;
  name: string;
  role: RosterRole;
  section: string | null;
}

export interface RosterError {
  line: number;
  message: string;
}

export interface RosterParseResult {
  rows: RosterRow[];
  errors: RosterError[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts our own template (email,name,role,section) as well as Google Classroom
// style exports ("Email Address", "First Name", "Last Name").
const HEADER_ALIASES: Record<string, keyof RawRow> = {
  email: "email",
  "email address": "email",
  "e-mail": "email",
  name: "name",
  "full name": "name",
  "first name": "firstName",
  "last name": "lastName",
  role: "role",
  section: "section",
  group: "section",
};

interface RawRow {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  section?: string;
}

function normalizeRole(value: string | undefined): RosterRole | null {
  const v = (value ?? "").trim().toUpperCase();
  if (v === "" || v === "STUDENT") return "STUDENT";
  if (v === "TA" || v === "TEACHING ASSISTANT") return "TA";
  if (v === "INSTRUCTOR" || v === "TEACHER" || v === "LECTURER") return "INSTRUCTOR";
  return null;
}

/** Columns, in order, when the list has no header row (e.g. just pasted emails). */
const POSITIONAL = ["email", "name", "role", "section"];

/**
 * Read a class list: CSV with a header row (our template or a Google Classroom
 * export), tab-separated text pasted from a spreadsheet, or simply one email per
 * line (optionally followed by name, role, section).
 */
export function parseRoster(csv: string): RosterParseResult {
  const text = csv.trim();
  const firstCell = text.split(/[\n,;\t]/)[0]?.trim() ?? "";
  const headerless = EMAIL_RE.test(firstCell);
  const parsed = Papa.parse<Record<string, string>>(headerless ? `${POSITIONAL.join(",")}\n${text}` : text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  // A header we added ourselves isn't a line of the user's text.
  const lineOffset = headerless ? 1 : 2;

  const headers = parsed.meta.fields ?? [];
  if (!headers.some((h) => HEADER_ALIASES[h] === "email")) {
    return { rows: [], errors: [{ line: 1, message: 'No "email" column found. Start with a header row (email,name,role,section) or paste one email per line.' }] };
  }

  const rows: RosterRow[] = [];
  const errors: RosterError[] = [];
  const seen = new Set<string>();

  parsed.data.forEach((record, i) => {
    const line = i + lineOffset;
    const raw: RawRow = {};
    for (const [key, value] of Object.entries(record)) {
      const field = HEADER_ALIASES[key];
      if (field) raw[field] = (value ?? "").trim();
    }

    const email = (raw.email ?? "").toLowerCase();
    if (!EMAIL_RE.test(email)) {
      errors.push({ line, message: `Invalid email "${raw.email ?? ""}".` });
      return;
    }
    if (seen.has(email)) {
      errors.push({ line, message: `Duplicate email ${email}.` });
      return;
    }
    const role = normalizeRole(raw.role);
    if (!role) {
      errors.push({ line, message: `Unknown role "${raw.role}". Use student, ta or instructor.` });
      return;
    }
    seen.add(email);
    const name =
      raw.name || [raw.firstName, raw.lastName].filter(Boolean).join(" ") || email.split("@")[0];
    rows.push({ line, email, name, role, section: raw.section || null });
  });

  return { rows, errors };
}
