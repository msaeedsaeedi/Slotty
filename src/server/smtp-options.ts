type Env = Record<string, string | undefined>;

/** SMTP servers on this machine (Mailpit in development) speak plain text; nothing else may. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "mailpit"]);

/**
 * Transport options for the outgoing SMTP connection, or null without SMTP_HOST (local
 * development only; deployments refuse to start without it, `mailConfigProblems`).
 *
 * Any non-local server must use TLS: port 465 connects over TLS directly, every other port must
 * upgrade with STARTTLS (`requireTLS`), so a stripped STARTTLS offer fails the send instead of
 * falling back to plain text and exposing the SMTP credentials, reset links and marks.
 */
export function smtpOptions(env: Env = process.env) {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(env.SMTP_PORT ?? 587);
  const secure = port === 465;
  const local = LOCAL_HOSTS.has(host.toLowerCase());
  return {
    host,
    port,
    secure,
    requireTLS: !secure && !local,
    tls: { minVersion: "TLSv1.2" as const },
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
  };
}
