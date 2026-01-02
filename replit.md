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