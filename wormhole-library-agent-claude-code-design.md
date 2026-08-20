# PaperWorm — Paper Agent Engineering Design Document

Version: 2.0 (restructured from v1.3, aligned to Qiniu Cloud main track + paper research direction)
Purpose: Feed directly to Claude Code / teammates for MVP implementation

---

## 0. Up Front: What Changed in This Version

The v1.3 original positioned itself as a "library-domain agent." After discussion, we pivoted to a **paper agent** for three reasons:

1. **Qiniu Cloud track is the best fit** — the prompt requires "feedback memory agent + real scenario." Academic research is a real scenario, and the memory engine is already built.
2. **All data is free** — OpenAlex + CrossRef APIs are verified working. Paper search, citations, concepts, and abstracts are all covered. No need to build a catalog from scratch.
3. **Library DNA doesn't match** — the DUT Library track wants "space-level transformation." A personal paper tool doesn't fit; forcing it would produce a chimera.

Change summary:

| v1.3 Original | v2.0 Changed To | Why |
|---|---|---|
| Library catalog (self-built seed) | Paper search (OpenAlex API) | Free real data, no self-build |
| Living Library (humans as living books) | **Cut** | Social matching needs network effects; can't build for real in a competition |
| Wormhole via NLP semantic similarity | Wormhole via OpenAlex concept-tag set operations | Verified, deterministic algorithm, no NLP needed |
| Memory system written from scratch | Existing Python version (skill_extractor + memory_layers); rewrite in TS or wrap as microservice | Saves 3–5 days |
| Four tracks side by side | Qiniu Cloud as primary; OpenAtom / Miracle Academy as bonus | Focus, avoid chimera |
| No citation feature | Added: DOI → APA / MLA / GB-T format | Real pain point, Miracle Academy anchor |
| No paper summarization | Added: argument / conclusion / intro extraction | Demo killer feature |

**Primary track**: Qiniu Cloud — "Lightweight Agent System with Feedback Memory Capability"
**Bonus tracks**: OpenAtom (wormhole = manufacturing surprise), Miracle Academy (papers are long & tedious = real pain point)
**Not pursuing**: DUT Library (wrong DNA)

---

## 1. Runtime Architecture

Same as v1.3 — a Next.js monolithic web app:

```
Browser
  -> Next.js API Routes
  -> Paper Agent Orchestrator
  -> Tool functions + External APIs + Database
```

The agent is not a chatbot — it's a **tool orchestrator**: receive user task → plan → call tools → return results → collect feedback → update memory → auto-reference next time.

### Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js App Router + React + TypeScript | Pages / API / logic in one project |
| Backend | Next.js API Routes | No separate FastAPI server |
| Database | SQLite + Prisma | Stable for local demo; can migrate to PostgreSQL later |
| External APIs | OpenAlex (primary) + CrossRef (citations) | All free, no API key needed |
| LLM | Ollama local (optional) | Only enhances summary/review; does not drive core ranking |
| Knowledge graph | OpenAlex concepts + in-memory graph search | No Neo4j |
| Visualization | D3.js / Cytoscape.js | Citation relationship map |
| Testing | Vitest + Playwright | Algorithm unit tests + Demo flow e2e |

### Deployment

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
# http://localhost:3000
```

No database install, no API key config, no Ollama required to run the core flow.

---

## 2. Track Mapping

### Primary Track: Qiniu Cloud — Lightweight Agent System with Feedback Memory

Original prompt: User inputs task → Agent plans + calls pre-built tools + generates results → User gives feedback → System deposits preferences/rules/experience → Future similar tasks auto-reference memory.

Evaluation criteria: Memory cost (token cost, time), conversation speed, memory effectiveness and accuracy of use.

**Our answers**:

| Criterion | How We Solve It |
|---|---|
| Agent basic flow | User input → orchestrator plans → calls paper_search / citation_format / paper_summarize tools → returns structured results |
| Memory preference recording | User feedback → compileFeedback compiles into preference patch → stored in L1 resident memory + L4 user profile |
| Future task reference | New request arrives → retrieve relevant history → inject reusable preferences/skills → Agent reflects them in results |
| **Memory cost** | Paper search and citation formatting go through APIs — **zero token cost**. Summaries use OpenAlex raw abstract as fallback; Ollama only called when extracting arguments |
| **Conversation speed** | Core flow is all API + SQLite queries — **millisecond response**. Only summary extraction goes through LLM |
| **Memory effectiveness** | /memory page visualizes preference profile + update history. In demo, after feedback, re-search shows visibly different ranking |

**Real scenario**: Academic paper research — every grad student repeatedly searches papers, filters, reads abstracts, formats citations. This is a real repetitive task with real personalization needs (empirical vs. theoretical, citation format preference).

### Bonus Track: OpenAtom — Manufacturing Surprise

The knowledge wormhole feature directly hits "don't keep guessing what the user wants next; try creating something they didn't even know they'd encounter." Shown as one of the agent's recommendation strategies, not a standalone product.

### Bonus Track: Miracle Academy — Patching Reality

"Papers are long & tedious + citation formats are torture" is a pain point anyone who's written a paper can empathize with. Citation generation + paper summarization = patches for the academic research workflow.

---

## 3. Product Definition

PaperWorm is a **paper agent that remembers you**.

Google Scholar helps you search papers and then leaves you alone. PaperWorm remembers your taste — whether you prefer empirical or theoretical work, whether you like APA or GB-T, whether you think certain fields are too math-heavy — and next time you search, it automatically filters and ranks for you.

Specifically, it does these things:

**Agent tools (pre-built capabilities):**

1. **Search papers** — keyword search, returns list + concept tags + citation count, ranked by your preferences
2. **Read papers** — paper too long? Extracts key argument, conclusion, and intro context
3. **Generate citations** — paste a DOI, auto-generate APA / MLA / GB-T format, one-click copy
4. **Literature review draft** — give it 3–5 papers, generates a review paragraph

**How feedback memory works:**

- You say "this is too theoretical, I want empirical" → remembers "prefers empirical research"
- You say "use APA format" → next time defaults to APA
- You say "this direction is interesting but the math is too hard" → remembers "low math tolerance," next time pushes less mathematical papers
- Next search → auto-references memory, prioritizes papers matching your preferences

**Differentiation bonus — Knowledge Wormhole:**

The agent occasionally starts from the paper you're reading, follows the citation graph 2–3 hops, and recommends a paper from an unrelated field whose ideas could help you. For example, reading the Transformer paper → wormhole to AlphaFold (protein structure prediction also uses attention mechanisms). This isn't random recommendation — it's a deterministic path through the citation graph + concept divergence.

### Target Users

- Undergraduates writing course papers
- Graduate students finding research directions
- People tortured by citation formats
- Anyone who wants to quickly judge if a paper is worth reading

---

## 4. Core Concepts

### 4.1 Paper Search (paper_search)

Calls the OpenAlex API to search papers. Returns title, DOI, year, authors, citation count, abstract, concept tags. Ranked by the user's stored preferences (empirical/theoretical, Chinese-first/English-first, etc.).

**Data source verified**: OpenAlex is free, just add an email to the request header, rate limits are generous.

### 4.2 Citation Format Generation (citation_format)

Paste DOI → call CrossRef API for full metadata → pure string template assembles APA / MLA / GB-T 7714 format. No AI, no LLM needed.

**Verified**: DOI `10.1109/CVPR.2017.114` returns full authors/title/year/journal/volume/issue/pages; manually assembled APA and GB-T formats.

### 4.3 Paper Summary Extraction (paper_summarize)

OpenAlex's `abstract_inverted_index` field can reconstruct the full abstract. Ollama extracts "core argument / main conclusion / intro context" in three segments. If Ollama is down, falls back to the OpenAlex raw abstract, labeled "raw abstract, arguments not extracted."

### 4.4 Feedback Memory (feedback_memory)

User feedback isn't just stored as chat history — it's compiled into structured preferences:

```
User feedback: "This direction is interesting, but the math is too heavy"
  ↓ compileFeedback compiles into patch
  ↓
{
  "serendipity.likedDomains": ["Economics"],   // likes Economics direction
  "difficulty.mathTolerance": 0.38,             // math tolerance drops
  "reading.summaryFirst": true                  // show summary first
}
  ↓
Next paper search → ranking logic references these preferences → math-heavy papers drop in rank
```

**Existing Python implementation**: `skill_extractor.py` (skill extraction) + `memory_layers.py` (L1 resident + L2 SQLite retrieval + L4 profile), passed end-to-end closed-loop testing. Two paths to port to web (see Section 13).

### 4.5 Knowledge Wormhole (wormhole_suggest) — Bonus Feature

Starting from the paper the user is reading, follows the citation chain 2–3 hops, recommends a paper with high concept divergence.

**Verified algorithm** (no NLP needed, set operations):

1. OpenAlex tags each paper with 10+ concepts, each with a score
2. User reads paper A (concepts: Transformer / Machine Translation / BLEU)
3. A cites B, look up B's concepts (Corpus Linguistics / Linguistics / Philosophy)
4. A and B have little concept overlap → divergence ≈ 60% → B is the wormhole destination
5. Slider controls divergence threshold: low slider pushes high-overlap papers, high slider pushes cross-domain papers

**Verified case**: Reading "Attention Is All You Need" → wormhole to "Penn Treebank" (1993 corpus linguistics). Even better: the first paper to cite Transformer is AlphaFold — from AI to biology.

### 4.6 Serendipity Slider — Bonus Feature

Users control how far from their knowledge comfort zone they want to go today:

| Range | Meaning |
|---|---|
| 0–20 | Nearby shelf: new papers in the same field |
| 21–40 | Adjacent shelf: neighboring fields |
| 41–60 | Cross-floor: clearly interdisciplinary |
| 61–80 | Different building: distant but with a clear bridge |
| 81–100 | Deep space: high surprise but still not random |

The slider must genuinely participate in wormhole ranking.

---

## 5. User Flows

### 5.1 First Use

```
User opens homepage
  -> Types: "I want to find papers on AI agents in scientific research"
  -> Agent calls paper_search (OpenAlex)
  -> Returns paper list, each with abstract + concept tags + citation count
  -> User clicks "too theoretical" on one result
  -> System remembers "prefers empirical research"
```

### 5.2 Second Use (Memory Takes Effect)

```
User types: "Help me find papers on agent memory"
  -> System reads memory: prefers empirical, Chinese-first, low math tolerance
  -> paper_search returns results auto-ranked by preferences
  -> Empirical papers ranked first, pure theoretical ones sink to bottom
  -> System proactively offers a wormhole: Agent Memory → Human Memory → Cognitive Psychology
```

### 5.3 Citation Format Flow

```
User clicks "generate citation" on paper detail page
  -> Pastes DOI: 10.1109/CVPR.2017.114
  -> System calls CrossRef API for metadata
  -> Selects format: APA / MLA / GB-T 7714
  -> One-click copy
  -> User says "always use APA from now on"
  -> System remembers default format
```

---

## 6. MVP Boundaries

### 6.1 Must Implement (Core for Qiniu Cloud Defense)

| Feature | Description | Data Source | Uses LLM |
|---|---|---|---|
| **Paper search** | Keyword search, returns list + abstract + concepts, ranked by preferences | OpenAlex API | No |
| **Citation format** | DOI → APA/MLA/GB-T, one-click copy | CrossRef API + templates | No |
| **Feedback memory** | Feedback → store preferences → auto-reference next search ranking | Local SQLite + files | No |

### 6.2 Showcase Capabilities (Make the Agent Look Smarter)

| Feature | Description | Data Source | Uses LLM |
|---|---|---|---|
| **Paper summary** | Extract argument/conclusion/intro | OpenAlex abstract + Ollama | Yes (degradable) |
| **Literature review** | Give 3–5 papers → generate review paragraph | Multi-paper abstracts + Ollama | Yes |
| **Citation map** | Visualize a paper's citation network | OpenAlex + D3 | No |
| **Reading gap analysis** | "You've read A, B, C, but should read D" | Citation graph set difference | No |

### 6.3 Differentiation Bonus

| Feature | Description | Track |
|---|---|---|
| **Knowledge wormhole** | Citation 2–3 hops + concept divergence | OpenAtom |
| **In-app push** | Timed recommendations + occasional wormhole | Qiniu Cloud (memory being continuously used) |

### 6.4 Not Doing

- ~~Living Library (humans as living books)~~ — social matching needs network effects, cut
- ~~Knowledge Collision (person matching)~~ — depends on Living Library, cut together
- ~~AR book finding~~
- ~~Real push notification system~~ — downgraded to in-app notification
- ~~Neo4j / Qdrant~~
- ~~Real user login system~~

---

## 7. System Architecture

```
User browser
  |
  v
Next.js API Routes (7 endpoints)
  |
  v
orchestrator.ts (sole dispatcher)
  |
  +-> paper_search() -----> OpenAlex API
  +-> citation_format() --> CrossRef API
  +-> paper_summarize() --> OpenAlex + Ollama
  +-> wormhole_suggest() -> OpenAlex (references + concepts)
  +-> compileFeedback() -> Memory engine (SQLite + files)
  +-> getMemory() -------> Memory engine
  +-> buildInjection() --> Memory engine
```

Core principles:
- Ranking and path generation must be deterministic code
- LLM only polishes summary text; does not drive core ranking
- Without LLM/Ollama, the demo still runs completely (OpenAlex has its own abstracts)
- All tools must have type definitions and tests

---

## 8. Tool Design

| Tool | Purpose | MVP Requirement | Data Source |
|---|---|---|---|
| `paper_search` | Keyword paper search | Must return paper cards (title/abstract/concepts/citation count) | OpenAlex |
| `citation_format` | DOI → citation format | Must support APA/MLA/GB-T | CrossRef + templates |
| `paper_summarize` | Extract argument/conclusion/intro | Fall back to OpenAlex raw abstract if Ollama down | OpenAlex + Ollama |
| `compileFeedback` | Feedback → memory patch | Must change subsequent ranking | Local |
| `getMemory` | Read user preferences | Return structured preferences | Local |
| `buildInjection` | Inject preferences into search results | Re-rank search results by preference | Local |
| `wormhole_suggest` | Citation 2–3 hops + concept divergence | Slider must affect results | OpenAlex |
| `findUnknownUnknowns` | Find fields the user hasn't searched but are relevant | Based on novelty + bridge | OpenAlex |
| `generateReview` | Generate review paragraph from multiple papers | Fall back to concatenation if Ollama down | Multi-paper abstracts + Ollama |

---

## 9. Data Models

### 9.1 Paper

```typescript
type Paper = {
  id: string;              // OpenAlex ID
  doi: string | null;
  title: string;
  authors: Author[];
  year: number;
  venue: string | null;     // Journal/conference
  citedByCount: number;
  abstract: string | null;  // Reconstructed from inverted_index
  concepts: ConceptTag[];   // OpenAlex concept tags
  openAccess: boolean;
  openAccessPdf: string | null;
};

type Author = {
  name: string;
  orcid: string | null;
  institution: string | null;
};

type ConceptTag = {
  id: string;              // OpenAlex concept ID
  name: string;
  score: number;           // 0-1 relevance
  level: number;           // 0=broad category, 4=fine-grained
};
```

### 9.2 CitationFormat

```typescript
type CitationFormat = {
  doi: string;
  style: "apa" | "mla" | "gbt7714" | "chicago";
  text: string;            // Assembled citation text
  source: "crossref" | "manual";
};

type CitationMetadata = {
  doi: string;
  title: string;
  authors: { family: string; given: string }[];
  year: number;
  containerTitle: string;   // Journal/conference name
  volume: string | null;
  issue: string | null;
  page: string | null;
  publisher: string | null;
  type: string;             // "journal-article" | "proceedings-article" | ...
};
```

### 9.3 UserMemory

```typescript
type UserMemory = {
  userId: string;
  category: "reading" | "difficulty" | "citation" | "serendipity" | "task";
  key: string;              // e.g. "reading.languagePref"
  value: unknown;           // e.g. "zh_first"
  confidence: number;       // 0-1
  source: "explicit_feedback" | "implicit_click" | "system_inferred";
  useCount: number;
  updatedAt: string;
};
```

Memory example:
```json
{
  "reading": {
    "languagePref": "zh_first",
    "summaryFirst": true,
    "resultCount": 5
  },
  "difficulty": {
    "preferredLevel": "undergrad",
    "mathTolerance": 0.42
  },
  "citation": {
    "defaultStyle": "apa"
  },
  "serendipity": {
    "defaultSlider": 60,
    "likedDomains": ["Cognitive Science", "Economics"],
    "dislikedDomains": ["Pure Mathematics"]
  }
}
```

### 9.4 WormholePath

```typescript
type WormholePath = {
  id: string;
  startPaperId: string;
  startConcepts: ConceptTag[];
  bridgePapers: Paper[];     // 2-3 hop intermediate papers
  targetPaperId: string;
  targetConcepts: ConceptTag[];
  explanation: string;       // Human-readable explanation of why we ended up here
  scores: {
    novelty: number;          // Concept divergence 0-1
    bridge: number;           // Path strength 0-1
    quality: number;          // Target paper quality 0-1
    final: number;            // Weighted total score
  };
};
```

### 9.5 Interaction

```typescript
type Interaction = {
  id: string;
  userId: string;
  query: string;
  resultPaperIds: string[];
  feedback: Feedback | null;
  memoryUsed: string[];     // Which memories were used this time
  createdAt: string;
};

type Feedback = {
  targetType: "paper" | "wormhole" | "citation";
  targetId: string;
  rating: "too_theoretical" | "too_empirical" | "too_hard" | "just_right" | "interesting";
  freeText: string | null;
};
```

---

## 10. Wormhole Algorithm (Verified Feasible)

### 10.1 Data Foundation

OpenAlex tags each paper with 10+ concept labels, each with a score (0–1) and level (0=broad, 4=fine-grained). These tags are pre-existing — no need to do your own NLP concept extraction.

### 10.2 Novelty (Concept Divergence)

```
concepts_A = concept set of user's current paper
concepts_B = concept set of candidate wormhole paper

# Filter out broad-category (level=0) noise, only compare level >= 1 concepts
concepts_A_filtered = {c.name for c in concepts_A if c.level >= 1 and c.score > 0.3}
concepts_B_filtered = {c.name for c in concepts_B if c.level >= 1 and c.score > 0.3}

overlap = concepts_A_filtered ∩ concepts_B_filtered
only_B = concepts_B_filtered - concepts_A_filtered

novelty = len(only_B) / len(concepts_B_filtered)   # Proportion of B-only concepts
```

Verified: "Attention Is All You Need" (machine translation) → "Penn Treebank" (corpus linguistics), novelty ≈ 0.60.

### 10.3 NoveltyFit (Slider Fit)

```
target_novelty = slider_value / 100
novelty_fit = 1 - abs(novelty - target_novelty)
```

Slider 70 → target_novelty = 0.70 → pushes papers with novelty near 0.70.
Slider 20 → target_novelty = 0.20 → pushes high-overlap papers.

### 10.4 BridgeScore (Path Strength)

```
# Find citation path from A to B (1-3 hops)
path_strength = average(edge.weight for edge in path)
path_explainability = 1 - ((path_length - 2)^2 / 4)   # 2 hops is optimal, penalize longer
bridge_score = 0.65 * path_strength + 0.35 * path_explainability
```

Elimination rules:
- Candidates with bridge_score < 0.35 are discarded
- Candidates with no paper landing point are discarded

### 10.5 QualityScore (Target Paper Quality)

```
quality_score =
  0.45 * normalized_cited_by_count    # Normalized citation count
  + 0.25 * open_access ? 1 : 0.5      # Open access bonus
  + 0.20 * has_abstract ? 1 : 0.3     # Has abstract bonus
  + 0.10 * difficulty_match           # Difficulty match to user
```

### 10.6 FinalScore

```
final_score =
  0.40 * bridge_score
  + 0.30 * novelty_fit
  + 0.20 * quality_score
  + 0.10 * diversity_score          # Diversity from already-recommended wormholes
```

### 10.7 Memory Correction

```
if target_domain in memory.likedDomains:     final_score += 0.05
if target_domain in memory.dislikedDomains:  final_score -= 0.08
if target_needs_high_math and mathTolerance < 0.4:  final_score -= 0.10
if memory.languagePref == "zh_first" and paper.is_chinese:  final_score += 0.04
```

---

## 11. Feedback Memory Engine — Qiniu Cloud Track Core

### 11.1 Existing Python Implementation

| Component | File | What It Does |
|---|---|---|
| Skill extraction | `skill_extractor.py` | Multi-step task completion → auto-extract reusable skill; synonymous phrasing matches next time → auto-inject → uses+1 |
| Layered memory | `memory_layers.py` | L1 resident memory (200 lines deduplicated) / L2 session archive (SQLite, token retrieval + hit-count ranking) / L4 user profile |
| Agent brain | `agent_brain.py` | get_system_prompt() injects 7 contexts: status + memory + task + summary + skill + profile + history |

Passed end-to-end closed-loop testing: multi-step task completion → skill extraction → synonymous phrasing match → uses increment → unrelated requests don't false-match → L2 history retrieval hits.

### 11.2 How to Port to Web

| Option | Approach | Pros | Cons |
|---|---|---|---|
| **Option A (recommended)** | Rewrite memory engine in TypeScript | Clean clone experience, npm install and run | 2–3 extra days of work |
| **Option B** | Wrap Python memory engine as FastAPI microservice | Zero rewrite, use tested code directly | Teammates need to install Python + dependencies |

### 11.3 Memory Compiler

Turns natural-language feedback into structured patches:

```
Feedback: "This direction is interesting, but the math is too heavy"
  ↓
[
  {
    "key": "serendipity.likedDomains",
    "operation": "add_or_increment",
    "value": "Economics",
    "confidenceDelta": 0.08
  },
  {
    "key": "difficulty.mathTolerance",
    "operation": "decrement",
    "value": 0.08,
    "confidenceDelta": 0.10
  }
]
```

### 11.4 How Memory Affects Ranking

```typescript
function rankWithMemory(papers: Paper[], memory: UserMemory): Paper[] {
  return papers.map(p => {
    let score = p.citedByCount;  // Base score = citation count

    // Language preference
    if (memory.reading?.languagePref === "zh_first" && p.isChinese)
      score *= 1.15;

    // Difficulty preference
    if (memory.difficulty?.mathTolerance < 0.4 && p.concepts.some(c => c.name === "Mathematics"))
      score *= 0.7;

    // Liked domain bonus
    if (p.concepts.some(c => memory.serendipity?.likedDomains?.includes(c.name)))
      score *= 1.1;

    return { ...p, _rankScore: score };
  }).sort((a, b) => b._rankScore - a._rankScore);
}
```

### 11.5 Memory Budget (Qiniu Cloud Evaluation Point)

Per agent call, inject at most:
- 12 memory entries
- Within 1200 characters

Memory selection formula:
```
memory_relevance =
  0.45 * task_match
  + 0.25 * confidence
  + 0.15 * recency
  + 0.15 * historical_success_rate
```

### 11.6 Memory Cost Analysis

| Operation | Uses LLM | Token Cost | Latency |
|---|---|---|---|
| Paper search | No | 0 | ~200ms (OpenAlex API) |
| Citation format | No | 0 | ~100ms (CrossRef API + template) |
| Memory retrieval (L2) | No | 0 | ~5ms (SQLite LIKE) |
| Skill injection | No | 0 | ~1ms (file read) |
| Paper summary extraction | Ollama | Low (chunked) | ~3–5s |
| Literature review | Ollama | Medium (multi-paper) | ~5–10s |

**The core flow (search + citation + memory) uses zero LLM — the memory system itself costs zero tokens. This is our biggest advantage over other competing teams.**

---

## 12. Data Sources — All Free, No API Key

### OpenAlex (Primary Data Source)

The Wikipedia of academic papers. Completely free, just add an email to the request header.

- **Search papers** — keyword search, returns title/DOI/year/authors/citation count/abstract/concept tags/open access status
- **Paper abstract** — `abstract_inverted_index` field, reconstructing the inverted index gives the full abstract
- **Concept tags** — each paper auto-tagged with 10+ concepts, with score and level
- **Citation relationships** — `referenced_works` (what it cites) + `filter=cites:W...` (what cites it)

Verified: Searched "Attention Is All You Need" → 28 referenced works + 6688 citing works + 10 concept tags + full abstract.

### CrossRef (For Citation Formatting)

The official DOI registration agency. Given a DOI, returns full bibliographic info: authors (family + given names separated), title, year, journal, volume, issue, pages, article type. Pure template assembly into APA/MLA/GB-T.

Verified: DOI `10.1109/CVPR.2017.114` → full metadata → manually assembled APA and GB-T formats.

### Semantic Scholar (Backup, can skip)

Also has paper search and citation graph, but without an API key, frequent 429 rate limiting. OpenAlex covers most of its functionality. **Can be completely unused.**

### Rate Limit Strategy

| API | Risk | Strategy |
|---|---|---|
| OpenAlex | Low | Add mailto to User-Agent |
| CrossRef | Low | Add mailto to User-Agent |
| Semantic Scholar | High | Apply for free key or don't use at all |

---

## 13. Degradation Strategy (Runs Without Everything, No Faking)

| If This Isn't Done | What the System Does | What the User Sees |
|---|---|---|
| OpenAlex rate-limited | Use local cached seed data | "Offline cache" badge |
| CrossRef down | Let user manually fill metadata | "Manual mode" label |
| Ollama down | Summary uses OpenAlex raw abstract | "Raw abstract, arguments not extracted" label |
| Wormhole algorithm incomplete | Use citation graph deterministic path (2 hops), slider still affects ranking | User doesn't notice |
| Citation map not drawn | Only show paper list | Hide map entry |
| Push not implemented | Downgrade to in-app notification | "In-app push" |
| Memory engine not fully ported | Use simplified version (SQLite key-value for preferences) | Feature degraded but closed loop |

**Key point**: Paper search, citation formatting, and memory engine — these three core features have almost zero risk of "can't build for real." OpenAlex and CrossRef are free APIs, and the memory engine is already built and tested.

---

## 14. Privacy & Security

- Demo seed data uses fictional papers and fictional users
- No real personal data collected
- Users can view and reset their memory
- /memory page provides "Reset Demo Memory" button
- ~~Living Library privacy flow~~ — cut, no social matching

---

## 15. API Design

### 15.1 Search

```
POST /api/search

Request:
{
  "userId": "demo-user",
  "query": "I want to find papers on AI agents in scientific research",
  "taskType": "project",       // project | research | coursework | exam
  "level": "beginner",          // beginner | undergrad | graduate | research
  "sliderValue": 60             // Wormhole surprise level (optional, defaults from memory)
}

Response:
{
  "interactionId": "int_001",
  "papers": [
    {
      "id": "W1234",
      "title": "...",
      "doi": "10.xxx/xxx",
      "year": 2024,
      "authors": [...],
      "citedByCount": 42,
      "abstract": "...",
      "concepts": [{"name": "AI Agent", "score": 0.92}, ...],
      "openAccess": true
    }
  ],
  "readingPath": ["AI Agent", "Planning", "Tool Use", "Memory"],
  "memoryUsed": ["prefers empirical research", "Chinese-first"],
  "interactionId": "int_001"
}
```

### 15.2 Paper Summary

```
POST /api/summarize

Request:
{
  "paperId": "W1234",           // OpenAlex ID
  "userId": "demo-user"
}

Response:
{
  "paperId": "W1234",
  "abstract": "...",            // OpenAlex raw abstract
  "keyArgument": "...",         // Ollama-extracted core argument
  "mainConclusion": "...",      // Ollama-extracted main conclusion
  "introContext": "...",        // Ollama-extracted intro context
  "source": "ollama"            // ollama | openalex_only | cached
}
```

### 15.3 Citation Format

```
POST /api/citation

Request:
{
  "doi": "10.1109/CVPR.2017.114",
  "style": "apa"                // apa | mla | gbt7714 | chicago
}

Response:
{
  "doi": "10.1109/CVPR.2017.114",
  "style": "apa",
  "text": "Vaswani, A., Shazeer, N., ... (2017). Attention Is All You Need. Advances in Neural Information Processing Systems. https://doi.org/10.1109/CVPR.2017.114",
  "metadata": {
    "title": "Attention Is All You Need",
    "authors": [...],
    "year": 2017,
    "container": "Advances in Neural Information Processing Systems",
    "volume": null,
    "page": "1013-1021"
  },
  "source": "crossref"
}
```

### 15.4 Submit Feedback

```
POST /api/feedback

Request:
{
  "userId": "demo-user",
  "interactionId": "int_001",
  "targetType": "paper",
  "targetId": "W1234",
  "rating": "too_theoretical",
  "freeText": "This is too theoretical, I want empirical work"
}

Response:
{
  "memoryPatches": [
    {"key": "reading.prefEmpirical", "operation": "set", "value": true},
    {"key": "difficulty.theoryTolerance", "operation": "decrement", "value": 0.1}
  ],
  "memoryUpdated": true
}
```

### 15.5 Generate Wormholes

```
POST /api/wormholes

Request:
{
  "userId": "demo-user",
  "interactionId": "int_001",
  "startPaperId": "W1234",
  "sliderValue": 70,
  "maxPaths": 3
}

Response:
{
  "wormholes": [
    {
      "id": "wh_001",
      "path": ["W1234", "W5678", "W9012"],
      "startConcepts": ["AI Agent", "Planning"],
      "targetConcepts": ["Mechanism Design", "Game Theory"],
      "targetPaper": {
        "id": "W9012",
        "title": "...",
        "doi": "...",
        "year": 1994,
        "citedByCount": 5000
      },
      "explanation": "Starting from AI Agent, Multi-Agent Coordination studies how multiple agents cooperate — this has a direct bridge to Mechanism Design, which studies how multiple agents act under rules.",
      "scores": {
        "novelty": 0.68,
        "bridge": 0.72,
        "quality": 0.85,
        "final": 0.74
      }
    }
  ]
}
```

### 15.6 Query / Reset Memory

```
GET /api/memory?userId=demo-user

Response:
{
  "userId": "demo-user",
  "memory": {
    "reading": {"languagePref": "zh_first", "summaryFirst": true},
    "difficulty": {"mathTolerance": 0.42, "preferredLevel": "undergrad"},
    "citation": {"defaultStyle": "apa"},
    "serendipity": {"defaultSlider": 60, "likedDomains": ["Cognitive Science"]}
  },
  "history": [
    {"timestamp": "2026-08-20T10:00:00Z", "action": "feedback", "detail": "prefers empirical research", "patches": [...]},
    {"timestamp": "2026-08-20T10:05:00Z", "action": "feedback", "detail": "math tolerance decreased", "patches": [...]}
  ]
}

DELETE /api/memory?userId=demo-user
-> Resets all memory to initial state
```

### Unified Error Format

```json
{
  "error": {
    "code": "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_ERROR",
    "message": "..."
  }
}
```

---

## 16. Database Schema

Prisma schema requires the following models:

```prisma
model User {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  memories  UserMemory[]
  interactions Interaction[]
}

model Paper {
  id            String   @id        // OpenAlex ID
  doi           String?
  title         String
  year          Int?
  venue         String?
  citedByCount  Int      @default(0)
  abstract      String?  // Reconstructed text
  concepts      Json?    // ConceptTag[]
  openAccess    Boolean  @default(false)
  createdAt     DateTime @default(now())
  interactions  Interaction[]
}

model UserMemory {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  category  String   // reading | difficulty | citation | serendipity | task
  key       String
  value     Json
  confidence Float   @default(0.5)
  source    String   @default("explicit_feedback")
  useCount  Int      @default(0)
  updatedAt DateTime @updatedAt
}

model Interaction {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  query        String
  resultPaperIds Json   // string[]
  feedback     Json?    // Feedback
  memoryUsed   Json?    // string[]
  createdAt    DateTime @default(now())
}

model Feedback {
  id              String   @id @default(cuid())
  interactionId   String
  targetType      String   // paper | wormhole | citation
  targetId        String
  rating          String   // too_theoretical | too_hard | just_right | interesting
  freeText        String?
  memoryPatches   Json?
  createdAt       DateTime @default(now())
}

model WormholeRun {
  id              String   @id @default(cuid())
  userId          String
  interactionId   String
  startPaperId    String
  sliderValue     Int
  paths           Json     // WormholePath[]
  createdAt       DateTime @default(now())
}
```

---

## 17. Frontend Pages

### 17.1 `/` — Homepage

Search box + paper list + feedback bar. First screen must be immediately usable.

Must include:
- Main input box (what you want to research)
- Task type selector (coursework / research project / exam prep / project development)
- Difficulty selector (beginner / undergrad / graduate / research)
- Demo example text
- Search result paper card list

### 17.2 `/paper/[id]` — Paper Detail

Must include:
- Paper title / authors / year / citation count
- Abstract (raw + Ollama-extracted argument/conclusion/intro)
- Concept tag list (clickable to filter papers by concept)
- Citation format generator (paste DOI → select format → one-click copy)
- "Try Knowledge Wormhole" button
- Feedback bar (too theoretical / too empirical / just right / too hard)

### 17.3 `/explore/[interactionId]` — Wormhole Exploration

Must include:
- Surprise slider (0–100)
- Wormhole card list (start → path → destination + explanation + scores)
- Feedback buttons (interesting but too hard / just right / irrelevant)
- Memory update notification after feedback

### 17.4 `/memory` — Memory Transparency Page (Qiniu Cloud Core Display)

Must include:
- Current preference profile (language / difficulty / citation format / wormhole preferences)
- Recent memory update history (timeline)
- "Reset Demo Memory" button
- Default surprise level adjustment

### 17.5 `/map/[interactionId]` — Citation Relationship Map (Bonus)

Visualizes a paper's citation network: current paper → referenced papers → citing papers, drawn as a draggable graph using D3/Cytoscape.

### 17.6 `/review` — Literature Review Generator (Bonus)

Input 3–5 papers → Ollama generates a review paragraph.

---

## 18. Component Design

| Component | What It Is | Key Interaction |
|---|---|---|
| `PaperCard` | Paper card: title/abstract/concept tags/citation count | Concept tags clickable for filtering |
| `FeedbackBar` | Feedback bar: "Too theoretical" "Too empirical" "Just right" "Too hard" | **Heart of Qiniu Cloud track** — clicking must change next ranking |
| `CitationFormatter` | Citation format: DOI input → format select → one-click copy | Remembers last selected format |
| `WormholeCard` | Wormhole card: start → path → destination + explanation + scores | Shows "why we ended up here" |
| `SerendipitySlider` | Surprise slider: 0–100 | Real-time changes wormhole ranking |
| `MemoryPanel` | Memory profile + update history | Qiniu Cloud core display |
| `ConceptTags` | Concept tag list | Clickable to filter by concept |
| `KnowledgeMap` | Citation network graph (D3/Cytoscape) | Draggable nodes |

---

## 19. Repo Structure

```text
paperworm/
  app/
    page.tsx                        # Homepage: search box + paper list
    paper/[id]/page.tsx             # Paper detail: abstract + citation + wormhole entry
    explore/[interactionId]/page.tsx # Wormhole exploration: slider + wormhole cards
    map/[interactionId]/page.tsx    # Citation relationship map
    memory/page.tsx                 # Memory profile + reset
    review/page.tsx                 # Literature review generator
    api/
      search/route.ts               # POST paper search
      summarize/route.ts            # POST paper summary extraction
      citation/route.ts             # POST citation format generation
      wormholes/route.ts            # POST wormhole generation
      feedback/route.ts             # POST feedback submission
      memory/route.ts              # GET/DELETE memory query/reset

  components/
    PaperCard.tsx
    FeedbackBar.tsx
    CitationFormatter.tsx
    WormholeCard.tsx
    SerendipitySlider.tsx
    MemoryPanel.tsx
    ConceptTags.tsx
    KnowledgeMap.tsx

  lib/
    types.ts                        # ★ Contract file — single source of truth for the whole team
    agent/
      orchestrator.ts               # ★ Integration core — INTEGRATION POINT lives here
      tools.ts                      # Tool registry
    api/
      openalex.ts                   # OpenAlex API wrapper
      crossref.ts                   # CrossRef API wrapper
    paper/
      search.ts                     # Paper search + preference ranking
      summarize.ts                  # Summary extraction (Ollama + OpenAlex fallback)
      citation.ts                   # Citation format generation (template assembly)
      review.ts                     # Literature review generation
    wormhole/
      generate.ts                   # Wormhole path generation (citation 2–3 hops)
      score.ts                      # Concept divergence + bridge + quality scoring
      paths.ts                      # Graph path search
    memory/
      getMemory.ts                  # Read user preferences
      compileFeedback.ts            # Feedback → memory patch
      applyPatch.ts                  # Apply patch to memory
      rankWithMemory.ts             # Re-rank search results by memory
    llm/
      provider.ts                   # LLM abstraction (Ollama / unavailable)
      deterministicProvider.ts       # Deterministic branch when no LLM

  prisma/
    schema.prisma
    seed.ts

  data/
    seed-papers.json                # 50+ papers (offline cache fallback)
    seed-concepts.json              # 50+ concepts
    seed-edges.json                 # 80+ concept relationship edges

  tests/
    unit/
      search.test.ts
      citation.test.ts
      wormhole-score.test.ts
      memory-compiler.test.ts
      feedback-ranking.test.ts
    e2e/
      demo.spec.ts

  docs/
    demo-script.md
    responsibility-packages.md

  README.md
```

---

## 20. Three-Person Responsibility Packages

### 20.1 Team Lead (You): Architecture Integration / Main App Loop / Demo Coordination

| Item | Content |
|---|---|
| Scope | Project architecture, interface freezing, task decomposition, progress control, code merging, test acceptance, demo and defense |
| Primary optimization goal | Ensure three members' work combines into a stable, demoable paper agent |
| Must-do | Set up main repo; freeze types.ts; maintain task board; merge patches; run tests; unify UI terminology; write README and demo script |
| Acceptance | At least one integration per day; each responsibility package must independently pass tests; final 3-minute demo must run completely after clean seed |
| Deliverables | Main repo, interface docs, main README, demo script, acceptance records, defense slides |
| Fallback boundary | Only do interface adaptation, conflict merges, lightweight bugfix; when a member's module fails, degrade to labeled fallback, don't fake completion |
| **Forbidden** | Don't write core algorithms for members; don't replace unfinished modules with static fake data |

Specific task list:
1. Set up Next.js + Prisma project skeleton
2. Write `lib/types.ts` to freeze all data structures
3. Write `orchestrator.ts` with all `INTEGRATION POINT`s marked
4. Write fake data engine (fallback) so the full flow runs from day one
5. Write 6 pages + 8 component UI skeletons
6. Write 7 API routes (receive request → pass to orchestrator → return result)
7. Merge three members' patches, run complete tests
8. Write README + demo script + defense slides

### 20.2 Member 1: Paper Retrieval / Citation Format / API Wrappers

| Item | Content |
|---|---|
| Scope | Paper search, citation format generation, result ranking, API wrappers |
| Primary optimization goal | Make the agent feel like a tool that genuinely understands papers, not a generic chatbot |
| Must implement | `lib/api/openalex.ts`, `lib/api/crossref.ts`, `lib/paper/search.ts`, `lib/paper/citation.ts`, `/api/search`, `/api/citation` |
| Must experiment | Ranking comparison across different taskTypes; Chinese-first vs. English-first ranking differences; citation format comparison across three styles |
| Must test | search-api.test.ts, citation.test.ts, no-LLM fallback test |
| Deliverables | Patch, API wrappers, ranking comparison table, citation format samples |
| Acceptance criteria | Inputting "I want to get started with AI agents for a project" returns at least 5 papers with abstracts and concepts; pasting a DOI generates correct APA/MLA/GB-T formats |

Specific task list:
1. Wrap OpenAlex API (search, details, citation relationships, concept tags, abstract reconstruction)
2. Wrap CrossRef API (DOI lookup, title search)
3. Implement `paper_search(query, filters)` returning paper card list
4. Implement `citation_format(doi, style)` returning formatted citation
5. Populate `data/seed-papers.json` (50+ papers, offline cache)
6. Write search-api.test.ts and citation.test.ts
7. Output ranking comparison table: project vs. research vs. coursework users see different results
8. Prepare 150-word defense explanation: how PaperWorm helps you judge if a paper is worth reading in 30 seconds

### 20.3 Member 2: Wormhole Algorithm / Feedback Memory / Concept Graph

| Item | Content |
|---|---|
| Scope | Concept graph, wormhole path generation, slider ranking, feedback memory compilation, memory-injected ranking |
| Primary optimization goal | Make "surprise" controllable, explainable, reproducible, and continuously adjustable via feedback memory |
| Must implement | `lib/wormhole/generate.ts`, `lib/wormhole/score.ts`, `lib/memory/compileFeedback.ts`, `lib/memory/applyPatch.ts`, `lib/memory/rankWithMemory.ts`, `/api/wormholes`, `/api/feedback`, `/api/memory` |
| Must experiment | slider=20/50/70/90 wormhole result comparison; pre/post-feedback ranking change comparison; low-bridge elimination experiment |
| Must test | wormhole-score.test.ts, memory-compiler.test.ts, feedback-ranking.test.ts |
| Deliverables | Patch, algorithm docs, weight table, experiment comparison tables, "controlled serendipity" explanation for defense |
| Acceptance criteria | Same query with slider=20 vs. slider=70 returns visibly different results; after user feedback "too hard," math-heavy papers drop in ranking |

Specific task list:
1. Implement `generateWormholes(startPaperId, sliderValue)` — citation 2–3 hop paths
2. Implement `score.ts` — novelty/bridge/quality/final scoring
3. Implement `compileFeedback(feedback)` — compile feedback into memory patch
4. Implement `applyPatch(memory, patches)` — apply patch to update memory
5. Implement `rankWithMemory(papers, memory)` — re-rank search results by memory
6. Populate `data/seed-concepts.json` (50+ concepts) and `data/seed-edges.json` (80+ edges)
7. Write slider comparison experiment table: what 20/50/70/90 each return and why they differ
8. Write pre/post-feedback comparison table: how ranking changes after "too hard" feedback
9. Prepare 150-word defense explanation: how PaperWorm achieves "not random, but controlled serendipity"

### 20.4 Interface Contract (Frozen — No Changes After Freeze)

```typescript
// Single source of truth: lib/types.ts

type PaperId = string;
type UserId = string;
type InteractionId = string;

type PaperCard = {
  id: PaperId;
  title: string;
  doi: string | null;
  year: number;
  authors: string[];
  citedByCount: number;
  abstract: string | null;
  concepts: ConceptTag[];
  openAccess: boolean;
  _rankScore?: number;       // Ranking score (internal use)
};

type ConceptTag = {
  id: string;
  name: string;
  score: number;
  level: number;
};

type WormholeCard = {
  id: string;
  path: PaperId[];
  startConcepts: ConceptTag[];
  targetConcepts: ConceptTag[];
  targetPaper: PaperCard;
  explanation: string;
  scores: {
    novelty: number;
    bridge: number;
    quality: number;
    final: number;
  };
};

type CitationResult = {
  doi: string;
  style: "apa" | "mla" | "gbt7714" | "chicago";
  text: string;
  metadata: CitationMetadata;
  source: "crossref" | "manual";
};

type Feedback = {
  targetType: "paper" | "wormhole" | "citation";
  targetId: string;
  rating: "too_theoretical" | "too_empirical" | "too_hard" | "just_right" | "interesting";
  freeText: string | null;
};

type MemoryPatch = {
  key: string;
  operation: "set" | "add_or_increment" | "decrement" | "remove";
  value: unknown;
  confidenceDelta: number;
};
```

After freezing, anyone modifying fields must also update tests and sample data. **Only optional fields may be added; renaming or deleting fields is forbidden.**

---

## 21. Implementation Priority

### Day 1: Skeleton + Core Search

1. Set up Next.js + Prisma project
2. Complete schema and seed data
3. Wrap OpenAlex API (Member 1)
4. Get `/api/search` working — can search papers
5. Get basic homepage and paper list working
6. Freeze types.ts

### Day 2: Citation Format + Feedback Memory

1. Wrap CrossRef API (Member 1)
2. Get `/api/citation` working — DOI → citation format
3. Implement feedback memory engine (Member 2)
4. Get `/api/feedback` + `/api/memory` working
5. Implement `rankWithMemory` — ranking changes after feedback
6. **Closed-loop verification**: search papers → click "too theoretical" → search again → ranking changed ✓

### Day 3: Wormhole + Summary + Tests + Demo

1. Implement wormhole algorithm (Member 2)
2. Get `/api/wormholes` working — slider changes results
3. Implement paper summary (Lead, Ollama + OpenAlex fallback)
4. Get `/api/summarize` working
5. Write tests (unit + e2e)
6. Write demo script
7. Fix UI + unify terminology + prepare defense

---

## 22. Testing & Acceptance

### 22.1 Unit Tests

Must cover:

- [ ] `paper_search` returns paper list, each with title/abstract/concepts/citation count
- [ ] `citation_format` DOI → APA/MLA/GB-T format correct (punctuation and spacing correct)
- [ ] `compileFeedback` feedback "too hard" → mathTolerance decreases
- [ ] `compileFeedback` feedback "interesting" → likedDomains adds entry
- [ ] `rankWithMemory` prefers empirical → empirical papers rise in rank
- [ ] `rankWithMemory` mathTolerance < 0.4 → math-heavy papers drop in rank
- [ ] `generateWormholes` slider=20 vs. slider=70 returns visibly different results
- [ ] `generateWormholes` wormholes with no paper landing point are eliminated
- [ ] `generateWormholes` candidates with bridge_score < 0.35 are eliminated
- [ ] `generateWormholes` every wormhole has an explanation

### 22.2 API Tests

- [ ] POST /api/search — returns paper list + memoryUsed
- [ ] POST /api/citation — returns formatted citation
- [ ] POST /api/summarize — returns abstract + argument/conclusion
- [ ] POST /api/feedback — returns memoryPatches
- [ ] GET /api/memory — returns preference profile + update history
- [ ] DELETE /api/memory — memory reset
- [ ] POST /api/wormholes — returns wormhole list + scores

### 22.3 E2E Demo Test

```
Open homepage
  -> Type: "I want to get started with AI agents for a project"
  -> View paper list
  -> Click "too theoretical" on one result
  -> Search again -> ranking visibly changed, empirical papers on top
  -> Open a paper -> see argument/conclusion extraction
  -> Click "generate citation" -> paste DOI -> APA format -> one-click copy
  -> Click "try knowledge wormhole" -> drag slider to 70
  -> See wormhole: AI Agent -> Multi-Agent -> Game Theory -> Mechanism Design
  -> Click "too hard" -> open /memory page -> mathTolerance decreased
  -> Click "reset demo memory" -> memory cleared
```

---

## 23. Demo Script (3 Minutes)

### Opening (15 seconds)

Google Scholar helps you search papers and then leaves you alone. PaperWorm remembers your taste — you say "too theoretical," and next time it prioritizes empirical work. Occasionally it even takes you to a field you've never searched before.

### Step 1: Search + Feedback (45 seconds)

Input: `I want to get started with AI agents for a project`

Show: Paper list, each with abstract + concept tags + citation count.

Click "too theoretical" on a theory-heavy paper.

### Step 2: Memory Takes Effect (30 seconds)

Search again with the same keywords.

**Highlight**: Results ranking visibly changed — empirical papers on top, pure theoretical ones pushed down. UI shows "Referenced your preferences: prefers empirical research."

### Step 3: Paper Summary + Citation Format (30 seconds)

Open a paper → see argument/conclusion/intro extraction.

Click "generate citation" → paste DOI → select APA → one-click copy.

### Step 4: Knowledge Wormhole (45 seconds)

Click "try knowledge wormhole" → drag surprise slider to 70.

Show wormhole: AI Agent → Multi-Agent Coordination → Game Theory → Mechanism Design

Explain: This isn't random. Multi-agent coordination and mechanism design both study "how multiple agents act under rules" — there's a direct knowledge bridge.

Click "too hard."

### Step 5: Memory Transparency Page (15 seconds)

Open /memory page → see: math tolerance decreased, Economics added to liked domains, update history timeline.

### Closing

PaperWorm turns paper search from "search and leave you alone" into "an agent that remembers you." Search, citation, and summary all use free APIs at zero token cost. Feedback memory runs on local SQLite with millisecond response. And occasionally it takes you to a field you've never searched — that's "manufacturing surprise."

---

## 24. Seed Data Requirements

### For Offline Cache (Fallback When OpenAlex Rate-Limits)

| File | Count | Content |
|---|---|---|
| `seed-papers.json` | 50+ | Papers (title/DOI/year/authors/abstract/concepts/citation count) |
| `seed-concepts.json` | 50+ | Concept nodes (name/aliases/domain/score) |
| `seed-edges.json` | 80+ | Concept relationship edges (source/target/weight) |

### Required Concept Chains (For Wormhole Demo)

1. AI Agent → Multi-Agent Coordination → Game Theory → Mechanism Design
2. AI Agent → Agent Memory → Human Memory → Cognitive Psychology → Forgetting Curve
3. Transformer → Information Theory → Statistical Physics → Phase Transition
4. RAG → Information Retrieval → Library Science → Personal Knowledge Management

### Required Papers

- Artificial Intelligence: A Modern Approach
- Attention Is All You Need
- Multiagent Systems (Wooldridge)
- An Introduction to Game Theory (Osborne)
- Cognitive Psychology and Its Implications
- Introduction to Information Retrieval

### Demo User

- 1 demo user (`demo-user`)
- 3 initial memories (prefers empirical, Chinese-first, mathTolerance=0.5)

---

## 25. Hard Rules (No Faking)

1. **Feedback must genuinely change subsequent recommendations.** User says "too theoretical" → next search ranking must actually change.
2. **Memory must be inspectable.** /memory page shows preference profile + update history, not a black box.
3. **Citation format must be real.** APA is APA — punctuation and spacing must be correct. Calls CrossRef for real metadata, no fabrication.
4. **Paper summaries must be genuine extractions from paper content.** If Ollama is down, use OpenAlex raw abstract — can't use generic filler.
5. **Wormholes must land on real papers.** The destination must be a real paper with a DOI — can't invent one.
6. **Every wormhole must show its path.** Show the A→B→C citation chain + human-readable explanation so the user understands "why we ended up here."
7. **The slider must genuinely change ranking.** slider=20 and slider=70 return visibly different wormholes.
8. **Clone must run.** npm install && npm run dev starts it up, no external API key dependency.
9. **Degradation must be labeled.** If fallback data is used, label it "offline cache." If Ollama is down, label it "raw abstract." Don't deceive the user.

---

## 26. Definition of Done

Project completion requires all of the following:

- [ ] Runs locally (npm install && npm run dev)
- [ ] Homepage is a usable paper search agent, not a concept intro page
- [ ] Paper search returns real paper data (OpenAlex API)
- [ ] Citation format generation is correct (CrossRef API + templates, APA/MLA/GB-T)
- [ ] Feedback changes memory (compileFeedback → memory patch)
- [ ] Memory affects next search ranking (rankWithMemory)
- [ ] /memory page shows preference profile + update history
- [ ] Wormhole paths can be generated and slider affects ranking
- [ ] Every wormhole has explanation and path
- [ ] Paper summary can extract argument/conclusion (falls back to OpenAlex raw if Ollama down)
- [ ] All three responsibility packages have independent deliverables
- [ ] Demo can be presented in 3 minutes
- [ ] Core flow runs without LLM API key (search + citation + memory)

---

## Appendix: Differences from v1.3 Original

| Dimension | v1.3 Original | v2.0 Revised |
|---|---|---|
| Product positioning | Library-domain agent | Paper agent (that remembers you) |
| Primary track | Four tracks side by side | Qiniu Cloud primary; OpenAtom / Miracle Academy as bonus |
| Catalog data | Self-built seed | OpenAlex API (free, real) |
| Citation format | None | CrossRef API + templates (APA/MLA/GB-T) |
| Paper summary | None | OpenAlex abstract reconstruction + Ollama argument extraction |
| Memory engine | Written from scratch | Existing Python version; TS rewrite or wrap as microservice |
| Wormhole algorithm | NLP semantic similarity | OpenAlex concept-tag set operations (verified) |
| Living Library | Core feature | **Cut** |
| Knowledge Collision | Core feature | **Cut** |
| Person matching | Core feature | **Cut** |
| Frontend pages | 5 pages | 6 pages (added paper detail + review) |
| API routes | 6 | 7 (added citation + summarize) |
| Demo mainline | Wormhole-centric | Feedback → memory → ranking change-centric |
| Degradation strategy | Yes | Yes + verified API fallback |
| Memory cost | Not analyzed | Has cost table (core flow zero tokens) |
