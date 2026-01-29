# PSUR RegOS v1

Medical device regulatory compliance automation platform for generating Periodic Safety Update Reports (PSURs). Orchestrates AI agents to process regulatory documents, extract evidence, and generate compliant reports across multiple jurisdictions (EU MDR, UK MDR, US, Canada).

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript 5.6, ES modules (`"type": "module"`)
- **Frontend:** React 18, Vite 7, Wouter (routing), TanStack React Query, shadcn/ui (New York style), Tailwind CSS 3, Framer Motion
- **Backend:** Express 4, PostgreSQL 16, Drizzle ORM, WebSocket (ws)
- **AI/LLM:** Anthropic Claude SDK, OpenAI SDK, Google Generative AI
- **Document Processing:** docx/docxtemplater (Word), Puppeteer (PDF), mammoth, xlsx
- **Graph DB:** Neo4j (knowledge graphs)
- **Auth:** Passport.js (local strategy), express-session

## Project Structure

```
client/src/           React frontend
  pages/              Route pages (psur-wizard.tsx is the main workflow UI)
  components/         Reusable components
  components/ui/      shadcn/ui primitives (30+ components)
  lib/                Utilities, auth context, query client
  hooks/              Custom React hooks

server/               Express backend
  index.ts            Server entry point (port 5000)
  routes.ts           All API route handlers
  db.ts               PostgreSQL/Drizzle connection pool
  storage.ts          File storage layer
  src/agents/         AI agent system
    llmService.ts     Multi-provider LLM integration
    agentOrchestrator.ts  Agent lifecycle management
    ingestion/        Document analysis, evidence extraction, field mapping
    runtime/          PSUR generation (narratives/, tables/, charts/)
  src/orchestrator/   Workflow engine
    workflowRunner.ts 6-step workflow (qualify → init → ingest → propose → generate → compile)
    steps/            Individual workflow step implementations
  src/services/       Business logic (17 services)
    grkbService.ts    Global Regulatory Knowledge Base
    contentTraceService.ts   Data provenance tracking
    provenanceRegistry.ts    Source attribution
  src/psur/           PSUR-specific engines, mappings, validation

shared/               Code shared between client and server
  schema.ts           Drizzle ORM schema + Zod types (single source of truth)
  models/chat.ts      Chat model definitions

migrations/           SQL database migrations (Drizzle Kit)
script/build.ts       Production build (Vite + esbuild)
```

## Commands

```bash
npm run dev           # Start dev server (tsx, hot reload)
npm run build         # Production build (Vite client + esbuild server → dist/)
npm run start         # Run production build (node dist/index.cjs)
npm run check         # TypeScript type checking (tsc --noEmit)
npm run db:push       # Push Drizzle schema to PostgreSQL
npm run db:seed       # Seed core database data
npm run db:seed:slots # Seed template slots
```

## Path Aliases

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

## Environment Variables

```
DATABASE_URL          # PostgreSQL connection (required)
ANTHROPIC_API_KEY     # Claude API key
OPENAI_API_KEY        # OpenAI API key
NODE_ENV              # development | production
PORT                  # Server port (default 5000)
```

## Architecture

### Monorepo with Shared Schema
Single repo: `client/` + `server/` + `shared/`. The `shared/schema.ts` file defines all Drizzle ORM tables and Zod validation schemas used by both sides. Types are inferred from the schema (`$inferSelect`, `z.infer`).

### Workflow Engine
The system runs a 6-step pipeline defined in `workflowRunner.ts`:
1. **Qualify Template** — validate against GRKB obligations (hard-fail if missing)
2. **Initialize Report** — set up report structure
3. **Ingest Evidence** — parse uploaded documents, extract evidence atoms
4. **Propose Slots** — map evidence to template slots
5. **Generate Narratives** — AI-driven content generation via specialized agents
6. **Compile Artifacts** — produce DOCX/PDF output

### Agent System
Base agent pattern with three agent categories:
- **Ingestion agents** (DocumentAnalyzer, EvidenceExtractor, FieldMapper)
- **Runtime narrative agents** (12 specialized: executive summary, safety, clinical, CAPA, etc.)
- **Runtime table/chart agents** (10 table + 5 chart generators)

Each agent follows: spawn → initialize → execute → terminate lifecycle.

### GRKB (Global Regulatory Knowledge Base)
DB-backed regulatory obligation system. Jurisdictions: EU_MDR, UK_MDR, US, Canada. Step 1 HARD FAILs (BLOCKED) if no mandatory obligations exist for selected jurisdictions. Must be seeded: `npx tsx server/scripts/seed-grkb.ts`.

### Traceability
Three-layer provenance:
- **Decision traces** — agent reasoning and choices
- **Content traces** — data lineage through the pipeline
- **Provenance registry** — source attribution for generated content

## Database

PostgreSQL 16 via Drizzle ORM. Key tables defined in `shared/schema.ts`:
- `users`, `companies`, `devices` (core entities)
- `psur_items`, `psur_cases` (report data)
- `data_sources`, `evidence_proposals` (evidence pipeline)
- `grkb_obligations`, `qualification_reports` (regulatory)
- `system_instructions`, `templates` (configuration)
- `agent_executions`, `content_traces`, `decision_traces` (traceability)

Migrations in `migrations/` directory. Push schema changes with `npm run db:push`.

## Conventions

- **TypeScript strict mode** — all code is strictly typed
- **Zod validation** at API boundaries; types inferred from Drizzle schema
- **File naming:** camelCase for utilities/services, PascalCase discouraged for non-component files
- **DB columns:** snake_case; TypeScript properties: camelCase
- **React patterns:** functional components, TanStack Query for server state, react-hook-form + Zod for forms
- **Error handling:** global process handlers for unhandled rejections; React Error Boundary in client; typed error responses from API
- **Styling:** Tailwind utility classes only (no CSS modules); HSL CSS variables for theming; dark mode via class selector
- **Imports:** ES module syntax; path aliases `@/` and `@shared/`
- **Services:** singleton pattern for stateful services (ProvenanceRegistry, template stores)
- **Concurrency:** `p-limit` for controlled parallelism, `p-retry` with exponential backoff

## Key Patterns

- All LLM calls route through `server/src/agents/llmService.ts` which handles provider selection, token tracking, and system prompt management
- Template slots have four kinds: ADMIN, NARRATIVE, TABLE, METRIC
- Template validation is permissive (minimum required fields, custom fields allowed)
- The server seeds system prompts idempotently on startup
- WebSocket connections (`ws`) used for real-time workflow progress
- Multi-tier caching: preview (1min TTL), compiled docs (1hr TTL), metrics
- Production build outputs CJS (`dist/index.cjs`) for Node.js compatibility
