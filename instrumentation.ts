export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "production"
    || process.env.P05_ACCEPTANCE_FIXTURE !== "1") return;
  const { installP05AcceptancePorts } = await import("./lib/workbench/acceptanceFixture");
  installP05AcceptancePorts();
}
