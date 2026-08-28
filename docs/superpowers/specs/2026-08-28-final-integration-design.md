# Wormhole Library Agent final integration design

**Date:** 2026-08-28  
**Status:** approved for implementation by the user's request to repair, integrate, and deliver the project

## Purpose

Produce one runnable Wormhole Library Agent from the accepted package 01 authentication/writing work, package 02 federated catalog work, package 03 research-session and personal graph work, package 04 private-memory work, and package 05 exploration workbench.  The final product must retain package 03/P05 behaviour already present at `161476d`; no stale package branch may silently remove it.

## Non-negotiable product behaviour

1. A visitor can use an authenticated member or persisted guest principal, create and access only their own research sessions, search federated sources, and inspect an editable personal graph/workbench.
2. Federated catalogue results expose per-source outcome and provenance rather than pretending a partial response is complete.
3. The workbench consumes actual package 02 results and package 04 historical memory through one canonical port each.  Both are bootstrapped before either the research or workbench route executes.
4. Private memory is owner-scoped, immutable at its public boundaries, automatically hydrated and persisted, and receives workbench feedback through a server-derived principal/session chain.
5. “Semantic memory” is truthful: an Ollama vector provider is used when available; when unavailable the UI and API explicitly report lexical fallback rather than claiming semantic recall.
6. Existing P05 sources, candidate links, degradation messaging, persistence behaviour, migrations, and UI routes remain available after integration.
7. Package 01’s no-email-verification login, model-provider settings, notes, and evidence-bound writing workflow are brought forward without replacing the P03/P05 research experience.

## Integration decisions

| Area | Selected source | Integration rule |
| --- | --- | --- |
| P01 auth and writing | `16ecb8b` / `codex/v3.2-p01-auth-writing` | Merge with explicit resolution only for `lib/llm/provider.ts` and Prisma migration lock; preserve existing schema entities and add P01 migrations. |
| P02 federation | `df80d1a` + `aa7cee6` | Selectively port federation files and source-transparent adapter; retain P05 catalog port as the sole binding contract. |
| P03/P05 | `161476d` | Baseline and protected surface. Do not replace or delete any P05 workbench route, UI, migration, test, or research graph behaviour. |
| P04 memory | `0fa20f2` + `ba17b4a` | Selectively port memory modules/migration, then repair the documented acceptance failures before exposing them in production. |

## Boundary design

`lib/composition.ts` is the only cross-package bootstrap. It binds:

- P01 current principal resolver to `lib/research/principal.ts`.
- P02 `createSourceTransparentCatalogAdapter()` to `bindPackage02SourceCatalogPort()`.
- P04 `defaultMemoryReadPort` to P05's `bindPackage04MemoryReadPort()`.
- a P05 feedback-event adapter to P04's principal/session-safe memory mutation facade.

`instrumentation.register()` invokes the bootstrap on the Node runtime.  `getResearchWorkspace()` and `recommendForSession()` also call an idempotent bootstrap as a route-level safety net.

P04 cannot accept a caller-supplied owner in a production mutation.  Public HTTP-facing mutations derive owner from P01 and bind the event to the already-authorized P03 session.  Low-level owner-parameter functions are internal/test helpers.

## Memory retrieval contract

The canonical workbench port returns a structured outcome.  It is one of:

- `semantic`: live vector-plus-lexical retrieval;
- `degraded`: lexical-only retrieval with a user-visible reason;
- `unavailable`: no memory port or an unrecoverable port failure.

The configured async provider POSTs to Ollama `/api/embed`, uses `OLLAMA_BASE_URL` and `MEMORY_EMBEDDING_MODEL`, and never replaces semantic vectors with a character n-gram hash.  Stored snapshots retain source records and lexical text; embeddings are rebuilt asynchronously after hydration, falling back explicitly if Ollama is unavailable.

## Acceptance evidence

The completed branch must have tests that prove source/status projection, no P05 deletion, principal-derived feedback, nested-input immutability, restore-then-write IDs, automatic persistence, semantic retrieval with a mocked Ollama protocol, truthful lexical fallback, and P05's real recommendation path consuming both ports.  It must also pass typecheck, full unit tests, migration validation, and production build before integration is declared ready.
