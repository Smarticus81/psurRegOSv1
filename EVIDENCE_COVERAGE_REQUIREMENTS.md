# PSUR Evidence Coverage Requirements (MDCG 2022-21)

To achieve 100% coverage for a Periodic Safety Update Report (PSUR) under EU MDR 2017/745, the following evidence types and data points are required. This structure is aligned with the **MDCG 2022-21 Annex I** template used in the system.

## 1. Consolidated Evidence Checklist

### Device & Regulatory Data
- [ ] **Device Registry Record**: Basic UDI-DI, GMDN/EMDN codes, risk class, intended use, user profile (from `devices` table).
- [ ] **Manufacturer Profile**: Name, SRN, address, Notified Body details.
- [ ] **Regulatory Certificate Record**: CE certificate number, expiry date.
- [ ] **Declaration of Conformity**: Current version.

### Post-Market Surveillance (PMS) Framework
- [ ] **PMS Plan Extract**: Date, version, specific surveillance activities planned.
- [ ] **PMS Activity Log**: Dates and statuses of executed PMS activities (e.g., surveys, audits).
- [ ] **Previous PSUR Extract**: Conclusions, actions taken, and benefit-risk profile from the preceding period.

### Usage & Market Data (ERP/Sales)
- [ ] **Sales Summary / Distribution Records**:
    - [ ] Part Numbers / SKUs
    - [ ] Quantity Sold / Units Placed on Market
    - [ ] Ship To Countries (Distinguish EEA+TR+XI vs ROW)
    - [ ] Dates (Ship Date / Invoice Date)
- [ ] **Usage Estimate**: Calculated patient exposure (e.g., device-years, procedures performed).

### Vigilance & Safety Data (QMS)
- [ ] **Complaint Records**:
    - [ ] Complaint ID, Receipt Date, Event Date
    - [ ] Problem Description
    - [ ] Severity / Seriousness Classification
    - [ ] Patient Outcome
    - [ ] Geographic Region
    - [ ] Device Batch/Serial Number
- [ ] **Serious Incident Records**:
    - [ ] IMDRF Event Codes (Annex A) & Health Impact Codes
    - [ ] Reporting Status (Submitted to EUDAMED/NC)
- [ ] **Trend Analysis**:
    - [ ] Statistical signal detection results
    - [ ] Baseline rates vs. current period rates
- [ ] **FSCA / Recall Records**:
    - [ ] FSCA Reference Number
    - [ ] Reason for Action
    - [ ] Date Initiated / Closed
    - [ ] Affected Scope (Batches/Regions)

### CAPA & Quality Data (QMS)
- [ ] **CAPA Records**:
    - [ ] CAPA ID & Trigger Source
    - [ ] Root Cause Analysis
    - [ ] Corrective/Preventive Actions
    - [ ] Effectiveness Check Results & Dates

### Clinical & External Data
- [ ] **Literature Review Summary**:
    - [ ] Search Protocol (Databases, Keywords, Dates)
    - [ ] Included/Excluded Quantities
    - [ ] Key Findings (Safety/Performance signals)
- [ ] **External Database Search Log**:
    - [ ] FDA MAUDE / MAUDE / Health Canada queries
    - [ ] Search terms used
    - [ ] Relevant hits found/analyzed
- [ ] **PMCF Activity Records**:
    - [ ] Specific study/activity IDs
    - [ ] Main findings
    - [ ] Impact on Clinical Evaluation Report (CER)

### Risk Management
- [ ] **Risk Management File (RMF) Extract**:
    - [ ] Benefit-Risk Analysis Matrix
    - [ ] Residual Risk Acceptability Statements
    - [ ] Change Log (New risks identified)

---

## 2. Requirements by PSUR Section

### Section 1: Executive Summary
* **Requirement**: High-level synthesis of the entire report.
* **Evidence Required**:
  - `sales_summary`
  - `complaint_summary`
  - `serious_incident_summary`
  - `trend_analysis`
  - `fsca_summary`
  - `capa_summary`
  - `pmcf_summary`
  - `benefit_risk_assessment`

### Section 2: Device Description & Scope
* **Requirement**: Precisely define what devices are covered.
* **Evidence Required**:
  - `device_registry_record`
  - `ifu_extract`
  - `clinical_evaluation_extract` (Intended Use)
  - `pms_plan_extract`
  - *If changes occurred*: `change_control_record`, `previous_psur_extract`

### Section 3: PMS Activities
* **Requirement**: Evidence that the PMS Plan was followed.
* **Evidence Required**:
  - `pms_plan_extract`
  - `pms_activity_log`
  - `data_source_register`

### Section 4: Sales Volume & Population Exposure
* **Requirement**: Denominators for safety rate calculations.
* **Evidence Required**:
  - `sales_summary` (Total volumes)
  - `sales_by_region` (EEA vs ROW breakdown)
  - `usage_estimate` (Calculated exposure)

### Section 5: Vigilance & Safety (Complaints / Incidents)
* **Requirement**: Detailed safety data analysis.
* **Evidence Required**:
  - `serious_incident_summary` & `vigilance_report`
  - `serious_incident_records_imdrf` (Specific IMDRF coded table)
  - `complaint_summary` & `complaint_record`
  - `complaints_by_region` (Table data)

### Section 6: Trend Reporting
* **Requirement**: Identification of statistically significant increases.
* **Evidence Required**:
  - `trend_analysis`
  - `signal_log`
  - `sales_summary` (For rate normalization)

### Section 7: Field Safety Corrective Actions (FSCA)
* **Requirement**: Details on mandatory market actions.
* **Evidence Required**:
  - `fsca_summary`
  - `fsca_record`
  - `recall_record`

### Section 8: CAPA
* **Requirement**: Preventive actions taken proactively.
* **Evidence Required**:
  - `capa_summary`
  - `capa_record`
  - `ncr_record` (Non-conformance reports)

### Section 9: Literature Review
* **Requirement**: Independent surveillance of scientific data.
* **Evidence Required**:
  - `literature_search_strategy` (Protocol)
  - `literature_review_summary` (Results)

### Section 10: External Databases
* **Requirement**: Review of competitor/similar device data.
* **Evidence Required**:
  - `external_db_query_log`
  - `external_db_summary`

### Section 11: PMCF (Post-Market Clinical Follow-up)
* **Requirement**: Dedicated clinical data gathering.
* **Evidence Required**:
  - `pmcf_summary`
  - `pmcf_activity_record`
  - `cer_extract` (Linkage to Clinical Evaluation)

### Section 12: Conclusions (Benefit-Risk)
* **Requirement**: Final determination of safety and actions.
* **Evidence Required**:
  - `benefit_risk_assessment`
  - `rmf_extract` (Risk profile validation)
  - `change_control_record` (Actions taken)
