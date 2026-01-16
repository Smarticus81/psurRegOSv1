# Input Data Requirements for PSUR Generation

This document outlines the expected data structures, columns, and file formats for each high-level input category to ensure full compatibility with the PSUR generation system.

## Overview

The system accepts documents categorized into 8 high-level types. For structured data (Excel, CSV), specific column headers are recommended to ensure accurate automatic mapping. For unstructured data (Word, PDF), the system uses AI to extract key information, but the presence of specific sections or data points is required.

**Common Requirement:** For multi-product files, a **Device Identifier** column (e.g., `Device Code`, `SKU`, `Model Number`, `UDI`) is strongly recommended to link data to the correct device.

---

## 1. CER (Clinical Evaluation Report)
**Purpose:** Provides clinical evidence, literature review summaries, and clinical evaluation conclusions.

*   **Supported Formats:** `.docx`, `.pdf`
*   **Key Extracted Evidence:** `cer_extract`, `clinical_evaluation_extract`, `literature_review_summary`

### Expected Content / Sections
*   **Executive Summary / Conclusion**: Overall clinical safety and performance conclusion.
*   **Literature Search Strategy**: Databases used, search terms, inclusion/exclusion criteria.
*   **Literature Review Results**: Summary of favorable and unfavorable data from literature.
*   **Key Findings**: Specific safety or performance claims validated.

---

## 2. Sales Data
**Purpose:** Quantitative data on sales volume and distribution to calculate patient exposure.

*   **Supported Formats:** `.xlsx`, `.csv`, `.json`
*   **Key Extracted Evidence:** `sales_volume`, `sales_by_region`, `sales_summary`

### Expected Columns (Structured Data)
| Field | Expected Column Headers (Examples) | Required? | Description |
| :--- | :--- | :--- | :--- |
| **Device ID** | `Device Code`, `Part Number`, `SKU` | **Yes** | Identifier to link sales to the device. |
| **Quantity** | `Quantity`, `Units Sold`, `Volume` | **Yes** | Number of units sold/distributed. |
| **Period Start** | `Date`, `Period Start`, `Month` | **Yes** | Start date of the sales record. |
| **Period End** | `Period End` | Optional | End date (if aggregated). Defaults to Start if missing. |
| **Region** | `Region`, `Market`, `Territory` | Recommended | E.g., "EU", "North America". |
| **Country** | `Country` | Recommended | Specific country code or name. |

---

## 3. Complaints
**Purpose:** Records of customer complaints, adverse events, and feedback.

*   **Supported Formats:** `.xlsx`, `.csv`, `.json`, `.docx`
*   **Key Extracted Evidence:** `complaint_record`, `complaint_summary`, `trend_analysis`

### Expected Columns (Structured Data)
| Field | Expected Column Headers (Examples) | Required? | Description |
| :--- | :--- | :--- | :--- |
| **Complaint ID** | `Complaint ID`, `Case Number`, `Ticket #` | **Yes** | Unique identifier for the complaint. |
| **Device ID** | `Device Code`, `Part Number`, `Product` | **Yes** | Identifier of the affected device. |
| **Date** | `Date`, `Reported Date`, `Event Date` | **Yes** | Date the complaint was received/occurred. |
| **Description** | `Description`, `Event Details`, `Narrative` | **Yes** | Text description of the issue. |
| **Severity** | `Severity`, `Classification` | Recommended | E.g., "Critical", "Major", "Minor". |
| **Serious?** | `Serious`, `Reportable?` | Recommended | Boolean/Text indicating if it was a serious incident. |
| **Status** | `Status`, `State` | Optional | E.g., "Open", "Closed", "Investigating". |

---

## 4. Field Actions and Recalls (FSCA)
**Purpose:** Details of any Field Safety Corrective Actions or Recalls.

*   **Supported Formats:** `.xlsx`, `.csv`, `.docx`
*   **Key Extracted Evidence:** `fsca_record`, `recall_record`

### Expected Columns (Structured Data)
| Field | Expected Column Headers (Examples) | Required? | Description |
| :--- | :--- | :--- | :--- |
| **FSCA ID** | `FSCA ID`, `Recall Number`, `Ref #` | **Yes** | Unique identifier for the action. |
| **Device ID** | `Device Code`, `Affected Product` | **Yes** | Identifier of the affected device(s). |
| **Type** | `Action Type`, `Type`, `Reason` | **Yes** | E.g., "Recall", "Safety Notice". |
| **Date** | `Date`, `Initiation Date` | **Yes** | Date the action was initiated. |
| **Status** | `Status` | Recommended | E.g., "Open", "Completed". |
| **Affected Units** | `Affected Units`, `Quantity` | Optional | Number of devices impacted. |

---

## 5. PMCF (Post-Market Clinical Follow-up)
**Purpose:** Results and summaries from PMCF activities (surveys, registries, studies).

*   **Supported Formats:** `.docx`, `.pdf`, `.xlsx`
*   **Key Extracted Evidence:** `pmcf_summary`, `pmcf_result`

### Expected Content (Document/Structured)
*   **Study/Activity Name**: Title of the PMCF activity.
*   **Status**: E.g., "Ongoing", "Completed".
*   **Key Findings**: Summary of clinical data gathered.
*   **Conclusion**: Whether the activity confirms safety/performance.

---

## 6. Risk Documents
**Purpose:** Risk management files, including Benefit-Risk Analysis.

*   **Supported Formats:** `.docx`, `.pdf`, `.xlsx`
*   **Key Extracted Evidence:** `benefit_risk_assessment`, `risk_assessment`

### Expected Content
*   **Risk Profile**: Summary of residual risks.
*   **Benefit-Risk Conclusion**: Statement on whether benefits continue to outweigh risks.
*   **New Risks**: Identification of any previously unrecognized risks.

---

## 7. CAPA (Corrective and Preventive Actions)
**Purpose:** Records of CAPAs related to the device.

*   **Supported Formats:** `.xlsx`, `.csv`, `.docx`
*   **Key Extracted Evidence:** `capa_record`, `capa_summary`

### Expected Columns (Structured Data)
| Field | Expected Column Headers (Examples) | Required? | Description |
| :--- | :--- | :--- | :--- |
| **CAPA ID** | `CAPA ID`, `Number`, `Record ID` | **Yes** | Unique identifier. |
| **Description** | `Description`, `Issue` | **Yes** | Description of the non-conformance/issue. |
| **Date** | `Date`, `Open Date` | **Yes** | Date initiated. |
| **Root Cause** | `Root Cause`, `Analysis` | Recommended | Determined cause of the issue. |
| **Status** | `Status` | Recommended | E.g., "Implemented", "Effectiveness Check". |

---

## 8. Administrative Data
**Purpose:** Device registration details, manufacturer info, and regulatory history.

*   **Supported Formats:** `.xlsx`, `.csv`, `.pdf`
*   **Key Extracted Evidence:** `device_registry_record`, `manufacturer_profile`, `regulatory_certificate`

### Expected Columns (Structured Data)
| Field | Expected Column Headers (Examples) | Required? | Description |
| :--- | :--- | :--- | :--- |
| **Device Name** | `Device Name`, `Trade Name` | **Yes** | Commercial name of the device. |
| **Model** | `Model`, `Reference` | Recommended | Specific model number/name. |
| **UDI-DI** | `UDI`, `UDI-DI`, `GTIN` | Recommended | Basic UDI-DI. |
