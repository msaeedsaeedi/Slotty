import { appUrl, isLocalAppUrl } from "@/server/app-url";

type Env = Record<string, string | undefined>;

/**
 * A real deployment: a production build serving a public address. The e2e server is a
 * production build too, but on localhost, so it may run without SMTP and with the dev mailbox.
 */
export function isDeployed(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" && !isLocalAppUrl(env.APP_URL);
}

/**
 * Mail must fail closed in a deployment: without SMTP, emails (invite and reset links, marks)
 * would only be printed, and the dev mailbox lists every queued email to anyone. Returns the
 * problems; empty means fine.
 */
export function mailConfigProblems(env: Env = process.env): string[] {
  if (!isDeployed(env)) return [];
  const problems: string[] = [];
  if (!env.SMTP_HOST?.trim()) problems.push("SMTP_HOST is not set, so emails could not be sent.");
  if (!env.MAIL_FROM?.trim()) problems.push("MAIL_FROM is not set.");
  if (env.SMTP_USER?.trim() && !env.SMTP_PASS?.trim()) problems.push("SMTP_USER is set but SMTP_PASS is not.");
  if (env.ENABLE_DEV_MAIL) problems.push("ENABLE_DEV_MAIL is set; the dev mailbox must never run on a public address.");
  return problems;
}

/**
 * Configuration that would silently break the app, or leak, if wrong. Exits instead of
 * serving: Next only logs errors thrown from the instrumentation hook. The worker runs it too.
 */
export function runStartupChecks() {
  const problems: string[] = [];
  try {
    appUrl();
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }
  problems.push(...mailConfigProblems());
  if (problems.length) {
    for (const p of problems) console.error(`[startup] ${p}`);
    process.exit(1);
  }
}
