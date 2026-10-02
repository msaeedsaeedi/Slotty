import { appUrl } from "@/server/app-url";

/**
 * Configuration that would silently break the app if wrong. Exits instead of
 * serving: Next only logs errors thrown from the instrumentation hook.
 */
export function runStartupChecks() {
  try {
    appUrl();
  } catch (err) {
    console.error(`[startup] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
