# Annex I Compliance Auditor Implementation

## Overview

Implemented a **non-blocking compliance auditing system** that flags templates not meeting full MDCG 2022-21 Annex I requirements WITHOUT failing validation.

The system validates templates against permissive schema validation, then runs comprehensive compliance auditing with warnings and recommendations.

## Architecture

### Core Components

1. **`annexIComplianceAuditor.ts`** - Main auditor service
   - Location: `server/src/services/annexIComplianceAuditor.ts`
   - Runs 7-layer compliance validation
   - Returns detailed compliance report with score 0-100

2. **Database Integration**
   - Added `complianceAudit` JSONB column to `templates` table
   - Migration: `migrations/0009_add_compliance_audit_column.sql`
   - Stores audit results for historical tracking

3. **API Integration**
   - Integrated into `templateManagementService.processTemplate()`
   - New endpoint: `GET /api/templates/:templateId/compliance`
   - Audit runs automatically when processing EU_MDR templates

4. **UI Component**
   - `ComplianceReport.tsx` - Visual compliance dashboard
   - Shows overall score, warnings, layer-by-layer results
   - Recommendations for improving compliance

## 7 Validation Layers

### Layer 1: Section Structure
**Checks**: Presence of mandatory MDCG 2022-21 sections (A-M)

**Flags**:
- Missing sections (e.g., Executive Summary, Conclusions)
- Invalid section paths (should follow "Number > Title" format)

**Score**: (Found sections / Expected sections) * 100

### Layer 2: Obligation Coverage
**Checks**: Template covers all 30 mandatory MDCG Annex I obligations

**Flags**:
- Missing mandatory obligations from `mandatory_obligation_ids`
- References `mdcg2022AnnexI.ts` definitions

**Score**: (Covered obligations / Total mandatory) * 100

### Layer 3: Required Tables
**Checks**: Each obligation's required tables are present

**Flags**:
- Missing tables (e.g., `TABLE_SALES_BY_REGION_YEAR`)
- Maps obligation → required tables from `mdcg2022AnnexI.ts`

**Score**: (Present tables / Required tables) * 100

### Layer 4: Evidence Type Mapping
**Checks**: Slots have correct evidence types for their obligations

**Flags**:
- Missing evidence types (e.g., `complaint_record`, `sales_volume`)
- Compares `evidence_requirements.required_types` against obligation requirements

**Score**: (Correct mappings / Total obligations with evidence) * 100

### Layer 5: Calculation Rules
**Checks**: Required calculations are referenced in slots

**Flags**:
- Missing calculation rules (e.g., complaint rate formula)
- Looks for formulas in slot descriptions or custom `calculation_rules` fields

**Score**: (Present rules / Required rules) * 100

### Layer 6: Narrative Constraints
**Checks**: Required narrative statements are documented

**Flags**:
- Missing constraints like "MUST_CONCLUDE", "MUST_STATE"
- Checks for quality checks or narrative constraints in slots

**Score**: (Present constraints / Required constraints) * 100

### Layer 7: Dependency Chain
**Checks**: Obligation dependencies are satisfied

**Flags**:
- Broken dependency chains (e.g., complaint rates depend on sales data)
- Validates `dependsOn` relationships from `mdcg2022AnnexI.ts`

**Score**: (Satisfied dependencies / Total dependencies) * 100

## Compliance Warning Levels

### CRITICAL (Red)
- Score < 50% in any layer
- Blocking regulatory issues
- **Impact**: "Template may not meet regulatory requirements"

### WARNING (Yellow)
- Score 50-80% in any layer
- Incomplete coverage
- **Impact**: "Template coverage is incomplete"

### INFO (Blue)
- Score 80%+ (good)
- Minor suggestions
- **Impact**: Informational only

## Integration Flow

```
User uploads template
        ↓
Permissive schema validation (PASS/FAIL)
        ↓ (if PASS)
GRKB grounding (semantic obligation matching)
        ↓
🆕 Annex I Compliance Audit (non-blocking)
        ↓
Save to DB with complianceAudit field
        ↓
Return result with warnings array
```

## API Usage

### Process Template with Audit
```bash
POST /api/templates/process
# Automatically runs compliance audit for EU_MDR templates
```

**Response**:
```json
{
  "success": true,
  "templateId": "CUSTOM_PSUR_V1",
  "complianceAudit": {
    "overallScore": 87,
    "warnings": 3,
    "criticalWarnings": 0,
    "recommendations": [...]
  },
  "warnings": [
    "[WARNING] STRUCTURE compliance is 75% (recommended: 80%+)",
    "[CRITICAL] OBLIGATION compliance is 45% - Missing mandatory obligations"
  ]
}
```

### Get Compliance Report
```bash
GET /api/templates/:templateId/compliance
```

**Response**:
```json
{
  "success": true,
  "templateId": "CUSTOM_PSUR_V1",
  "audit": {
    "overallComplianceScore": 87,
    "warnings": [
      {
        "level": "WARNING",
        "category": "STRUCTURE",
        "message": "STRUCTURE compliance is 75%",
        "remediation": "Add mandatory section Executive Summary",
        "impact": "Template coverage is incomplete"
      }
    ],
    "layerResults": {
      "sectionStructure": {
        "score": 75,
        "missingSections": ["EXEC_SUMMARY"],
        "recommendations": [...]
      }
    }
  },
  "cached": true
}
```

## UI Display

The `ComplianceReport` component displays:

1. **Overall Score Card**
   - Score 0-100 with color coding
   - Badge: Excellent (80+) / Acceptable (50-80) / Needs Improvement (<50)
   - Count of Critical/Warning/Passed checks

2. **Warnings Section**
   - Critical warnings in red alert boxes
   - Standard warnings in default alert boxes
   - Each shows: message, remediation, impact

3. **7-Layer Tabs**
   - Individual score for each layer
   - Progress bar visualization
   - Top 5 recommendations per layer

4. **Recommendations List**
   - Top 10 actionable recommendations
   - Checkmark icons for easy scanning

## Key Design Decisions

### 1. Non-Blocking by Design
- **Never fails** template validation
- **Always saves** template to database
- **Warnings only** - user decides if acceptable

**Rationale**: Users may have valid reasons for custom templates that don't match exact MDCG structure (e.g., company-specific extensions, UKCA requirements)

### 2. Permissive + Audit Pattern
- **Permissive schema** allows custom fields (via `.passthrough()`)
- **Compliance audit** flags gaps without blocking
- **Best of both worlds**: Flexibility + visibility

### 3. Score-Based Reporting
- **0-100 scale** easy to understand
- **80% threshold** recommended (not enforced)
- **Layer breakdown** shows exactly where to improve

### 4. Cached Results
- Audit stored in `complianceAudit` JSONB column
- Re-runs only on template update or explicit request
- Fast retrieval for dashboards

## Example Compliance Report

```json
{
  "templateId": "COMPREHENSIVE_PSUR",
  "overallComplianceScore": 92,
  "layerResults": {
    "sectionStructure": { "score": 95 },
    "obligationCoverage": { "score": 100 },
    "requiredTables": { "score": 85 },
    "evidenceTypes": { "score": 90 },
    "calculationRules": { "score": 80 },
    "narrativeConstraints": { "score": 88 },
    "dependencies": { "score": 100 }
  },
  "warnings": [
    {
      "level": "WARNING",
      "category": "TABLE",
      "message": "TABLE compliance is 85% (recommended: 80%+)",
      "remediation": "Add table TABLE_UCL_ANALYSIS for obligation ANNEX_I_14",
      "impact": "Template coverage is incomplete"
    }
  ],
  "recommendations": [
    "Add table TABLE_UCL_ANALYSIS for complaint trend analysis",
    "Add calculation 'Upper Control Limit' (mean + (3 * stddev))",
    "Document narrative constraint MUST_CONCLUDE for benefit-risk"
  ]
}
```

## Files Modified

### New Files
- `server/src/services/annexIComplianceAuditor.ts` (510 lines)
- `client/src/components/ComplianceReport.tsx` (300 lines)
- `migrations/0009_add_compliance_audit_column.sql`
- `.agent/artifacts/annex_i_compliance_auditor_implementation.md`

### Modified Files
- `shared/schema.ts` - Added `complianceAudit` column to `templates` table
- `server/src/services/templateManagementService.ts`:
  - Import `createAnnexIComplianceAuditor`
  - Run audit after grounding (EU_MDR only)
  - Pass audit to `saveTemplate()`
  - Add audit to return type
- `server/src/templateRoutes.ts`:
  - New `GET /api/templates/:templateId/compliance` endpoint
  - Include audit summary in process response

## Testing

### Manual Testing Steps

1. **Upload Custom Template**
```bash
curl -X POST http://localhost:5000/api/templates/process \
  -F "template=@custom_template.json"
```

2. **Check Compliance**
```bash
curl http://localhost:5000/api/templates/CUSTOM_PSUR/compliance
```

3. **Verify Warnings**
- Check response `warnings` array
- Verify non-blocking (template still saved)
- Confirm score calculation

### Expected Behaviors

✅ Template with full Annex I coverage → 90%+ score, minimal warnings
✅ Minimal template (min requirements only) → 60-80% score, moderate warnings
✅ Template missing mandatory obligations → <50% score, CRITICAL warnings
✅ All templates save successfully regardless of score

## Future Enhancements

1. **LLM-Powered Deep Analysis**
   - Use LLM to analyze narrative quality
   - Check if constraint statements actually present in text
   - Validate calculation formulas

2. **Annex II/III/IV Integration**
   - Extend auditor to validate Annex II table schemas
   - Check Annex III presentation rules
   - Validate Annex IV device requirements

3. **Auto-Fix Suggestions**
   - Generate template patches to fix gaps
   - Suggest slot additions with pre-filled config

4. **Compliance Trends**
   - Track score over time as template evolves
   - Dashboard of compliance across all templates

5. **Export Compliance Report**
   - PDF generation of full audit
   - Include in regulatory submission package

## Conclusion

The Annex I Compliance Auditor provides **transparency** without **restrictions**. Users can upload any template that meets minimum requirements, then receive detailed feedback on how to improve compliance with MDCG 2022-21 standards.

This approach balances:
- ✅ **Flexibility** - Custom templates allowed
- ✅ **Visibility** - Clear gap identification  
- ✅ **Guidance** - Actionable recommendations
- ✅ **Non-blocking** - Never prevents workflow

**Result**: Users have full control while the system provides expert regulatory guidance.
