# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

PSUR Regulatory OS -- an AI-powered platform for generating EU MDR-compliant Periodic Safety Update Reports (PSURs) per MDCG 2022-21 guidance. It ingests evidence data, maps it against regulatory obligations (GRKB), and uses AI agents to compile fully-traced, audit-ready PSUR documents.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (Express + Vite HMR on port 5000) |
| `npm run build` | Production build (Vite client -> `dist/public/`, esbuild server -> `dist/index.cjs`) |
| `npm start` | Run production server |
| `npm run check` | TypeScript type-check (`tsc --noEmit`) |
| `npm run db:push` | Push Drizzle schema to PostgreSQL |
| `npm run db:seed` | Seed database (`tsx server/src/db/seed.ts`) |
| `npm run db:seed:slots` | Seed slot definitions (`tsx server/src/db/seed_slots.ts`) |
| `npx tsx server/scripts/seed-grkb.ts` | Seed GRKB regulatory obligations |
| `npx tsx server/scripts/seed-psur-grkb.ts` | Seed PSUR-specific GRKB |

No test framework is configured. No CI pipeline exists.

## Architecture

### Monorepo Layout

```
client/          React SPA (Vite + React 18 + wouter + TanStack Query + shadcn/ui)
server/          Express.js API (TypeScript via tsx in dev, esbuild CJS bundle in prod)
shared/          Shared schema and types (imported by both client and server)
migrations/      Drizzle SQL migrations (0001-0010)
server/templates/ MDCG 2022-21 Annex JSON templates (I-IV)
```

Path aliases: `@/*` -> `client/src/*`, `@shared/*` -> `shared/*`

### Single Source of Truth: `shared/schema.ts`

This ~900-line file defines ALL Drizzle table schemas, Zod insert schemas, TypeScript types, business enums, and the `EVIDENCE_DEFINITIONS` registry (14 evidence types across 5 tiers). Both client and server import from here. When adding new data models, add them here.

### Client

- **Router:** wouter (not React Router) -- routes defined in `client/src/App.tsx`
- **Server state:** TanStack React Query -- client configured in `client/src/lib/queryClient.ts`
- **UI:** shadcn/ui components in `client/src/components/ui/` (Radix primitives + Tailwind)
- **Theme:** `next-themes` ThemeProvider with dark mode support
- **Key pages:** `/psur` (wizard), `/lineage` (content traces), `/templates` (pipeline), `/prompts` (AI instructions), `/regulatory` (GRKB), `/dossiers` (device dossiers)

### Server

- **Entry:** `server/index.ts` -- creates Express app, registers routes, sets up Vite middleware (dev) or static serving (prod)
- **Routes:** `server/routes.ts` (~6500 lines, the largest file) contains most API endpoints inline under `/api/`. Template routes are split to `server/src/templateRoutes.ts`, HITL routes to `server/src/hitlRoutes.ts`
- **Storage:** `IStorage` interface in `server/storage.ts` with `DatabaseStorage` implementation. All DB access goes through the exported `storage` singleton
- **Database:** PostgreSQL via `pg` + Drizzle ORM. Optional Neo4j for GRKB obligation graph
- **LLM:** Dual provider -- OpenAI (GPT-4o) and Anthropic (Claude Sonnet) with automatic fallback. Configured in `server/src/agents/llmService.ts`
- **File uploads:** Multer with 50MB limit
- **Document export:** DOCX (docx + docxtemplater), PDF (Puppeteer), Markdown

### Agent System (`server/src/agents/`)

Class hierarchy with typed I/O and built-in tracing:

- **`BaseAgent<TInput, TOutput>`** -- Abstract base with lifecycle (`run` -> `initialize` -> `execute` -> `cleanup`), LLM invocation with decision trace logging, metric tracking
- **Agent Orchestrator** (`agentOrchestrator.ts`) -- Singleton coordinating ingestion and runtime workflows
- **Ingestion agents** (`agents/ingestion/`) -- FieldMappingAgent, EvidenceExtractionAgent, DocumentAnalyzerAgent
- **Compile Orchestrator** (`agents/runtime/compileOrchestrator.ts`) -- Coordinates full PSUR compilation: Narratives -> Tables -> Charts -> Document Formatting, with HITL approval gates and SSE streaming
- **Narrative agents** (`agents/runtime/narratives/`) -- 10 section-specific agents extending `BaseNarrativeAgent` (exec summary, device scope, safety, trends, FSCA, CAPA, clinical, benefit-risk, conclusion, PMS activity)
- **Table agents** (`agents/runtime/tables/`) -- 8 agents extending `BaseTableAgent`
- **Chart agents** (`agents/runtime/charts/`) -- 5 agents generating pure SVG (no native deps)

Orchestrators are singletons: `getOrchestrator()`, `getCompileOrchestrator()`.

### PSUR Compilation Pipeline (`server/src/orchestrator/workflowRunner.ts`)

8-step workflow: Validate Template -> Initialize Report -> Load Data -> Map Content -> Verify Completeness -> Coverage Analysis -> Generate Document -> Export Package. Progress streamed via SSE at `/api/orchestrator/cases/:id/stream`.

### Template System

JSON templates in `server/templates/` define slots mapped to GRKB obligations. The template pipeline (`server/src/services/templatePipeline.ts`) ingests templates, auto-maps slots to obligations via embeddings, and persists to PostgreSQL + Neo4j. The PSUR contract (`server/src/psur/psurContract.ts`) defines canonical section/table/figure IDs -- templates may add sections but must not remove or rename core ones.

### Evidence Processing

Evidence flows: Upload -> Parse (`server/src/parsers/`) -> Normalize to atoms (`evidence_atoms` table) -> Map to template slots via slot proposals -> AI generates content. PSUR calculation engines in `server/src/psur/engines/` handle domain-specific computations (sales/exposure, complaints, vigilance, literature, PMCF).

### Decision Traceability

Multi-level audit trail:
1. **Decision Trace** -- Hash-chained immutable entries with regulatory context and compliance assertions (`server/src/services/decisionTraceService.ts`)
2. **Content Traces** -- Element-level tracing of every sentence/cell/calculation (`server/src/services/contentTraceService.ts`)
3. **Provenance Registry** -- Statement-level WHERE/WHEN/HOW/WHY tracking (`server/src/services/provenanceRegistry.ts`)

### HITL (Human-in-the-Loop)

Compilation pauses at section boundaries for human approval. Managed by `server/src/services/hitlApprovalService.ts`, routes in `server/src/hitlRoutes.ts`.

## Environment Variables

- `DATABASE_URL` -- PostgreSQL connection string (required)
- `OPENAI_API_KEY` -- OpenAI API key (needed for LLM features)
- `ANTHROPIC_API_KEY` -- Anthropic API key (fallback LLM provider)
- `PORT` -- Server port (defaults to 5000)

## Key Conventions

- Always implement full SOTA (state-of-the-art) solutions, not stubs or partial implementations
- All evidence data is normalized to "atoms" with provenance metadata and content hashes, scoped to `psurCaseId`
- Template slots go through adjudication (accept/reject) before compilation
- Every AI decision must be traced -- the `BaseAgent` class handles this automatically via `invokeLLM()` and `invokeLLMForJSON()`
- The GRKB (Global Regulatory Knowledge Base) is the single source of truth for obligations; it lives in both PostgreSQL and optionally Neo4j
