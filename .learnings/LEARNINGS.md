# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## [LRN-20260821-001] correction

**Logged**: 2026-08-21T00:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: docs

### Summary
The task scope is responsibility-package integration and UI delivery, not the previously assumed Prisma migration.

### Details
The user clarified that they own responsibility package 01 and need teammate 03's submitted functions integrated, exposed through frontend UI, and reflected in documentation.

### Suggested Action
Read the handoff, design, and responsibility packages before changing code; keep the frozen API contracts intact.

### Metadata
- Source: user_feedback
- Related Files: docs/HANDOFF-CODEX.md, responsibility-packages/package-01-owner-integration.md, responsibility-packages/package-03-wormhole-memory-algorithm.md
- Tags: scope, integration, frontend
- Pattern-Key: docs.scope-correction

---

## [LRN-20260828-001] correction

**Logged**: 2026-08-28T00:25:00+08:00
**Priority**: high
**Status**: resolved
**Area**: docs

### Summary
Responsibility-package acceptance must not assign P01 final composition or P05 consumer integration work to the P02/P04 owner.

### Details
The prior teammate02 supplemental acceptance report treated missing production bootstrap and consumer-side registry wiring as teammate02 blockers. The user clarified that only work owned by teammate02 should remain in the report.

### Suggested Action
Separate package-owned implementation defects from integration-owner work; report the latter only as external follow-up, never as a failure attributable to the submitting teammate.

### Metadata
- Source: user_feedback
- Related Files: docs/2026-08-28_验收报告-队友02补交-aa7cee6-ba17b4a.md
- Tags: acceptance, scope, ownership
- Pattern-Key: audit.scope-attribution

---
