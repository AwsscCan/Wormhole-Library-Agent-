import { describe, expect, it } from "vitest";
import { canRequestAsyncConversation, normalizeSharedUrl } from "@/lib/livingLibrary/conversations";

describe("Living Book conversation guards", () => {
  it("only opens an asynchronous request for a visible profile that opted into answers", () => {
    expect(canRequestAsyncConversation("lb_001")).toBe(true);
    expect(canRequestAsyncConversation("lb_005")).toBe(false);
    expect(canRequestAsyncConversation("lb_private_example")).toBe(false);
    expect(canRequestAsyncConversation("missing")).toBe(false);
  });

  it("accepts ordinary source links and rejects executable or malformed URLs", () => {
    expect(normalizeSharedUrl("https://openlibrary.org/works/OL1W")).toBe("https://openlibrary.org/works/OL1W");
    expect(normalizeSharedUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSharedUrl("not a url")).toBeNull();
  });
});
