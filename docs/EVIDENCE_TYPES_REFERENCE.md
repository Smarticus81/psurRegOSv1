# Evidence Types Reference

This document provides a comprehensive reference for all evidence types required by the MDCG 2022-21 Annex I PSUR template. Each evidence type is defined with its expected source, definition, and the PSUR requirements it fulfills.

---

## Overview

Evidence types are categorized into:
- **Raw Data Inputs**: Directly extracted from user-uploaded documents
- **Derived Summaries**: Generated from raw data during processing
- **Document Extracts**: Extracted from structured documents (CER, RMF, etc.)
- **Administrative Records**: Device registry, manufacturer profiles, regulatory certificates

---

## Special Handling: Clinical Evaluation Reports (CER)

CERs are comprehensive documents that require specialized multi-evidence extraction. A single CER can be the source for many evidence types because it contains:

| CER Section | Evidence Types Extracted |
|-------------|-------------------------|
| Cover Page / Executive Summary | `manufacturer_profile`, `clinical_evaluation_extract`, `benefit_risk_assessment` |
| Device Description | `device_registry_record`, `cer_extract` |
| Device Identifiers | `device_registry_record` (UDI-DI, GMDN) |
| Regulatory Status | `regulatory_certificate_record`, `cer_extract` |
| Intended Purpose | `ifu_extract`, `clinical_evaluation_extract` |
| Literature Search Protocol | `literature_search_strategy` |
| Literature Search Results | `literature_result`, `literature_review_summary` |
| Literature Analysis | `literature_review_summary`, `clinical_evaluation_extract` |
| Clinical Investigations | `clinical_evaluation_extract`, `pmcf_result` |
| PMCF Data | `pmcf_result`, `pmcf_summary`, `pmcf_activity_record` |
| PMS Data | `pms_activity_log`, `pms_plan_extract` |
| Complaints Summary | `complaint_summary`, `complaints_by_region`, `previous_psur_extract` |
| Vigilance Summary | `serious_incident_summary`, `vigilance_report`, `previous_psur_extract` |
| Sales Data | `sales_summary`, `sales_by_region`, `previous_psur_extract` |
| Benefit Analysis | `benefit_risk_assessment`, `clinical_evaluation_extract` |
| Risk Analysis | `benefit_risk_assessment`, `risk_assessment`, `rmf_extract` |
| Benefit-Risk Conclusion | `benefit_risk_assessment` |
| Conclusions | `clinical_evaluation_extract`, `benefit_risk_assessment` |

**Important Notes:**
- Sales, complaints, and vigilance data extracted from a CER are typically from the **previous PSUR period** and should be marked as historical
- Current period data should be uploaded separately from dedicated sources (Sales, Complaints, FSCA files)
- The CER extractor uses Claude Sonnet 4.5 for intelligent section classification and semantic extraction
- All CER extractions include detailed decision tracing for audit compliance

---

## Raw Data Inputs

### `sales_volume`
- **Definition**: Individual sales transaction records containing device codes, quantities, dates, regions, and countries. Raw data that will be aggregated into summaries.
- **Expected Source**: **Sales** (Excel, CSV, JSON)
- **Required Fields**: `deviceCode`, `quantity`, `periodStart`, `periodEnd`, `region`, `country`, `revenue`, `distributionChannel`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.SALES_POPULATION_USAGE` - Sales volume, population exposure and usage frequency
  - Section: **4 > Exposure > Sales Volume**
  - Section: **4 > Exposure > Sales Table**

---

### `complaint_record`
- **Definition**: Individual complaint records with details about customer complaints, adverse events, and feedback. Includes complaint ID, device code, date, description, severity, seriousness classification, region, root cause analysis, and corrective actions.
- **Expected Source**: **Complaints** (Excel, CSV, JSON, DOCX)
- **Required Fields**: `complaintId`, `deviceCode`, `complaintDate`, `description`, `severity`, `serious`, `region`, `country`, `rootCause`, `correctiveAction`, `patientOutcome`, `investigationStatus`
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.COMPLAINTS_FEEDBACK` - Complaints and feedback handling
  - Section: **5 > Safety > Complaints**
  - Section: **6 > Trend Reporting**

---

### `serious_incident_record`
- **Definition**: Records of serious incidents as defined by EU MDR Article 2(64), including incident ID, device code, date, description, severity, patient outcome, reporting status, and IMDRF codes.
- **Expected Source**: **Complaints** (derived from complaint records where `serious = "Yes"`)
- **Required Fields**: `incidentId`, `deviceCode`, `incidentDate`, `description`, `severity`, `patientOutcome`, `reportedTo`, `imdrfCode`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.SERIOUS_INCIDENTS` - Summary of serious incidents
  - Section: **5 > Safety > Serious Incidents**
  - Section: **5 > Safety > Serious Incidents > IMDRF Table**

---

### `fsca_record`
- **Definition**: Field Safety Corrective Action records including FSCA ID, device code, initiation date, description, affected units, status, corrective action details, and affected regions.
- **Expected Source**: **Field Actions and Recalls (FSCA)** (Excel, CSV, JSON, DOCX)
- **Required Fields**: `fscaId`, `deviceCode`, `initiationDate`, `description`, `affectedUnits`, `status`, `correctiveAction`, `region`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.FSCA` - Field Safety Corrective Actions
  - Section: **7 > FSCA**
  - Section: **7 > FSCA > FSCA Table**

---

### `capa_record`
- **Definition**: Corrective and Preventive Action records including CAPA ID, device code, open/close dates, description, root cause, corrective action, status, and effectiveness verification.
- **Expected Source**: **CAPA** (Excel, CSV, JSON, DOCX)
- **Required Fields**: `capaId`, `deviceCode`, `openDate`, `closeDate`, `description`, `rootCause`, `correctiveAction`, `status`, `effectiveness`
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.CORRECTIVE_PREVENTIVE_ACTIONS` - CAPA summary and linkage to PMS findings
  - Section: **8 > CAPA**
  - Section: **8 > CAPA > CAPA Table**

---

### `pmcf_result`
- **Definition**: Results from Post-Market Clinical Follow-up activities including study ID, study type, start/end dates, sample size, findings, conclusions, and status.
- **Expected Source**: **PMCF** (DOCX, PDF, Excel)
- **Required Fields**: `studyId`, `studyType`, `startDate`, `endDate`, `sampleSize`, `findings`, `conclusions`, `status`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.PMCF_MAIN_FINDINGS` - PMCF activities, results, integration into CER/RMF
  - `EU.MDR.ANNEX_III.PMCF` - Post-Market Clinical Follow-up
  - Section: **11 > PMCF**
  - Section: **11 > PMCF > PMCF Table**

---

### `ncr_record`
- **Definition**: Non-Conformance Report records related to quality issues, manufacturing defects, or deviations from specifications.
- **Expected Source**: **CAPA** (secondary evidence type)
- **Required Fields**: `ncrId`, `deviceCode`, `date`, `description`, `severity`, `status`
- **PSUR Requirements**:
  - Section: **8 > CAPA** (as supporting evidence for CAPA activities)

---

### `recall_record`
- **Definition**: Product recall records including recall ID, device code, recall date, reason, affected units, and status.
- **Expected Source**: **Field Actions and Recalls (FSCA)** (secondary evidence type)
- **Required Fields**: `recallId`, `deviceCode`, `recallDate`, `reason`, `affectedUnits`, `status`
- **PSUR Requirements**:
  - Section: **7 > FSCA** (as supporting evidence for FSCA activities)

---

## Document Extracts

### `cer_extract`
- **Definition**: Extracted content from Clinical Evaluation Reports (CER), including sections, key findings, clinical conclusions, and safety/performance claims.
- **Expected Source**: **CER** (DOCX, PDF)
- **Required Fields**: `sourceDocument`, `sectionReference`, `content`, `extractionDate`, `deviceCode`
- **PSUR Requirements**:
  - Section: **11 > PMCF** (integration of PMCF findings into CER)
  - Section: **2 > Device Description > Scope** (intended purpose and clinical evaluation)

---

### `clinical_evaluation_extract`
- **Definition**: Specific extracts from clinical evaluation documents focusing on clinical evidence, literature review summaries, and clinical conclusions.
- **Expected Source**: **CER** (DOCX, PDF)
- **Required Fields**: `sourceDocument`, `sectionReference`, `content`, `extractionDate`, `deviceCode`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.DEVICES_INTENDED_USE` - Devices covered by the PSUR scope and intended purpose
  - Section: **2 > Device Description > Scope**

---

### `ifu_extract`
- **Definition**: Extracts from Instructions for Use (IFU) documents describing device intended use, indications, contraindications, and warnings.
- **Expected Source**: **Admin** (secondary, from device documentation)
- **Required Fields**: `sourceDocument`, `sectionReference`, `content`, `deviceCode`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.DEVICES_INTENDED_USE` - Devices covered by the PSUR scope and intended purpose
  - Section: **2 > Device Description > Scope**

---

### `rmf_extract`
- **Definition**: Extracts from Risk Management Files (RMF) including risk assessments, hazard analysis, and risk control measures.
- **Expected Source**: **Risk Docs** (DOCX, PDF, Excel)
- **Required Fields**: `sourceDocument`, `sectionReference`, `content`, `deviceCode`
- **PSUR Requirements**:
  - Section: **11 > PMCF** (integration of PMCF findings into RMF)
  - Section: **12 > Conclusions > Benefit-Risk** (risk assessment)
  - Section: **12 > Conclusions > Actions Taken** (RMF change log)

---

### `pms_plan_extract`
- **Definition**: Extracts from Post-Market Surveillance (PMS) Plans describing planned PMS activities, data sources, and monitoring strategies.
- **Expected Source**: **Admin** (secondary, from PMS documentation)
- **Required Fields**: `sourceDocument`, `sectionReference`, `content`, `deviceCode`
- **PSUR Requirements**:
  - `EU.MDR.ART83.PMS_SYSTEM` - Overview of PMS activities performed during the reporting period
  - Section: **3 > PMS Activities**
  - Section: **2 > Device Description > Scope**

---

### `previous_psur_extract`
- **Definition**: Extracts from previous PSUR reports for comparison, trend analysis, and change tracking.
- **Expected Source**: **Admin** (secondary, from previous PSUR documents)
- **Required Fields**: `sourceDocument`, `sectionReference`, `content`, `psurReference`, `period`
- **PSUR Requirements**:
  - Section: **2 > Device Description > Changes** (changes vs previous PSUR)
  - Section: **12 > Conclusions > Benefit-Risk** (acceptability changes vs prior PSUR)

---

### `pmcf_report_extract`
- **Definition**: Extracts from PMCF study reports, surveys, or registry summaries.
- **Expected Source**: **PMCF** (secondary, from PMCF reports)
- **Required Fields**: `sourceDocument`, `sectionReference`, `content`, `studyId`, `deviceCode`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.PMCF_MAIN_FINDINGS` - PMCF activities, results, integration into CER/RMF
  - Section: **11 > PMCF**

---

### `pmcf_activity_record`
- **Definition**: Records of individual PMCF activities including activity name, key findings, impact on safety/performance, and required updates to RMF/CER.
- **Expected Source**: **PMCF** (secondary, from PMCF activity logs)
- **Required Fields**: `pmcfActivity`, `keyFindings`, `impact`, `rmfOrCerUpdate`, `reference`
- **PSUR Requirements**:
  - Section: **11 > PMCF > PMCF Table**

---

### `literature_result`
- **Definition**: Individual literature search results including publication details, relevance, and key findings from scientific literature.
- **Expected Source**: **CER** (secondary, from literature review sections)
- **Required Fields**: `publicationTitle`, `authors`, `journal`, `year`, `relevance`, `keyFindings`
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.LITERATURE_REVIEW` - Scientific literature review
  - Section: **9 > Literature Review**

---

## Administrative Records

### `device_registry_record`
- **Definition**: Device registration information including device name, model, UDI-DI, Basic UDI-DI, risk class, and regulatory status.
- **Expected Source**: **Administrative Data** (Excel, CSV, JSON, PDF)
- **Required Fields**: `deviceName`, `model`, `udiDi`, `basicUdiDi`, `riskClass`, `regulatoryStatus`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.ADMIN` - PSUR administrative information
  - Section: **Cover** (PSUR Cover Page)
  - Section: **2 > Device Description > Scope**
  - Section: **2 > Device Description > Changes**

---

### `manufacturer_profile`
- **Definition**: Manufacturer information including company name, address, authorized representative, and contact details.
- **Expected Source**: **Administrative Data** (Excel, CSV, JSON, PDF)
- **Required Fields**: `manufacturerName`, `address`, `authorizedRepresentative`, `contactInfo`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.ADMIN` - PSUR administrative information
  - Section: **Cover** (PSUR Cover Page)

---

### `regulatory_certificate_record`
- **Definition**: Regulatory certificates including notified body, certificate number, issue date, expiry date, and scope.
- **Expected Source**: **Administrative Data** (Excel, CSV, JSON, PDF)
- **Required Fields**: `certificateNumber`, `notifiedBody`, `issueDate`, `expiryDate`, `scope`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.ADMIN` - PSUR administrative information
  - Section: **Cover** (PSUR Cover Page)

---

### `change_control_record`
- **Definition**: Records of changes to device design, labeling, manufacturing, or intended use during the reporting period.
- **Expected Source**: **Administrative Data** (secondary, from change control systems)
- **Required Fields**: `changeId`, `deviceCode`, `changeDate`, `changeType`, `description`, `impact`
- **PSUR Requirements**:
  - Section: **2 > Device Description > Changes** (changes vs previous PSUR)
  - Section: **12 > Conclusions > Actions Taken** (labeling/IFU changes)

---

### `data_source_register`
- **Definition**: Register of data sources used for PMS activities including source name, type, access method, and update frequency.
- **Expected Source**: **Administrative Data** (secondary, from PMS documentation)
- **Required Fields**: `sourceName`, `sourceType`, `accessMethod`, `updateFrequency`, `description`
- **PSUR Requirements**:
  - `EU.MDR.ART83.PMS_SYSTEM` - Overview of PMS activities performed during the reporting period
  - Section: **3 > PMS Activities**

---

### `pms_activity_log`
- **Definition**: Log of PMS activities performed during the reporting period including activity type, date, description, and outcomes.
- **Expected Source**: **Administrative Data** (secondary, from PMS activity logs)
- **Required Fields**: `activityType`, `activityDate`, `description`, `outcome`, `deviceCode`
- **PSUR Requirements**:
  - `EU.MDR.ART83.PMS_SYSTEM` - Overview of PMS activities performed during the reporting period
  - Section: **3 > PMS Activities**

---

## Derived Summaries (Generated from Raw Data)

### `sales_summary`
- **Definition**: Aggregated summary of sales data including total units sold, revenue, distribution channels, and period-over-period trends. **Derived from `sales_volume`**.
- **Expected Source**: **Sales** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.SALES_POPULATION_USAGE` - Sales volume, population exposure and usage frequency
  - Section: **1 > Executive Summary**
  - Section: **4 > Exposure > Sales Volume**
  - Section: **6 > Trend Reporting**

---

### `sales_by_region`
- **Definition**: Sales data aggregated by geographic region with units sold, estimated users, and usage frequency estimates. **Derived from `sales_volume`**.
- **Expected Source**: **Sales** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.SALES_POPULATION_USAGE` - Exposure table by region
  - Section: **4 > Exposure > Sales Table**
  - Section: **5 > Safety > Complaints > By Region Table**

---

### `distribution_summary`
- **Definition**: Summary of distribution channels, markets, and geographic distribution patterns. **Derived from `sales_volume`**.
- **Expected Source**: **Sales** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.SALES_POPULATION_USAGE` - Sales volume, population exposure and usage frequency
  - Section: **4 > Exposure > Sales Volume**

---

### `usage_estimate`
- **Definition**: Estimates of device usage frequency, patient exposure, and utilization patterns. **Derived from `sales_volume` and clinical data**.
- **Expected Source**: **Sales** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.SALES_POPULATION_USAGE` - Sales volume, population exposure and usage frequency
  - Section: **4 > Exposure > Sales Volume**
  - Section: **4 > Exposure > Sales Table**

---

### `complaint_summary`
- **Definition**: Aggregated summary of complaints including total counts, breakdown by severity/seriousness, key themes, and trends. **Derived from `complaint_record`**.
- **Expected Source**: **Complaints** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.COMPLAINTS_FEEDBACK` - Complaints and non-serious incidents summary
  - Section: **1 > Executive Summary**
  - Section: **5 > Safety > Complaints**

---

### `complaints_by_region`
- **Definition**: Complaints aggregated by geographic region and seriousness classification with counts and rates per 1000 units. **Derived from `complaint_record` and `sales_by_region`**.
- **Expected Source**: **Complaints** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.1.1.COMPLAINT_TRENDS` - Complaints table by region and seriousness
  - Section: **5 > Safety > Complaints > By Region Table**

---

### `serious_incident_summary`
- **Definition**: Summary of serious incidents including total counts, severity breakdown, patient outcomes, and reporting status. **Derived from `serious_incident_record`**.
- **Expected Source**: **Complaints** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.SERIOUS_INCIDENTS` - Summary of serious incidents
  - Section: **1 > Executive Summary**
  - Section: **5 > Safety > Serious Incidents**

---

### `serious_incident_records_imdrf`
- **Definition**: Serious incidents coded using IMDRF terminology with event terms, codes, counts, regions impacted, and patient outcomes. **Derived from `serious_incident_record`**.
- **Expected Source**: **Complaints** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.SERIOUS_INCIDENTS` - Serious incidents table with IMDRF coding
  - Section: **5 > Safety > Serious Incidents > IMDRF Table**

---

### `trend_analysis`
- **Definition**: Statistical trend analysis comparing baseline rates, current rates, thresholds, and signal detection conclusions. **Derived from `complaint_record`, `sales_summary`, and historical data**.
- **Expected Source**: **Complaints** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ART88.TREND_REPORTING` - Trend reporting with statistically significant increases, signals, thresholds
  - Section: **1 > Executive Summary**
  - Section: **6 > Trend Reporting**
  - Section: **6 > Trend Reporting > Trend Table**

---

### `signal_log`
- **Definition**: Log of detected safety signals including signal description, detection date, assessment status, and actions taken. **Derived from `complaint_record` and `trend_analysis`**.
- **Expected Source**: **Complaints** (secondary, derived output)
- **PSUR Requirements**:
  - `EU.MDR.ART88.TREND_REPORTING` - Trend reporting with signal detection
  - Section: **6 > Trend Reporting**

---

### `fsca_summary`
- **Definition**: Summary of Field Safety Corrective Actions including opened/closed counts, scope, effectiveness, and key themes. **Derived from `fsca_record`**.
- **Expected Source**: **Field Actions and Recalls (FSCA)** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.FSCA` - Field Safety Corrective Actions summary
  - Section: **1 > Executive Summary**
  - Section: **7 > FSCA**

---

### `capa_summary`
- **Definition**: Summary of Corrective and Preventive Actions including counts, key themes, linkage to PMS findings, and effectiveness. **Derived from `capa_record`**.
- **Expected Source**: **CAPA** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.CORRECTIVE_PREVENTIVE_ACTIONS` - CAPA summary and linkage to PMS findings
  - Section: **1 > Executive Summary**
  - Section: **8 > CAPA**
  - Section: **12 > Conclusions > Actions Taken**

---

### `pmcf_summary`
- **Definition**: Summary of PMCF activities including activities performed, key findings, integration into CER/RMF, and conclusions. **Derived from `pmcf_result` and `pmcf_report_extract`**.
- **Expected Source**: **PMCF** (derived output, not direct input)
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.PMCF_MAIN_FINDINGS` - PMCF activities, results, integration into CER/RMF
  - Section: **1 > Executive Summary**
  - Section: **11 > PMCF**

---

### `literature_review_summary`
- **Definition**: Summary of scientific literature review including search strategy, results, relevant findings, and conclusions. **Derived from `literature_result` and `cer_extract`**.
- **Expected Source**: **CER** (secondary, derived from literature review sections)
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.LITERATURE_REVIEW` - Scientific literature review
  - Section: **1 > Executive Summary**
  - Section: **9 > Literature Review**

---

### `literature_search_strategy`
- **Definition**: Documentation of literature search strategy including databases used, search terms, inclusion/exclusion criteria, and date ranges. **Derived from `cer_extract`**.
- **Expected Source**: **CER** (secondary, derived from literature review sections)
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.LITERATURE_REVIEW` - Scientific literature review search strategy
  - Section: **9 > Literature Review**

---

### `external_db_summary`
- **Definition**: Summary of queries to external databases/registries including databases queried, hits, relevance, benchmarking, and conclusions. **Derived from `external_db_query_log`**.
- **Expected Source**: **Administrative Data** (secondary, derived from database query logs)
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.EXTERNAL_DATABASES` - External databases/registries query and results
  - Section: **1 > Executive Summary**
  - Section: **10 > External Databases**

---

### `external_db_query_log`
- **Definition**: Log of queries to external databases including database name, query date, search terms, number of hits, and relevance assessment.
- **Expected Source**: **Administrative Data** (secondary, from database query logs)
- **Required Fields**: `databaseName`, `queryDate`, `searchTerms`, `hits`, `relevance`
- **PSUR Requirements**:
  - `EU.MDR.ANNEX_III.EXTERNAL_DATABASES` - External databases/registries query and results
  - Section: **10 > External Databases**

---

### `vigilance_report`
- **Definition**: Reports from national competent authorities or vigilance databases including report numbers, dates, and key findings.
- **Expected Source**: **Administrative Data** (secondary, from vigilance systems)
- **Required Fields**: `reportNumber`, `reportDate`, `authority`, `keyFindings`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.SERIOUS_INCIDENTS` - Summary of serious incidents
  - Section: **5 > Safety > Serious Incidents**

---

### `benefit_risk_assessment`
- **Definition**: Benefit-risk assessment conclusion including benefit summary, risk summary, conclusion, and comparison to previous PSUR. **May be extracted from Risk Docs or derived from analysis**.
- **Expected Source**: **Risk Docs** (DOCX, PDF, Excel) or **derived from analysis**
- **Required Fields**: `assessment`, `benefitSummary`, `riskSummary`, `conclusion`, `periodStart`, `periodEnd`, `deviceCode`
- **PSUR Requirements**:
  - `EU.MDR.ART86.1.CONCLUSIONS` - Benefit-risk determination and acceptability changes vs prior PSUR
  - Section: **1 > Executive Summary**
  - Section: **12 > Conclusions > Benefit-Risk**

---

### `risk_assessment`
- **Definition**: Risk assessment details including residual risks, new risks identified, and risk control measures.
- **Expected Source**: **Risk Docs** (DOCX, PDF, Excel)
- **Required Fields**: `riskProfile`, `residualRisks`, `newRisks`, `riskControls`
- **PSUR Requirements**:
  - Section: **12 > Conclusions > Benefit-Risk** (as supporting evidence)

---

## Change Logs

### `cer_change_log`
- **Definition**: Log of changes to Clinical Evaluation Reports during the reporting period including change date, section affected, description, and rationale.
- **Expected Source**: **CER** (secondary, from CER change tracking)
- **Required Fields**: `changeDate`, `section`, `description`, `rationale`, `deviceCode`
- **PSUR Requirements**:
  - Section: **12 > Conclusions > Actions Taken** (RMF/CER updates)

---

### `rmf_change_log`
- **Definition**: Log of changes to Risk Management Files during the reporting period including change date, section affected, description, and rationale.
- **Expected Source**: **Risk Docs** (secondary, from RMF change tracking)
- **Required Fields**: `changeDate`, `section`, `description`, `rationale`, `deviceCode`
- **PSUR Requirements**:
  - Section: **12 > Conclusions > Actions Taken** (RMF/CER updates)

---

## Supporting Evidence Types

### `customer_feedback_summary`
- **Definition**: Summary of customer feedback, surveys, or satisfaction data (non-complaint feedback).
- **Expected Source**: **Complaints** (secondary, from feedback systems)
- **PSUR Requirements**: Supporting evidence for complaint analysis

---

## Summary Table

| Evidence Type | Source | Input/Derived | Required? | Key PSUR Sections |
|--------------|--------|---------------|------------|-------------------|
| `sales_volume` | Sales | Input | Yes | 4 (Exposure) |
| `complaint_record` | Complaints | Input | Yes | 5 (Safety), 6 (Trends) |
| `serious_incident_record` | Complaints | Input | Yes | 5 (Safety) |
| `fsca_record` | FSCA | Input | Yes | 7 (FSCA) |
| `capa_record` | CAPA | Input | Yes | 8 (CAPA) |
| `pmcf_result` | PMCF | Input | Yes | 11 (PMCF) |
| `cer_extract` | CER | Input | Yes | 2 (Device Scope), 11 (PMCF) |
| `device_registry_record` | Admin | Input | Yes | Cover, 2 (Device Scope) |
| `benefit_risk_assessment` | Risk | Input | Yes | 12 (Conclusions) |
| `sales_summary` | Sales | Derived | Yes | 1 (Exec Summary), 4 (Exposure) |
| `sales_by_region` | Sales | Derived | Yes | 4 (Exposure Table) |
| `complaint_summary` | Complaints | Derived | Yes | 1 (Exec Summary), 5 (Safety) |
| `serious_incident_summary` | Complaints | Derived | Yes | 1 (Exec Summary), 5 (Safety) |
| `trend_analysis` | Complaints | Derived | Yes | 1 (Exec Summary), 6 (Trends) |
| `fsca_summary` | FSCA | Derived | Yes | 1 (Exec Summary), 7 (FSCA) |
| `capa_summary` | CAPA | Derived | Yes | 1 (Exec Summary), 8 (CAPA) |
| `pmcf_summary` | PMCF | Derived | Yes | 1 (Exec Summary), 11 (PMCF) |
| `literature_review_summary` | CER | Derived | Yes | 1 (Exec Summary), 9 (Literature) |
| `external_db_summary` | Admin | Derived | Yes | 1 (Exec Summary), 10 (External DBs) |

---

## Notes

1. **Derived Evidence Types**: Types marked as "Derived" are generated automatically by the system from raw input data. Users should not upload pre-aggregated summaries; instead, upload raw data and let the system generate summaries.

2. **Multiple Sources**: Some evidence types can be derived from multiple sources. For example, `literature_review_summary` can come from CER documents or be generated from `literature_result` records.

3. **Required vs. Optional**: All evidence types listed in the template slots are required for a complete PSUR. However, some slots allow "empty with justification" if evidence is not available.

4. **Source Priority**: When uploading documents, select the most appropriate source type (CER, Sales, Complaints, etc.) to ensure correct evidence type routing and extraction.

5. **Field Mapping**: The system uses SOTA LLM extraction (Claude Sonnet 4.5) to intelligently map source columns to evidence type fields. See `docs/INPUT_DATA_REQUIREMENTS.md` for expected column headers.
