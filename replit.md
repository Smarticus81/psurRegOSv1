# RegulatoryOS

## Overview

RegulatoryOS is a single-company deployment system for medical device regulatory compliance. It provides AI-powered automation for generating MDCG 2022-21 compliant Periodic Safety Update Reports (PSURs) and other regulatory documentation required for medical device manufacturers operating across multiple jurisdictions (EU MDR, UK MDR, FDA).

**Deployment Model**: Single-company - the logged-in user IS the company. No company selection is needed throughout the application.

The system features a Global Regulatory Knowledge Base (GRKB) containing structured regulatory requirements, an agent orchestration layer for automating document generation workflows, and a unified data layer for ingesting and normalizing compliance data from various sources.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens for light/dark themes
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Style**: RESTful JSON APIs under `/api/*` prefix
- **Build**: esbuild for production bundling with selective dependency bundling

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit with `db:push` command
- **Object Storage**: Google Cloud Storage integration for file uploads with presigned URLs

### Key Data Models
- **Companies**: Medical device manufacturers with jurisdiction configurations
- **Devices**: Medical devices with classification (Class I, IIa, IIb, III), risk profiles
- **PSUR Items**: Periodic Safety Update Report tracking and scheduling
- **Data Sources**: Uploaded compliance data (sales, complaints, adverse events)
- **Agent Executions**: Audit trail for AI agent workflow runs
- **Generated Documents**: Output documents with metadata and review status
- **GRKB Entries**: Structured regulatory knowledge base entries
- **Evidence Atoms**: Immutable evidence records with full provenance tracking

### Evidence Definitions Registry
The system uses a shared evidence registry (`EVIDENCE_DEFINITIONS` in `shared/schema.ts`) as a single source of truth for all evidence types:
- **15 Evidence Types**: manufacturer_master_data, device_master_data, psur_case_record, sales_volume, population_estimate, exposure_model, incident_record, incidents, complaint_record, complaints, fsca, capa, literature, registry, pmcf
- **Raw→Aggregated Mapping**: incident_record→incidents, complaint_record→complaints (raw records satisfy aggregated slot requirements)
- **Section Mapping**: Each type maps to PSUR sections A-M (e.g., incident_record → D, E, G, M)
- **Tier System**: 0=admin, 1=sales/population, 2=safety, 3=external, 4=conclusions
- **Parser Types**: "dedicated" for structured parsing, "generic" for flexible key-value ingestion

### Agent Architecture
- **AI Provider**: Anthropic Claude via SDK
- **Orchestration Pattern**: Multi-agent system with specialized agents (PSUR, Data Collection, Analysis, Document Generation)
- **Batch Processing**: Rate-limited concurrent processing with retry logic
- **Chat Integration**: Conversation-based AI interactions with message history

### File Structure Convention
- `client/src/`: React frontend application
- `server/`: Express backend with API routes
- `shared/`: Shared TypeScript types and database schema
- `server/replit_integrations/`: Pre-built integration modules (chat, batch processing, object storage)
- `server/src/services/`: Backend services (evidenceStore, etc.)
- `server/src/schemas/`: Zod validation schemas for DTOs

### Orchestrator Workflow Design (8 Steps)
**Key Principle**: Pre-ingestion + Deterministic Generation. Evidence must be uploaded before workflow execution.

1. **Step 1 - Template Qualification**: Validates template structure
2. **Step 2 - PSUR Case Creation**: Persists case record to DB
3. **Step 3 - Evidence Validation**: Fetches existing atoms from DB (no in-memory creation). Uses `storage.getEvidenceAtoms(psurCaseId)` or `listEvidenceAtomsByCase()`
4. **Step 4 - Coverage Queue Build**: Builds prioritized slot queue, triggers deterministic generators for proposal creation with real evidence linkage
5. **Step 5 - Adjudication**: Reviews and accepts/rejects proposals
6. **Step 6 - Coverage Report**: Generates coverage metrics
7. **Step 7 - Document Assembly**: Compiles final PSUR document
8. **Step 8 - Audit Bundle**: Persists traceability records

**Evidence Flow**: 
- Upload via `/api/evidence/upload` → Parse → Validate → Persist to `evidence_atoms` table
- Workflow Step 3 reads from DB only (never creates demo atoms)
- Deterministic generators receive DB atoms via `storage.getEvidenceAtoms()`

## External Dependencies

### AI Services
- **Anthropic Claude**: Primary AI model for document generation and analysis (claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5)
- Environment variables: `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`

### Database
- **PostgreSQL**: Primary data store
- Environment variable: `DATABASE_URL`

### File Storage
- **Google Cloud Storage**: Object storage for uploaded files (sales data, complaints, CERs)
- Accessed via Replit sidecar endpoint at `http://127.0.0.1:1106`
- Environment variable: `PUBLIC_OBJECT_SEARCH_PATHS`

### File Upload
- **Uppy**: Client-side file upload library with AWS S3-compatible presigned URL flow
- Dashboard modal interface for file management

### UI Dependencies
- **Radix UI**: Accessible component primitives (dialog, dropdown, tabs, etc.)
- **Lucide React**: Icon library
- **class-variance-authority**: Component variant management
- **react-day-picker**: Calendar component
- **embla-carousel**: Carousel functionality
- **recharts**: Data visualization charts