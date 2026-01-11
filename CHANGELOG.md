# CHANGELOG - GRKB DB-Backed Refactoring

## Summary
Refactored the PSUR orchestration app to use a DB-backed Global Regulatory Knowledge Base (GRKB) for Step 1 Template Qualification. The GRKB is now the single source of truth for regulatory obligations, replacing all hardcoded/static data and Python orchestrator calls.

## Changes Made

### ADDED

#### New Files
- `server/src/services/grkbService.ts` - **GRKB Service**
  - `listGrkbEntries(filter)` - List all GRKB entries with optional filtering
  - `getObligations(jurisdictions, artifactType, templateId)` - Get mandatory obligations from DB
  - `getConstraints(jurisdictions, artifactType, templateId)` - Get constraints from DB
  - `qualifyTemplateAgainstGrkb(...)` - Core qualification logic with HARD FAIL on missing obligations
  - `createGrkbObligation()`, `createGrkbObligationsBatch()` - Create entries
  - `deleteAllGrkbObligations()` - For testing/seeding

- `server/scripts/seed-grkb.ts` - **Seed Script**
  - Seeds 13 EU_MDR PSUR obligations
  - Seeds 6 UK_MDR PSUR obligations
  - Seeds 3 constraints
  - Run with: `npx tsx server/scripts/seed-grkb.ts`

- `server/src/services/grkbService.test.ts` - **Test Suite**
  - Tests for BLOCKED status when no obligations exist
  - Tests for VERIFIED status when obligations exist
  - Tests for multi-jurisdiction scenarios
  - Count verification tests

#### Schema Additions (`shared/schema.ts`)
- `grkb_obligations` table - New properly structured GRKB table:
  - `obligationId` (stable unique ID, e.g., "EU_MDR.PSUR.OBL.001")
  - `jurisdiction` (EU_MDR, UK_MDR)
  - `artifactType` (PSUR, CER, etc.)
  - `templateId` (nullable - applies to specific template or all)
  - `kind` (obligation, constraint, definition)
  - `title`, `text`, `sourceCitation`, `version`, `effectiveFrom`
  - `mandatory` (boolean)
  - `requiredEvidenceTypes` (string array)

- `qualification_reports` table - Persisted qualification results:
  - Links to `psur_cases`
  - Status (VERIFIED/BLOCKED)
  - Slot/mapping counts
  - Obligation counts and missing obligations
  - Blocking errors

- `QualificationReportData` interface - Added to WorkflowStep report union type

### MODIFIED

#### Step 1 - Qualify Template (`server/src/orchestrator/workflowRunner.ts`)
- Now calls `qualifyTemplateAgainstGrkb()` from GRKB service
- **HARD FAIL (BLOCKED)** if any selected jurisdiction has ZERO mandatory obligations
- Persists `qualification_report` to DB
- Log messages now derive Y from DB result size:
  - "Validating X slots against Y mandatory obligations..."
- Returns detailed qualification report with:
  - `mandatoryObligationsTotal` / `mandatoryObligationsFound`
  - `missingObligations` with jurisdiction and message
  - `blockingErrors` array

#### Routes (`server/routes.ts`)
- Added import for GRKB service functions
- `GET /api/orchestrator/status` - Now returns counts from DB-backed GRKB instead of Python orchestrator
- `GET /api/grkb` - Now uses `listGrkbEntries()` from GRKB service (read-only)

#### Kernel Status
- `getKernelStatus()` now queries DB-backed GRKB via `getObligations()` and `getConstraints()`
- No longer calls Python orchestrator

### REMOVED

#### Dependencies Eliminated
- Python orchestrator is no longer called for obligations/constraints
- `listObligations()` and `listConstraints()` from `orchestrator.ts` are no longer used in Step 1 or status endpoint

### NOT CHANGED (Out of Scope)
- No pages were deleted in this iteration (cleanup of mock UI deferred)
- Evidence page and admin page remain unchanged
- Original `grkb_entries` table kept for backwards compatibility

## File Structure After Changes

```
server/
├── scripts/
│   └── seed-grkb.ts          # NEW: Seed script for GRKB
├── src/
│   ├── orchestrator/
│   │   └── workflowRunner.ts # MODIFIED: Uses GRKB service
│   └── services/
│       ├── grkbService.ts    # NEW: GRKB repository/service
│       └── grkbService.test.ts # NEW: Test suite
├── routes.ts                  # MODIFIED: Uses GRKB service
└── ...

shared/
└── schema.ts                  # MODIFIED: Added grkb_obligations, qualification_reports
```

## Database Migrations Required

Run the following to push the new schema:

```bash
npm run db:push
```

Then seed the GRKB:

```bash
npx tsx server/scripts/seed-grkb.ts
```

## Testing

Run the GRKB service tests:

```bash
npx vitest run server/src/services/grkbService.test.ts
```

### Test Cases
1. **When DB has NO EU_MDR obligations** → Step 1 returns `BLOCKED` status
2. **When DB has obligations** → Step 1 returns `VERIFIED` with correct counts
3. **Multi-jurisdiction** → BLOCKED if any jurisdiction missing, VERIFIED if all present

## Breaking Changes

- Step 1 will now **BLOCK** if the GRKB is not seeded with obligations for selected jurisdictions
- UI "Kernel Status" panel now shows counts from DB (will be 0 until seeded)
- The `qualification_report` in Step 1 has a new structure - clients should handle `QualificationReportData` type

## Migration Guide

1. Run `npm run db:push` to create new tables
2. Run `npx tsx server/scripts/seed-grkb.ts` to populate GRKB
3. Verify `/api/orchestrator/status` returns non-zero counts
4. Run workflow - Step 1 should show VERIFIED with obligation counts
