import { describe, expect, it } from "vitest";
import { workflowCatalog, workflowCatalogTemplate } from "@/lib/writing/workflowTemplates";

describe("workflow catalogue", () => {
  it("keeps the full operational directory while mapping every entry to a safe runner", () => {
    expect(workflowCatalog.length).toBeGreaterThanOrEqual(15);
    expect(workflowCatalog.map((item) => item.id)).toEqual(expect.arrayContaining([
      "idea_discovery", "paper_writing", "nature_writing", "full_pipeline", "paper_from_assets", "patent_disclosure",
    ]));
    expect(workflowCatalog.some((item) => /数学建模|MCM|ICM/i.test(`${item.id} ${item.name}`))).toBe(false);
    expect(workflowCatalog.every((item) => item.stages.length > 0 && item.outputs.length > 0)).toBe(true);
    expect(workflowCatalogTemplate("missing").id).toBe("literature_review");
  });
});
