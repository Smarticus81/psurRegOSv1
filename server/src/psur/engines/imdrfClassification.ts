/**
 * IMDRF CLASSIFICATION ENGINE
 *
 * Deterministic mapping from internal symptom codes to IMDRF Annex A taxonomy:
 *   - Medical Device Problem (MDP) codes: Annex A §2 (device malfunction type)
 *   - Patient Harm codes: Annex E (health effect on patient)
 *
 * Two-stage classification:
 *   Stage 1: Deterministic lookup from symptom code → IMDRF mapping
 *   Stage 2: LLM adjudication for context-dependent cases (harm depends on patient outcome)
 *
 * Per MDCG 2022-21, PSUR Tables 5/6 require IMDRF-coded complaint classification.
 */

import type { ComplaintEvidenceAtom } from "./complaintEngine";
import type { PSURTable, TableRow } from "../psurContract";
import { createTraceReference } from "../psurContract";

// ============================================================================
// IMDRF CODE TYPES
// ============================================================================

export interface IMDRFMapping {
  /** Internal symptom code (lowercase, no spaces) */
  symptomCode: string;

  /** IMDRF Annex A Medical Device Problem code */
  mdpCode: string;
  /** Human-readable MDP term */
  mdpTerm: string;

  /** IMDRF Annex E Health Effect (harm) code, null if no harm */
  harmCode: string | null;
  /** Human-readable harm term */
  harmTerm: string;

  /** Default severity classification */
  severityDefault: "serious" | "non-serious";

  /**
   * If true, harm classification depends on complaint context
   * (patient involvement, investigation findings, additional medical attention).
   * These cases need LLM adjudication in Stage 2.
   */
  requiresAdjudication: boolean;
}

export interface IMDRFClassificationResult {
  /** The IMDRF MDP code assigned */
  mdpCode: string;
  mdpTerm: string;

  /** The IMDRF harm code assigned (null = no patient harm) */
  harmCode: string | null;
  harmTerm: string;

  /** Severity classification after adjudication */
  severity: "serious" | "non-serious";

  /** How the classification was determined */
  classificationMethod: "deterministic" | "llm_adjudicated" | "default_fallback";

  /** Confidence (1.0 for deterministic, 0.0-1.0 for LLM) */
  confidence: number;
}

export interface IMDRFSummary {
  /** Complaints grouped by MDP code */
  byMdpCode: IMDRFCodeCount[];

  /** Complaints grouped by harm code */
  byHarmCode: IMDRFCodeCount[];

  /** Total classified */
  totalClassified: number;

  /** Total requiring adjudication */
  totalAdjudicated: number;

  /** Total that fell through to default */
  totalDefaultFallback: number;

  /** Summary table for PSUR insertion */
  imdrfTable: PSURTable;

  /** All atom IDs that contributed */
  allEvidenceAtomIds: string[];
}

export interface IMDRFCodeCount {
  code: string;
  term: string;
  count: number;
  confirmedCount: number;
  percentage: number;
}

// ============================================================================
// IMDRF MAPPING TABLE (Stage 1)
// ============================================================================

/**
 * Deterministic symptom code → IMDRF mapping table.
 * Keys are lowercase symptom codes with no spaces.
 *
 * MDP codes from IMDRF Annex A §2 (Medical Device Problem codes):
 *   2003 = Break/Fracture
 *   2009 = Sticking/Jamming
 *   2101 = Electrical Problem
 *   2104 = Thermal Problem
 *   2201 = Software Problem
 *   2301 = Material Problem
 *   2401 = Leakage
 *   2501 = Misassembly
 *   2601 = Labeling Problem
 *   2701 = Sterility Problem
 *   2801 = Biocompatibility Problem
 *   3001 = Use Error
 *   3002 = Connection/Disconnection Problem
 *   3010 = Packaging Problem
 *   3011 = Shipping/Storage Problem
 *
 * Harm codes from IMDRF Annex E (Health Effects):
 *   E0101 = Death
 *   E0201 = Injury (Serious)
 *   E0202 = Thermal Injury/Burn
 *   E0203 = Electrical Injury/Shock
 *   E0204 = Mechanical Injury
 *   E0301 = Infection
 *   E0401 = Allergic/Immunological Reaction
 *   E0501 = No Consequence / No Health Effect
 *   E0601 = Procedural Complication
 *   E0701 = Inadequate/Delayed Treatment
 */
export const IMDRF_SYMPTOM_MAPPINGS: Record<string, IMDRFMapping> = {
  // ── Mechanical Problems ──
  brokenordamagedcomponent: {
    symptomCode: "brokenordamagedcomponent",
    mdpCode: "2003",
    mdpTerm: "Mechanical Problem - Break/Fracture",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,  // harm depends on whether breakage occurred during use
  },
  breakage: {
    symptomCode: "breakage",
    mdpCode: "2003",
    mdpTerm: "Mechanical Problem - Break/Fracture",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  crack: {
    symptomCode: "crack",
    mdpCode: "2003",
    mdpTerm: "Mechanical Problem - Break/Fracture",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  bent: {
    symptomCode: "bent",
    mdpCode: "2003",
    mdpTerm: "Mechanical Problem - Break/Fracture",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  productsticking: {
    symptomCode: "productsticking",
    mdpCode: "2009",
    mdpTerm: "Mechanical Problem - Sticking/Jamming",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  sticking: {
    symptomCode: "sticking",
    mdpCode: "2009",
    mdpTerm: "Mechanical Problem - Sticking/Jamming",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  jamming: {
    symptomCode: "jamming",
    mdpCode: "2009",
    mdpTerm: "Mechanical Problem - Sticking/Jamming",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  loosening: {
    symptomCode: "loosening",
    mdpCode: "2005",
    mdpTerm: "Mechanical Problem - Loosening",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  misalignment: {
    symptomCode: "misalignment",
    mdpCode: "2007",
    mdpTerm: "Mechanical Problem - Misalignment",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },
  wear: {
    symptomCode: "wear",
    mdpCode: "2010",
    mdpTerm: "Mechanical Problem - Wear/Abrasion",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },

  // ── Electrical Problems ──
  electrical: {
    symptomCode: "electrical",
    mdpCode: "2101",
    mdpTerm: "Electrical Problem",
    harmCode: "E0203",
    harmTerm: "Electrical Injury/Shock",
    severityDefault: "serious",
    requiresAdjudication: true,  // harm depends on patient involvement
  },
  electricalshock: {
    symptomCode: "electricalshock",
    mdpCode: "2102",
    mdpTerm: "Electrical Problem - Shock/Electrocution",
    harmCode: "E0203",
    harmTerm: "Electrical Injury/Shock",
    severityDefault: "serious",
    requiresAdjudication: true,
  },
  shortcircuit: {
    symptomCode: "shortcircuit",
    mdpCode: "2103",
    mdpTerm: "Electrical Problem - Short Circuit",
    harmCode: "E0203",
    harmTerm: "Electrical Injury/Shock",
    severityDefault: "serious",
    requiresAdjudication: true,
  },

  // ── Thermal Problems ──
  burn: {
    symptomCode: "burn",
    mdpCode: "2104",
    mdpTerm: "Thermal Problem",
    harmCode: "E0202",
    harmTerm: "Thermal Injury/Burn",
    severityDefault: "serious",
    requiresAdjudication: true,
  },
  overheating: {
    symptomCode: "overheating",
    mdpCode: "2104",
    mdpTerm: "Thermal Problem",
    harmCode: "E0202",
    harmTerm: "Thermal Injury/Burn",
    severityDefault: "serious",
    requiresAdjudication: true,
  },

  // ── Material / Contamination Problems ──
  contamination: {
    symptomCode: "contamination",
    mdpCode: "2301",
    mdpTerm: "Material Problem - Contamination",
    harmCode: "E0301",
    harmTerm: "Infection",
    severityDefault: "serious",
    requiresAdjudication: true,
  },
  corrosion: {
    symptomCode: "corrosion",
    mdpCode: "2302",
    mdpTerm: "Material Problem - Corrosion",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },
  discoloration: {
    symptomCode: "discoloration",
    mdpCode: "2303",
    mdpTerm: "Material Problem - Discoloration",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },
  degradation: {
    symptomCode: "degradation",
    mdpCode: "2304",
    mdpTerm: "Material Problem - Degradation",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },

  // ── Leakage ──
  leakage: {
    symptomCode: "leakage",
    mdpCode: "2401",
    mdpTerm: "Leakage",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },

  // ── Assembly / Manufacturing ──
  misassembly: {
    symptomCode: "misassembly",
    mdpCode: "2501",
    mdpTerm: "Misassembly",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },
  defective: {
    symptomCode: "defective",
    mdpCode: "2501",
    mdpTerm: "Manufacturing Defect",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },

  // ── Labeling / IFU ──
  labeling: {
    symptomCode: "labeling",
    mdpCode: "2601",
    mdpTerm: "Labeling Problem",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },
  labelingerror: {
    symptomCode: "labelingerror",
    mdpCode: "2601",
    mdpTerm: "Labeling Problem",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },
  missinglabel: {
    symptomCode: "missinglabel",
    mdpCode: "2602",
    mdpTerm: "Labeling Problem - Missing/Incomplete",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },

  // ── Sterility ──
  sterilitycompromised: {
    symptomCode: "sterilitycompromised",
    mdpCode: "2701",
    mdpTerm: "Sterility Problem",
    harmCode: "E0301",
    harmTerm: "Infection",
    severityDefault: "serious",
    requiresAdjudication: true,
  },
  packagebreach: {
    symptomCode: "packagebreach",
    mdpCode: "2701",
    mdpTerm: "Sterility Problem - Packaging Breach",
    harmCode: "E0301",
    harmTerm: "Infection",
    severityDefault: "serious",
    requiresAdjudication: true,
  },

  // ── Biocompatibility ──
  allergicreaction: {
    symptomCode: "allergicreaction",
    mdpCode: "2801",
    mdpTerm: "Biocompatibility Problem",
    harmCode: "E0401",
    harmTerm: "Allergic/Immunological Reaction",
    severityDefault: "serious",
    requiresAdjudication: true,
  },

  // ── Use Error / External ──
  usererror: {
    symptomCode: "usererror",
    mdpCode: "3001",
    mdpTerm: "Use Error",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },
  connectionproblem: {
    symptomCode: "connectionproblem",
    mdpCode: "3002",
    mdpTerm: "Connection/Disconnection Problem",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  shippingdamage: {
    symptomCode: "shippingdamage",
    mdpCode: "3010",
    mdpTerm: "Packaging Problem - Shipping Damage",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },
  packagingdamage: {
    symptomCode: "packagingdamage",
    mdpCode: "3010",
    mdpTerm: "Packaging Problem",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: false,
  },

  // ── Software ──
  softwarefailure: {
    symptomCode: "softwarefailure",
    mdpCode: "2201",
    mdpTerm: "Software Problem",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  softwareerror: {
    symptomCode: "softwareerror",
    mdpCode: "2201",
    mdpTerm: "Software Problem",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },

  // ── Performance / Functional ──
  performancedegradation: {
    symptomCode: "performancedegradation",
    mdpCode: "1001",
    mdpTerm: "Device Operates Differently than Expected",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  failure: {
    symptomCode: "failure",
    mdpCode: "1002",
    mdpTerm: "Device Does Not Operate as Intended",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
  malfunction: {
    symptomCode: "malfunction",
    mdpCode: "1003",
    mdpTerm: "Malfunction",
    harmCode: null,
    harmTerm: "No Health Effect",
    severityDefault: "non-serious",
    requiresAdjudication: true,
  },
};

// ============================================================================
// STAGE 1: DETERMINISTIC CLASSIFICATION
// ============================================================================

/**
 * Stage 1: Look up symptom code in the mapping table.
 * Normalizes the input code (lowercase, remove spaces/underscores/hyphens).
 * Returns the mapping if found, null otherwise.
 */
export function lookupIMDRFMapping(symptomCode: string): IMDRFMapping | null {
  if (!symptomCode) return null;

  const normalized = symptomCode
    .toLowerCase()
    .replace(/[\s_\-./]/g, "")
    .trim();

  // Direct lookup
  if (IMDRF_SYMPTOM_MAPPINGS[normalized]) {
    return IMDRF_SYMPTOM_MAPPINGS[normalized];
  }

  // Fuzzy match: check if any key is contained in the normalized code
  for (const [key, mapping] of Object.entries(IMDRF_SYMPTOM_MAPPINGS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return mapping;
    }
  }

  return null;
}

/**
 * Classify a complaint deterministically (Stage 1 only).
 * For complaints that require adjudication, returns the default mapping
 * with classificationMethod="deterministic" and a note that adjudication is needed.
 */
export function classifyComplaintDeterministic(
  complaint: ComplaintEvidenceAtom
): IMDRFClassificationResult {
  // Try existing IMDRF code first
  if (complaint.imdrfProblemCode) {
    const existingMdp = findMdpByCode(complaint.imdrfProblemCode);
    if (existingMdp) {
      return {
        mdpCode: existingMdp.mdpCode,
        mdpTerm: existingMdp.mdpTerm,
        harmCode: existingMdp.harmCode,
        harmTerm: existingMdp.harmTerm,
        severity: existingMdp.severityDefault,
        classificationMethod: "deterministic",
        confidence: 1.0,
      };
    }
  }

  // Try symptom code
  const mapping = lookupIMDRFMapping(
    complaint.symptomCode || complaint.category || ""
  );

  if (mapping) {
    // If no adjudication needed, return as-is
    if (!mapping.requiresAdjudication) {
      return {
        mdpCode: mapping.mdpCode,
        mdpTerm: mapping.mdpTerm,
        harmCode: mapping.harmCode,
        harmTerm: mapping.harmTerm,
        severity: mapping.severityDefault,
        classificationMethod: "deterministic",
        confidence: 1.0,
      };
    }

    // Adjudication needed — check if we can resolve deterministically from context
    const contextResult = resolveFromContext(complaint, mapping);
    if (contextResult) return contextResult;

    // Return default mapping (adjudication will refine later)
    return {
      mdpCode: mapping.mdpCode,
      mdpTerm: mapping.mdpTerm,
      harmCode: mapping.harmCode,
      harmTerm: mapping.harmTerm,
      severity: mapping.severityDefault,
      classificationMethod: "deterministic",
      confidence: 0.7,
    };
  }

  // No mapping found — return default fallback
  return {
    mdpCode: "2999",
    mdpTerm: "Other Device Problem",
    harmCode: null,
    harmTerm: "No Health Effect",
    severity: "non-serious",
    classificationMethod: "default_fallback",
    confidence: 0.3,
  };
}

/**
 * Try to resolve adjudication cases deterministically from complaint context.
 * If patient involvement is clearly "no"/"n/a" and no medical attention needed,
 * we can classify as no harm without LLM.
 */
function resolveFromContext(
  complaint: ComplaintEvidenceAtom,
  mapping: IMDRFMapping
): IMDRFClassificationResult | null {
  const patientInv = (complaint.patientInvolvement || "").toLowerCase();
  const medAttn = (complaint.additionalMedicalAttention || "").toLowerCase();
  const findings = (complaint.investigationFindings || "").toLowerCase();

  // Clear no-harm indicators
  const noPatientInvolvement =
    patientInv === "no" || patientInv === "n/a" || patientInv === "none" || patientInv === "";
  const noMedicalAttention =
    medAttn === "no" || medAttn === "n/a" || medAttn === "none" || medAttn === "";
  const externalCause =
    findings.includes("shipping damage") ||
    findings.includes("damage incurred in transit") ||
    findings.includes("user error") ||
    findings.includes("handling error");

  if (noPatientInvolvement && noMedicalAttention) {
    return {
      mdpCode: mapping.mdpCode,
      mdpTerm: mapping.mdpTerm,
      harmCode: null,
      harmTerm: "No Health Effect",
      severity: "non-serious",
      classificationMethod: "deterministic",
      confidence: 0.9,
    };
  }

  if (externalCause) {
    return {
      mdpCode: "3010",
      mdpTerm: "Packaging Problem - External Cause",
      harmCode: null,
      harmTerm: "No Health Effect",
      severity: "non-serious",
      classificationMethod: "deterministic",
      confidence: 0.9,
    };
  }

  // Clear harm indicators
  const hasInjury =
    findings.includes("injury") ||
    findings.includes("burn") ||
    findings.includes("laceration") ||
    findings.includes("hospitalized");
  const hasMedAttn = medAttn === "yes";

  if (hasInjury || hasMedAttn) {
    return {
      mdpCode: mapping.mdpCode,
      mdpTerm: mapping.mdpTerm,
      harmCode: mapping.harmCode || "E0201",
      harmTerm: mapping.harmTerm !== "No Health Effect" ? mapping.harmTerm : "Injury (Serious)",
      severity: "serious",
      classificationMethod: "deterministic",
      confidence: 0.85,
    };
  }

  return null;
}

/**
 * Find an MDP mapping by its code (for complaints that already have IMDRF codes).
 */
function findMdpByCode(code: string): IMDRFMapping | null {
  const cleaned = code.replace(/[^0-9]/g, "");
  for (const mapping of Object.values(IMDRF_SYMPTOM_MAPPINGS)) {
    if (mapping.mdpCode === cleaned) {
      return mapping;
    }
  }
  return null;
}

// ============================================================================
// BATCH CLASSIFICATION
// ============================================================================

/**
 * Classify all complaints in a batch (Stage 1 only).
 * Returns the classification result for each complaint, keyed by atomId.
 * Complaints needing LLM adjudication will have confidence < 1.0.
 */
export function classifyComplaintsBatch(
  complaints: ComplaintEvidenceAtom[]
): Map<string, IMDRFClassificationResult> {
  const results = new Map<string, IMDRFClassificationResult>();
  for (const complaint of complaints) {
    results.set(complaint.atomId, classifyComplaintDeterministic(complaint));
  }
  return results;
}

/**
 * Get complaints that need LLM adjudication (Stage 2).
 * These are complaints where:
 *   1. The mapping has requiresAdjudication=true AND
 *   2. Context-based resolution couldn't determine harm deterministically
 */
export function getComplaintsNeedingAdjudication(
  complaints: ComplaintEvidenceAtom[],
  classifications: Map<string, IMDRFClassificationResult>
): ComplaintEvidenceAtom[] {
  return complaints.filter(c => {
    const cls = classifications.get(c.atomId);
    return cls && cls.confidence < 0.8 && cls.classificationMethod !== "default_fallback";
  });
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate IMDRF classification summary from classified complaints.
 * Produces tables for PSUR Section E.
 */
export function generateIMDRFSummary(
  complaints: ComplaintEvidenceAtom[],
  classifications: Map<string, IMDRFClassificationResult>
): IMDRFSummary {
  const mdpCounts = new Map<string, { code: string; term: string; total: number; confirmed: number }>();
  const harmCounts = new Map<string, { code: string; term: string; total: number; confirmed: number }>();

  let totalAdjudicated = 0;
  let totalDefaultFallback = 0;

  for (const complaint of complaints) {
    const cls = classifications.get(complaint.atomId);
    if (!cls) continue;

    const isConfirmed = (complaint.complaintConfirmed || "").toLowerCase() === "yes";

    if (cls.classificationMethod === "llm_adjudicated") totalAdjudicated++;
    if (cls.classificationMethod === "default_fallback") totalDefaultFallback++;

    // MDP accumulation
    const mdpKey = cls.mdpCode;
    const existingMdp = mdpCounts.get(mdpKey) || { code: cls.mdpCode, term: cls.mdpTerm, total: 0, confirmed: 0 };
    existingMdp.total++;
    if (isConfirmed) existingMdp.confirmed++;
    mdpCounts.set(mdpKey, existingMdp);

    // Harm accumulation
    const harmKey = cls.harmCode || "NONE";
    const harmLabel = cls.harmCode ? cls.harmTerm : "No Health Effect";
    const existingHarm = harmCounts.get(harmKey) || { code: harmKey, term: harmLabel, total: 0, confirmed: 0 };
    existingHarm.total++;
    if (isConfirmed) existingHarm.confirmed++;
    harmCounts.set(harmKey, existingHarm);
  }

  const totalClassified = complaints.length;

  const byMdpCode: IMDRFCodeCount[] = Array.from(mdpCounts.values())
    .map(v => ({
      code: v.code,
      term: v.term,
      count: v.total,
      confirmedCount: v.confirmed,
      percentage: totalClassified > 0 ? (v.total / totalClassified) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const byHarmCode: IMDRFCodeCount[] = Array.from(harmCounts.values())
    .map(v => ({
      code: v.code,
      term: v.term,
      count: v.total,
      confirmedCount: v.confirmed,
      percentage: totalClassified > 0 ? (v.total / totalClassified) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const atomIds = complaints.map(c => c.atomId);
  const imdrfTable = buildIMDRFSummaryTable(byMdpCode, byHarmCode, totalClassified, atomIds);

  return {
    byMdpCode,
    byHarmCode,
    totalClassified,
    totalAdjudicated,
    totalDefaultFallback,
    imdrfTable,
    allEvidenceAtomIds: atomIds,
  };
}

// ============================================================================
// TABLE BUILDER
// ============================================================================

function buildIMDRFSummaryTable(
  byMdpCode: IMDRFCodeCount[],
  byHarmCode: IMDRFCodeCount[],
  totalClassified: number,
  atomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_imdrf_classification", atomIds);

  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "IMDRF Code", format: "text" },
        { value: "Term", format: "text" },
        { value: "Count", format: "number" },
        { value: "Confirmed", format: "number" },
        { value: "% of Total", format: "number" },
      ],
    },
    // MDP section
    {
      rowId: "section_mdp",
      cells: [
        { value: "=== MEDICAL DEVICE PROBLEMS (Annex A) ===", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
      ],
    },
  ];

  for (const mdp of byMdpCode) {
    rows.push({
      rowId: `mdp_${mdp.code}`,
      cells: [
        { value: mdp.code, format: "text" },
        { value: mdp.term, format: "text" },
        { value: mdp.count, format: "number" },
        { value: mdp.confirmedCount, format: "number" },
        { value: mdp.percentage, format: "number", precision: 1 },
      ],
    });
  }

  // Harm section
  rows.push({
    rowId: "section_harm",
    cells: [
      { value: "=== HEALTH EFFECTS (Annex E) ===", format: "text" },
      { value: "", format: "text" },
      { value: "", format: "text" },
      { value: "", format: "text" },
      { value: "", format: "text" },
    ],
  });

  for (const harm of byHarmCode) {
    rows.push({
      rowId: `harm_${harm.code}`,
      cells: [
        { value: harm.code, format: "text" },
        { value: harm.term, format: "text" },
        { value: harm.count, format: "number" },
        { value: harm.confirmedCount, format: "number" },
        { value: harm.percentage, format: "number", precision: 1 },
      ],
    });
  }

  // Total row
  rows.push({
    rowId: "total",
    cells: [
      { value: "TOTAL", format: "text" },
      { value: "", format: "text" },
      { value: totalClassified, format: "number" },
      { value: "", format: "text" },
      { value: 100, format: "number", precision: 1 },
    ],
  });

  return {
    tableId: "TABLE_IMDRF_CLASSIFICATION",
    title: "IMDRF Classification Summary",
    columns: ["IMDRF Code", "Term", "Count", "Confirmed", "% of Total"],
    rows,
    footnotes: [
      "MDP codes per IMDRF Annex A (Medical Device Problem codes)",
      "Health Effect codes per IMDRF Annex E",
      "Complaints classified via deterministic mapping from internal symptom codes",
    ],
    traceRef,
  };
}
