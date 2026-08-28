import { afterEach, describe, expect, it } from "vitest";
import {
  clearCurrentPrincipalPortForTests,
  requireCurrentPrincipal,
} from "@/lib/research/principal";
import { bindPackage01ServerPrincipal } from "@/lib/integration/package01Principal";

afterEach(() => clearCurrentPrincipalPortForTests());

describe("package 01 research principal adapter", () => {
  it("binds package 01's server-derived guest principal to research routes", async () => {
    bindPackage01ServerPrincipal();

    await expect(
      requireCurrentPrincipal(new Request("http://library.test/api/research/sessions")),
    ).resolves.toMatchObject({ mode: "guest" });
  });
});
