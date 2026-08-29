# Wormhole Knowledge Management and Writing Workflow Design

## Goal

Turn Wormhole Library Agent into a usable, source-grounded knowledge-management
application. The product must search real catalogues, accept and read user
materials, use those materials in an evidence-constrained writing workflow, and
make the resulting knowledge visible through public-catalogue and personal-star
map views. It must provide a working real-time LaTeX preview in notes and
writing artifacts. It must not present seed data, deterministic text, an
unavailable upstream, or an unrendered formula as if it were a live capability.

All workflow contracts are defined and implemented inside Wormhole Library
Agent. External provider catalogues may be imported only through explicit,
redacted interfaces; credentials, licensing mechanisms, and private runtime
state from other applications are never copied.

## Confirmed Product Rules

- A user may upload a file as a temporary workflow attachment or choose to add
  it to their private knowledge library.
- Temporary attachments expire after 30 days. Library assets persist until their
  owner deletes them.
- Institution administrators may configure a shared university-library source.
  Ordinary users may also configure private sources for themselves.
- The system must support realistic university-library integration paths rather
  than only generic public book APIs.
- The catalogue map and personal star map are working views of actual data, not
  decorative visualizations.
- Literature review is a writing-workbench template or a writing step. It is not
  maintained as a disconnected page with a separate evidence pipeline.

## Current Faults and Root Causes

1. The main search path calls `lib/catalog/openAlexAdapter.ts`, which silently
   returns `seedCatalogAdapter` results after an OpenAlex failure. The federated
   OpenLibrary path exists separately in `lib/federation/*` and is not the main
   search path.
2. The writing discovery port in `lib/composition.ts` is hard-coded to
   `seedCatalogAdapter`, so writing evidence cannot use federation or a real
   connected library.
3. Federation candidates do not retain external URLs, and `ResourceCard` does
   not render source links. A real source result consequently becomes a
   non-clickable text record.
4. The existing personal graph is a per-session projection of searches and
   manually saved graph edits. It has no event projection for uploaded assets,
   writing artifacts, library assets, or memory effects.
5. The existing writing page supports a simple evidence draft state machine but
   has no file intake, workflow template, workflow-wide assignment, per-step
   assignment, run log, or artifacts surface.
6. The current note surface does not deliver a reliable real-time LaTeX preview.
   It therefore fails the product's editor/preview contract for text artifacts
   and must be diagnosed before replacement.

## Writing Workflow Contracts

The project defines the following typed contracts:

- The workflow template catalogue records template IDs, ordered step IDs,
  expected outputs, checkpoint presence, and checkpoint types.
- Workflow runs record `model_preset_id`, `step_models`, checkpoint settings,
  checkpoint resolution, step reruns, artifact inventory, and isolated
  attachment workspaces.
- The workbench interaction contract covers input material, parameters,
  checkpoint controls, workflow model selection, optional per-step overrides,
  execution, progress, artifacts, logs, and checkpoint feedback.
- Provider catalogue import reads only redacted provider/model metadata, imports
  selected tuples explicitly, and never returns credentials.

Wormhole is a Next.js/Prisma application. Workflow data and interaction
behavior are implemented through typed TypeScript service boundaries in the web
runtime.

## Architecture

### Unified Source Catalogue

All search and evidence discovery consume one `CatalogGateway`. It normalizes
each result into a persistent source-aware record containing title, authors,
year, abstract or excerpt, DOI/ISBN, concepts, cited-by count when available,
availability, call number/location, original URL, source ID, retrieval time,
and source status.

Sources have a scope:

- `builtin`: OpenAlex, OpenLibrary, CrossRef.
- `institution`: university library connections published by an authorized
  administrator.
- `personal`: user-owned library connections visible only to that user.
- `import`: a user or institution catalogue imported from MARC, CSV, or JSON.

The gateway's search response includes per-source outcomes: `live`, `cached`,
`empty`, `failed`, `disabled`, or `requires_access`. Results retain their source
URL. A source failure never changes a seed record's label into a live-source
label. Seed data is a clearly labelled offline fallback only.

The primary academic search source is OpenAlex. It returns title, DOI, year,
authors, venue, cited-by count, reconstructed abstract, concepts, open-access
link, and source URL. OpenLibrary remains a book discovery source. CrossRef is
used for citation metadata and APA, MLA, and GB/T 7714 formatting.

### University and Personal Library Connections

`CatalogSource` stores source metadata, scope, owner or institution identity,
protocol, endpoint, field mapping, source capabilities, health status, and last
successful synchronization. Secrets live in encrypted server-side storage and
are never returned by list endpoints.

The connection wizard supports:

1. A public catalogue/OPAC address with protocol discovery.
2. Explicit SRU, OAI-PMH, Z39.50, Koha/Alma-compatible REST, or generic REST
   configuration when auto-discovery cannot identify a service.
3. MARC, CSV, and JSON import with a visual field mapping preview.
4. Optional access credentials, supplied only by the source owner or an
   institution administrator.

The wizard performs test, preview, and save as separate operations. Test output
reports protocol, result count, mapped sample fields, availability, and access
requirements. It does not expose raw credentials or upstream error internals.
Institution sources can be synchronized manually or on their configured schedule.
Personal sources can be manually refreshed by their owner.

Private and local-network endpoints are allowed only for the owning local or
approved deployment environment and only after explicit host allow-listing. This
keeps SSRF defenses intact while supporting campus-network and IP-whitelist
catalogues. A source that requires a campus network or SSO reports
`requires_access`; it is not silently retried through unrelated public sources.

### Knowledge Assets

`KnowledgeAsset` records the owner, original filename, media type, byte size,
storage key, extraction state, extracted text, keywords, preview metadata,
retention policy, expiration, and source relation. `KnowledgeAssetUse` records
when an asset is attached to a workflow, used as evidence, or cited in output.

The upload control accepts `md`, `txt`, `csv`, `json`, `py`, `tex`, `bib`, `pdf`,
`docx`, common image formats, `zip`, and `tar.gz`. The default row is
"only this workflow; retained 30 days". A per-file checkbox changes it to
"add to my knowledge library". Existing library assets can be attached by search
instead of uploading them again.

Upload processing has type, size, count, total-size, parsing-time, and archive
limits. Archive extraction rejects absolute paths, traversal paths, nested
archive recursion, excessive file counts, and decompression-ratio violations.
Failed extraction keeps the original asset and its error state. It never creates
a false empty-text success. Structured parsers are used for CSV, JSON, DOCX,
PDF, bibliographic, and archive formats; unsupported binary formats remain
attachable but are clearly marked unreadable to the text-writing agent.

### Writing Workbench

The current evidence-draft path becomes one workflow template rather than the
entire writing product. The workbench uses this interaction order:

1. Select a template and enter the topic or prompt.
2. Attach temporary files or private knowledge assets.
3. Set template-specific parameters.
4. Enable or disable human checkpoints.
5. Choose an overall workflow model.
6. Optionally assign a model to each step.
7. Run, pause, provide feedback, rerun a step, inspect artifacts, and export.

Supported initial templates are evidence-grounded section writing, literature
review, outline, and source-to-paper. Literature review consumes verified
catalogue evidence and selected assets in the same run, produces a review
artifact with citations, and may pause for evidence or outline approval. The old
`/review` route becomes a redirect or a direct entry into a preselected
literature-review workbench template; it does not own a separate generation
pipeline.

`WorkflowRun`, `WorkflowStepRun`, `WorkflowArtifact`, and `WorkflowCheckpoint`
preserve template, resolved models, input assets, outputs, stage statuses, logs,
and checkpoint feedback. Resolution order is exactly step preset, workflow
preset, role preset, then user default. Every model-backed output stores the
resolved preset identifier and the visible model name. A deterministic fallback
is permitted only when marked as such and never claims that an upstream model
read materials or searched the web.

Generation context contains only selected assets, verified catalogue evidence,
approved prior-step output, and the narrow memory context relevant to the task.
Every output citation links to an asset or catalogue record. Human checkpoints
may approve, supply feedback and rerun the current step, pause, or cancel.

### Model and CC Switch Integration

Existing `ProviderConfig` and `ModelPreset` remain the canonical owner-scoped
provider store. A DeepSeek quick-add path creates an OpenAI Chat Completions
provider preset using the user's supplied key; the key is encrypted at rest.

CC Switch integration reads a redacted catalogue through an explicit,
user-authorized import action. It presents provider/model tuples, imports only
the selected tuple into Wormhole's own provider/preset store, and does not alter
CC Switch. No CC Switch credential is copied or exposed implicitly. Workflow and
step selectors use the imported presets through the standard resolution order.

### Maps and Visible Memory

The graph page has a stable segmented control:

- `Catalogue map` renders category and holding hierarchy for enabled builtin and
  institution sources. It deliberately clusters records instead of rendering an
  unusable node for every item. Edges are typed and labelled: classification,
  topical relation, citation, author, and holding location. A search lights its
  result nodes, their category path, and their relationships.
- `My star map` is an owner-scoped projection of knowledge events. Searches,
  opened or saved resources, uploaded assets, library assets, verified evidence,
  writing topics, produced artifacts, and feedback generate or strengthen
  keyword/concept nodes. Edges represent co-occurrence, evidence use,
  citation, generated-from, and explicit personal links.

The personal map maintains a user-editable override layer for pinning, hiding,
renaming, notes, and personal edges. Auto-generated nodes and edges remain the
base projection, so new knowledge continues to appear without manual graph
maintenance.

Memory is visible in both search and maps. A filterable memory layer displays
preference chips and relevant feedback events. Node brightness reflects interest
weight; edge width reflects repeated use. Search cards and writing steps expose
"why this was prioritized" with the specific preference, event, or evidence
that influenced ranking. The memory page remains the detailed audit and reset
surface.

## UI Boundaries

The navigation exposes Search, Library maps, My star map, Writing workbench,
Knowledge library, Living Book, and one Settings center. The Settings center has
cohesive sections for model providers, CC Switch import, DeepSeek quick-add,
catalogue sources, themes, and star-map display preferences. These settings are
not scattered across unrelated feature pages. Exploration and Research workspace use distinct icons and
labels: exploration retains a compass/navigation signal; research workspace uses
a workbench/map signal. No top-level destinations reuse the same icon for a
different mental model.

The search page is the first usable view. Its cards show title, source, source
state, summary, concepts, venue, cited-by count where supplied, availability,
and original links. It offers inspect, source-link, save, attach as evidence,
and map-focus actions.

The writing workbench is a dense operational workspace: template and source
controls at the top; material, parameters, checkpoint, and model controls in
the setup flow; stage list and logs on one side; editor and preview in the
primary pane; evidence and artifacts in the other side pane. Controls remain
functional at desktop and mobile widths rather than being decorative replicas.

Theme preferences provide several restrained, work-focused colour systems rather
than a single fixed palette. A user can select a theme from visible swatches in
settings; the choice is persisted per owner and applied across navigation,
catalogue maps, personal maps, notes, and the workbench. Every theme preserves
contrast, source-status colours, and the semantic distinction between system,
personal, warning, and error states.

Star maps retain multiple contextual entry points in addition to navigation:
search cards can focus their result and category path; research sessions can
open their related personal projection; evidence and writing artifacts can focus
their source clusters. All entries resolve to the same owner-scoped graph view
and preserve the requested focus node in the URL.

### Living Book Conversations and Sharing

Living Book moves from a profile/match list to a consent-first answer space. A
conversation can be created only after the Living Book owner has explicitly
accepted a contact request. Both participants can send text and attach catalogue
resources, reading lists, and source links. A participant may share a private
knowledge asset only by choosing that asset in the attachment picker and
explicitly granting that conversation access; private assets are never shared by
profile visibility or chat creation alone.

Conversation resource attachments preserve source provenance, availability,
location, and canonical URL. The recipient can save a shared catalogue resource
to their own evidence basket or reading list, but cannot gain the sender's
private-source credentials. Shared private assets store a per-conversation grant
that the sender may revoke; revocation removes recipient access while retaining
the audit metadata that a share occurred. The chat UI shows clear ownership and
access labels beside every attachment.

### Notes and Real-Time LaTeX Preview

Notes, draft artifacts, and review artifacts use one safe Markdown rendering
pipeline. The editor maintains a debounced preview of the same saved-or-draft
text the user sees, so inline `$...$`, display `$$...$$`, and supported LaTex
environments render without requiring a manual page refresh. Markdown text is
escaped before rendering; the math renderer receives only extracted math spans.
Invalid LaTeX produces an inline, non-destructive source error while preserving
the original text and the rest of the preview. The preview does not use raw HTML
injection and does not silently omit malformed formulas.

The initial implementation uses a browser-renderable, maintained math renderer
and its supported CSS/assets. The rendering engine is loaded once at the editor
boundary, not dynamically per formula. Notes continue to persist Markdown, so
their contents remain portable and exportable. The root cause of the failed
current preview is recorded in a regression test before its implementation is
replaced.

## Error Handling and Security

- Each source outcome is independently visible. "No result" and "source
  unavailable" have different UI states.
- External links use safe `https` validation and open as explicit source links.
- Source credentials and provider keys are encrypted server-side and redacted
  from all browser response DTOs.
- API authorization derives owners on the server; browser requests never submit
  an arbitrary owner ID.
- All persisted assets, source configurations, workflow runs, artefacts, and
  event projections are owner-checked.
- Sync and extraction jobs have bounded retries and record final status rather
  than silently substituting unrelated data.

## Acceptance Criteria

1. A real topic search returns at least one externally sourced result when an
   enabled upstream is reachable. Its card has a clickable original link and
   shows its actual source.
2. If OpenAlex fails, the UI identifies OpenAlex as failed and presents any
   successful OpenLibrary, institution, personal, or cached result with correct
   labels. It never relabels seed data as a live result.
3. A university administrator can configure and test an institution source;
   an ordinary user can configure, test, and use a private source without code.
4. A temporary attachment expires 30 days after upload; a library asset survives
   and is searchable by its owner until deletion.
5. A writing workflow can read selected parsed assets and verified catalogue
   evidence, pause at a configured checkpoint, rerun a single step, and show
   referenced assets/evidence in the artifact provenance.
6. The literature-review template runs entirely within the writing workbench and
   reuses its material, evidence, model, checkpoint, artifact, and export paths.
7. Workflow-level and per-step presets resolve in the stated order. A DeepSeek
   preset and an explicitly imported CC Switch preset are selectable and the
   resolved choice is recorded for the run.
8. Catalogue-map search highlights category paths and semantic links. Personal
   map projection changes after search, save, upload, and writing events without
   manual node creation.
9. A recorded feedback event visibly affects a later ranking and is explainable
   through the memory layer.
10. Unit, integration, migration, and browser tests cover the above flows with
    both live-source test doubles and failure-source test doubles. Browser
    verification includes desktop and mobile layouts, linked source navigation,
    upload state, source-state display, map changes, and checkpoint workflow.
11. Notes and editable writing artifacts render valid inline and display LaTeX
    without a refresh. Invalid LaTeX keeps the source intact and produces an
    understandable preview error. Browser regression tests prove both states.
12. Exploration and research workspace have distinct navigation icons. A theme
    selected through settings persists after reload and preserves accessible
    contrast and source-status semantics.
13. A Living Book owner can accept a request, answer in a private conversation,
    and share a catalogue record or an explicitly selected knowledge asset. A
    recipient can save a shared catalogue record, cannot view source credentials,
    and loses asset access after the sender revokes the conversation grant.

## Scope Exclusions

The first implementation does not bypass university SSO, paywalls, IP controls,
or library terms of service. It reports access requirements and accepts an
authorized administrator connection. It does not silently scrape a user's other
applications or import their credentials. It does not promise full-text reading
where a catalogue exposes metadata only.
