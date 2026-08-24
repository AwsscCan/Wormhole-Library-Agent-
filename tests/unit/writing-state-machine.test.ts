import { describe, expect, it } from "vitest";
import { WritingStateError, advanceWritingStage, legalNextStage } from "@/lib/writing/stateMachine";

describe("writing state machine", () => {
  it("persists only legal forward workflow transitions", () => {
    expect(legalNextStage("evidence")).toBe("verified_sources");
    expect(() => advanceWritingStage("evidence", "draft")).toThrow(WritingStateError);
    expect(advanceWritingStage("human_review", "export")).toBe("export");
  });
});
