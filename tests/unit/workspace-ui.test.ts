// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { SafeMarkdown } from "@/components/notes/SafeMarkdown";
import { ProviderSettings } from "@/components/settings/ProviderSettings";
import WritingPage from "@/app/writing/page";

const note = { id: "note-1", title: "Private note", markdown: "body", version: 1, updatedAt: "2026-08-24T00:00:00.000Z" };
const provider = { id: "provider-1", name: "Safe provider", baseUrl: "https://provider.example", model: "model-1", wireApi: "chat_completions", hasApiKey: true };
const roots: Root[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function json(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => { root.render(element); });
  await act(async () => { await Promise.resolve(); });
  return container;
}

async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function click(container: Element, label: string, exact = false) {
  const button = [...container.querySelectorAll("button")].find((item) => exact ? item.textContent === label : item.textContent?.includes(label));
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => { button.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
}

async function setInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(async () => {
  await act(async () => { roots.splice(0).forEach((root) => root.unmount()); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
  vi.restoreAllMocks();
});

describe("workspace UI rejected-fetch recovery", () => {
  it("shows a recovery message when private-note initial loading rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const container = await render(createElement(NoteEditor));
    await settle();
    expect(container.textContent).toContain("暂时无法加载私有笔记。");
  });

  it("shows a recovery message when Provider initial loading rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const container = await render(createElement(ProviderSettings));
    await settle();
    expect(container.textContent).toContain("暂时无法读取配置；请确认当前账户权限和服务状态。");
  });

  it("recovers when deleting a private note rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([note])).mockRejectedValueOnce(new Error("network down")));
    const container = await render(createElement(NoteEditor));
    await click(container, "Private note");
    await settle();
    await click(container, "删除");
    await settle();
    expect(container.textContent).toContain("删除失败，请检查网络后重试。");
  });

  it("recovers when deleting a Provider rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([provider])).mockResolvedValueOnce(json([])).mockRejectedValueOnce(new Error("network down")));
    const container = await render(createElement(ProviderSettings));
    await click(container, "删除");
    await settle();
    expect(container.textContent).toContain("删除失败，请检查网络后重试。");
  });

  it("recovers when saving a model preset rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([provider])).mockResolvedValueOnce(json([])).mockRejectedValueOnce(new Error("network down")));
    const container = await render(createElement(ProviderSettings));
    const inputs = [...container.querySelectorAll("input")];
    await setInput(inputs[4], "Focused writing");
    await setInput(inputs[5], "model-1");
    await settle();
    await click(container, "保存", true);
    await settle();
    expect(container.textContent).toContain("预设保存失败，请检查网络后重试。");
  });
});

describe("workspace UI security behavior", () => {
  it("clears a stored provider key only after the explicit confirmed clear action", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([provider])).mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ ...provider, hasApiKey: false }))
      .mockResolvedValueOnce(json([{ ...provider, hasApiKey: false }])).mockResolvedValueOnce(json([]));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    const container = await render(createElement(ProviderSettings));
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("清除密钥"))).toBe(true);
    await click(container, "清除密钥");
    await settle();
    expect(fetchMock.mock.calls[2][0]).toBe("/api/v3/providers/provider-1");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toEqual({ apiKey: "" });
    expect(container.textContent).toContain("Provider 密钥已清除");
  });

  it("clears the provider key input after submitting it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([])).mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(provider))
      .mockResolvedValueOnce(json([provider])).mockResolvedValueOnce(json([]));
    vi.stubGlobal("fetch", fetchMock);
    const container = await render(createElement(ProviderSettings));
    const inputs = [...container.querySelectorAll("input")];
    await setInput(inputs[0], "Provider");
    await setInput(inputs[1], "https://provider.example");
    await setInput(inputs[2], "model-1");
    await setInput(inputs[3], "secret-not-retained");
    await click(container, "保存 Provider", true);
    await settle();
    expect((inputs[3] as HTMLInputElement).value).toBe("");
    expect(container.textContent).not.toContain("secret-not-retained");
  });

  it("shows the safe dependency message for writing 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response));
    const container = await render(createElement(WritingPage));
    const inputs = [...container.querySelectorAll("input")];
    await setInput(inputs[0], "session-1");
    await setInput(inputs[1], "Methods");
    await setInput(container.querySelector("textarea")!, "e1,e2,e3");
    await click(container, "生成有证据草稿", true);
    await settle();
    expect(container.textContent).toContain("写作证据端口尚未接入");
  });

  it("downloads only the server export after explicit evidence linking and human review", async () => {
    const generated = {
      markdown: "# Unreviewed browser preview",
      citations: ["e1", "e2", "e3"].map((evidenceId) => ({ evidenceId, marker: `[${evidenceId}]` })),
      source: "deterministic",
      checkpointId: "draft-checkpoint",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(generated))
      .mockResolvedValueOnce(json({ stage: "evidence_link" }))
      .mockResolvedValueOnce(json({ stage: "human_review" }))
      .mockResolvedValueOnce(new Response("# Server-reviewed export", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const createObjectUrl = vi.fn().mockReturnValue("blob:reviewed-export");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const container = await render(createElement(WritingPage));
    const inputs = [...container.querySelectorAll("input")];
    await setInput(inputs[0], "session-1");
    await setInput(inputs[1], "Methods");
    await setInput(container.querySelector("textarea")!, "e1,e2,e3");
    await click(container, "生成有证据草稿", true);
    await settle();

    expect([...container.querySelectorAll("button")].some((button) => button.textContent === ".md")).toBe(false);
    await click(container, "建立证据回链", true);
    await settle();
    await click(container, "确认人工复核", true);
    await settle();
    await click(container, ".md", true);
    await settle();

    expect(fetchMock.mock.calls.slice(1).map(([url]) => url)).toEqual([
      "/api/v3/writing/review",
      "/api/v3/writing/review",
      "/api/v3/writing/export",
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toMatchObject({
      sessionId: "session-1",
      stage: "human_review",
      confirmed: true,
    });
    const exportedBlob = createObjectUrl.mock.calls[0][0] as Blob;
    const exportedText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(exportedBlob);
    });
    expect(exportedText).toBe("# Server-reviewed export");
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:reviewed-export");
  });

  it("strips unsafe raw HTML and hardens an allowed Markdown link", async () => {
    const container = await render(createElement(SafeMarkdown, { markdown: "<script>alert(1)</script><img src=x onerror=alert(2)> [safe](https://example.test) [bad](javascript:alert(3))" }));
    const link = container.querySelector("a");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("alert(1)");
    expect(link?.getAttribute("href")).toBe("https://example.test/");
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");
    expect(container.textContent).toContain("bad");
  });
});
