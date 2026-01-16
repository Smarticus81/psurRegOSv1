/**
 * PSUR-GRKB Comprehensive Seed Script
 * 
 * Seeds all PSUR-specific regulatory knowledge:
 * - Evidence type definitions with validation schemas
 * - MDCG 2022-21 Annex I sections
 * - FormQAR-054 sections
 * - EU MDR Article 86 obligations (comprehensive)
 * - UK MDR PSUR obligations
 * - Obligation dependencies and cross-references
 * - Slot-obligation mappings
 * 
 * Run: npx tsx server/scripts/seed-psur-grkb.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load environment
const envPath = resolve(process.cwd(), ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  }
  console.log("[PSUR-GRKB] Loaded environment from .env");
} catch {
  console.log("[PSUR-GRKB] No .env file found, using existing environment");
}

import {
  psurEvidenceTypes,
  psurSections,
  psurObligationDependencies,
  psurSlotObligations,
  grkbObligations,
  type InsertPsurEvidenceType,
  type InsertPsurSection,
  type InsertPsurObligationDependency,
  type InsertPsurSlotObligation,
  type InsertGrkbObligation,
} from "@shared/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const PSUR_EVIDENCE_TYPES: InsertPsurEvidenceType[] = [
  // === SAFETY ===
  {
    evidenceTypeId: "complaint_record",
    displayName: "Complaint Record",
    description: "Individual complaint reports from customers, healthcare providers, or patients",
    category: "safety",
    requiredFields: ["complaint_id", "received_date", "description"],
    optionalFields: ["severity", "outcome", "region", "patient_outcome", "device_id", "root_cause", "classification_code"],
    fieldDefinitions: {
      complaint_id: { type: "string", description: "Unique complaint identifier" },
      received_date: { type: "date", format: "ISO8601", description: "Date complaint was received" },
      description: { type: "string", description: "Description of the complaint" },
      severity: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"], description: "Severity classification" },
      outcome: { type: "string", description: "Resolution outcome" },
      region: { type: "string", description: "Geographic region" },
      patient_outcome: { type: "string", description: "Patient outcome if applicable" },
      device_id: { type: "string", description: "Device identifier" },
      root_cause: { type: "string", description: "Root cause analysis result" },
      classification_code: { type: "string", description: "IMDRF or internal classification code" },
    },
    validationRules: [
      { rule: "received_date <= today", errorMessage: "Received date cannot be in the future", severity: "error" },
      { rule: "description.length >= 10", errorMessage: "Description must be at least 10 characters", severity: "warning" },
    ],
    expectedSourceTypes: ["excel", "csv", "json"],
    supportsClassification: true,
    classificationModel: "gpt-4o",
    typicalPsurSections: ["complaints", "safety_summary", "trend_analysis"],
    version: "1.0.0",
    isActive: true,
  },
  {
    evidenceTypeId: "serious_incident_record",
    displayName: "Serious Incident Record",
    description: "Reportable serious incidents per MDR Article 87 definitions",
    category: "safety",
    requiredFields: ["incident_id", "incident_date", "description", "patient_outcome"],
    optionalFields: ["device_involved", "root_cause", "corrective_action", "reported_to", "report_date", "mdr_report_number"],
    fieldDefinitions: {
      incident_id: { type: "string", description: "Unique incident identifier" },
      incident_date: { type: "date", format: "ISO8601", description: "Date incident occurred" },
      description: { type: "string", description: "Description of the incident" },
      patient_outcome: { type: "string", enum: ["death", "serious_injury", "hospitalization", "intervention_required", "life_threatening", "other"], description: "Patient outcome" },
      device_involved: { type: "string", description: "Device information" },
      root_cause: { type: "string", description: "Root cause analysis" },
      corrective_action: { type: "string", description: "Actions taken" },
      reported_to: { type: "string", description: "Regulatory authority reported to" },
      report_date: { type: "date", description: "Date reported to authority" },
      mdr_report_number: { type: "string", description: "MDR report reference number" },
    },
    validationRules: [
      { rule: "incident_date <= today", errorMessage: "Incident date cannot be in the future", severity: "error" },
      { rule: "patient_outcome in valid_outcomes", errorMessage: "Patient outcome must be from allowed list", severity: "error" },
    ],
    expectedSourceTypes: ["excel", "docx"],
    supportsClassification: false,
    typicalPsurSections: ["serious_incidents", "vigilance_summary"],
    version: "1.0.0",
    isActive: true,
  },
  {
    evidenceTypeId: "fsca_record",
    displayName: "Field Safety Corrective Action",
    description: "FSCA records including recalls, corrections, and safety notices",
    category: "safety",
    requiredFields: ["fsca_id", "initiation_date", "description", "action_type"],
    optionalFields: ["affected_units", "countries", "status", "completion_date", "root_cause", "effectiveness_check"],
    fieldDefinitions: {
      fsca_id: { type: "string", description: "FSCA identifier" },
      initiation_date: { type: "date", description: "Date FSCA was initiated" },
      description: { type: "string", description: "Description of the FSCA" },
      action_type: { type: "string", enum: ["recall", "correction", "advisory", "labeling_change", "software_update"], description: "Type of action" },
      affected_units: { type: "number", description: "Number of affected units" },
      countries: { type: "array", description: "Affected countries" },
      status: { type: "string", enum: ["open", "closed", "ongoing"], description: "Current status" },
      completion_date: { type: "date", description: "Date completed" },
      root_cause: { type: "string", description: "Root cause" },
      effectiveness_check: { type: "string", description: "Effectiveness verification result" },
    },
    expectedSourceTypes: ["excel", "docx"],
    supportsClassification: false,
    typicalPsurSections: ["fsca_summary", "corrective_actions"],
    version: "1.0.0",
    isActive: true,
  },
  
  // === QUALITY ===
  {
    evidenceTypeId: "capa_record",
    displayName: "CAPA Record",
    description: "Corrective and Preventive Action records linked to PMS findings",
    category: "quality",
    requiredFields: ["capa_id", "open_date", "description", "capa_type"],
    optionalFields: ["status", "target_date", "close_date", "effectiveness", "root_cause", "linked_complaint"],
    fieldDefinitions: {
      capa_id: { type: "string", description: "CAPA identifier" },
      open_date: { type: "date", description: "Date opened" },
      description: { type: "string", description: "CAPA description" },
      capa_type: { type: "string", enum: ["corrective", "preventive"], description: "Type of action" },
      status: { type: "string", enum: ["open", "in_progress", "verification", "closed"], description: "Current status" },
      target_date: { type: "date", description: "Target completion date" },
      close_date: { type: "date", description: "Actual close date" },
      effectiveness: { type: "string", enum: ["effective", "ineffective", "pending"], description: "Effectiveness assessment" },
      root_cause: { type: "string", description: "Root cause analysis" },
      linked_complaint: { type: "string", description: "Linked complaint ID if applicable" },
    },
    expectedSourceTypes: ["excel", "docx"],
    supportsClassification: false,
    typicalPsurSections: ["capa_summary", "corrective_actions"],
    version: "1.0.0",
    isActive: true,
  },
  
  // === COMMERCIAL ===
  {
    evidenceTypeId: "sales_volume",
    displayName: "Sales/Distribution Data",
    description: "Sales volume and distribution data by region and period",
    category: "commercial",
    requiredFields: ["region", "period", "units"],
    optionalFields: ["revenue", "product_line", "channel", "country", "lot_numbers"],
    fieldDefinitions: {
      region: { type: "string", description: "Geographic region (EU, US, APAC, etc.)" },
      period: { type: "string", description: "Time period (YYYY-MM or YYYY-QN)" },
      units: { type: "number", description: "Number of units sold/distributed" },
      revenue: { type: "number", description: "Revenue in currency" },
      product_line: { type: "string", description: "Product line or variant" },
      channel: { type: "string", description: "Distribution channel" },
      country: { type: "string", description: "Country code" },
      lot_numbers: { type: "array", description: "Lot numbers included" },
    },
    validationRules: [
      { rule: "units >= 0", errorMessage: "Units cannot be negative", severity: "error" },
    ],
    expectedSourceTypes: ["excel", "csv", "json"],
    supportsClassification: false,
    typicalPsurSections: ["sales_exposure", "market_distribution"],
    version: "1.0.0",
    isActive: true,
  },
  
  // === CLINICAL ===
  {
    evidenceTypeId: "pmcf_result",
    displayName: "PMCF Study Result",
    description: "Post-Market Clinical Follow-up study results and findings",
    category: "clinical",
    requiredFields: ["study_id", "study_type", "findings"],
    optionalFields: ["patient_count", "start_date", "end_date", "conclusions", "adverse_events", "protocol_id"],
    fieldDefinitions: {
      study_id: { type: "string", description: "Study identifier" },
      study_type: { type: "string", enum: ["registry", "survey", "prospective", "retrospective", "literature_review"], description: "Type of PMCF study" },
      findings: { type: "string", description: "Key findings" },
      patient_count: { type: "number", description: "Number of patients/subjects" },
      start_date: { type: "date", description: "Study start date" },
      end_date: { type: "date", description: "Study end date" },
      conclusions: { type: "string", description: "Study conclusions" },
      adverse_events: { type: "number", description: "Number of adverse events reported" },
      protocol_id: { type: "string", description: "Protocol reference" },
    },
    expectedSourceTypes: ["docx", "pdf"],
    supportsClassification: false,
    typicalPsurSections: ["pmcf_summary", "clinical_data"],
    version: "1.0.0",
    isActive: true,
  },
  {
    evidenceTypeId: "literature_result",
    displayName: "Literature Search Result",
    description: "Systematic literature review results",
    category: "clinical",
    requiredFields: ["reference_id", "title", "relevance"],
    optionalFields: ["authors", "publication_date", "journal", "findings", "safety_signals", "doi", "pmid"],
    fieldDefinitions: {
      reference_id: { type: "string", description: "Internal reference ID" },
      title: { type: "string", description: "Publication title" },
      relevance: { type: "string", enum: ["high", "medium", "low", "excluded"], description: "Relevance to device" },
      authors: { type: "string", description: "Author list" },
      publication_date: { type: "date", description: "Publication date" },
      journal: { type: "string", description: "Journal name" },
      findings: { type: "string", description: "Key findings relevant to device" },
      safety_signals: { type: "string", description: "Any safety signals identified" },
      doi: { type: "string", description: "DOI" },
      pmid: { type: "string", description: "PubMed ID" },
    },
    expectedSourceTypes: ["excel", "docx"],
    supportsClassification: false,
    typicalPsurSections: ["literature_review"],
    version: "1.0.0",
    isActive: true,
  },
  
  // === REGULATORY ===
  {
    evidenceTypeId: "external_db_query",
    displayName: "External Database Search",
    description: "Results from external database searches (MAUDE, MHRA, TGA, etc.)",
    category: "regulatory",
    requiredFields: ["database", "query_date", "results_count"],
    optionalFields: ["query_terms", "relevant_findings", "analysis", "date_range", "export_file"],
    fieldDefinitions: {
      database: { type: "string", enum: ["MAUDE", "MHRA", "TGA", "EUDAMED", "SWISSMEDIC", "BfArM"], description: "Database searched" },
      query_date: { type: "date", description: "Date search was conducted" },
      results_count: { type: "number", description: "Number of results returned" },
      query_terms: { type: "string", description: "Search terms used" },
      relevant_findings: { type: "number", description: "Number of relevant findings" },
      analysis: { type: "string", description: "Analysis of findings" },
      date_range: { type: "string", description: "Date range searched" },
      export_file: { type: "string", description: "Reference to exported results file" },
    },
    expectedSourceTypes: ["excel", "docx"],
    supportsClassification: false,
    typicalPsurSections: ["external_data_review"],
    version: "1.0.0",
    isActive: true,
  },
  {
    evidenceTypeId: "trend_analysis",
    displayName: "Trend Analysis Result",
    description: "Statistical trend analysis of complaints, incidents, or other data",
    category: "regulatory",
    requiredFields: ["analysis_type", "period_analyzed", "trend_detected"],
    optionalFields: ["statistical_method", "p_value", "baseline_rate", "current_rate", "conclusion"],
    fieldDefinitions: {
      analysis_type: { type: "string", enum: ["complaint_rate", "incident_rate", "failure_rate", "complaint_category"], description: "Type of trend analysis" },
      period_analyzed: { type: "string", description: "Period covered by analysis" },
      trend_detected: { type: "boolean", description: "Whether statistically significant trend was detected" },
      statistical_method: { type: "string", description: "Statistical method used" },
      p_value: { type: "number", description: "P-value if applicable" },
      baseline_rate: { type: "number", description: "Baseline rate" },
      current_rate: { type: "number", description: "Current rate" },
      conclusion: { type: "string", description: "Conclusion of trend analysis" },
    },
    expectedSourceTypes: ["excel", "docx"],
    supportsClassification: false,
    typicalPsurSections: ["trend_reporting"],
    version: "1.0.0",
    isActive: true,
  },
  {
    evidenceTypeId: "risk_assessment",
    displayName: "Risk Assessment Update",
    description: "Updates to risk management file based on PMS data",
    category: "quality",
    requiredFields: ["risk_id", "hazard", "risk_level_before", "risk_level_after"],
    optionalFields: ["risk_controls", "residual_risk", "status", "update_reason"],
    fieldDefinitions: {
      risk_id: { type: "string", description: "Risk identifier from RMF" },
      hazard: { type: "string", description: "Identified hazard" },
      risk_level_before: { type: "string", enum: ["acceptable", "ALARP", "unacceptable"], description: "Risk level before PMS data" },
      risk_level_after: { type: "string", enum: ["acceptable", "ALARP", "unacceptable"], description: "Risk level after PMS data" },
      risk_controls: { type: "string", description: "Risk control measures" },
      residual_risk: { type: "string", description: "Residual risk assessment" },
      status: { type: "string", description: "Status of risk" },
      update_reason: { type: "string", description: "Why risk assessment was updated" },
    },
    expectedSourceTypes: ["docx", "pdf"],
    supportsClassification: false,
    typicalPsurSections: ["benefit_risk_conclusions"],
    version: "1.0.0",
    isActive: true,
  },
  
  // === DEVICE INFORMATION ===
  {
    evidenceTypeId: "device_registry_record",
    displayName: "Device Registry Information",
    description: "Device identification and registration information",
    category: "regulatory",
    requiredFields: ["device_code", "device_name", "udi_di"],
    optionalFields: ["basic_udi", "gmdn_code", "emdn_code", "risk_class", "notified_body", "certificate_number"],
    fieldDefinitions: {
      device_code: { type: "string", description: "Internal device code" },
      device_name: { type: "string", description: "Device trade name" },
      udi_di: { type: "string", description: "UDI-DI" },
      basic_udi: { type: "string", description: "Basic UDI-DI" },
      gmdn_code: { type: "string", description: "GMDN code" },
      emdn_code: { type: "string", description: "EMDN code" },
      risk_class: { type: "string", enum: ["I", "IIa", "IIb", "III"], description: "Risk classification" },
      notified_body: { type: "string", description: "Notified Body name" },
      certificate_number: { type: "string", description: "CE certificate number" },
    },
    expectedSourceTypes: ["json", "excel"],
    supportsClassification: false,
    typicalPsurSections: ["device_description", "cover"],
    version: "1.0.0",
    isActive: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MDCG 2022-21 ANNEX I SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const MDCG_SECTIONS: InsertPsurSection[] = [
  // Cover and Admin
  { sectionId: "MDCG.ANNEXI.COVER", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "0", sectionPath: "Cover Page", displayOrder: 1, title: "Cover Page", sectionType: "cover", mandatory: true, regulatoryBasis: "MDCG 2022-21" },
  { sectionId: "MDCG.ANNEXI.TOC", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "0.1", sectionPath: "Table of Contents", displayOrder: 2, title: "Table of Contents", sectionType: "toc", mandatory: true },
  
  // Section A - Device Description
  { sectionId: "MDCG.ANNEXI.A", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "A", sectionPath: "A > Device Description", displayOrder: 10, title: "Description of Device(s) and Intended Purpose", sectionType: "narrative", mandatory: true, minimumWordCount: 100, requiredEvidenceTypes: ["device_registry_record"], regulatoryBasis: "MDCG 2022-21 Annex I Section A" },
  
  // Section B - PMS Activities
  { sectionId: "MDCG.ANNEXI.B", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "B", sectionPath: "B > PMS Activities", displayOrder: 20, title: "Post-Market Surveillance Activities", sectionType: "narrative", mandatory: true, regulatoryBasis: "MDCG 2022-21 Annex I Section B, EU MDR Article 83" },
  
  // Section C - Sales/Exposure
  { sectionId: "MDCG.ANNEXI.C", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "C", sectionPath: "C > Sales and Exposure", displayOrder: 30, title: "Sales Volume and Population Exposure", sectionType: "table", mandatory: true, requiredEvidenceTypes: ["sales_volume"], minimumEvidenceAtoms: 1, renderAs: "table", tableSchema: { columns: [{ name: "region", type: "string" }, { name: "period", type: "string" }, { name: "units", type: "number" }] }, regulatoryBasis: "MDCG 2022-21 Annex I Section C, EU MDR Article 86(1)" },
  
  // Section D - Safety Data: Serious Incidents
  { sectionId: "MDCG.ANNEXI.D", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "D", sectionPath: "D > Serious Incidents", displayOrder: 40, title: "Summary of Serious Incidents", sectionType: "table", mandatory: true, requiredEvidenceTypes: ["serious_incident_record"], renderAs: "table", regulatoryBasis: "MDCG 2022-21 Annex I Section D, EU MDR Article 86(1), Article 87" },
  { sectionId: "MDCG.ANNEXI.D.NARRATIVE", templateId: "MDCG_2022_21_ANNEX_I", parentSectionId: "MDCG.ANNEXI.D", sectionNumber: "D.1", sectionPath: "D > Serious Incidents > Analysis", displayOrder: 41, title: "Analysis of Serious Incidents", sectionType: "narrative", mandatory: true },
  
  // Section E - Trend Reporting
  { sectionId: "MDCG.ANNEXI.E", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "E", sectionPath: "E > Trend Reporting", displayOrder: 50, title: "Trend Reporting per Article 88", sectionType: "narrative", mandatory: true, requiredEvidenceTypes: ["trend_analysis"], regulatoryBasis: "MDCG 2022-21 Annex I Section E, EU MDR Article 88" },
  
  // Section F - Complaints
  { sectionId: "MDCG.ANNEXI.F", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "F", sectionPath: "F > Complaints", displayOrder: 60, title: "Summary and Analysis of Complaints", sectionType: "table", mandatory: true, requiredEvidenceTypes: ["complaint_record"], minimumEvidenceAtoms: 0, renderAs: "table", regulatoryBasis: "MDCG 2022-21 Annex I Section F, EU MDR Annex III" },
  { sectionId: "MDCG.ANNEXI.F.NARRATIVE", templateId: "MDCG_2022_21_ANNEX_I", parentSectionId: "MDCG.ANNEXI.F", sectionNumber: "F.1", sectionPath: "F > Complaints > Analysis", displayOrder: 61, title: "Analysis of Complaints", sectionType: "narrative", mandatory: true },
  
  // Section G - Non-Serious Incidents
  { sectionId: "MDCG.ANNEXI.G", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "G", sectionPath: "G > Non-Serious Incidents", displayOrder: 70, title: "Non-Serious Incidents and Near-Misses", sectionType: "narrative", mandatory: false },
  
  // Section H - FSCA
  { sectionId: "MDCG.ANNEXI.H", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "H", sectionPath: "H > FSCA", displayOrder: 80, title: "Field Safety Corrective Actions", sectionType: "table", mandatory: true, requiredEvidenceTypes: ["fsca_record"], renderAs: "table", regulatoryBasis: "MDCG 2022-21 Annex I Section H, EU MDR Article 86(1), Article 82" },
  
  // Section I - CAPA
  { sectionId: "MDCG.ANNEXI.I", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "I", sectionPath: "I > CAPA", displayOrder: 90, title: "Corrective and Preventive Actions", sectionType: "table", mandatory: true, requiredEvidenceTypes: ["capa_record"], renderAs: "table", regulatoryBasis: "MDCG 2022-21 Annex I Section I, EU MDR Annex III" },
  
  // Section J - Literature Review
  { sectionId: "MDCG.ANNEXI.J", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "J", sectionPath: "J > Literature Review", displayOrder: 100, title: "Systematic Literature Review", sectionType: "narrative", mandatory: true, requiredEvidenceTypes: ["literature_result"], regulatoryBasis: "MDCG 2022-21 Annex I Section J, EU MDR Annex III" },
  
  // Section K - External Databases
  { sectionId: "MDCG.ANNEXI.K", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "K", sectionPath: "K > External Databases", displayOrder: 110, title: "Review of External Databases", sectionType: "narrative", mandatory: true, requiredEvidenceTypes: ["external_db_query"], regulatoryBasis: "MDCG 2022-21 Annex I Section K, EU MDR Annex III" },
  
  // Section L - PMCF
  { sectionId: "MDCG.ANNEXI.L", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "L", sectionPath: "L > PMCF", displayOrder: 120, title: "Post-Market Clinical Follow-up", sectionType: "narrative", mandatory: true, requiredEvidenceTypes: ["pmcf_result"], regulatoryBasis: "MDCG 2022-21 Annex I Section L, EU MDR Article 86(1), Article 61" },
  { sectionId: "MDCG.ANNEXI.L.TABLE", templateId: "MDCG_2022_21_ANNEX_I", parentSectionId: "MDCG.ANNEXI.L", sectionNumber: "L.1", sectionPath: "L > PMCF > Studies Table", displayOrder: 121, title: "PMCF Studies Summary", sectionType: "table", mandatory: true },
  
  // Section M - Conclusions
  { sectionId: "MDCG.ANNEXI.M", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "M", sectionPath: "M > Conclusions", displayOrder: 130, title: "Overall Conclusions", sectionType: "narrative", mandatory: true, minimumWordCount: 200, requiredEvidenceTypes: ["risk_assessment"], regulatoryBasis: "MDCG 2022-21 Annex I Section M, EU MDR Article 86(1)" },
  { sectionId: "MDCG.ANNEXI.M.BR", templateId: "MDCG_2022_21_ANNEX_I", parentSectionId: "MDCG.ANNEXI.M", sectionNumber: "M.1", sectionPath: "M > Conclusions > Benefit-Risk", displayOrder: 131, title: "Benefit-Risk Determination", sectionType: "narrative", mandatory: true },
  { sectionId: "MDCG.ANNEXI.M.ACTIONS", templateId: "MDCG_2022_21_ANNEX_I", parentSectionId: "MDCG.ANNEXI.M", sectionNumber: "M.2", sectionPath: "M > Conclusions > Actions", displayOrder: 132, title: "Actions Taken or Planned", sectionType: "narrative", mandatory: true },
  
  // Appendices
  { sectionId: "MDCG.ANNEXI.APP.A", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "App.A", sectionPath: "Appendices > Evidence Sources", displayOrder: 200, title: "Appendix A: Evidence Sources", sectionType: "appendix", mandatory: false },
  { sectionId: "MDCG.ANNEXI.APP.B", templateId: "MDCG_2022_21_ANNEX_I", sectionNumber: "App.B", sectionPath: "Appendices > Slot Mapping", displayOrder: 201, title: "Appendix B: Slot-Evidence Mapping", sectionType: "appendix", mandatory: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// EU MDR ARTICLE 86 OBLIGATIONS (COMPREHENSIVE)
// ═══════════════════════════════════════════════════════════════════════════════

const EU_MDR_PSUR_OBLIGATIONS: InsertGrkbObligation[] = [
  // === ARTICLE 86(1) CORE ===
  {
    obligationId: "EU_MDR.ART86.1",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "PSUR Core Requirement",
    text: "Manufacturers of class IIa, class IIb and class III devices shall prepare a periodic safety update report ('PSUR') for each device and where relevant for each category or group of devices summarising the results and conclusions of the analyses of the post-market surveillance data gathered as a result of the post-market surveillance plan.",
    sourceCitation: "EU MDR 2017/745 Article 86(1)",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: [],
  },
  {
    obligationId: "EU_MDR.ART86.1.a",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Main Safety and Performance Conclusions",
    text: "The PSUR shall set out the conclusions of the benefit-risk determination.",
    sourceCitation: "EU MDR 2017/745 Article 86(1)(a)",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["risk_assessment"],
  },
  {
    obligationId: "EU_MDR.ART86.1.b",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Main PMCF Findings",
    text: "The PSUR shall set out the main findings of the PMCF.",
    sourceCitation: "EU MDR 2017/745 Article 86(1)(b)",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["pmcf_result"],
  },
  {
    obligationId: "EU_MDR.ART86.1.c",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Sales Volume and Exposure",
    text: "The PSUR shall set out the volume of sales of the device and an estimate of the size and other characteristics of the population using the device and, where practicable, the usage frequency of the device.",
    sourceCitation: "EU MDR 2017/745 Article 86(1)(c)",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["sales_volume"],
  },
  
  // === SERIOUS INCIDENTS ===
  {
    obligationId: "EU_MDR.ART86.SI.SUMMARY",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Serious Incidents Summary",
    text: "Summary of serious incidents reported during the reporting period, including number, type, and severity.",
    sourceCitation: "EU MDR 2017/745 Article 86(1), Article 87",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["serious_incident_record"],
  },
  {
    obligationId: "EU_MDR.ART86.SI.ANALYSIS",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Serious Incidents Root Cause Analysis",
    text: "Analysis of serious incidents including root cause analysis and identification of any patterns or trends.",
    sourceCitation: "EU MDR 2017/745 Article 86(1)",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["serious_incident_record"],
  },
  
  // === COMPLAINTS ===
  {
    obligationId: "EU_MDR.ART86.COMPLAINTS.SUMMARY",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Complaints Summary",
    text: "Summary of complaints received during the reporting period, categorized by type, severity, and geographic region.",
    sourceCitation: "EU MDR 2017/745 Annex III Section 1.1",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["complaint_record"],
  },
  {
    obligationId: "EU_MDR.ART86.COMPLAINTS.ANALYSIS",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Complaints Analysis",
    text: "Analysis of complaint data including trend analysis, rate calculations, and identification of any systematic issues.",
    sourceCitation: "EU MDR 2017/745 Annex III",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["complaint_record", "trend_analysis"],
  },
  
  // === FSCA ===
  {
    obligationId: "EU_MDR.ART86.FSCA.SUMMARY",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "FSCA Summary",
    text: "Summary of all Field Safety Corrective Actions initiated, ongoing, or completed during the reporting period.",
    sourceCitation: "EU MDR 2017/745 Article 86(1), Article 82",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["fsca_record"],
  },
  {
    obligationId: "EU_MDR.ART86.FSCA.EFFECTIVENESS",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "FSCA Effectiveness",
    text: "Assessment of FSCA effectiveness including verification results.",
    sourceCitation: "EU MDR 2017/745 Article 82",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["fsca_record"],
  },
  
  // === TREND REPORTING (Article 88) ===
  {
    obligationId: "EU_MDR.ART88.TREND",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Trend Reporting per Article 88",
    text: "Where a manufacturer of a device, other than a device within the meaning of Article 1(8) of Directive 90/385/EEC or a device referred to in the first subparagraph of Article 1(4) of Directive 93/42/EEC, identifies a statistically significant increase in the frequency or severity of incidents or suspected incidents covered by Article 87(1) of this Regulation that might have a significant impact on the benefit-risk analysis, the manufacturer shall report to the competent authorities.",
    sourceCitation: "EU MDR 2017/745 Article 88",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["trend_analysis"],
  },
  
  // === PMCF ===
  {
    obligationId: "EU_MDR.ART86.PMCF.ACTIVITIES",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "PMCF Activities Summary",
    text: "Summary of PMCF activities conducted during the reporting period, including studies initiated, ongoing, and completed.",
    sourceCitation: "EU MDR 2017/745 Article 86(1)(b), Article 61, Annex XIV Part B",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["pmcf_result"],
  },
  {
    obligationId: "EU_MDR.ART86.PMCF.FINDINGS",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "PMCF Findings Integration",
    text: "Integration of PMCF findings into the clinical evaluation and risk management documentation.",
    sourceCitation: "EU MDR 2017/745 Article 61, Annex XIV Part B",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["pmcf_result", "risk_assessment"],
  },
  
  // === LITERATURE ===
  {
    obligationId: "EU_MDR.ANNEXIII.LITERATURE",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Systematic Literature Review",
    text: "Systematic review of scientific literature relevant to the device, including search strategy, screening criteria, and findings.",
    sourceCitation: "EU MDR 2017/745 Annex III",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["literature_result"],
  },
  
  // === EXTERNAL DATABASES ===
  {
    obligationId: "EU_MDR.ANNEXIII.EXTERNAL_DB",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "External Database Review",
    text: "Review of external databases and registries (e.g., MAUDE, MHRA) for relevant safety information.",
    sourceCitation: "EU MDR 2017/745 Annex III",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["external_db_query"],
  },
  
  // === CAPA ===
  {
    obligationId: "EU_MDR.ANNEXIII.CAPA",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Corrective and Preventive Actions",
    text: "Summary of corrective and preventive actions linked to PMS findings.",
    sourceCitation: "EU MDR 2017/745 Annex III",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["capa_record"],
  },
  
  // === CONCLUSIONS ===
  {
    obligationId: "EU_MDR.ART86.CONCLUSIONS.BR",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Benefit-Risk Conclusions",
    text: "Overall conclusions on the benefit-risk profile of the device based on all available PMS data.",
    sourceCitation: "EU MDR 2017/745 Article 86(1)(a)",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["risk_assessment"],
  },
  {
    obligationId: "EU_MDR.ART86.CONCLUSIONS.ACTIONS",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Actions Taken or Planned",
    text: "Description of preventive and corrective actions taken or planned as a result of PMS findings.",
    sourceCitation: "EU MDR 2017/745 Annex III",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["capa_record"],
  },
  
  // === DEVICE DESCRIPTION ===
  {
    obligationId: "EU_MDR.ART86.DEVICE_DESC",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Device Description and Scope",
    text: "Description of device(s) covered by the PSUR including identification, intended purpose, and scope.",
    sourceCitation: "EU MDR 2017/745 Article 86(1)",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["device_registry_record"],
  },
  
  // === ADMINISTRATIVE ===
  {
    obligationId: "EU_MDR.ART86.ADMIN",
    jurisdiction: "EU_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "Administrative Identification",
    text: "Administrative information including manufacturer details, device identification, UDI, reporting period.",
    sourceCitation: "EU MDR 2017/745 Article 86, MDCG 2022-21",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["device_registry_record"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// UK MDR PSUR OBLIGATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const UK_MDR_PSUR_OBLIGATIONS: InsertGrkbObligation[] = [
  {
    obligationId: "UK_MDR.PSUR.ADMIN",
    jurisdiction: "UK_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "UK PSUR Administrative Requirements",
    text: "Administrative identification for UK market including UKCA marking details.",
    sourceCitation: "UK MDR 2002 Schedule 3",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["device_registry_record"],
  },
  {
    obligationId: "UK_MDR.PSUR.SALES",
    jurisdiction: "UK_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "UK Market Sales Data",
    text: "Sales volume and distribution data specific to the UK market.",
    sourceCitation: "UK MDR 2002",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["sales_volume"],
  },
  {
    obligationId: "UK_MDR.PSUR.INCIDENTS",
    jurisdiction: "UK_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "UK Adverse Incidents Summary",
    text: "Summary of adverse incidents reported to MHRA.",
    sourceCitation: "UK MDR 2002 Regulation 46",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["serious_incident_record"],
  },
  {
    obligationId: "UK_MDR.PSUR.COMPLAINTS",
    jurisdiction: "UK_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "UK Complaints Summary",
    text: "Summary of complaints from UK customers and healthcare providers.",
    sourceCitation: "UK MDR 2002",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["complaint_record"],
  },
  {
    obligationId: "UK_MDR.PSUR.FSN",
    jurisdiction: "UK_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "UK Field Safety Notices",
    text: "Summary of Field Safety Notices issued in the UK.",
    sourceCitation: "UK MDR 2002 Regulation 47",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["fsca_record"],
  },
  {
    obligationId: "UK_MDR.PSUR.CONCLUSIONS",
    jurisdiction: "UK_MDR",
    artifactType: "PSUR",
    kind: "obligation",
    title: "UK-Specific Conclusions",
    text: "Conclusions specific to the UK market including benefit-risk assessment.",
    sourceCitation: "UK MDR 2002",
    version: "1.0.0",
    mandatory: true,
    requiredEvidenceTypes: ["risk_assessment"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// OBLIGATION DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════

const OBLIGATION_DEPENDENCIES: InsertPsurObligationDependency[] = [
  // Core PSUR requires all sub-obligations
  { fromObligationId: "EU_MDR.ART86.1", toObligationId: "EU_MDR.ART86.1.a", relationType: "REQUIRES", strength: "STRONG", description: "Article 86(1) requires benefit-risk conclusions" },
  { fromObligationId: "EU_MDR.ART86.1", toObligationId: "EU_MDR.ART86.1.b", relationType: "REQUIRES", strength: "STRONG", description: "Article 86(1) requires PMCF findings" },
  { fromObligationId: "EU_MDR.ART86.1", toObligationId: "EU_MDR.ART86.1.c", relationType: "REQUIRES", strength: "STRONG", description: "Article 86(1) requires sales data" },
  
  // Conclusions depend on various data sections
  { fromObligationId: "EU_MDR.ART86.CONCLUSIONS.BR", toObligationId: "EU_MDR.ART86.SI.SUMMARY", relationType: "REQUIRES", strength: "STRONG", description: "Benefit-risk must consider serious incidents" },
  { fromObligationId: "EU_MDR.ART86.CONCLUSIONS.BR", toObligationId: "EU_MDR.ART86.COMPLAINTS.ANALYSIS", relationType: "REQUIRES", strength: "STRONG", description: "Benefit-risk must consider complaints" },
  { fromObligationId: "EU_MDR.ART86.CONCLUSIONS.BR", toObligationId: "EU_MDR.ART86.PMCF.FINDINGS", relationType: "REQUIRES", strength: "STRONG", description: "Benefit-risk must consider PMCF" },
  
  // Trend analysis depends on base data
  { fromObligationId: "EU_MDR.ART88.TREND", toObligationId: "EU_MDR.ART86.COMPLAINTS.SUMMARY", relationType: "REQUIRES", strength: "STRONG", description: "Trend analysis needs complaint data" },
  { fromObligationId: "EU_MDR.ART88.TREND", toObligationId: "EU_MDR.ART86.SI.SUMMARY", relationType: "REQUIRES", strength: "STRONG", description: "Trend analysis needs incident data" },
  
  // Cross-references
  { fromObligationId: "EU_MDR.ART86.SI.ANALYSIS", toObligationId: "EU_MDR.ART86.CAPA", relationType: "CROSS_REFERENCES", strength: "STRONG", description: "Incident analysis references CAPA" },
  { fromObligationId: "EU_MDR.ART86.PMCF.FINDINGS", toObligationId: "EU_MDR.ART86.CONCLUSIONS.BR", relationType: "CROSS_REFERENCES", strength: "STRONG", description: "PMCF feeds into benefit-risk" },
  
  // Section groupings
  { fromObligationId: "EU_MDR.ART86.SI.SUMMARY", toObligationId: "EU_MDR.ART86.SI.ANALYSIS", relationType: "SAME_SECTION", strength: "INFORMATIONAL" },
  { fromObligationId: "EU_MDR.ART86.COMPLAINTS.SUMMARY", toObligationId: "EU_MDR.ART86.COMPLAINTS.ANALYSIS", relationType: "SAME_SECTION", strength: "INFORMATIONAL" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT-OBLIGATION MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════════

const SLOT_OBLIGATION_MAPPINGS: InsertPsurSlotObligation[] = [
  // MDCG template mappings
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.COVER", obligationId: "EU_MDR.ART86.ADMIN", mandatory: true, coveragePercentage: 100, minimumEvidenceAtoms: 1, allowEmptyWithJustification: false },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.A", obligationId: "EU_MDR.ART86.DEVICE_DESC", mandatory: true, coveragePercentage: 100, minimumEvidenceAtoms: 1 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.C", obligationId: "EU_MDR.ART86.1.c", mandatory: true, coveragePercentage: 100, minimumEvidenceAtoms: 1 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.D", obligationId: "EU_MDR.ART86.SI.SUMMARY", mandatory: true, coveragePercentage: 100, minimumEvidenceAtoms: 0, allowEmptyWithJustification: true },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.D.NARRATIVE", obligationId: "EU_MDR.ART86.SI.ANALYSIS", mandatory: true, coveragePercentage: 100 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.E", obligationId: "EU_MDR.ART88.TREND", mandatory: true, coveragePercentage: 100 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.F", obligationId: "EU_MDR.ART86.COMPLAINTS.SUMMARY", mandatory: true, coveragePercentage: 100, minimumEvidenceAtoms: 0, allowEmptyWithJustification: true },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.F.NARRATIVE", obligationId: "EU_MDR.ART86.COMPLAINTS.ANALYSIS", mandatory: true, coveragePercentage: 100 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.H", obligationId: "EU_MDR.ART86.FSCA.SUMMARY", mandatory: true, coveragePercentage: 50, minimumEvidenceAtoms: 0, allowEmptyWithJustification: true },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.H", obligationId: "EU_MDR.ART86.FSCA.EFFECTIVENESS", mandatory: true, coveragePercentage: 50 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.I", obligationId: "EU_MDR.ANNEXIII.CAPA", mandatory: true, coveragePercentage: 100, minimumEvidenceAtoms: 0, allowEmptyWithJustification: true },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.J", obligationId: "EU_MDR.ANNEXIII.LITERATURE", mandatory: true, coveragePercentage: 100, minimumEvidenceAtoms: 1 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.K", obligationId: "EU_MDR.ANNEXIII.EXTERNAL_DB", mandatory: true, coveragePercentage: 100, minimumEvidenceAtoms: 1 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.L", obligationId: "EU_MDR.ART86.PMCF.ACTIVITIES", mandatory: true, coveragePercentage: 50 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.L", obligationId: "EU_MDR.ART86.PMCF.FINDINGS", mandatory: true, coveragePercentage: 50 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.L", obligationId: "EU_MDR.ART86.1.b", mandatory: true, coveragePercentage: 100 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.M", obligationId: "EU_MDR.ART86.1.a", mandatory: true, coveragePercentage: 50 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.M.BR", obligationId: "EU_MDR.ART86.CONCLUSIONS.BR", mandatory: true, coveragePercentage: 100 },
  { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.M.ACTIONS", obligationId: "EU_MDR.ART86.CONCLUSIONS.ACTIONS", mandatory: true, coveragePercentage: 100 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function seedPsurGrkb() {
  const { db, pool } = await import("../db");

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("[PSUR-GRKB] Starting comprehensive PSUR-GRKB seed...");
  console.log("═══════════════════════════════════════════════════════════════════");

  try {
    // 1. Seed Evidence Types
    console.log("\n[PSUR-GRKB] Step 1: Seeding Evidence Types...");
    for (const evType of PSUR_EVIDENCE_TYPES) {
      await db.insert(psurEvidenceTypes).values(evType).onConflictDoNothing();
    }
    console.log(`  ✓ Seeded ${PSUR_EVIDENCE_TYPES.length} evidence types`);

    // 2. Seed MDCG Sections
    console.log("\n[PSUR-GRKB] Step 2: Seeding MDCG 2022-21 Sections...");
    for (const section of MDCG_SECTIONS) {
      await db.insert(psurSections).values(section).onConflictDoNothing();
    }
    console.log(`  ✓ Seeded ${MDCG_SECTIONS.length} PSUR sections`);

    // 3. Seed EU MDR Obligations
    console.log("\n[PSUR-GRKB] Step 3: Seeding EU MDR PSUR Obligations...");
    for (const obligation of EU_MDR_PSUR_OBLIGATIONS) {
      await db.insert(grkbObligations).values(obligation).onConflictDoNothing();
    }
    console.log(`  ✓ Seeded ${EU_MDR_PSUR_OBLIGATIONS.length} EU MDR obligations`);

    // 4. Seed UK MDR Obligations
    console.log("\n[PSUR-GRKB] Step 4: Seeding UK MDR PSUR Obligations...");
    for (const obligation of UK_MDR_PSUR_OBLIGATIONS) {
      await db.insert(grkbObligations).values(obligation).onConflictDoNothing();
    }
    console.log(`  ✓ Seeded ${UK_MDR_PSUR_OBLIGATIONS.length} UK MDR obligations`);

    // 5. Seed Obligation Dependencies
    console.log("\n[PSUR-GRKB] Step 5: Seeding Obligation Dependencies...");
    for (const dep of OBLIGATION_DEPENDENCIES) {
      await db.insert(psurObligationDependencies).values(dep).onConflictDoNothing();
    }
    console.log(`  ✓ Seeded ${OBLIGATION_DEPENDENCIES.length} obligation dependencies`);

    // 6. Seed Slot-Obligation Mappings
    console.log("\n[PSUR-GRKB] Step 6: Seeding Slot-Obligation Mappings...");
    for (const mapping of SLOT_OBLIGATION_MAPPINGS) {
      await db.insert(psurSlotObligations).values(mapping).onConflictDoNothing();
    }
    console.log(`  ✓ Seeded ${SLOT_OBLIGATION_MAPPINGS.length} slot-obligation mappings`);

    // Summary
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("[PSUR-GRKB] Seed Complete! Summary:");
    console.log("═══════════════════════════════════════════════════════════════════");
    
    const evTypeCount = await db.select().from(psurEvidenceTypes);
    const sectionCount = await db.select().from(psurSections);
    const euObligations = await db.select().from(grkbObligations);
    const depCount = await db.select().from(psurObligationDependencies);
    const mappingCount = await db.select().from(psurSlotObligations);

    console.log(`  Evidence Types:       ${evTypeCount.length}`);
    console.log(`  PSUR Sections:        ${sectionCount.length}`);
    console.log(`  Total Obligations:    ${euObligations.length}`);
    console.log(`    - EU MDR:           ${euObligations.filter(o => o.jurisdiction === "EU_MDR").length}`);
    console.log(`    - UK MDR:           ${euObligations.filter(o => o.jurisdiction === "UK_MDR").length}`);
    console.log(`  Dependencies:         ${depCount.length}`);
    console.log(`  Slot Mappings:        ${mappingCount.length}`);
    console.log("═══════════════════════════════════════════════════════════════════");

    await pool.end();

  } catch (error) {
    console.error("[PSUR-GRKB] Seed Error:", error);
    throw error;
  }
}

// Run
seedPsurGrkb().then(() => {
  console.log("\n[PSUR-GRKB] Done.");
  process.exit(0);
}).catch((err) => {
  console.error("[PSUR-GRKB] Fatal error:", err);
  process.exit(1);
});
