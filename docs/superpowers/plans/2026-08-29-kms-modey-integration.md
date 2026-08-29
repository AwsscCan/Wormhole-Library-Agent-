# Wormhole Knowledge Management and ModeY Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a source-grounded Wormhole knowledge-management application with real catalogue search, owner-scoped knowledge assets, ModeY-style writing workflows, meaningful maps, visible memory, working LaTeX preview, distinct navigation, and saved themes.

**Architecture:** A single catalogue gateway replaces divergent search and writing discovery paths. Persistent source, asset, workflow, and knowledge-event records supply the maps and writing workbench. The UI is a Next.js projection over those services, with source truth, owner isolation, and safe degradation carried through every route.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma/SQLite, Zod, Vitest, React Flow, KaTeX, server-side fetch.

**Spec:** `docs/superpowers/specs/2026-08-29-kms-modey-integration-design.md`

## Global Constraints

- Preserve the existing server-derived owner model; never accept arbitrary owner IDs from browser payloads.
- External-source state must be `live`, `cached`, `empty`, `failed`, `disabled`, or `requires_access`; seed data is visibly labelled offline fallback.
- Credentials are encrypted server-side and never included in response DTOs.
- Temporary uploaded files expire after exactly 30 days; opted-in knowledge assets persist until owner deletion.
- Do not bypass SSO, paywalls, IP controls, campus networks, or library terms.
- Use structured parsers and bounded extraction; reject archive traversal and decompression bombs.
- Workflow model order is step preset, workflow preset, role preset, user default.
- Literature review uses the writing-workbench evidence and artifact path, never a separate generation pipeline.
- Existing unrelated worktree edits must be preserved.

---

## File Structure

- `lib/catalog/gateway.ts`: source-aware catalogue search and status aggregation.
- `lib/catalog/sourceAdapters/*`: OpenAlex, OpenLibrary, imported, and connection-protocol adapter boundary.
- `lib/catalog/sourceRepository.ts`: owner/institution source configuration, encrypted credential storage, and health state.
- `lib/knowledge/assets.ts`: asset validation, retention, extraction state, and owner-scoped persistence.
- `lib/knowledge/events.ts`: append-only knowledge events and personal-map projection inputs.
- `lib/workflows/*`: ModeY-derived template, run, step, checkpoint, artifact, and model-resolution services.
- `lib/livingLibrary/conversations.ts`: consent-gated messages, resource sharing, and revocable asset grants.
- `components/catalog/*`, `components/knowledge/*`, `components/workflows/*`: source cards, connection wizard, asset picker, workflow workbench, and map controls.
- `lib/notes/mathMarkdown.ts` and `components/notes/*`: safe Markdown plus KaTeX rendering and editor preview.
- `lib/preferences/theme.ts` and `components/settings/*`: persisted theme preference and colour swatches.
- `prisma/schema.prisma` plus one migration: durable models and owner-scoped indexes.

## Task 1: Establish the Source-Truth Catalogue Contract

**Files:**
- Create: `lib/catalog/gateway.ts`, `tests/unit/catalog-gateway.test.ts`
- Modify: `lib/types.ts`, `lib/catalog/openAlexAdapter.ts`, `lib/federation/openAlexFederated.ts`, `lib/federation/openLibraryAdapter.ts`, `lib/federation/dedupe.ts`, `components/ResourceCard.tsx`

**Interfaces:**
- Produces `CatalogGateway.search(input): Promise<CatalogSearchResult>` with `records`, `sources`, and `degraded`.
- Produces `CatalogRecord` with `sourceUrl`, `abstract`, `citedByCount`, and source provenance.

- [ ] **Step 1: Write failing gateway tests**

```ts
expect(await gateway.search({ query: "RAG" })).toMatchObject({
  sources: expect.arrayContaining([expect.objectContaining({ kind: "openalex", status: "failed" })]),
  records: expect.arrayContaining([expect.objectContaining({ sourceUrl: "https://" })]),
});
```

- [ ] **Step 2: Run the focused test and verify the missing gateway contract fails.**

Run: `npx vitest run tests/unit/catalog-gateway.test.ts`

- [ ] **Step 3: Implement the minimal normalized gateway and preserve URLs.**

```ts
export type SourceOutcome = { kind: SourceKind; status: SourceStatus; message?: string };
export async function searchCatalogGateway(input: CatalogSearchInput): Promise<CatalogSearchResult> {
  const settled = await Promise.allSettled(enabledAdapters.map((adapter) => adapter.search(input)));
  return mergeCatalogSettled(settled, input);
}
```

- [ ] **Step 4: Render `sourceUrl` as an explicit secure source link on `ResourceCard`.**

- [ ] **Step 5: Run focused tests, TypeScript, and commit.**

Run: `npx vitest run tests/unit/catalog-gateway.test.ts tests/unit/federation.test.ts && npx tsc --noEmit`

Commit: `feat: unify live catalog search and source links`

## Task 2: Route Search and Writing Discovery Through the Gateway

**Files:**
- Modify: `lib/agent/orchestrator.ts`, `lib/research/runtime.ts`, `lib/research/workspace.ts`, `lib/composition.ts`, `app/api/search/route.ts`, `tests/unit/orchestrator-smoke.test.ts`, `tests/unit/draft-service.test.ts`

**Interfaces:**
- Consumes `CatalogGateway.search` from Task 1.
- Produces search sessions and writing candidates whose provenance remains source-aware.

- [ ] **Step 1: Write failing tests proving a gateway result appears in main search and writing discovery.**

```ts
expect(search.resources[0]).toMatchObject({ sourceUrl: "https://source.example/item" });
expect(candidate.provenance.sourceKind).toBe("openalex");
```

- [ ] **Step 2: Run focused tests and verify old seed-only wiring fails.**

Run: `npx vitest run tests/unit/orchestrator-smoke.test.ts tests/unit/draft-service.test.ts`

- [ ] **Step 3: Replace direct `seedCatalogAdapter` and silent OpenAlex fallback calls with the gateway.**

- [ ] **Step 4: Persist source status with each session search and show failure separately from no results.**

- [ ] **Step 5: Run focused tests and commit.**

Commit: `feat: use source-aware catalog for search and writing`

## Task 3: Add Persistent Sources and the No-Code Connection Wizard

**Files:**
- Create: `lib/catalog/sourceRepository.ts`, `lib/catalog/sourceValidation.ts`, `app/api/v3/catalog-sources/route.ts`, `app/api/v3/catalog-sources/[sourceId]/test/route.ts`, `components/catalog/CatalogSourceSettings.tsx`, `app/settings/catalog-sources/page.tsx`, `tests/unit/catalog-source-repository.test.ts`
- Modify: `prisma/schema.prisma`, `prisma/migrations/202608290001_catalog_sources/migration.sql`, `components/TopNav.tsx`

**Interfaces:**
- Produces `CatalogSourceDto`, `createCatalogSource(principal, input)`, and `testCatalogSource(principal, id)`.
- Supports scopes `institution` and `personal`, with admin-only publishing for institution sources.

- [ ] **Step 1: Write failing repository and route tests for owner isolation, redaction, and test-preview DTOs.**

- [ ] **Step 2: Add the Prisma models and migration before implementing routes.**

- [ ] **Step 3: Implement SRU, OAI-PMH, REST, and import-source validation; expose Z39.50 as a configured capability requiring an approved server adapter.**

- [ ] **Step 4: Build the visual wizard: address/protocol, test, field preview, scope, credential, and save.**

- [ ] **Step 5: Run migration, focused tests, and commit.**

Commit: `feat: add personal and institution catalog sources`

## Task 4: Build Knowledge Assets With 30-Day Retention

**Files:**
- Create: `lib/knowledge/assets.ts`, `lib/knowledge/extract.ts`, `app/api/v3/knowledge-assets/route.ts`, `app/api/v3/knowledge-assets/[assetId]/route.ts`, `components/knowledge/AssetDropzone.tsx`, `components/knowledge/KnowledgeAssetPicker.tsx`, `tests/unit/knowledge-assets.test.ts`
- Modify: `prisma/schema.prisma`, `prisma/migrations/202608290002_knowledge_assets/migration.sql`, package dependencies, `components/TopNav.tsx`

**Interfaces:**
- Produces `createKnowledgeAsset(principal, file, { retention })` and `listKnowledgeAssets(principal, query)`.
- Retention is `temporary` with `expiresAt = createdAt + 30 days` or `library` with `expiresAt = null`.

- [ ] **Step 1: Write failing tests for retention calculation, MIME/extension validation, owner isolation, and archive rejection.**

- [ ] **Step 2: Add safe storage metadata and extraction states with database migration.**

- [ ] **Step 3: Implement bounded text, CSV, JSON, BibTeX, DOCX, PDF, image metadata, ZIP, and TAR.GZ extraction.**

- [ ] **Step 4: Implement drop zone rows with a retention toggle and attach-existing-library flow.**

- [ ] **Step 5: Run focused tests and commit.**

Commit: `feat: add retained knowledge assets and safe upload`

## Task 5: Port the ModeY Workflow Contract

**Files:**
- Create: `lib/workflows/templates.ts`, `lib/workflows/repository.ts`, `lib/workflows/service.ts`, `app/api/v3/workflows/route.ts`, `app/api/v3/workflows/[runId]/route.ts`, `components/workflows/WorkflowWorkbench.tsx`, `components/workflows/WorkflowSetup.tsx`, `components/workflows/WorkflowStages.tsx`, `tests/unit/workflow-service.test.ts`
- Modify: `prisma/schema.prisma`, `prisma/migrations/202608290003_workflow_runs/migration.sql`, `app/writing/page.tsx`, `app/review/page.tsx`, `app/api/review/route.ts`

**Interfaces:**
- Produces `createWorkflowRun`, `advanceWorkflowStep`, `resolveCheckpoint`, and `rerunWorkflowStep`.
- Imports a narrowed TypeScript representation of ModeY `workflow-templates.json` with evidence section, literature review, outline, and source-to-paper templates.

- [ ] **Step 1: Write failing tests for step order, checkpoint pause/feedback/rerun, asset attachment, and artifact provenance.**

- [ ] **Step 2: Implement workflow persistence and state transitions with explicit per-step outcomes.**

- [ ] **Step 3: Replace the writing page with the ModeY-derived operational layout and preserve existing evidence-draft data.**

- [ ] **Step 4: Redirect `/review` into the literature-review template and remove its separate generation path.**

- [ ] **Step 5: Run focused tests and commit.**

Commit: `feat: add ModeY-style writing workbench`

## Task 6: Implement Model Routing, DeepSeek, and CC Switch Import

**Files:**
- Create: `lib/llm/ccSwitch.ts`, `app/api/v3/cc-switch/catalog/route.ts`, `app/api/v3/cc-switch/import/route.ts`, `tests/unit/cc-switch.test.ts`
- Modify: `lib/llm/providerRepository.ts`, `components/settings/ProviderSettings.tsx`, `components/workflows/WorkflowSetup.tsx`, validation schemas

**Interfaces:**
- Produces `resolveWorkflowModel(input)` using step, workflow, role, user-default priority.
- Produces `listRedactedCcSwitchCatalog()` and `importCcSwitchPreset(principal, selection)`.

- [ ] **Step 1: Write failing tests for resolution priority, redaction, DeepSeek preset creation, and forged CC Switch selection rejection.**

- [ ] **Step 2: Implement a DeepSeek quick-add form that creates an owner-scoped OpenAI-compatible provider.**

- [ ] **Step 3: Implement opt-in CC Switch model catalogue import without reading or returning secrets.**

- [ ] **Step 4: Render global model selector and optional per-step selectors in the workflow setup.**

- [ ] **Step 5: Run focused tests and commit.**

Commit: `feat: add workflow model routing and provider import`

## Task 7: Project Events Into Catalogue and Personal Maps

**Files:**
- Create: `lib/knowledge/events.ts`, `lib/knowledge/personalMap.ts`, `components/catalog/CatalogueMap.tsx`, `components/knowledge/PersonalKnowledgeMap.tsx`, `tests/unit/personal-map.test.ts`
- Modify: `lib/research/personalGraph.ts`, `components/PersonalGraphWorkspace.tsx`, `app/research/[sessionId]/map/page.tsx`, search and workflow services

**Interfaces:**
- Produces `appendKnowledgeEvent`, `buildCatalogueMap`, and `buildPersonalKnowledgeMap(ownerId)`.
- Event kinds include search, save, upload, evidence, writing, artifact, and feedback.

- [ ] **Step 1: Write failing tests for automatic node/edge creation and weight updates after events.**

- [ ] **Step 2: Append events in gateway search, asset creation, evidence selection, workflow completion, and feedback paths.**

- [ ] **Step 3: Render the catalogue/personal segmented map control with typed relationship legends and search highlighting.**

- [ ] **Step 4: Preserve pin/hide/note/manual-edge overrides as a layer over the automatic personal projection.**

- [ ] **Step 5: Run focused tests and commit.**

Commit: `feat: project knowledge activity into maps`

## Task 8: Expose Memory and Theme Preferences in the Working UI

**Files:**
- Create: `lib/preferences/theme.ts`, `components/settings/ThemeSettings.tsx`, `tests/unit/theme-preferences.test.ts`
- Modify: `prisma/schema.prisma`, `prisma/migrations/202608290004_preferences/migration.sql`, `components/settings/ProviderSettings.tsx`, `app/settings/providers/page.tsx`, `app/memory/page.tsx`, search cards, map components, `app/globals.css`, `components/TopNav.tsx`

**Interfaces:**
- Produces `getThemePreference(ownerId)` and `setThemePreference(ownerId, themeId)`.
- Maps and result cards consume `MemoryExplanation` with visible ranking reasons.

- [ ] **Step 1: Write failing tests for saved theme and memory-explanation projection.**

- [ ] **Step 2: Store and apply accessible theme tokens and map-display preferences through the unified settings center.**

- [ ] **Step 3: Add memory layer controls, priority explanations, interest brightness, and use-weight edge widths.**

- [ ] **Step 4: Assign distinct navigation icons for exploration and research workspace.**

- [ ] **Step 5: Add map-focus entry links on source cards, research sessions, evidence, and writing artifacts.**

- [ ] **Step 6: Run focused tests and commit.**

Commit: `feat: expose memory and persisted themes`

## Task 9: Add Consent-Gated Living Book Conversations

**Files:**
- Create: `lib/livingLibrary/conversations.ts`, `app/api/v3/living-book/conversations/route.ts`, `app/api/v3/living-book/conversations/[conversationId]/messages/route.ts`, `components/living-library/ConversationPanel.tsx`, `tests/unit/living-book-conversations.test.ts`
- Modify: `prisma/schema.prisma`, `prisma/migrations/202608290005_living_book_conversations/migration.sql`, `app/living-library/page.tsx`, contact-request routes, knowledge asset access service

**Interfaces:**
- Produces `createConversation`, `sendConversationMessage`, `shareConversationResource`, `grantConversationAsset`, and `revokeConversationAsset`.
- A conversation is valid only when the matching contact request is accepted by the Living Book owner.

- [ ] **Step 1: Write failing tests for accepted-contact gating, message owner isolation, resource sharing, asset grant revocation, and credential redaction.**

- [ ] **Step 2: Add conversation, message, resource attachment, and revocable asset-grant tables with owner indexes.**

- [ ] **Step 3: Implement server routes with sender/recipient authorization and attachment provenance.**

- [ ] **Step 4: Build the conversation panel, reading-list/resource attachment picker, and explicit private-asset share confirmation.**

- [ ] **Step 5: Run focused tests and commit.**

Commit: `feat: add Living Book conversations and resource sharing`

## Task 10: Replace the Broken Markdown Math Preview

**Files:**
- Create: `lib/notes/mathMarkdown.ts`, `tests/unit/math-markdown.test.ts`
- Modify: `components/notes/SafeMarkdown.tsx`, `components/notes/NoteEditor.tsx`, `app/globals.css`, package dependencies, writing artifact preview

**Interfaces:**
- Produces `renderSafeMarkdown(markdown): MarkdownBlock[]` and `MathFragment` values for inline/display math or an explicit render error.

- [ ] **Step 1: Write a failing regression test showing `$x^2$` is currently emitted as plain text.**

- [ ] **Step 2: Add KaTeX and a safe tokenizing renderer for inline `$...$` and display `$$...$$`.**

- [ ] **Step 3: Display debounced live preview and inline parse errors without altering source text.**

- [ ] **Step 4: Reuse the same preview renderer in writing artifacts.**

- [ ] **Step 5: Run focused tests and commit.**

Commit: `fix: restore safe real-time LaTeX preview`

## Task 11: End-to-End Verification and Documentation

**Files:**
- Create: `tests/e2e/kms-workflows.spec.ts`, `docs/FINAL-ACCEPTANCE-2026-08-30.md`
- Modify: `README.md`, `.env.example`

**Interfaces:**
- Consumes all public route DTOs and browser workflows from Tasks 1-9.

- [ ] **Step 1: Add browser tests for live/failed source status, source navigation, asset retention choice, workflow checkpoints, maps, theme persistence, math preview, and consent-gated Living Book sharing.**

- [ ] **Step 2: Run migrations from an empty SQLite database and verify owner isolation.**

- [ ] **Step 3: Run lint, TypeScript, unit, build, and browser suites.**

Run: `npm run lint && npx tsc --noEmit && npm run test && npm run build`

- [ ] **Step 4: Manually verify desktop and mobile local-browser flows and record actual results.**

- [ ] **Step 5: Update README/environment instructions and commit.**

Commit: `test: verify knowledge management workflows`
