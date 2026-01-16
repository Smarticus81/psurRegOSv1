# PSUR Wizard User Workflow

This document describes the complete user workflow for creating a PSUR (Periodic Safety Update Report) using the PSUR Wizard, from initial case creation through document generation.

---

## Overview

The PSUR Wizard is a 4-step guided workflow that helps users:
1. **Create** a new PSUR case with regulatory parameters
2. **Upload** evidence documents using AI-powered extraction or manual mapping
3. **Review** evidence coverage and completeness
4. **Compile** the final PSUR document with optional AI narrative generation

---

## Step 1: Create Case

### Purpose
Configure the regulatory foundation for your PSUR report, including template selection, jurisdictions, device identification, and reporting period.

### User Actions

#### 1.1 Template Selection
- **Default**: MDCG 2022-21 Annex I (EU MDR template)
- The template is pre-selected and displayed as a read-only card
- This determines which evidence types are required for the PSUR

#### 1.2 Jurisdiction Selection
- Select one or more regulatory jurisdictions:
  - **EU MDR** - European Union Medical Device Regulation
  - **UK MDR** - United Kingdom Medical Device Regulation
- Click checkboxes to toggle jurisdictions
- Multiple jurisdictions can be selected for multi-market reports

#### 1.3 Device Selection
- **If devices are registered**: Select from dropdown list showing device codes
- **If no devices registered**: Enter device code manually in text input
- The selected device becomes the "leading device" for this PSUR case

#### 1.4 Reporting Period
- **Period Start**: Select start date (YYYY-MM-DD format)
- **Period End**: Select end date (YYYY-MM-DD format)
- The period defines the time range for evidence collection

#### 1.5 Create Case
- Click **"Create PSUR Case"** button
- System generates a unique PSUR reference (e.g., `PSUR-MKFMFSHA`)
- Case is saved to database with status "draft"
- Wizard automatically advances to **Step 2: Upload**

### Resume Existing Case
If you have previously started a case but didn't complete it:

1. Scroll to **"Resume Draft"** section (appears below Create button)
2. View list of draft cases with:
   - PSUR Reference number
   - Device code
   - Reporting period dates
   - Selected jurisdictions
   - Creation date
3. Click on any draft case to resume
4. System loads all previous configuration and evidence
5. Wizard advances to **Step 2** with existing data intact

### What Happens Behind the Scenes
- Case record created in database with unique ID
- Template requirements fetched (list of required evidence types)
- Evidence atom counts initialized (all zeros)
- Case status set to "draft" for resumability

---

## Step 2: Upload Evidence

### Purpose
Upload and extract evidence from source documents. The system supports two upload methods: **AI-Powered Document Ingestion** (recommended) and **Advanced Manual Upload**.

### Overview Stats
The top of Step 2 displays three key metrics:
- **Evidence Atoms**: Total number of evidence records created
- **Coverage**: Percentage of required evidence types that have data
- **Missing Types**: Count of required evidence types still without data

### Method 1: Upload Documents (AI-Powered)

#### 2.1 Open Upload Panel
- Click the **"Upload Documents"** card (left side)
- Modal opens with **Evidence Ingestion Panel**

#### 2.2 Select Source Type
Choose one of 8 high-level document categories:
- **CER** - Clinical Evaluation Reports (DOCX, PDF)
- **Sales** - Sales and distribution data (Excel, CSV, JSON)
- **Complaints** - Customer complaints and feedback (Excel, CSV, JSON, DOCX)
- **FSCA** - Field Safety Corrective Actions (Excel, CSV, JSON, DOCX)
- **PMCF** - Post-Market Clinical Follow-up (DOCX, PDF, Excel)
- **Risk** - Risk Management documents (DOCX, PDF, Excel)
- **CAPA** - Corrective and Preventive Actions (Excel, CSV, DOCX)
- **Admin** - Administrative data (Excel, CSV, JSON, PDF)

#### 2.3 Upload Files
- **Drag and drop** files onto the upload zone, or
- **Click "browse"** to select files from your computer
- Multiple files can be uploaded simultaneously
- Supported formats depend on source type (see above)

#### 2.4 AI Extraction Process
When you click **"Extract Evidence from X File(s)"**:

1. **Document Parsing**
   - Files are parsed to extract structure (tables, sections, text)
   - Excel/CSV: Headers and rows identified
   - DOCX/PDF: Sections and content blocks extracted

2. **SOTA LLM Analysis** (Claude Sonnet 4.5)
   - Column headers analyzed semantically
   - Sample data patterns examined
   - Intelligent field mapping inferred
   - Evidence type determined based on source type + content

3. **Evidence Extraction**
   - Each row/section becomes an evidence atom
   - Fields mapped to canonical evidence schema
   - Confidence scores assigned (0.0 - 1.0)
   - Duplicate detection (same content hash = skipped)

4. **Results Display**
   - Shows extracted evidence count per file
   - Lists evidence types identified
   - Displays confidence scores
   - Highlights any warnings or unmapped fields

#### 2.5 Review and Select Evidence
- Review extracted evidence items
- Toggle checkboxes to select/deselect items
- System shows which evidence types will be created
- Click **"Create Evidence Atoms"** to save selected items

#### 2.6 Evidence Atoms Created
- Selected evidence is saved to database
- Each atom gets:
  - Unique atom ID
  - Content hash (SHA-256) for deduplication
  - Full provenance (source file, extraction date, device, period)
  - Normalized data fields
- Modal closes automatically
- Evidence grid updates to show new counts

### Method 2: Advanced Upload (Manual)

#### 2.1 Open Advanced Upload
- Click the **"Advanced Upload"** card (right side)
- Modal opens with manual upload form

#### 2.2 Select Evidence Type
- Choose specific evidence type from dropdown:
  - `sales_volume`
  - `complaint_record`
  - `fsca_record`
  - `capa_record`
  - `pmcf_result`
  - `benefit_risk_assessment`
  - `device_registry_record`
  - And other granular types

#### 2.3 Upload Structured File
- Select file (Excel or CSV)
- File must have column headers matching expected fields
- System analyzes file structure

#### 2.4 Column Mapping (If Needed)
- If auto-mapping fails or needs adjustment:
  - System shows source columns vs. target fields
  - Manual mapping interface appears
  - Drag or select to map columns
  - Can save mapping as profile for reuse

#### 2.5 Upload and Parse
- Click **"Upload & Parse"**
- System creates evidence atoms directly from file
- No AI extraction - direct field mapping
- Results shown in toast notification

### Evidence Status Grid

The bottom section of Step 2 shows a live grid of all required evidence types:

- **Green cards** = Evidence type has data (ready)
- **Amber/Slate cards** = Evidence type missing (needs upload)
- Each card shows:
  - Evidence type name (formatted)
  - Count of atoms for that type
  - Status badge ("Ready" or "Missing")

### Navigation
- Click **"Refresh"** button to update counts after uploads
- Use **"Next"** button to proceed to Step 3 (only enabled when case exists)
- Can go back to Step 1 to modify case configuration

---

## Step 3: Review

### Purpose
Verify evidence completeness before compilation. Ensure all mandatory evidence types have data.

### Coverage Statistics
Four metric cards display:
- **Total Atoms**: Sum of all evidence records
- **Types Covered**: Number of required types with data
- **Types Missing**: Number of required types without data
- **Status**: "Ready" (all types covered) or "Incomplete" (missing types)

### Evidence Type Grid
- Visual grid showing all required evidence types
- **Green cards** = Has data (count shown)
- **Red cards** = Missing data (shows "-")
- Click to see details (if implemented)

### Missing Types Alert
If any required types are missing:
- Amber alert box appears at bottom
- Lists missing types (first 5, then "+X more")
- User should return to Step 2 to upload missing evidence

### Navigation
- **"Next"** button enabled only when all required types have data
- Can go back to Step 2 to add more evidence
- Can go back to Step 1 to modify case settings

---

## Step 4: Compile

### Purpose
Execute the PSUR generation workflow. This step orchestrates evidence processing, slot proposal, adjudication, and document rendering.

### Pre-Compilation

#### 4.1 Case Summary
Four summary cards show:
- **Case ID**: PSUR case number
- **Template**: Selected template name
- **Jurisdictions**: Selected regulatory markets
- **Atoms**: Total evidence atoms collected

#### 4.2 AI Narrative Generation Toggle
- Toggle switch: **"AI Narrative Generation"**
- **ON**: Claude Sonnet generates narrative text for PSUR sections
- **OFF**: Uses template placeholders and data only
- Badge shows "Claude Sonnet" when enabled

### Compilation Process

#### 4.3 Start Compilation
Click **"Compile PSUR Document"** button to begin.

#### 4.4 Runtime Pipeline Visualization
The system displays a horizontal pipeline showing workflow steps:

1. **Ingest Evidence** - Loads all evidence atoms for the case
2. **Propose Slots** - AI proposes content for each template slot
3. **Adjudicate** - Validates and accepts/rejects proposals
4. **Render Document** - Generates final DOCX and Markdown files
5. **Export Trace** - Creates audit trail (JSONL format)
6. **Generate Audit Bundle** - Packages all artifacts

Each step shows:
- **Green checkmark** = Completed successfully
- **Red X** = Failed (error message shown)
- **Blue spinner** = Currently running
- **Gray number** = Pending

#### 4.5 Trace Metrics
During/after compilation, metrics display:
- **Events**: Total workflow events logged
- **Accepted**: Number of slot proposals accepted
- **Rejected**: Number of slot proposals rejected
- **Chain**: Validation status ("Valid" or "Invalid")

### Success State

#### 4.6 Download Options
When compilation completes successfully:

- **Download DOCX**: Full PSUR document in Word format
- **Download Markdown**: PSUR in Markdown format
- **Audit Bundle**: ZIP file containing:
  - PSUR document
  - Evidence atoms export
  - Decision trace log
  - Template configuration
- **Trace Log**: JSONL file with complete workflow audit trail

#### 4.7 Start New PSUR
- Click **"Start New PSUR"** button
- Resets wizard to Step 1
- Clears all state
- User can begin a new case

---

## Key Features

### Resume Capability
- All cases saved as "draft" can be resumed later
- Evidence atoms persist across sessions
- Case configuration preserved
- No data loss on disconnect

### AI-Powered Extraction
- **Claude Sonnet 4.5** for semantic understanding
- Handles unusual column names (e.g., "units_shipped_q4" → "quantity")
- Infers evidence types from content
- Provides confidence scores for transparency
- Falls back to rule-based matching if LLM unavailable

### Evidence Type Mapping
- **8 High-Level Inputs**: CER, Sales, Complaints, FSCA, PMCF, Risk, CAPA, Admin
- **Granular Evidence Types**: System extracts specific types (e.g., `sales_volume`, `complaint_record`)
- **Automatic Routing**: Source type selection forces correct evidence type (prevents misclassification)

### Data Integrity
- **Immutable Atoms**: Once created, evidence atoms cannot be modified
- **Content Hashing**: SHA-256 hashes prevent duplicates
- **Full Provenance**: Every atom tracks source file, extraction date, device, period
- **Audit Trail**: Complete workflow trace for regulatory compliance

---

## Workflow Tips

### Best Practices

1. **Prepare Documents First**
   - Ensure files have proper headers/columns
   - Use consistent date formats (YYYY-MM-DD)
   - Include device codes/identifiers in all files

2. **Upload by Source Type**
   - Group related documents (e.g., all sales files together)
   - Use "Upload Documents" for bulk ingestion
   - Use "Advanced Upload" for specific evidence types

3. **Monitor Coverage**
   - Check Step 3 regularly to see missing types
   - Upload missing evidence before compilation
   - Review evidence counts to ensure completeness

4. **Review Extraction Results**
   - Check confidence scores in extraction results
   - Verify field mappings are correct
   - Re-upload if extraction quality is low

5. **Save Progress**
   - Cases auto-save as "draft"
   - Can close browser and resume later
   - No need to complete in one session

### Common Issues

- **"Missing Types" in Step 3**: Upload documents for those evidence types in Step 2
- **Low Confidence Scores**: Check file format and column headers match expected fields
- **Duplicate Atoms**: System automatically skips duplicates (same content hash)
- **Extraction Fails**: Verify file format is supported for selected source type

---

## Technical Details

### Evidence Atom Structure
Each evidence atom contains:
```typescript
{
  atomId: string,              // Unique identifier
  evidenceType: string,        // Canonical type (e.g., "sales_volume")
  normalizedData: object,      // Structured data fields
  contentHash: string,         // SHA-256 for deduplication
  provenance: {
    sourceFile: string,        // Original filename
    extractDate: string,       // ISO timestamp
    uploadedAt: string,       // Upload timestamp
    deviceRef: { deviceCode }, // Device identifier
    psurPeriod: { periodStart, periodEnd } // Reporting period
  }
}
```

### Workflow Steps (Backend)
1. **Ingest Evidence**: Queries evidence atoms for case
2. **Propose Slots**: LLM generates proposals for each template slot
3. **Adjudicate**: Validates proposals against rules
4. **Render**: Generates DOCX using template engine
5. **Export Trace**: Creates audit log
6. **Bundle**: Packages all artifacts

### Supported File Formats
- **Excel**: `.xlsx`, `.xls` (tables extracted)
- **CSV**: `.csv` (comma-separated values)
- **Word**: `.docx` (sections and tables extracted)
- **PDF**: `.pdf` (text and structure extracted)
- **JSON**: `.json` (structured data)

---

## Next Steps After Compilation

1. **Review Generated PSUR**: Download and review DOCX document
2. **Verify Content**: Check that all sections are populated correctly
3. **Audit Trail**: Review trace log for compliance
4. **Submit**: Use generated document for regulatory submission
5. **Archive**: Save audit bundle for records

---

## Support

For detailed information on:
- **Input Data Requirements**: See `docs/INPUT_DATA_REQUIREMENTS.md`
- **Evidence Type Definitions**: See Admin page → Evidence Types tab
- **Source Mapping Configuration**: See Admin page → Source Mappings tab
- **Template Structure**: See `server/templates/MDCG_2022_21_ANNEX_I.json`
