import "server-only";
import type { CurrentPrincipal } from "@/lib/auth/principal";
import { bindPackage01ServerPrincipal } from "@/lib/integration/package01Principal";
import { seedCatalogAdapter } from "@/lib/catalog/seedCatalogAdapter";
import { principalOwnerKey } from "@/lib/research/principal";
import { getResearchSessionService } from "@/lib/research/sessionStore";
import type { SessionResource } from "@/lib/research/types";
import { getPrisma } from "@/lib/db/prisma";
import { installWritingPorts, writingPortsAreInstalled } from "@/lib/writing/ports";
import type { EvidenceItem } from "@/lib/writing/types";

function ownerKey(principal: CurrentPrincipal): string {
  return principalOwnerKey(principal);
}

function sourceKind(label?: string): EvidenceItem["provenance"]["sourceKind"] {
  const normalized = label?.toLowerCase() ?? "";
  if (normalized.includes("openalex")) return "openalex";
  if (normalized.includes("open library") || normalized.includes("openlibrary")) return "openlibrary";
  if (normalized.includes("seed") || normalized.includes("种子")) return "seed";
  return "library";
}

function resourceEvidence(resource: SessionResource): EvidenceItem {
  return {
    id: resource.id,
    title: resource.title,
    excerpt: `Research session resource: ${resource.title}.`,
    url: resource.sourceUrl,
    provenance: {
      sourceKind: sourceKind(resource.sourceLabel),
      sourceLabel: resource.sourceLabel ?? "Research session",
      retrievedAt: new Date().toISOString(),
      externalId: resource.id,
    },
    verificationStatus: "needs_review",
  };
}

export function ensureAppComposition(): void {
  bindPackage01ServerPrincipal();
  if (writingPortsAreInstalled()) return;

  installWritingPorts({
    async session({ principal, sessionId }) {
      try {
        const session = await getResearchSessionService().get(ownerKey(principal), sessionId);
        return {
          id: session.id,
          ownerId: session.ownerId,
          researchQuestion: session.researchQuestion,
          evidenceIds: session.evidenceIds,
        };
      } catch {
        return null;
      }
    },
    async evidence({ principal, sessionId, evidenceId }) {
      const ownerId = ownerKey(principal);
      const stored = await getPrisma().writingEvidence.findFirst({
        where: {
          ownerId,
          sessionId,
          verificationStatus: "verified",
          userConfirmedAt: { not: null },
          OR: [{ id: evidenceId }, { externalEvidenceId: evidenceId }],
        },
      });
      if (stored) {
        const provenance = JSON.parse(stored.provenanceJson) as EvidenceItem["provenance"] & {
          doi?: string;
          authors?: string[];
          titleAuthorMatch?: EvidenceItem["titleAuthorMatch"];
        };
        const { doi, authors, titleAuthorMatch, ...source } = provenance;
        return {
          id: stored.externalEvidenceId,
          title: stored.title,
          excerpt: stored.excerpt,
          provenance: source,
          url: stored.url ?? undefined,
          doi,
          authors,
          titleAuthorMatch,
          verificationStatus: "verified",
          userConfirmedAt: stored.userConfirmedAt?.toISOString(),
        };
      }

      try {
        const session = await getResearchSessionService().get(ownerId, sessionId);
        const resource = session.searches
          .flatMap((search) => search.resources)
          .find((item) => item.id === evidenceId);
        return resource ? resourceEvidence(resource) : null;
      } catch {
        return null;
      }
    },
    async discover({ researchQuestion }) {
      const resources = await seedCatalogAdapter.searchCatalog({
        query: researchQuestion,
        limit: 12,
        taskType: "research",
      });
      return resources.map((resource): EvidenceItem => ({
        id: resource.id,
        title: resource.title,
        excerpt: resource.why,
        url: resource.sourceUrl,
        authors: resource.authors,
        titleAuthorMatch: resource.authors.length > 0 ? "partial" : "low",
        provenance: {
          sourceKind: "seed",
          sourceLabel: "本地种子",
          retrievedAt: new Date().toISOString(),
          externalId: resource.id,
        },
        verificationStatus: "needs_review",
      }));
    },
  });
}
