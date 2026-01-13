/**
 * PSUR CONTRACT - Authoritative Schema
 * 
 * This contract defines the CANONICAL structure for all PSUR documents.
 * ALL rendering MUST conform to this contract regardless of template.
 * 
 * Templates may ADD sections but may NOT remove or rename core sections.
 * 
 * Per MDCG 2022-21 and EU MDR Article 86
 */

// ============================================================================
// CORE TYPE DEFINITIONS
// ============================================================================

export type PSURSectionId = 
  | "COVER_PAGE"
  | "TABLE_OF_CONTENTS"
  | "SECTION_A_PRODUCT_INFO"
  | "SECTION_B_DEVICE_DESCRIPTION"
  | "SECTION_C_SALES_EXPOSURE"
  | "SECTION_D_COMPLAINTS"
  | "SECTION_E_COMPLAINT_TRENDS"
  | "SECTION_F_SERIOUS_INCIDENTS"
  | "SECTION_G_FSCA"
  | "SECTION_H_VIGILANCE_SUMMARY"
  | "SECTION_I_LITERATURE_REVIEW"
  | "SECTION_J_EXTERNAL_DATABASES"
  | "SECTION_K_PMCF"
  | "SECTION_L_BENEFIT_RISK"
  | "SECTION_M_CONCLUSIONS"
  | "SECTION_N_SIGNOFF"
  | "APPENDIX_A_EVIDENCE_REGISTER"
  | "APPENDIX_B_TRACE_LOG";

export type TableId =
  | "TABLE_DEVICE_IDENTIFICATION"
  | "TABLE_SALES_BY_REGION_YEAR"
  | "TABLE_SALES_CUMULATIVE"
  | "TABLE_POPULATION_EXPOSURE"
  | "TABLE_COMPLAINTS_BY_CATEGORY"
  | "TABLE_COMPLAINTS_BY_HARM"
  | "TABLE_COMPLAINT_RATES"
  | "TABLE_COMPLAINT_TRENDS"
  | "TABLE_UCL_ANALYSIS"
  | "TABLE_SERIOUS_INCIDENTS"
  | "TABLE_IMDRF_ANNEX_A"
  | "TABLE_IMDRF_ANNEX_C"
  | "TABLE_IMDRF_ANNEX_F"
  | "TABLE_FSCA_SUMMARY"
  | "TABLE_CAPA_STATUS"
  | "TABLE_LITERATURE_SUMMARY"
  | "TABLE_EXTERNAL_DB_FINDINGS"
  | "TABLE_PMCF_ACTIVITIES"
  | "TABLE_RISK_BENEFIT_MATRIX"
  | "TABLE_EVIDENCE_REGISTER";

export type FigureId =
  | "FIGURE_SALES_TREND"
  | "FIGURE_COMPLAINT_TREND"
  | "FIGURE_UCL_CHART"
  | "FIGURE_HARM_DISTRIBUTION"
  | "FIGURE_REGIONAL_DISTRIBUTION";

// ============================================================================
// TRACE REFERENCE - Links content to evidence atoms
// ============================================================================

export interface TraceReference {
  paragraphId: string;
  evidenceAtomIds: string[];
  calculationId?: string;
  sourceObligationIds?: string[];
  validatedAt: string;
}

// ============================================================================
// TABLE DEFINITIONS - Typed, Deterministic
// ============================================================================

export interface TableCell {
  value: string | number | null;
  format?: "text" | "number" | "percentage" | "date" | "currency";
  precision?: number;
  traceRef?: TraceReference;
}

export interface TableRow {
  cells: TableCell[];
  isHeader?: boolean;
  isTotal?: boolean;
  rowId: string;
}

export interface PSURTable {
  tableId: TableId;
  title: string;
  columns: string[];
  rows: TableRow[];
  footnotes?: string[];
  traceRef: TraceReference;
  calculationFormula?: string;
  periodFilter?: {
    start: string;
    end: string;
  };
}

// ============================================================================
// FIGURE DEFINITIONS - Metadata only, rendering separate
// ============================================================================

export interface PSURFigure {
  figureId: FigureId;
  title: string;
  description: string;
  dataSource: TableId;
  chartType: "line" | "bar" | "pie" | "scatter" | "area";
  xAxis?: string;
  yAxis?: string;
  traceRef: TraceReference;
}

// ============================================================================
// PARAGRAPH DEFINITIONS - With mandatory trace
// ============================================================================

export interface PSURParagraph {
  paragraphId: string;
  content: string;
  traceRef: TraceReference;
  isNarrativeRequired: boolean;
  constraints?: NarrativeConstraint[];
}

export interface NarrativeConstraint {
  type: "MUST_STATE" | "MUST_NOT_STATE" | "MUST_REFERENCE" | "MUST_CONCLUDE";
  condition: string;
  requiredText?: string;
}

// ============================================================================
// SECTION DEFINITIONS
// ============================================================================

export interface PSURSection {
  sectionId: PSURSectionId;
  sectionNumber: string;
  title: string;
  isCore: boolean; // Core sections cannot be removed
  paragraphs: PSURParagraph[];
  tables?: PSURTable[];
  figures?: PSURFigure[];
  subsections?: PSURSection[];
  obligationIds: string[]; // MDCG obligations this section satisfies
  traceRef: TraceReference;
}

// ============================================================================
// COVER PAGE
// ============================================================================

export interface PSURCoverPage {
  documentTitle: string;
  documentType: "PERIODIC_SAFETY_UPDATE_REPORT";
  psurReference: string;
  version: number;
  reportingPeriod: {
    start: string;
    end: string;
  };
  deviceInfo: {
    deviceName: string;
    deviceCode: string;
    udiDi?: string;
    riskClass: string;
    intendedPurpose: string;
  };
  manufacturerInfo: {
    name: string;
    address?: string;
    authorizedRepresentative?: string;
  };
  regulatoryInfo: {
    jurisdictions: string[];
    certificateNumbers?: string[];
    notifiedBody?: string;
  };
  documentControl: {
    preparedBy: string;
    reviewedBy?: string;
    approvedBy?: string;
    approvalDate?: string;
  };
  traceRef: TraceReference;
}

// ============================================================================
// TABLE OF CONTENTS
// ============================================================================

export interface TOCEntry {
  sectionNumber: string;
  title: string;
  pageRef?: number;
  subsections?: TOCEntry[];
}

export interface PSURTableOfContents {
  entries: TOCEntry[];
  generatedAt: string;
}

// ============================================================================
// CONCLUSION BLOCK
// ============================================================================

export interface PSURConclusionBlock {
  overallConclusion: "FAVORABLE" | "UNFAVORABLE" | "REQUIRES_ACTION";
  benefitRiskStatement: string;
  keyFindings: string[];
  actionsRequired: string[];
  pmcfRequired: boolean;
  pmcfJustification: string;
  nextReviewDate: string;
  traceRef: TraceReference;
}

// ============================================================================
// SIGNOFF METADATA
// ============================================================================

export interface PSURSignoff {
  role: string;
  name: string;
  signature?: string;
  date: string;
  declaration: string;
}

export interface PSURSignoffBlock {
  preparer: PSURSignoff;
  qmsReviewer?: PSURSignoff;
  raReviewer?: PSURSignoff;
  finalApprover: PSURSignoff;
  declarationText: string;
  traceRef: TraceReference;
}

// ============================================================================
// FULL PSUR DOCUMENT CONTRACT
// ============================================================================

export interface PSURDocument {
  // Document metadata
  documentId: string;
  schemaVersion: "1.0.0";
  generatedAt: string;
  templateId: string;
  templateExtensions?: string[];
  
  // Core structure (MANDATORY)
  coverPage: PSURCoverPage;
  tableOfContents: PSURTableOfContents;
  
  // Sections (Core sections MANDATORY)
  sections: PSURSection[];
  
  // Conclusions (MANDATORY)
  conclusions: PSURConclusionBlock;
  
  // Signoff (MANDATORY)
  signoff: PSURSignoffBlock;
  
  // Full trace log
  traceLog: TraceReference[];
  
  // Validation metadata
  validation: {
    passedQualityGate: boolean;
    obligationsCovered: string[];
    obligationsMissing: string[];
    validatedAt: string;
    validatorVersion: string;
  };
}

// ============================================================================
// CORE SECTION DEFINITIONS - These cannot be removed by templates
// ============================================================================

export const CORE_SECTIONS: PSURSectionId[] = [
  "COVER_PAGE",
  "TABLE_OF_CONTENTS",
  "SECTION_A_PRODUCT_INFO",
  "SECTION_B_DEVICE_DESCRIPTION",
  "SECTION_C_SALES_EXPOSURE",
  "SECTION_D_COMPLAINTS",
  "SECTION_F_SERIOUS_INCIDENTS",
  "SECTION_G_FSCA",
  "SECTION_I_LITERATURE_REVIEW",
  "SECTION_K_PMCF",
  "SECTION_L_BENEFIT_RISK",
  "SECTION_M_CONCLUSIONS",
  "SECTION_N_SIGNOFF",
];

export const REQUIRED_TABLES: Record<PSURSectionId, TableId[]> = {
  COVER_PAGE: [],
  TABLE_OF_CONTENTS: [],
  SECTION_A_PRODUCT_INFO: ["TABLE_DEVICE_IDENTIFICATION"],
  SECTION_B_DEVICE_DESCRIPTION: [],
  SECTION_C_SALES_EXPOSURE: [
    "TABLE_SALES_BY_REGION_YEAR",
    "TABLE_SALES_CUMULATIVE",
    "TABLE_POPULATION_EXPOSURE",
  ],
  SECTION_D_COMPLAINTS: [
    "TABLE_COMPLAINTS_BY_CATEGORY",
    "TABLE_COMPLAINTS_BY_HARM",
    "TABLE_COMPLAINT_RATES",
  ],
  SECTION_E_COMPLAINT_TRENDS: [
    "TABLE_COMPLAINT_TRENDS",
    "TABLE_UCL_ANALYSIS",
  ],
  SECTION_F_SERIOUS_INCIDENTS: [
    "TABLE_SERIOUS_INCIDENTS",
    "TABLE_IMDRF_ANNEX_A",
  ],
  SECTION_G_FSCA: ["TABLE_FSCA_SUMMARY"],
  SECTION_H_VIGILANCE_SUMMARY: [
    "TABLE_IMDRF_ANNEX_C",
    "TABLE_IMDRF_ANNEX_F",
    "TABLE_CAPA_STATUS",
  ],
  SECTION_I_LITERATURE_REVIEW: ["TABLE_LITERATURE_SUMMARY"],
  SECTION_J_EXTERNAL_DATABASES: ["TABLE_EXTERNAL_DB_FINDINGS"],
  SECTION_K_PMCF: ["TABLE_PMCF_ACTIVITIES"],
  SECTION_L_BENEFIT_RISK: ["TABLE_RISK_BENEFIT_MATRIX"],
  SECTION_M_CONCLUSIONS: [],
  SECTION_N_SIGNOFF: [],
  APPENDIX_A_EVIDENCE_REGISTER: ["TABLE_EVIDENCE_REGISTER"],
  APPENDIX_B_TRACE_LOG: [],
};

// ============================================================================
// SECTION NUMBERING - Per MDCG 2022-21 structure
// ============================================================================

export const SECTION_NUMBERS: Record<PSURSectionId, string> = {
  COVER_PAGE: "0",
  TABLE_OF_CONTENTS: "0.1",
  SECTION_A_PRODUCT_INFO: "1",
  SECTION_B_DEVICE_DESCRIPTION: "2",
  SECTION_C_SALES_EXPOSURE: "3",
  SECTION_D_COMPLAINTS: "4",
  SECTION_E_COMPLAINT_TRENDS: "5",
  SECTION_F_SERIOUS_INCIDENTS: "6",
  SECTION_G_FSCA: "7",
  SECTION_H_VIGILANCE_SUMMARY: "8",
  SECTION_I_LITERATURE_REVIEW: "9",
  SECTION_J_EXTERNAL_DATABASES: "10",
  SECTION_K_PMCF: "11",
  SECTION_L_BENEFIT_RISK: "12",
  SECTION_M_CONCLUSIONS: "13",
  SECTION_N_SIGNOFF: "14",
  APPENDIX_A_EVIDENCE_REGISTER: "A",
  APPENDIX_B_TRACE_LOG: "B",
};

export const SECTION_TITLES: Record<PSURSectionId, string> = {
  COVER_PAGE: "Cover Page",
  TABLE_OF_CONTENTS: "Table of Contents",
  SECTION_A_PRODUCT_INFO: "Product Identification",
  SECTION_B_DEVICE_DESCRIPTION: "Device Description and Intended Purpose",
  SECTION_C_SALES_EXPOSURE: "Sales Volume and Population Exposure",
  SECTION_D_COMPLAINTS: "Complaint Analysis",
  SECTION_E_COMPLAINT_TRENDS: "Complaint Trending and Statistical Analysis",
  SECTION_F_SERIOUS_INCIDENTS: "Serious Incidents and Vigilance Reports",
  SECTION_G_FSCA: "Field Safety Corrective Actions",
  SECTION_H_VIGILANCE_SUMMARY: "Vigilance Summary and CAPA Status",
  SECTION_I_LITERATURE_REVIEW: "Literature Review",
  SECTION_J_EXTERNAL_DATABASES: "External Database Review",
  SECTION_K_PMCF: "Post-Market Clinical Follow-up",
  SECTION_L_BENEFIT_RISK: "Benefit-Risk Analysis",
  SECTION_M_CONCLUSIONS: "Conclusions and Recommendations",
  SECTION_N_SIGNOFF: "Document Approval and Signoff",
  APPENDIX_A_EVIDENCE_REGISTER: "Appendix A: Evidence Register",
  APPENDIX_B_TRACE_LOG: "Appendix B: Trace Log",
};

// ============================================================================
// CALCULATION FORMULAS - Deterministic, Auditable
// ============================================================================

export const CALCULATION_FORMULAS = {
  COMPLAINT_RATE: "complaints / (units_sold * 1000) * 1000 // per 1000 units",
  INCIDENT_RATE: "incidents / units_sold * 1000000 // per million units",
  UCL_3SIGMA: "mean + (3 * stddev)",
  LCL_3SIGMA: "mean - (3 * stddev)",
  POPULATION_EXPOSURE_SINGLE_USE: "cumulative_units_sold",
  POPULATION_EXPOSURE_REUSABLE: "cumulative_units_sold * avg_procedures_per_device",
  TREND_SLOPE: "(y2 - y1) / (x2 - x1)",
  PERCENT_OF_GLOBAL: "(regional_sales / global_sales) * 100",
} as const;

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createTraceReference(
  paragraphId: string,
  evidenceAtomIds: string[],
  options?: {
    calculationId?: string;
    sourceObligationIds?: string[];
  }
): TraceReference {
  return {
    paragraphId,
    evidenceAtomIds,
    calculationId: options?.calculationId,
    sourceObligationIds: options?.sourceObligationIds,
    validatedAt: new Date().toISOString(),
  };
}

export function createEmptyPSURDocument(
  psurReference: string,
  templateId: string
): PSURDocument {
  const now = new Date().toISOString();
  return {
    documentId: `PSUR-DOC-${Date.now()}`,
    schemaVersion: "1.0.0",
    generatedAt: now,
    templateId,
    coverPage: {
      documentTitle: `Periodic Safety Update Report - ${psurReference}`,
      documentType: "PERIODIC_SAFETY_UPDATE_REPORT",
      psurReference,
      version: 1,
      reportingPeriod: { start: "", end: "" },
      deviceInfo: {
        deviceName: "",
        deviceCode: "",
        riskClass: "",
        intendedPurpose: "",
      },
      manufacturerInfo: { name: "" },
      regulatoryInfo: { jurisdictions: [] },
      documentControl: { preparedBy: "RegulatoryOS" },
      traceRef: createTraceReference("cover_page", []),
    },
    tableOfContents: {
      entries: [],
      generatedAt: now,
    },
    sections: [],
    conclusions: {
      overallConclusion: "FAVORABLE",
      benefitRiskStatement: "",
      keyFindings: [],
      actionsRequired: [],
      pmcfRequired: false,
      pmcfJustification: "",
      nextReviewDate: "",
      traceRef: createTraceReference("conclusions", []),
    },
    signoff: {
      preparer: {
        role: "Document Preparer",
        name: "",
        date: now,
        declaration: "I confirm this document accurately represents the available evidence.",
      },
      finalApprover: {
        role: "Qualified Person",
        name: "",
        date: "",
        declaration: "I approve this PSUR for submission.",
      },
      declarationText: "This Periodic Safety Update Report has been prepared in accordance with EU MDR 2017/745 Article 86 and MDCG 2022-21.",
      traceRef: createTraceReference("signoff", []),
    },
    traceLog: [],
    validation: {
      passedQualityGate: false,
      obligationsCovered: [],
      obligationsMissing: [],
      validatedAt: now,
      validatorVersion: "1.0.0",
    },
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isCoreSection(sectionId: PSURSectionId): boolean {
  return CORE_SECTIONS.includes(sectionId);
}

export function validateSectionStructure(section: PSURSection): string[] {
  const errors: string[] = [];
  
  if (!section.sectionId) {
    errors.push("Section missing sectionId");
  }
  
  if (!section.traceRef) {
    errors.push(`Section ${section.sectionId} missing traceRef`);
  }
  
  const requiredTables = REQUIRED_TABLES[section.sectionId] || [];
  const providedTableIds = (section.tables || []).map(t => t.tableId);
  
  for (const requiredTable of requiredTables) {
    if (!providedTableIds.includes(requiredTable)) {
      errors.push(`Section ${section.sectionId} missing required table: ${requiredTable}`);
    }
  }
  
  for (const paragraph of section.paragraphs) {
    if (!paragraph.traceRef || paragraph.traceRef.evidenceAtomIds.length === 0) {
      if (paragraph.isNarrativeRequired) {
        errors.push(`Paragraph ${paragraph.paragraphId} in ${section.sectionId} requires trace reference`);
      }
    }
  }
  
  return errors;
}
