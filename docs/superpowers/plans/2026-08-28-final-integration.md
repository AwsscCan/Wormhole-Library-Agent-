# Final integration implementation plan

> **For implementation team:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair and integrate all accepted responsibility-package functionality into one runnable Wormhole Library Agent without regressing P03/P05.

**Architecture:** `161476d` is the protected P03/P05 base.  P01 is merged with two deliberate conflict resolutions; P02 and P04 are ported selectively because their stale branch topology would otherwise delete P05.  A single composition root binds canonical ports, while P04 becomes async, durable, principal-derived, and explicit about semantic degradation.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/SQLite, Vitest, Ollama embedding API.

**Spec:** `docs/superpowers/specs/2026-08-28-final-integration-design.md`

**Global constraints**

- Work only in `E:\Temp\codex-final-integration` on `codex/final-integration`.
- Never merge or cherry-pick `ba17b4a` wholesale; it deletes protected P05 paths.
- Apply test-driven development: create/run a focused failing test before each production change.
- Keep P05 `lib/workbench/ports.ts` as the canonical memory-read boundary and `lib/research/catalogPort.ts` as the canonical catalog boundary.
- Do not weaken authorization, replace a real semantic provider with hashes, or silently downgrade a partial/unavailable data source.
- Commit each completed task with only its intended files, then have a fresh reviewer inspect the net diff and test evidence.

### Task 1: Merge package 01 auth/writing without regressing the research workbench

**Files:** P01 branch files from `16ecb8b`, existing `lib/llm/provider.ts`, `prisma/migrations/migration_lock.toml`, `prisma/schema.prisma`, tests under `tests/unit/auth-*`, `tests/unit/writing-*`, `tests/unit/workspace-ui.test.ts`.

1. Write focused regression tests proving the P01 principal resolver is bindable by research code and existing P05 workbench imports/routes remain present.
2. Run them to demonstrate the P01 integration is absent on the protected base.
3. Merge `16ecb8b` into the integration branch. Resolve `lib/llm/provider.ts` by retaining P05-compatible provider behaviour and P01's provider configuration functionality; resolve the migration lock by retaining a valid SQLite lock and every migration.
4. Add an adapter from P01's server principal to `bindPackage01CurrentPrincipalPort` without parsing credentials in P03/P04.
5. Run focused P01/P03/P05 tests, typecheck, and commit.

### Task 2: Port package 02 federation and source-transparent catalog adapter

**Files:** `lib/federation/*`, `app/api/library/topic/route.ts`, `lib/research/catalogPort.ts`, `lib/research/types.ts`, `tests/unit/{federation*,catalog-port-adapter,research-catalog-port}.test.ts`.

1. Add focused tests for a P02 source matrix with stable source order, primary/additional provenance, and a P05 catalog call receiving a real partial response rather than `not integrated`.
2. Run them red.
3. Selectively port P02 federation and adapter files from `df80d1a` and `aa7cee6`; union the shared DTO additions with all P05 graph-projection fields.
4. Bind P02 only through the P05/P03 canonical catalog contract; preserve source status/provenance and deterministically order the matrix.
5. Run focused tests and commit.

### Task 3: Port and repair package 04 durable private-memory fundamentals

**Files:** `lib/research/memory/{index,indexStore,inference,ledger,persistence,port,qa,types}.ts`, `prisma/schema.prisma`, `prisma/migrations/202608280001_package04_memory/migration.sql`, `tests/unit/memory-{immutability,ledger,persistence,principal,port}.test.ts`.

1. Write red tests for nested input/return mutation, restore-then-write unique IDs, idempotent concurrent hydration, and automatic persistence after every mutation.
2. Selectively port P04 foundations, then use `structuredClone` at all inbound/outbound boundaries and reconstruct monotonically increasing event/snippet IDs after hydration.
3. Add an async, serialized lifecycle that hydrates before the first public operation and snapshots after successful mutation. Preserve P05 migrations and add a Prisma model matching the `MemorySnapshot` migration.
4. Restrict public writes to the P01-derived facade; ensure any server feedback has an already-authorized P03 session and trusted P02 provenance.
5. Run focused memory and migration tests and commit.

### Task 4: Implement truthful async semantic memory and P05 presentation

**Files:** `lib/research/memory/embedding.ts`, `lib/research/memory/{index,indexStore,port,qa,types}.ts`, `lib/workbench/ports.ts`, `components/ExplorationWorkbench.tsx`, related memory/workbench tests.

1. Add red tests using mocked Ollama `/api/embed` responses for English and Chinese no-token-overlap semantic matches; add unavailable/timeout/malformed/dimension-mismatch fallback cases.
2. Replace the synchronous hashed n-gram default with an async `SemanticEmbeddingProvider` that reports `semantic` or `degraded` explicitly and uses lexical-only matching when the provider cannot run.
3. Propagate the structured result through P05's canonical port and render semantic, lexical-fallback, and unavailable states distinctly.
4. Rebuild vectors asynchronously after a memory snapshot restore; never persist a fake semantic vector.
5. Run focused semantic/workbench tests and commit.

### Task 5: Production composition, route-level integration, and end-to-end proof

**Files:** `lib/composition.ts`, `instrumentation.ts`, `lib/research/runtime.ts`, `lib/workbench/runtime.ts`, P05 feedback route, integration tests.

1. Add red integration tests that exercise the actual P05 recommendation/feedback route with P01 principal: P02 catalog is live/partial, P04 memory is read, feedback creates one owner/session-scoped event, and a persistence failure preserves the route's retryable response.
2. Implement one idempotent bootstrap that wires P01, P02, P04, and feedback ports. Call it from Node instrumentation and both research/workbench runtime entry points.
3. Verify private session ownership before writing memory feedback; do not trust client owner or provenance fields.
4. Run focused end-to-end/migration tests, then `npx tsc --noEmit`, the complete test suite, and `npm run build`.
5. Commit, produce a concise release-readiness report with exact commands/results, and request independent final review.
