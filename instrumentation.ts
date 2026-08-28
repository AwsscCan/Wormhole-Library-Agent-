export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureAppComposition } = await import("./lib/composition");
  ensureAppComposition();
  if (process.env.NODE_ENV !== "production" && process.env.P05_ACCEPTANCE_FIXTURE === "1") {
    const { installP05AcceptancePorts } = await import("./lib/workbench/acceptanceFixture");
    installP05AcceptancePorts();
  }
}
