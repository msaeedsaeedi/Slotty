/** Runs once when the server starts: refuse to run with configuration that would break links. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupChecks } = await import("@/server/startup-checks");
    runStartupChecks();
  }
}
