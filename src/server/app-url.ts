const DEV_DEFAULT = "http://localhost:3000";

/**
 * The app's public base URL, without a trailing slash, for links that leave the
 * app: emails, invites, password resets and calendar feeds. Links inside the app
 * (redirects, in-app notifications, push) stay relative so they follow whatever
 * host and port the user actually reached.
 *
 * Production refuses to guess: a missing APP_URL would send users to localhost.
 */
export function appUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_URL is not set. Set it to the public address, e.g. https://uniflow.example.edu");
    }
    return DEV_DEFAULT;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`APP_URL is not a valid URL: "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`APP_URL must start with http:// or https://: "${raw}"`);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Is APP_URL a local address (localhost, a loopback IP, or a .local / .localhost name such as
 * the dev Caddy's uniflow.local)? Unset counts as local, since appUrl() then falls back to
 * localhost outside production.
 */
export function isLocalAppUrl(raw = process.env.APP_URL): boolean {
  if (!raw?.trim()) return true;
  try {
    const host = new URL(raw.trim()).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || /^127\./.test(host) || /\.(local|localhost)$/.test(host);
  } catch {
    return false;
  }
}

/** Absolute link to an app path, e.g. absoluteUrl("/invite/abc"). */
export function absoluteUrl(path: string): string {
  return `${appUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
