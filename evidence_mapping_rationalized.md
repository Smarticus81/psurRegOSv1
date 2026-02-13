# Rationalized Evidence-to-Input Source Map
## Eliminating Redundancies & Correcting Misalignments

---

## KEY CHANGES FROM ORIGINAL MAPPING

### 1. **Three-Tier Evidence Classification**
- **PRIMARY** = Raw data from uploads/systems (e.g., `complaint_record`)
- **CALCULATED** = Derived via engines/agents (e.g., `complaint_rate`)
- **EXTRACTED** = Pulled from documents (e.g., `cer_intended_use`)

### 2. **Eliminated Redundancies**
- Merged overlapping summary types (e.g., `complaint_summary` + `complaints_by_region` → single `complaint_metrics`)
- Removed duplicate "extract" items (e.g., `cer_extract` vs. `clinical_evaluation_extract` → unified)

### 3. **Fixed Misalignments**
- Moved vigilance data to separate category (not lumped with complaints)
- Clarified primary vs. secondary sources (e.g., device registry is ADMIN, not CER)
- Distinguished regulatory submissions from QMS exports

### 4. **Added Missing Evidence Types**
- `imdrf_classification` (critical for PSUR compliance)
- `control_chart_data` (for statistical trending per MDCG 2022-21)
- `segmentation_analysis` (multi-dimensional rate breakdowns)
- `root_cause_clusters` (NLP-derived insights)

---

## RATIONALIZED TAXONOMY

### INPUT CATEGORY 1: Device Master Data
**Source:** Administrative systems, EUDAMED, internal device registry  
**Format:** Excel, CSV, JSON, Admin portal export

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `device_identification` | PRIMARY | Basic UDI-DI, GMDN/EMDN codes, device name, models, SRN |
| `device_classification` | PRIMARY | Risk class (EU/UK/US), classification rule, device group |
| `device_intended_use` | PRIMARY | Intended purpose, indications, contraindications, target population |
| `device_technical_specs` | PRIMARY | Physical characteristics, sterility, shelf life |
| `manufacturer_details` | PRIMARY | Legal name, address, SRN, Authorized Rep, Notified Body |
| `regulatory_certificates` | PRIMARY | CE certificate number, UKCA, FDA clearance, expiry dates |

**Notes:**
- This is the **authoritative source** for device identity
- CER/RMF/IFU may *reference* these details but should NOT be primary source
- Device registry should be version-controlled and change-tracked

---

### INPUT CATEGORY 2: Complaints & Non-Serious Events
**Source:** QMS (Trackwise, Greenlight, MasterControl, etc.)  
**Format:** Excel, CSV, JSON export from QMS

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `complaint_record` | PRIMARY | Complaint ID, date received, event date, description, product, lot, region, customer, severity=non-serious |
| `complaint_investigation` | PRIMARY | Investigation findings, root cause, confirmed (Y/N), corrective action |
| `complaint_metrics` | CALCULATED | Total count, confirmed count, rates by region/product/lot, UCL/LCL |
| `imdrf_classification_complaints` | CALCULATED | IMDRF Harm codes + MDP codes for each complaint |
| `complaint_control_chart` | CALCULATED | Time-series with UCL/LCL, trend status |
| `complaint_segmentation` | CALCULATED | Regional, product, lot, temporal breakdowns with alerts |
| `root_cause_clusters` | CALCULATED | NLP-derived themes across complaints |

**Notes:**
- Complaints = non-serious events (no death/injury/malfunction risk)
- Serious incidents go in separate category below
- `confirmed` field is critical for rate calculations

---

### INPUT CATEGORY 3: Vigilance & Serious Incidents
**Source:** Vigilance system, EUDAMED incident reports, regulatory submissions  
**Format:** Excel, CSV, JSON, regulatory report PDFs

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `serious_incident_record` | PRIMARY | Incident ID, date, description, severity (death/serious injury/malfunction), product, lot, region |
| `serious_incident_investigation` | PRIMARY | Root cause analysis, actions taken, outcome |
| `imdrf_classification_incidents` | CALCULATED | IMDRF Harm codes + MDP codes for each serious incident |
| `vigilance_submission_log` | PRIMARY | Submission dates to EUDAMED, Competent Authorities, timeline compliance |
| `serious_incident_metrics` | CALCULATED | Count by severity, rates per 1000 uses, comparison to RMF expected rates |

**Notes:**
- **DO NOT MIX** with complaints (different regulatory requirements)
- Serious incidents require regulatory reporting within tight timelines
- May include MDR numbers, EUDAMED incident IDs

---

### INPUT CATEGORY 4: Sales & Distribution
**Source:** ERP (D365, SAP, Oracle), distribution records  
**Format:** Excel, CSV, ERP export

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `sales_transactions` | PRIMARY | Product number, quantity sold, ship date, ship-to region/country, customer |
| `sales_aggregated` | CALCULATED | Total units by period, by region (EEA/ROW), by product |
| `population_exposure` | CALCULATED | Patient exposure estimates (procedures performed, device-years) |
| `market_history` | PRIMARY | Date first sold, markets entered/exited, volume trends |

**Notes:**
- Sales data is the **denominator** for all rate calculations
- Temporal alignment with complaint/incident dates is critical
- For reusable devices, track "active installed base" not just units sold

---

### INPUT CATEGORY 5: Field Safety Corrective Actions (FSCA)
**Source:** FSCA management system, regulatory submission records  
**Format:** Excel, CSV, FSCA notification documents

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `fsca_record` | PRIMARY | FSCA ID, type (recall/field correction/customer notification), reason, date initiated, scope (lots/models), regions, status |
| `fsca_effectiveness` | PRIMARY | Completion %, devices retrieved/corrected, effectiveness verification |
| `fsca_metrics` | CALCULATED | Count by type, geographic scope, link to triggering incidents/complaints |

**Notes:**
- FSCAs are **mandatory regulatory actions**, not just internal CAPAs
- Include both initiated and closed FSCAs in reporting period
- `recall_record` is redundant - all recalls are FSCAs

---

### INPUT CATEGORY 6: CAPA (Corrective & Preventive Action)
**Source:** CAPA system (QMS module)  
**Format:** Excel, CSV, CAPA system export

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `capa_record` | PRIMARY | CAPA ID, trigger source, problem statement, root cause analysis, corrective actions, preventive actions, effectiveness check |
| `ncr_record` | PRIMARY | Non-conformance reports (may trigger CAPAs) |
| `capa_metrics` | CALCULATED | Count by trigger type, status (open/closed), effectiveness verification results |

**Notes:**
- CAPAs are **proactive** (vs. FSCAs which are reactive/regulatory)
- Link CAPAs to complaints/incidents that triggered them
- Effectiveness checks demonstrate risk reduction

---

### INPUT CATEGORY 7: Clinical Evaluation Report (CER)
**Source:** CER document (current version)  
**Format:** DOCX, PDF

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `cer_metadata` | EXTRACTED | CER version, date, author, approval status |
| `cer_intended_use` | EXTRACTED | Intended purpose, indications, contraindications (for verification vs. Device Master Data) |
| `cer_clinical_benefits` | EXTRACTED | Primary/secondary endpoints, clinical performance metrics, benefit magnitude |
| `cer_clinical_risks` | EXTRACTED | Known adverse events, contraindications, warnings |
| `cer_literature_summary` | EXTRACTED | Literature search protocol, included/excluded studies, key findings |
| `cer_pmcf_summary` | EXTRACTED | PMCF activities described, results, integration |
| `cer_equivalence` | EXTRACTED | Equivalent/similar devices, comparative data |
| `cer_state_of_art` | EXTRACTED | Alternative therapies, benchmark performance/safety |
| `cer_conclusions` | EXTRACTED | Overall clinical safety/performance assessment, benefit-risk |
| `cer_change_log` | EXTRACTED | Version history, what changed since last PSUR |

**Notes:**
- CER is a **reference document**, not primary data source
- Extracts should be version-specific (CER v3.1 Section 4.2)
- Benefits/risks here feed into Section J benefit-risk determination

---

### INPUT CATEGORY 8: Risk Management File (RMF)
**Source:** RMF document (current version), RACT (Risk Assessment Control Table)  
**Format:** Excel, DOCX, PDF

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `rmf_metadata` | EXTRACTED | RMF version, date, approval status |
| `rmf_hazard_analysis` | EXTRACTED | Hazardous situations, associated harms, causes |
| `rmf_risk_assessment_pre` | EXTRACTED | Pre-mitigation probability, severity, risk level for each hazard |
| `rmf_risk_controls` | EXTRACTED | Risk control measures implemented |
| `rmf_risk_assessment_post` | EXTRACTED | Post-mitigation (residual) probability, severity, risk level |
| `rmf_acceptability` | EXTRACTED | Risk acceptability criteria, maximum acceptable occurrence rates |
| `rmf_benefit_risk` | EXTRACTED | Benefit-risk analysis, ratio, acceptability threshold |
| `rmf_change_log` | EXTRACTED | New risks identified since last version, risk reclassifications |

**Notes:**
- RMF provides **expected risk rates** to compare against PMS data
- Section H (Risk Re-evaluation) compares RMF to actual occurrence
- Benefit-risk assessment PRIMARY source is RMF (not CER)

---

### INPUT CATEGORY 9: Post-Market Clinical Follow-up (PMCF)
**Source:** PMCF study reports, PMCF Evaluation Report, registry data  
**Format:** DOCX, PDF, Excel (registry exports)

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `pmcf_plan_extract` | EXTRACTED | PMCF activities planned, objectives, timelines |
| `pmcf_activity_record` | PRIMARY | Individual study/activity ID, type (survey/registry/clinical trial), status |
| `pmcf_results` | PRIMARY | Study outcomes, safety/performance findings, patient-reported outcomes |
| `pmcf_evaluation_summary` | EXTRACTED | Impact on CER, new risks/benefits identified, clinical conclusions |

**Notes:**
- PMCF may be described in CER but **primary data** comes from PMCF reports
- For grouped devices, PMCF may cover entire family
- PMCF feeds into CER updates

---

### INPUT CATEGORY 10: Literature & External Databases
**Source:** Literature search results, FDA MAUDE, Health Canada, MHRA, database query logs  
**Format:** Excel, CSV, PDF (search results), JSON (API exports)

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `literature_search_protocol` | PRIMARY | Databases searched, keywords, date range, inclusion/exclusion criteria |
| `literature_screening_results` | PRIMARY | Studies identified, screened, included, excluded (with reasons) |
| `literature_findings` | EXTRACTED | Individual study results, safety signals, performance benchmarks |
| `literature_synthesis` | CALCULATED | Summary of findings, impact on device safety/performance assessment |
| `external_db_query_log` | PRIMARY | Database (MAUDE/Health Canada), search terms, dates, hit count |
| `external_db_findings` | PRIMARY | Relevant incidents on similar devices, competitive intelligence |

**Notes:**
- Literature review may be in CER or standalone
- External DB searches are **independent surveillance** (not complaints about your device)
- Findings inform state-of-the-art and comparative safety assessments

---

### INPUT CATEGORY 11: PMS Plan & Activity Log
**Source:** PMS Plan document, activity tracking system  
**Format:** DOCX, PDF (plan), Excel/CSV (activity log)

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `pms_plan_extract` | EXTRACTED | PMS Plan version, date, surveillance activities defined, update frequency |
| `pms_activity_log` | PRIMARY | Activity ID, type (literature review/complaint trending/registry monitoring), planned date, actual date, status, findings |

**Notes:**
- Demonstrates **systematic surveillance** per MDR Article 83
- Section 3 of PSUR describes PMS activities performed

---

### INPUT CATEGORY 12: Previous PSUR
**Source:** Last PSUR document  
**Format:** DOCX, PDF

| Evidence Item | Type | Description |
|---------------|------|-------------|
| `previous_psur_metadata` | EXTRACTED | Period covered, date submitted, Notified Body response |
| `previous_psur_conclusions` | EXTRACTED | Benefit-risk determination, actions required, open items |
| `previous_psur_metrics` | EXTRACTED | Previous period complaint rate, incident rate, sales volume (for trending) |
| `previous_psur_actions` | EXTRACTED | CAPAs, FSCAs, RMF updates, design changes from previous PSUR |
| `previous_psur_action_status` | PRIMARY | Status of actions from previous PSUR (completed, ongoing, effectiveness verified) |

**Notes:**
- Required to demonstrate **continuity** across PSURs
- Executive Summary must address actions from previous PSUR
- Enables year-over-year trending

---

## CALCULATED EVIDENCE (Generated by Engines)

These evidence items are **NOT UPLOADED** but **GENERATED** by your calculation engines from primary data:

| Evidence Item | Engine | Input Evidence | Output |
|---------------|--------|----------------|--------|
| `complaint_rate_analysis` | ComplaintRateEngine | `complaint_record` + `sales_transactions` | Confirmed rate, unconfirmed rate, combined rate, by region/product/lot |
| `statistical_trending` | StatisticalTrendingEngine | `complaint_record` (historical) + `sales_transactions` | Mean, std dev, UCL, LCL, trend status |
| `control_chart_data` | ControlChartAgent | `statistical_trending` output | SVG chart, data points, control limits |
| `segmentation_analysis` | SegmentationEngine | `complaint_record` + `sales_transactions` | Regional/product/lot rates, rate ratios, alerts |
| `imdrf_classification_complaints` | IMDRFClassificationAgent | `complaint_record` | IMDRF Harm codes + MDP codes per complaint |
| `imdrf_classification_incidents` | IMDRFClassificationAgent | `serious_incident_record` | IMDRF Harm codes + MDP codes per incident |
| `root_cause_clusters` | RootCauseClusteringAgent | `complaint_record` (investigation findings) | Clusters, themes, hypotheses, actions |
| `serious_incident_metrics` | VigilanceEngine | `serious_incident_record` + `sales_transactions` | Incident rates per 1000 uses, comparison to RMF |
| `benefit_risk_quantification` | BenefitRiskEngine | `cer_clinical_benefits` + `serious_incident_metrics` + `complaint_rate_analysis` + `rmf_benefit_risk` | Quantitative ratio, acceptability determination, change from previous |
| `risk_reassessment` | RiskReassessmentEngine | `rmf_risk_assessment_pre` + `complaint_metrics` + `serious_incident_metrics` | Post-PSUR probability/severity, risk level changes |
| `population_exposure` | ExposureEngine | `sales_transactions` + exposure methodology | Patient-years, procedures performed, active installed base |

**Notes:**
- These are **intermediate outputs** that feed into agent prompts
- They are stored as `evidence_atoms` with `evidenceType = 'calculated'`
- They have full provenance (which engine, version, input hashes)

---

## UNIFIED INPUT CATEGORIES (Final)

Replace your current "By Input Source" section with this:

### 1. Device Master Data
- Device identification, classification, intended use, technical specs
- Manufacturer details, regulatory certificates
- **Primary source** for device identity

### 2. Complaints (Non-Serious Events)
- Complaint records, investigations, IMDRF classification
- Calculated: rates, control charts, segmentation, root cause clusters

### 3. Vigilance (Serious Incidents)
- Serious incident records, investigations, IMDRF classification
- Vigilance submissions log
- Calculated: incident metrics, rates per 1000 uses

### 4. Sales & Distribution
- Sales transactions, aggregated volumes
- Calculated: population exposure, market history

### 5. Field Safety Corrective Actions (FSCA)
- FSCA records, effectiveness verification
- Calculated: FSCA metrics

### 6. CAPA
- CAPA records, NCRs
- Calculated: CAPA metrics

### 7. Clinical Evaluation Report (CER)
- Extracted: intended use, clinical benefits/risks, literature summary, PMCF summary, state of art, conclusions, change log

### 8. Risk Management File (RMF)
- Extracted: hazard analysis, risk assessments (pre/post), risk controls, acceptability criteria, benefit-risk, change log

### 9. PMCF
- PMCF plan, activity records, results, evaluation summary

### 10. Literature & External Databases
- Literature search protocol, screening results, findings, synthesis
- External DB query logs, findings

### 11. PMS Plan & Activity Log
- PMS Plan extract, activity log

### 12. Previous PSUR
- Previous PSUR metadata, conclusions, metrics, actions, action status

### 13. Calculated Evidence
- Generated by engines: complaint rates, statistical trending, control charts, segmentation, IMDRF classification, root cause clusters, serious incident metrics, benefit-risk quantification, risk reassessment, population exposure

---

## MAPPING RATIONALIZATION SUMMARY

### Eliminated Redundancies
- ❌ `complaint_summary` + `complaints_by_region` → ✅ `complaint_metrics`
- ❌ `serious_incident_summary` → ✅ `serious_incident_metrics`
- ❌ `sales_summary` + `sales_by_region` + `distribution_summary` → ✅ `sales_aggregated`
- ❌ `fsca_summary` + `recall_record` → ✅ `fsca_metrics`
- ❌ `capa_summary` → ✅ `capa_metrics`
- ❌ `cer_extract` + `clinical_evaluation_extract` → ✅ `cer_*` (specific extracts)
- ❌ `literature_review_summary` + `literature_result` → ✅ `literature_findings` + `literature_synthesis`

### Fixed Misalignments
- ✅ Separated vigilance from complaints (different regulatory requirements)
- ✅ Made Device Master Data the primary source for device identity (not CER)
- ✅ Made RMF the primary source for benefit-risk (not CER)
- ✅ Distinguished PRIMARY (uploaded) from CALCULATED (engine-generated)

### Added Missing Evidence
- ✅ `imdrf_classification_complaints` / `imdrf_classification_incidents`
- ✅ `control_chart_data`
- ✅ `segmentation_analysis`
- ✅ `root_cause_clusters`
- ✅ `benefit_risk_quantification`
- ✅ `risk_reassessment`

### Clarified Evidence Tiers
- **PRIMARY** = Raw uploads
- **EXTRACTED** = Parsed from documents
- **CALCULATED** = Generated by engines

---

## IMPACT ON GRKB

The rationalized evidence map **strengthens GRKB** by:

1. **Clearer Evidence Requirements:** Each GRKB obligation can specify PRIMARY + CALCULATED evidence needed
2. **Validation Precision:** Slot coverage validation can check for specific calculated evidence (e.g., `control_chart_data` for trending obligations)
3. **Preprocessing Triggers:** GRKB obligations can trigger specific engines (e.g., "requires statistical trending" → invoke `StatisticalTrendingEngine`)
4. **Quality Assurance:** GRKB can enforce semantic requirements (e.g., "must have UCL calculation" checks for presence of `statistical_trending` evidence atom)

**Example GRKB Enhancement:**

```json
{
    "obligationId": "mdcg-5.3-complaint-trending",
    "requirementText": "Complaint trending with statistical analysis",
    "slotId": "section_e_subsection_2",
    
    "requiredEvidence": {
        "primary": ["complaint_record", "sales_transactions"],
        "calculated": ["complaint_rate_analysis", "statistical_trending", "control_chart_data"]
    },
    
    "preprocessingPipeline": [
        {"engine": "ComplaintRateEngine", "priority": 1},
        {"engine": "StatisticalTrendingEngine", "priority": 2},
        {"engine": "ControlChartAgent", "priority": 3}
    ],
    
    "validationRules": {
        "mustHaveControlChart": true,
        "mustHaveUCLCalculation": true,
        "mustCompareToPreviousPeriod": true,
        "minimumWordCount": 400
    }
}
```

This ensures that when Section E is generated, the GRKB **guarantees** the necessary preprocessing has occurred.
