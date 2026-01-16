# RegulatoryOS PSUR Engine - Complete System Explainer

**Video Duration**: ~25-30 minutes  
**Target Audience**: Medical device manufacturers, regulatory affairs professionals, quality assurance teams

---

## Opening Scene (0:00 - 1:30)

### Visual: Animated logo reveal, modern UI showcase

**Narrator**:

"Welcome to RegulatoryOS PSUR Engine - the world's first fully automated, AI-powered Periodic Safety Update Report generation system for medical devices.

In the highly regulated medical device industry, manufacturers must submit Periodic Safety Update Reports - or PSURs - to regulatory authorities like the European Union's Medical Device Regulation authority. These reports are comprehensive safety assessments that analyze post-market surveillance data, adverse events, field safety corrective actions, and clinical evidence.

Traditionally, creating a PSUR takes weeks or even months. Regulatory teams must manually gather data from dozens of sources, analyze thousands of records, ensure every claim is traceable to evidence, and format everything according to strict regulatory templates.

RegulatoryOS changes everything. What once took months now takes minutes. What required manual copy-paste now happens automatically. What was error-prone is now verified by AI agents and cryptographic hash chains.

Let's explore how it works."

---

## Part 1: System Architecture Overview (1:30 - 3:00)

### Visual: High-level architecture diagram zooming in on components

**Narrator**:

"RegulatoryOS is built on three foundational pillars:

**First: The Evidence Foundation**. Every statement in your PSUR must be traceable to real evidence. The system ingests documents from multiple sources - sales data, complaint logs, Field Safety Corrective Actions, Clinical Evaluation Reports, Post-Market Clinical Follow-up studies, and more. AI agents parse these documents, extract structured data, and create evidence atoms - immutable, granular pieces of evidence stored in a PostgreSQL database.

**Second: The Template Engine**. RegulatoryOS supports multiple regulatory templates - the EU MDR MDCG 2022-21 Annex I template, the FormQAR-054 template, and custom company templates. Each template defines the required sections, data points, and regulatory obligations that must be satisfied.

**Third: The AI Agent Orchestra**. When you run a PSUR workflow, ephemeral AI agents spawn dynamically. These agents select relevant evidence, generate narrative content, populate tables, validate regulatory compliance, and ensure every word is backed by traceable evidence. Every decision is logged to a cryptographic hash chain for complete auditability.

Now let's see it in action."

---

## Part 2: Initial Setup - Company Configuration (3:00 - 6:00)

### Visual: Screen recording of Admin page

**Narrator**:

"Before generating your first PSUR, you'll configure your company and devices in the Admin panel.

**Company Setup**:
Navigate to the Admin page. Here you'll register your company information - legal name, address, authorized representative for EU MDR, UK Responsible Person if applicable, and contact details. This information will automatically populate administrative sections of your PSUR.

**Device Registration**:
Next, register your medical devices. For each device, you'll enter:
- Device code (internal reference)
- Device identification number (UDI-DI for EU MDR)
- Device name and intended use
- Classification (Class I, IIa, IIb, III)
- CE mark date and Notified Body information
- Markets where the device is sold

The system stores this in the database and makes it available for PSUR generation.

**Template Configuration**:
RegulatoryOS comes with two built-in templates:
1. **MDCG 2022-21 Annex I** - The official EU MDR PSUR template
2. **FormQAR-054** - An alternative structured format

You can also upload custom templates. Templates are JSON files that define:
- Section structure and hierarchy
- Required slots (narrative sections, tables, metrics)
- Evidence requirements per slot
- Regulatory obligations that must be satisfied
- Rendering instructions (markdown, Word format)

Each template undergoes a qualification process. The system checks that every regulatory obligation referenced in the template exists in the Global Regulatory Knowledge Base - our database of EU MDR, UK MDR, and FDA requirements. If the template is valid, you'll see a green checkmark. If there are issues, you'll see specific error messages.

**Global Regulatory Knowledge Base (GRKB)**:
Behind the scenes, RegulatoryOS maintains a comprehensive database of regulatory obligations. Each obligation has:
- A unique ID (e.g., 'EU_MDR_ART86_COVERAGE')
- The regulation source (EU MDR Article 86, MDCG guidance, etc.)
- A description of what's required
- Constraint rules (e.g., 'requires_field_safety_data: true')

When you run a PSUR, the system cross-references your template against the GRKB to ensure regulatory compliance."

---

## Part 3: PSUR Wizard - Step 1: Create Case (6:00 - 8:00)

### Visual: Screen recording of PSUR Wizard, Step 1

**Narrator**:

"Now let's create a PSUR. Navigate to the PSUR Wizard.

**Step 1: Create PSUR Case**

You'll see a clean, modern interface designed for efficiency. The wizard guides you through four steps, and every step is designed to fit in a single view - no scrolling required.

**Template Selection**:
First, select your template. You'll see visual cards for each available template:
- MDCG 2022-21 Annex I (EU MDR official template)
- FormQAR-054 (Alternative format)

Let's select MDCG 2022-21 Annex I for this demonstration.

**Device Information**:
Enter your device code - let's use 'JS3000X'. The system looks up this device in your registry and auto-fills the device ID.

**Jurisdictions**:
Select the regulatory jurisdictions for this PSUR. You can choose:
- EU_MDR (European Union Medical Device Regulation)
- UK_MDR (United Kingdom Medical Device Regulation)
- FDA_510K (US FDA 510(k) pathway)
- FDA_PMA (US FDA Premarket Approval)

Let's select EU_MDR.

**Reporting Period**:
Define the reporting period. EU MDR typically requires annual PSURs for Class III devices, every two years for Class IIb, and longer intervals for lower classes. Let's set:
- Period Start: 2024-01-01
- Period End: 2024-12-31

**Create Case**:
Click 'Create PSUR Case'. The system:
1. Validates your inputs
2. Checks template availability
3. Runs template qualification against GRKB
4. Creates a database record for your PSUR case
5. Generates a unique PSUR reference (e.g., 'PSUR-2024-JS3000X-001')
6. Initializes the decision trace chain
7. Returns your PSUR Case ID

You'll see a success message: 'PSUR Case ID: 42 (PSUR-2024-JS3000X-001)'. This ID is used throughout the workflow to track all evidence, decisions, and outputs."

---

## Part 4: PSUR Wizard - Step 2: Upload Documents (8:00 - 14:00)

### Visual: Screen recording of Step 2 with AI Document Ingestion

**Narrator**:

"**Step 2: Upload Documents**

This is where the magic begins. You'll upload the source documents that contain your evidence. The system needs specific evidence types based on your template. For MDCG Annex I, you'll see requirements for:

- Sales and distribution data
- Complaint records
- Serious incident reports
- Field Safety Corrective Actions (FSCAs)
- Corrective and Preventive Actions (CAPA)
- Post-Market Clinical Follow-up (PMCF) data
- Clinical literature
- Risk management updates

At the top of the screen, you'll see four real-time statistics:
- **Total Atoms**: Total evidence atoms created
- **Types Covered**: How many required evidence types have data
- **Types Missing**: How many required types still need data
- **Status**: 'Ready' when all required types are present, 'Incomplete' otherwise

You have three ways to populate evidence:

---

**Option 1: AI Document Ingestion**

Click the 'AI Document Ingestion' button. A modal opens with a beautiful, modern interface.

**Source Type Selection**:
The system supports multiple document sources:
- Sales Data (Excel, CSV, JSON)
- Complaints (Excel, CSV, DOCX)
- FSCA Reports (Excel, CSV, JSON)
- CAPA Records (Excel, CSV, DOCX)
- PMCF Studies (Word documents)
- Literature (Word documents, PDFs)
- Clinical Evaluation Reports (Word, PDF)
- Risk Management Files

Select 'Complaints Data' for this example.

**Drag and Drop Upload**:
Drag your complaints file - let's say 'Complaints_2024.xlsx' - into the upload zone. You can also browse to select files. The system accepts:
- Excel files (.xlsx, .xls)
- CSV files
- Word documents (.docx)
- PDF files
- JSON files

Once uploaded, you'll see the file listed with its size.

**Click 'Extract Evidence'**:

Now watch the AI agents in action:

1. **FormatDetectionAgent** analyzes the file:
   - Detects it's an Excel file with 3 sheets
   - Identifies 'Complaints_Log' sheet as the primary data source
   - Detects tabular structure with headers in row 1
   - Confidence: 99%

2. **ExcelParserAgent** parses the spreadsheet:
   - Reads all rows from 'Complaints_Log' sheet
   - Extracts 247 rows of data
   - Identifies 12 columns

3. **ComplaintsExtractionAgent** takes over:
   - Analyzes column headers
   - Maps columns to the complaint evidence schema:
     - 'Complaint ID' → complaint_id (confidence: 100%)
     - 'Date Received' → received_date (confidence: 100%)
     - 'Customer Description' → description (confidence: 95%)
     - 'Issue Type' → complaint_type (confidence: 92%)
   
   For ambiguous columns, the agent uses semantic similarity and LLM assistance:
   - 'Cust Feedback' → description or notes?
   - The LLM analyzes sample values and determines it's additional 'notes'
   - Confidence: 87% - flagged for user review

**Mapping Tool**:
A sophisticated mapping interface appears showing:
- **Left Column**: Source columns from your file
- **Right Column**: Target fields in the evidence schema
- **Auto-mapped items**: Green checkmarks with confidence scores
- **Ambiguous items**: Yellow warning icons - you can confirm or adjust
- **Unmapped items**: Red X icons - you must select target field

For 'Cust Feedback', you see:
- Suggested mapping: 'notes' (87% confidence)
- Alternative: 'description' (42% confidence)
- You can drag to remap or confirm the suggestion

You confirm all mappings.

4. **LLM Classification**:
   For each complaint record, the ComplaintsExtractionAgent invokes an LLM to classify:
   - **Severity**: CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL
   - **Is Adverse Event?**: Boolean
   - **Is Serious Incident?**: Boolean (per EU MDR definition)

   Example for Complaint C-2024-0042:
   - Description: "Device alarm did not sound during procedure"
   - LLM reasoning: "Device malfunction during use with potential patient risk. No injury occurred but could have led to delayed treatment."
   - Classification: MEDIUM severity, Not an adverse event, Not a serious incident
   - Confidence: 91%

5. **NormalizationAgent** standardizes the data:
   - Converts dates to ISO format
   - Normalizes text fields (removes extra whitespace, fixes encoding)
   - Applies consistent capitalization to categorical fields
   - Generates unique atom IDs (ATOM-CMPL-2024-001, ATOM-CMPL-2024-002, ...)

6. **ValidationAgent** checks data quality:
   - Verifies all required fields are present
   - Checks date ranges fall within reporting period
   - Identifies duplicate records
   - Flags anomalies (e.g., future dates, invalid IDs)

7. **Evidence Atoms Created**:
   247 evidence atoms are inserted into the database, each with:
   - Unique atom ID
   - Evidence type: 'complaint_record'
   - PSUR case ID: 42
   - Source file: 'Complaints_2024.xlsx'
   - Extraction metadata (agent ID, confidence, timestamp)
   - Normalized data (structured JSON)
   - Raw data (original values for audit)

**Extraction Summary**:
You'll see a beautiful results panel showing:
- File name: 'Complaints_2024.xlsx'
- Evidence count: 247 items
- High confidence: 223 (90.3%)
- Medium confidence: 22 (8.9%)
- Low confidence: 2 (0.8%)
- Warnings: 2 (duplicate records detected)

You can review individual items, select which to include, and see the LLM's reasoning for classifications.

**Every single step is logged to the decision trace**:
- FORMAT_DETECTED: Excel file identified
- PARSING_COMPLETED: 247 rows parsed
- FIELD_MAPPING_RESOLVED: 12 mappings confirmed
- LLM_INVOKED: 247 classification calls
- SEVERITY_CLASSIFIED: Each with reasoning
- ATOM_CREATED: 247 atoms stored
- INGESTION_COMPLETED: Total time, total atoms

---

**Option 2: Manual Upload**

Click 'Manual Upload'. A modal opens.

This is for pre-structured data files where you know exactly which evidence type you're uploading.

**Evidence Type Selection**:
You'll see a visual grid of all required evidence types, organized by category:
- **Safety Data**: Complaints, Incidents, FSCAs
- **Quality Data**: CAPA, Nonconformities
- **Clinical Data**: PMCF, Literature, CER
- **Commercial Data**: Sales, Distribution

Each card shows:
- An icon representing the type
- The evidence type name
- Current atom count (with green checkmark if data exists)
- Category label

Click 'FSCA Records' to select it.

**File Upload**:
Upload your FSCA spreadsheet. The system:
- Reads the file
- Maps columns (simpler than AI ingestion since you specified the type)
- Creates evidence atoms
- Updates the count

No LLM classification needed for FSCAs since the data is already structured.

---

**Option 3: Load Sample Data**

For testing or demonstration, click 'Load Sample Data'.

The system automatically generates realistic sample evidence for ALL required types:
- 156 sales records across EU regions
- 247 complaint records (mix of severities)
- 12 serious incidents
- 8 FSCAs with corrective actions
- 23 CAPA records
- 3 PMCF studies with 450 patient records
- 18 literature references
- Risk assessment data
- Clinical evaluation summaries

All samples are deterministically generated to be realistic and coherent. Within seconds, your evidence is populated.

---

**Real-Time Evidence Grid**:

As you upload documents, the evidence type grid updates in real-time. Each evidence type card shows:
- Icon and name
- Atom count (e.g., '247' for complaints)
- Status indicator (green checkmark when populated)
- Category color-coding

At the bottom, the summary updates:
- Total atoms: 1,024
- Types covered: 12/12
- Types missing: 0
- Status: Ready ✓

Once all required evidence types have data, the 'Next Step' button activates."

---

## Part 5: PSUR Wizard - Step 3: Review Evidence (14:00 - 16:00)

### Visual: Screen recording of Step 3

**Narrator**:

"**Step 3: Review Evidence**

Before compiling the PSUR, you'll review what evidence is available.

The system displays:

**Evidence Summary Table**:
- Complaint Records: 247 atoms
- Serious Incidents: 12 atoms
- FSCA Records: 8 atoms
- CAPA Records: 23 atoms
- Sales Data: 156 atoms
- PMCF Data: 450 atoms (3 studies)
- Literature: 18 atoms
- Risk Data: 1 atom (current risk assessment)

Each row shows:
- Evidence type
- Atom count
- Status indicator (green if > 0, red if missing)

**Missing Evidence Check**:
If any required evidence types are missing, you'll see a warning:
'⚠️ Missing required evidence types: incident_report'

You cannot proceed until all required types are present. You'd need to go back to Step 2 and upload the missing data.

In our case, everything is green:
'✓ All required evidence types are present.'

**Evidence Quality Indicators**:
The system also shows quality metrics:
- Confidence distribution: 92% high, 7% medium, 1% low
- Date coverage: 100% within reporting period
- Duplicate warnings: 2 potential duplicates flagged
- Validation issues: 0

Click 'Next Step' to proceed to compilation."

---

## Part 6: PSUR Wizard - Step 4: Compile PSUR (16:00 - 21:00)

### Visual: Screen recording of Step 4 with animated workflow

**Narrator**:

"**Step 4: Compile PSUR + Export Audit Bundle**

This is where the AI orchestration happens.

**Pre-Run Summary**:
You'll see a summary of what's about to be generated:
- Case: #42 (PSUR-2024-JS3000X-001)
- Template: MDCG_2022_21_ANNEX_I
- Jurisdictions: EU_MDR
- Period: 2024-01-01 → 2024-12-31
- Evidence atoms: 1,024

**Click 'Run PSUR Workflow'**:

The orchestrator initiates an 8-step workflow. You'll see real-time progress for each step:

---

**Step 1: Qualify Template**

Status: RUNNING → COMPLETED (2.3s)

The system:
1. Loads the template JSON
2. Runs strict schema validation using Zod
3. Checks that all slot IDs are unique
4. Verifies every slot has a mapping to regulatory obligations
5. Queries the GRKB to ensure all referenced obligations exist
6. Checks evidence requirements are logical (e.g., required slots have min_atoms ≥ 1)
7. Logs: TEMPLATE_QUALIFIED

Result: Template 'MDCG_2022_21_ANNEX_I' qualified, 45 slots, 23 regulatory obligations, 0 errors

---

**Step 2: Create/Confirm Case**

Status: RUNNING → COMPLETED (0.8s)

The system:
1. Confirms the PSUR case exists (ID: 42)
2. Updates case metadata with template ID and version
3. Logs: CASE_CREATED

Result: Case #42 confirmed

---

**Step 3: Ingest Evidence**

Status: RUNNING → COMPLETED (0.3s)

This step is already complete since you uploaded evidence in Step 2 of the wizard.

The system:
1. Verifies all evidence atoms are linked to case ID 42
2. Checks for negative evidence (types with 0 records but valid for period)
3. Creates negative evidence atoms where appropriate

Example: If you had zero FSCAs during the period (which is good!), the system creates:
- Atom ID: ATOM-NEG-FSCA-2024-001
- Evidence type: fsca_record
- Normalized data: { count: 0, period: '2024-01-01 to 2024-12-31', isNegativeEvidence: true, justification: 'No Field Safety Corrective Actions were issued during the reporting period.' }
- Logs: NEGATIVE_EVIDENCE_CREATED

This ensures the PSUR can say "0 FSCAs during period" with traceable evidence, rather than having a trace gap.

Result: 1,024 evidence atoms confirmed, 3 negative evidence atoms created

---

**Step 4: Build Queue & Propose Slots**

Status: RUNNING → COMPLETED (8.7s)

This is where deterministic generators create slot proposals.

For each of the 45 slots in the template:

1. **Read Slot Definition**:
   - Slot ID: MDCG.ANNEXI.COMPLAINTS_SUMMARY
   - Title: "Summary of Complaints"
   - Required types: ['complaint_record']
   - Min atoms: 1
   - Slot kind: NARRATIVE

2. **Query Evidence**:
   - Fetch all atoms with type 'complaint_record' and case_id = 42
   - Found: 247 atoms

3. **Generate Proposal**:
   - Proposal ID: PROP-2024-001
   - Slot ID: MDCG.ANNEXI.COMPLAINTS_SUMMARY
   - Status: READY (evidence available)
   - Required types: ['complaint_record']
   - Evidence atom IDs: [ATOM-CMPL-2024-001, ATOM-CMPL-2024-002, ..., ATOM-CMPL-2024-247]
   - Method statement: "Analyzed 247 complaint records from Complaints_2024.xlsx covering period 2024-01-01 to 2024-12-31. Data includes complaint IDs, dates, descriptions, severity classifications (LLM-assisted), and outcomes."
   - Claimed obligations: ['EU_MDR_ART86_COMPLAINTS']

4. **Log to Trace**:
   - SLOT_PROPOSED: MDCG.ANNEXI.COMPLAINTS_SUMMARY, status=READY
   - Evidence atoms: 247 linked

For slots where evidence is missing:
- Slot ID: MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE
- Required types: ['incident_report']
- Evidence atoms: 0 (but negative evidence exists)
- Status: READY (negative evidence allowed)
- Method statement: "No serious incidents occurred during reporting period. Negative evidence atom ATOM-NEG-INC-2024-001 confirms zero incidents."

For slots with true gaps:
- If a required type has NO evidence and negative evidence is not applicable, the status is TRACE_GAP
- Logs: TRACE_GAP_DETECTED
- The user would be alerted and must resolve before proceeding

Result: 45 slot proposals created, 42 READY, 3 with negative evidence, 0 trace gaps

---

**Step 5: Adjudicate Proposals**

Status: RUNNING → COMPLETED (1.2s)

The adjudication engine auto-evaluates each proposal using rules:

**Rule 1: Evidence Presence**
- If status = READY and evidenceAtomIds.length >= min_atoms → ACCEPT
- If status = TRACE_GAP and allow_empty_with_justification = true → ACCEPT with warning
- Otherwise → REJECT

**Rule 2: Claimed Obligations**
- If claimed obligations exist and are valid in GRKB → ACCEPT
- If claimed but invalid → REJECT

**Rule 3: Method Statement**
- If method statement length >= 20 chars → ACCEPT
- If too short → REJECT (insufficient methodology)

**Rule 4: Traceability**
- If narrative or table slot, evidenceAtomIds must exist → ACCEPT
- If admin slot, evidenceAtomIds can be empty → ACCEPT

For each proposal:

Example 1 - ACCEPT:
- Slot: MDCG.ANNEXI.COMPLAINTS_SUMMARY
- Evidence atoms: 247
- Claimed obligations: ['EU_MDR_ART86_COMPLAINTS'] ✓ exists in GRKB
- Method statement: 91 chars ✓
- Decision: ACCEPT
- Logs: SLOT_ACCEPTED

Example 2 - ACCEPT with negative evidence:
- Slot: MDCG.ANNEXI.FSCA_TABLE
- Evidence atoms: 1 (negative evidence ATOM-NEG-FSCA-2024-001)
- Status: READY
- Decision: ACCEPT
- Logs: SLOT_ACCEPTED

Example 3 - REJECT:
- Slot: MDCG.ANNEXI.INVALID_SLOT
- Evidence atoms: 0
- Required: true
- Allow empty: false
- Decision: REJECT
- Reasons: ['Insufficient evidence', 'Required slot cannot be empty']
- Logs: SLOT_REJECTED

Result: 45 slots processed, 43 accepted, 2 rejected, 0 trace gaps

If any critical slots are rejected, the workflow fails and you must resolve issues.

---

**Step 6: Coverage Report**

Status: RUNNING → COMPLETED (0.9s)

The system generates a regulatory obligation coverage report:

For each obligation in the GRKB:
1. Check if any accepted slot claims this obligation
2. If yes → Obligation SATISFIED
3. If no → Obligation UNSATISFIED (warning)

Example:
- Obligation: EU_MDR_ART86_COMPLAINTS
  - Required by: EU_MDR
  - Description: "PSUR must include summary of complaints"
  - Satisfied by: MDCG.ANNEXI.COMPLAINTS_SUMMARY ✓
  - Logs: OBLIGATION_SATISFIED

- Obligation: EU_MDR_ART86_BENEFIT_RISK
  - Required by: EU_MDR
  - Description: "PSUR must include benefit-risk analysis"
  - Satisfied by: MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION ✓
  - Logs: OBLIGATION_SATISFIED

The report shows:
- Total obligations: 23
- Satisfied: 23
- Unsatisfied: 0
- Coverage: 100%

Logs: COVERAGE_COMPUTED

---

**Step 7: Render Document**

Status: RUNNING → COMPLETED (12.4s)

Now the ephemeral AI agents spawn to generate content.

**TemplateInterpreterAgent** initializes:
- Parses template structure
- Creates slot processing queue (respecting dependencies)
- Spawns content generation agents

For each slot:

---

**Example Slot: MDCG.ANNEXI.EXECUTIVE_SUMMARY (Narrative)**

1. **NarrativeWriterAgent** spawns:
   - Agent ID: NarrativeAgent-001
   - Slot: MDCG.ANNEXI.EXECUTIVE_SUMMARY
   - Logs: AGENT_SPAWNED

2. **Evidence Selection**:
   - Queries database for all accepted evidenceAtomIds for this slot
   - Retrieves summary statistics across all evidence types
   - Logs: EVIDENCE_QUERY_COMPLETED (1,024 atoms retrieved)

3. **LLM Content Generation**:
   - Prepares prompt with:
     - Slot title: "Executive Summary"
     - Template guidance: "Provide concise overview of device safety profile"
     - Evidence summary: "247 complaints (2 serious), 8 FSCAs, 23 CAPAs, 156,000 units sold..."
     - Evidence details: Excerpts from key atoms
   
   - Invokes GPT-4-turbo:
     - Model: gpt-4o
     - Temperature: 0.1 (low for factual accuracy)
     - Max tokens: 2000
     - Prompt tokens: 1,850
     - Logs: LLM_INVOKED
   
   - Receives response (1.8s):
     ```
     This Periodic Safety Update Report (PSUR) covers the JS3000X medical device for the period January 1, 2024 to December 31, 2024, under EU MDR requirements.

     During the reporting period, 156,000 units were distributed across EU markets [ATOM-SALES-2024-SUMMARY]. A total of 247 complaints were received [ATOM-CMPL-2024-001 through ATOM-CMPL-2024-247], representing a complaint rate of 0.16%. Of these, 2 complaints were classified as serious incidents [ATOM-INC-2024-011, ATOM-INC-2024-012], both related to device alarm failures. No patient injuries resulted from these incidents.

     Eight Field Safety Corrective Actions (FSCAs) were issued during the period [ATOM-FSCA-2024-001 through ATOM-FSCA-2024-008], addressing firmware updates and labeling clarifications. All FSCAs were implemented successfully with no residual safety concerns.

     Post-Market Clinical Follow-up data from three ongoing studies [ATOM-PMCF-STUDY-001, ATOM-PMCF-STUDY-002, ATOM-PMCF-STUDY-003] involving 450 patients continues to demonstrate acceptable safety and performance. No new risks were identified.

     The benefit-risk profile remains favorable. The device continues to meet its intended use without unacceptable risks.
     ```
   - Logs: LLM_RESPONSE_RECEIVED (completion tokens: 412)

4. **Citation Verification**:
   - Extracts all [ATOM-xxx] citations from generated content
   - Verifies each atom ID exists in database
   - Confirms atoms are linked to this case
   - All 15 citations verified ✓
   - Logs: CITATION_VERIFIED

5. **Content Validation**:
   - Checks: All required evidence types mentioned ✓
   - Checks: No unsupported claims (all statements cite evidence) ✓
   - Checks: Appropriate regulatory tone ✓
   - Confidence score: 0.94
   - Logs: NARRATIVE_VALIDATED

6. **Agent Handoff**:
   - Stores narrative in slot output
   - Logs: AGENT_COMPLETED
   - Agent terminates

---

**Example Slot: MDCG.ANNEXI.COMPLAINTS_TABLE (Table)**

1. **TableFormatterAgent** spawns:
   - Agent ID: TableAgent-005
   - Slot: MDCG.ANNEXI.COMPLAINTS_TABLE

2. **Evidence Query**:
   - Retrieves all complaint record atoms (247 records)

3. **Table Generation**:
   - Uses `psurTableGenerator.ts` to create structured table
   - Columns: Complaint ID | Date | Description | Severity | Outcome | Evidence Atom
   - Sorts by date descending
   - Formats:
     ```markdown
     | Complaint ID | Date Received | Description | Severity | Outcome | Evidence Atom |
     |--------------|---------------|-------------|----------|---------|---------------|
     | C-2024-247 | 2024-12-28 | Device screen unresponsive | LOW | Replaced | ATOM-CMPL-2024-247 |
     | C-2024-246 | 2024-12-27 | Alarm delay reported | MEDIUM | Software update | ATOM-CMPL-2024-246 |
     | ... | ... | ... | ... | ... | ... |
     ```

4. **Table Validation**:
   - Verifies all complaint IDs are unique
   - Confirms dates within reporting period
   - Checks no [MISSING] values (all data present)
   - Logs: TABLE_VALIDATED

5. **Agent Handoff**:
   - Stores table in slot output
   - Logs: AGENT_COMPLETED
   - Agent terminates

---

**Parallel Processing**:
Multiple agents run in parallel for different slots. The orchestrator manages dependencies (e.g., Executive Summary references other sections, so it runs last).

**Compliance Validation**:

After all slots are generated, **RegulatoryComplianceAgent** spawns:
- Loads 45 compliance rules for EU MDR
- Checks each rule:
  - Rule: "PSUR must include sales data" → ✓ PASS (sales section present)
  - Rule: "Serious incidents must be described" → ✓ PASS (incidents section present)
  - Rule: "Benefit-risk conclusion required" → ✓ PASS (conclusion section present)
- Result: 45/45 rules passed
- Logs: COMPLIANCE_CHECK_COMPLETED

**Quality Assurance**:

**QualityAssuranceAgent** performs final review:
- Cross-references: Checks that Executive Summary numbers match detailed sections
- Citation integrity: Verifies all atoms cited in narrative exist in tables
- Completeness: Confirms all template slots are populated
- Consistency: Checks date ranges are consistent across sections
- Result: QA PASSED, confidence 0.96
- Logs: QA_PASSED

**Document Rendering**:

The system generates two outputs:

1. **Markdown (.md)**:
   - Assembles all slot content in template order
   - Applies markdown formatting (headers, tables, lists)
   - Inserts table of contents
   - Adds evidence atom citations as footnotes
   - Generates appendices (mapping, evidence list)
   - Saves to: `case_42_psur_PSUR-2024-JS3000X-001.md`
   - Logs: DOCUMENT_RENDERED (format: markdown)

2. **Word Document (.docx)**:
   - Uses `docx` library to create formatted DOCX
   - Applies styles:
     - Titles: Arial 12pt Bold
     - Subtitles: Arial 10pt Bold
     - Body text: Arial 10pt
     - Tables: Calibri 10pt, bold headers, shaded header row
   - Inserts page numbers, headers, footers
   - Adds cover page with device info
   - Saves to: `case_42_psur.docx`
   - Logs: DOCUMENT_RENDERED (format: docx)

Result: Rendering completed in 12.4s, 2 formats generated

---

**Step 8: Export Audit Bundle**

Status: RUNNING → COMPLETED (3.8s)

The system creates a comprehensive audit package:

1. **Assemble Bundle**:
   - PSUR markdown
   - PSUR DOCX
   - `qualification_report.json` (template qualification results)
   - `coverage_report.json` (obligation coverage)
   - `trace.jsonl` (complete decision trace - hash verified)
   - `trace_summary.json` (trace statistics)
   - `evidence_manifest.json` (list of all evidence atoms used)
   - `slot_proposals.json` (all proposals and decisions)

2. **Generate Trace JSONL**:
   - Exports all trace entries from database
   - Formats as JSON Lines (one event per line)
   - Includes hash chain for verification
   - Example entry:
     ```json
     {"eventId":"evt-523","traceId":"uuid-abc","psurCaseId":42,"timestamp":"2024-01-13T15:23:45Z","eventType":"SLOT_ACCEPTED","actor":"AdjudicationEngine","entityType":"SLOT","entityId":"MDCG.ANNEXI.COMPLAINTS_SUMMARY","decision":"ACCEPT","inputData":{"proposalId":"PROP-2024-001"},"outputData":{"evidenceAtomIds":["ATOM-CMPL-2024-001",...],"confidence":0.94},"reasons":["Evidence complete","Method statement valid"],"contentHash":"abc123...","previousHash":"def456..."}
     ```

3. **Verify Chain Integrity**:
   - Recalculates hash for each entry
   - Verifies previousHash matches prior entry's contentHash
   - Confirms no tampering
   - Result: CHAIN VALID ✓

4. **Create ZIP Archive**:
   - Bundles all files into `audit_bundle_case_42.zip`
   - Total size: 2.4 MB
   - Stores in file system with key: `audit_bundles/case_42/bundle.zip`

5. **Update Database**:
   - Saves bundle path to psur_cases.audit_bundle_path
   - Updates case status to 'COMPLETED'

Logs: BUNDLE_EXPORTED

---

**Workflow Summary**:

The system displays final results:

```
✓ PSUR Workflow Completed Successfully

Steps:
  1. Qualify Template       COMPLETED  2.3s
  2. Create Case            COMPLETED  0.8s
  3. Ingest Evidence        COMPLETED  0.3s
  4. Build Queue & Propose  COMPLETED  8.7s
  5. Adjudicate             COMPLETED  1.2s
  6. Coverage Report        COMPLETED  0.9s
  7. Render Document        COMPLETED  12.4s
  8. Export Bundle          COMPLETED  3.8s

Total Time: 30.4 seconds

Decision Trace Summary:
  - Total events: 1,247
  - Evidence atoms: 1,027
  - Slots accepted: 43
  - Slots rejected: 2
  - Obligations satisfied: 23/23
  - LLM invocations: 58
  - Chain valid: YES ✓
```

**Download Section**:

You'll see download buttons:

1. **Word Document (.docx)**: Primary deliverable, formatted for regulatory submission
2. **Markdown (.md)**: Human-readable version for review
3. **Full Audit Bundle (.zip)**: Complete package with trace, evidence manifest, qualification reports
4. **Decision Trace (JSONL)**: Standalone trace file for external audit systems

Click any button to download immediately."

---

## Part 7: Decision Tracing Deep Dive (21:00 - 24:00)

### Visual: Animated trace chain visualization

**Narrator**:

"Let's explore the decision tracing system - the foundation of auditability.

**What is Decision Tracing?**

Every action in RegulatoryOS - every document parsed, every column mapped, every LLM call, every slot accepted - is logged as an event in a cryptographic hash chain. This creates an immutable audit trail that proves:
- What decisions were made
- When they were made
- Who (which agent) made them
- Why they were made (reasoning)
- What evidence was used
- That the chain has not been tampered with

**Hash Chain Structure**:

Each trace event contains:
- Event metadata (ID, timestamp, type, actor)
- Input data (what went into the decision)
- Output data (what came out)
- Decision details (options, selected, reasoning, confidence)
- LLM context (if applicable: model, prompt, tokens, latency)
- Content hash: SHA-256 hash of the entire event
- Previous hash: SHA-256 hash of the prior event

This creates a blockchain-like chain where each event cryptographically links to the previous one. If anyone modifies a past event, the hashes break and you'll know tampering occurred.

**Example Trace Query**:

Using the API, you can query the trace in multiple ways:

1. **Get Trace Summary**:
   ```
   GET /api/psur-cases/42/trace/summary
   ```
   Returns:
   ```json
   {
     "psurCaseId": 42,
     "traceId": "uuid-abc-123",
     "totalEntries": 1247,
     "chainValid": true,
     "acceptedSlots": 43,
     "rejectedSlots": 2,
     "evidenceAtoms": 1027,
     "obligationsSatisfied": 23,
     "workflowStatus": "COMPLETED",
     "completedSteps": 8,
     "firstEntryHash": "abc123...",
     "lastEntryHash": "xyz789..."
   }
   ```

2. **Get All LLM Invocations**:
   ```
   GET /api/psur-cases/42/trace/entries?eventTypes=LLM_INVOKED,LLM_RESPONSE_RECEIVED
   ```
   Returns 58 events showing every LLM call with:
   - Which agent called it
   - What prompt was used
   - How many tokens
   - What response was received
   - The reasoning provided

3. **Get Slot Decision Chain**:
   ```
   GET /api/psur-cases/42/trace/slots/MDCG.ANNEXI.COMPLAINTS_SUMMARY
   ```
   Returns all events related to that specific slot:
   - SLOT_PROPOSED
   - EVIDENCE_QUERY_COMPLETED
   - AGENT_SPAWNED
   - LLM_INVOKED
   - CONTENT_GENERATED
   - VALIDATION_PASSED
   - SLOT_ACCEPTED

4. **Verify Chain Integrity**:
   ```
   GET /api/psur-cases/42/trace/verify
   ```
   Returns:
   ```json
   {
     "valid": true,
     "totalEntries": 1247,
     "verifiedLinks": 1246,
     "brokenLinks": 0,
     "firstHash": "abc123...",
     "lastHash": "xyz789...",
     "verificationTime": "0.234s"
   }
   ```

**Audit Use Cases**:

1. **Regulatory Submission**:
   When you submit your PSUR to a Notified Body or Competent Authority, you can include the `trace.jsonl` file. Auditors can:
   - Verify every statement in the PSUR is backed by evidence atoms
   - See the LLM reasoning for classifications
   - Confirm no manual edits were made
   - Validate the hash chain integrity

2. **Internal Quality Audit**:
   Your QA team can query specific decisions:
   - "Show me all complaints classified as CRITICAL"
   - "Show me all LLM calls with confidence < 0.8"
   - "Show me all slots that were rejected"

3. **Post-Market Surveillance Investigation**:
   If a serious incident occurs and regulators ask "Did you know about this risk?", you can:
   - Query trace for all incident reports during relevant period
   - Show when incidents were extracted and classified
   - Prove the incidents were included in your risk analysis
   - Demonstrate traceability to PSUR sections

**Trace in the UI**:

The PSUR Wizard shows trace statistics in Step 4:
- Total trace events
- Chain validity status
- Key metrics (accepted/rejected slots, obligations satisfied)

You can click 'View Detailed Trace' to see a chronological timeline of all events with filtering options."

---

## Part 8: Advanced Features (24:00 - 26:30)

### Visual: Screen recordings of advanced features

**Narrator**:

"**Admin Configuration Portal**

Beyond basic device registration, the Admin portal lets you:

- **Configure Evidence Type Mappings**: Define custom mappings from your internal systems to RegulatoryOS evidence types
- **Manage User Roles**: Set up team members with different permissions (Admin, Reviewer, Viewer)
- **Template Management**: Upload, version, and archive custom templates
- **GRKB Extensions**: Add company-specific regulatory obligations
- **Notification Rules**: Set up alerts for trace gaps or compliance failures

**Instructions Page**

The Instructions page provides:
- Comprehensive documentation for each evidence type
- Sample files you can download for reference
- Field-by-field guidance on data requirements
- Links to regulatory guidance documents
- FAQ and troubleshooting

**Multi-Jurisdiction Support**

RegulatoryOS handles multiple jurisdictions:
- When you select both EU_MDR and UK_MDR, the system ensures all obligations from both regulations are satisfied
- The GRKB contains jurisdiction-specific requirements
- Templates can declare which jurisdictions they support
- Coverage reports break down by jurisdiction

**Version Control**

Every PSUR case is versioned:
- Initial submission: Version 1.0
- If you need to amend and resubmit, create Version 1.1
- The system tracks changes between versions
- All prior versions and their traces are preserved

**Collaborative Workflows** (Future Feature)

Coming soon:
- Multiple team members can work on different sections
- Review and approval workflows
- Comments and annotations
- Change tracking and diff views"

---

## Part 9: System Benefits Summary (26:30 - 28:00)

### Visual: Animated benefit icons and statistics

**Narrator**:

"Let's recap the transformative benefits of RegulatoryOS:

**Time Savings**:
- Traditional PSUR creation: 4-8 weeks
- RegulatoryOS: 30 seconds to 5 minutes
- Time saved: 99%+

**Cost Reduction**:
- No need for large regulatory affairs teams to manually compile reports
- No consultants needed for data analysis
- One person can generate PSURs that previously required teams

**Error Elimination**:
- Zero copy-paste errors
- Zero unsourced claims
- Zero formatting inconsistencies
- Every statement is traceable to evidence

**Regulatory Confidence**:
- Complete audit trail with cryptographic verification
- LLM reasoning is transparent and reviewable
- Coverage reports prove all obligations satisfied
- Notified Bodies can verify integrity

**Scalability**:
- Generate PSURs for 1 device or 1,000 devices
- Support multiple templates and jurisdictions
- Process thousands of evidence records
- No marginal increase in effort

**Compliance Assurance**:
- Built-in validation against EU MDR, UK MDR, FDA requirements
- Real-time obligation coverage tracking
- Automatic detection of trace gaps
- Regulatory updates reflected in GRKB

**AI Transparency**:
- Not a black box - every LLM decision is logged
- Confidence scores help you trust the system
- Low-confidence items are flagged for review
- You can always trace back to source evidence"

---

## Part 10: Technical Architecture Recap (28:00 - 29:30)

### Visual: Architecture diagram with labels

**Narrator**:

"Under the hood, RegulatoryOS is built on a modern, scalable technology stack:

**Frontend**:
- React with TypeScript for type safety
- Vite for fast development
- shadcn/ui component library for beautiful, accessible UI
- Tailwind CSS for responsive design

**Backend**:
- Node.js with Express for API server
- TypeScript throughout for consistency
- Drizzle ORM for database operations
- PostgreSQL for relational data storage with full ACID guarantees

**AI Integration**:
- OpenAI GPT-4-turbo for content generation
- Claude 3.5 Sonnet as fallback
- Custom prompt engineering for regulatory domain
- Confidence scoring and validation

**Document Processing**:
- `xlsx` for Excel parsing
- `mammoth` for Word document parsing
- `pdf-parse` for PDF extraction
- `docx` for Word generation

**Security**:
- SHA-256 cryptographic hashing for trace integrity
- Row-level security in database
- API authentication and authorization
- Audit logging for all access

**Deployment**:
- Docker containers for easy deployment
- Environment-based configuration
- Scalable to cloud infrastructure (AWS, Azure, GCP)
- On-premise deployment option for sensitive data

The entire system is designed for medical device regulatory compliance, with every architectural decision made to ensure data integrity, traceability, and regulatory defensibility."

---

## Closing Scene (29:30 - 30:00)

### Visual: Logo, contact information, call to action

**Narrator**:

"RegulatoryOS PSUR Engine represents the future of medical device regulatory affairs.

What once required weeks of manual effort now happens in seconds. What was error-prone is now verified by AI and cryptography. What was opaque is now completely transparent and traceable.

Whether you're a small startup with your first device or a global manufacturer with thousands of products, RegulatoryOS scales to your needs.

For medical device manufacturers operating under EU MDR, UK MDR, or FDA regulations, RegulatoryOS is the compliance automation platform you've been waiting for.

Visit RegulatoryOS.com to schedule a demo, or contact our team to discuss how we can transform your regulatory operations.

RegulatoryOS - Automating Compliance, Amplifying Confidence.

Thank you."

---

**[END OF VIDEO]**

---

## Appendix: Key Messages for Different Audiences

### For Regulatory Affairs Professionals:
- Complete traceability from evidence to PSUR statements
- Built-in compliance with EU MDR Article 86, MDCG guidance
- Cryptographically verified audit trails
- Templates based on official regulatory guidance
- Reduces report generation time from weeks to minutes

### For Quality Assurance Teams:
- Every decision is logged with reasoning
- Hash chain prevents tampering
- Validation agents ensure data quality
- Compliance rules automatically enforced
- Review workflows for oversight

### For C-Suite / Business Leaders:
- Massive time and cost savings (99%+ time reduction)
- Scalable across entire product portfolio
- De-risks regulatory submissions
- Enables faster market access
- Competitive advantage through automation

### For Technical Teams:
- Modern tech stack (TypeScript, React, PostgreSQL)
- API-first architecture
- Extensible agent framework
- Cloud-native deployment
- Open to integration with existing systems

### For Notified Bodies / Auditors:
- Complete transparency into AI decisions
- Exportable audit trails
- Hash verification tools included
- Evidence atoms linked to source documents
- Confidence scoring for risk assessment

---

## Production Notes

**Visuals**:
- Screen recordings should be high-resolution (1920x1080 minimum)
- Use cursor highlighting to draw attention to key UI elements
- Animate data flows (evidence → atoms → PSUR)
- Use color coding (green for success, amber for warnings, red for errors)
- Show side-by-side comparisons (traditional vs RegulatoryOS timelines)

**Voice**:
- Professional narrator (male or female, neutral accent)
- Clear, steady pace
- Emphasis on key terms (AI agents, evidence atoms, hash chain, traceability)
- Enthusiastic but authoritative tone

**Music**:
- Modern, corporate background music
- Subtle and non-distracting
- Builds in intensity during workflow execution
- Triumphant at completion

**Branding**:
- RegulatoryOS logo consistently displayed
- Color scheme: Professional blues, greens for success, clean whites
- On-screen text for key statistics
- Call-to-action at end with contact info

---

*This comprehensive explainer script covers every feature, workflow, and technical detail of the RegulatoryOS PSUR Engine, suitable for a 25-30 minute production video.*
