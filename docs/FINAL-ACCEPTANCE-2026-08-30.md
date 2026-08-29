# Wormhole Library final acceptance

Date: 2026-08-30
Branch: `codex/final-integration`

## Evidence

- `npx vitest run`: 71 test files, 434 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with no ESLint warnings or errors.
- `npm run build`: passed; 38 application pages and API routes generated.
- Browser verification on `http://localhost:3008`: home search, research sessions, daily recommendations, writing workbench, settings themes, and source links opened successfully.

## Findings

The integrated application now has one source-aware catalogue path for OpenAlex,
Open Library, and user-configured personal catalogue sources. Search results keep
their original URLs and source labels. A source failure is shown as a source
failure rather than being relabelled as an empty result.

The writing workbench follows the recovered workflow interaction order: choose a
workflow, attach materials, set language/citation/tone, choose checkpoints and a
model, optionally override a step model, run, edit, review, rerun, and export.
The directory includes research, academic, and existing-material workflow
families. Mathematics-contest/modeling workflows are intentionally excluded from
the production surface. Complex local-code, figure, PDF, and DOCX stages are
shown as evidence-writing fallback stages until a deployment supplies those
executors.

Temporary uploads expire after exactly 30 days; library uploads persist until
deleted. Upload and writing activity is projected into the private session map.
Personal map distance, search-frequency brightness, catalogue-map highlighting,
and map entry links are functional.

Living Book requests remain consent-gated. Accepted conversations support text,
source links, private asset grants, recipient reads through an authorization
checked endpoint, and sender revocation.

## Path

Use the running build at [http://localhost:3008](http://localhost:3008). The
older `3000` through `3007` tabs are stale processes and must not be used for
acceptance.

For real university catalogues, open `/settings/catalog-sources`, choose SRU,
OAI-PMH, Koha/Alma REST, Z39.50 configuration, or a MARC/CSV/JSON import, test
the connection, then save it as a personal source. An institution SSO, campus
network, IP allow-list, paywall, or provider credential must still be supplied
by the user or institution; the application does not bypass those controls.

For model-backed writing, configure a provider or DeepSeek preset under
`/settings/providers`. Without a configured model the application clearly labels
the generated output as a local traceable draft and does not claim that a model
read the sources.
