export async function register() {
  // Next currently compiles instrumentation for both runtime targets in dev.
  // Keep the integration test hook here; Node route entry points initialise the
  // actual composition lazily so Edge compilation never sees node:crypto.
  if (process.env.NODE_ENV === "test") {
    const { ensureAppComposition } = await import("./lib/composition");
    await ensureAppComposition();
  }
}
