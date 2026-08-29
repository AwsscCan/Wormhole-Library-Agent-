import type { CatalogAdapter } from "@/lib/types";
import { rankResources } from "./ranking";
import { seedCatalogAdapter } from "./seedCatalogAdapter";
import { searchCatalogGateway } from "./gateway";

function disabled(name: string): boolean {
  return process.env[name] === "1";
}

/**
 * Compatibility boundary for the original search orchestrator.
 *
 * The public CatalogAdapter contract predates source provenance, so the
 * gateway remains the source of truth and this adapter only projects its
 * records into the frozen ResourceCard shape.
 */
export const federatedCatalogAdapter: CatalogAdapter = {
  async searchCatalog(input) {
    // An empty query powers the offline catalog browse view. It is not sent to
    // public providers, whose broad responses would be both costly and vague.
    if (!input.query.trim()) return seedCatalogAdapter.searchCatalog(input);

    // Tests and explicitly offline installs retain deterministic local data.
    if (disabled("OPENALEX_DISABLED") && disabled("OPENLIBRARY_DISABLED")) {
      return seedCatalogAdapter.searchCatalog(input);
    }

    const result = await searchCatalogGateway(
      { query: input.query, limit: Math.max(input.limit ?? 10, 12), ownerId: input.userId },
      {
        includeOpenAlex: !disabled("OPENALEX_DISABLED"),
        includeOpenLibrary: !disabled("OPENLIBRARY_DISABLED"),
        includeSeed: true,
      },
    );
    return rankResources([...result.records], input).slice(0, input.limit ?? 10);
  },

  async getResourceDetails(resourceId) {
    return seedCatalogAdapter.getResourceDetails(resourceId);
  },

  async findResourcesByConcept(conceptId, limit) {
    return seedCatalogAdapter.findResourcesByConcept(conceptId, limit);
  },
};
