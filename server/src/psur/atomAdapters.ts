/**
 * ATOM ADAPTERS
 *
 * Transforms generic evidence_atoms rows (from DB) into engine-typed inputs.
 * Each adapter maps normalizedData fields to the strict types expected by
 * the deterministic PSUR engines.
 *
 * This decouples the flexible ingestion schema from the strict engine contracts.
 */

import type { ComplaintEvidenceAtom, HarmLevel } from "./engines/complaintEngine";
import type { SalesEvidenceAtom } from "./engines/salesExposureEngine";
import type {
  SeriousIncidentAtom,
  FSCAAtom,
  CAPARecord,
  IncidentOutcome,
  IncidentSeverity,
  FSCAActionType,
  FSCAStatus,
  CAPAStatus,
} from "./engines/vigilanceEngine";
import type { LiteratureEvidenceAtom, LiteratureRelevance } from "./engines/literatureEngine";
import type { PMCFEvidenceAtom, PMCFStudyType, PMCFStudyStatus } from "./engines/pmcfEngine";
import type { PSURSectionId } from "./psurContract";

// ============================================================================
// GENERIC ATOM TYPE (matches DB rows)
// ============================================================================

interface GenericAtom {
  atomId: string;
  evidenceType: string;
  normalizedData: Record<string, unknown>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function str(val: unknown, fallback = ""): string {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

function num(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") return isNaN(val) ? fallback : val;
  // Strip currency symbols, commas, spaces, and parentheses before parsing
  const cleaned = String(val).replace(/[$€£¥,\s]/g, "").replace(/[()]/g, "-");
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}

function bool(val: unknown, fallback = false): boolean {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "boolean") return val;
  const s = String(val).toLowerCase();
  return s === "true" || s === "yes" || s === "1";
}

// ============================================================================
// COMPLAINT ADAPTERS
// ============================================================================

export function toComplaintAtoms(atoms: GenericAtom[]): ComplaintEvidenceAtom[] {
  return atoms
    .filter(a => {
      const t = a.evidenceType.toLowerCase();
      return t.includes("complaint") && !t.includes("summary");
    })
    .map(a => {
      const d = a.normalizedData;
      return {
        atomId: a.atomId,
        evidenceType: "complaint_record" as const,
        complaintId: str(d.complaint_id || d.complaintId || d.id || a.atomId),
        deviceCode: str(d.device_code || d.deviceCode || d.device || ""),
        complaintDate: str(d.complaint_date || d.complaintDate || d.date || d.received_date || ""),
        description: str(d.description || d.complaint_type || d.issue || d.problem_description || ""),
        category: str(d.category || d.complaint_category || d.type || undefined) || undefined,
        severity: mapSeverity(d.severity || d.seriousness || d.severity_level),
        harmLevel: mapHarmLevel(d.harm_level || d.harmLevel || d.patient_harm),
        deviceRelated: bool(d.device_related || d.deviceRelated, true),
        patientInjury: bool(d.patient_injury || d.patientInjury || d.patient_outcome),
        investigationStatus: str(d.investigation_status || d.status || undefined) || undefined,
        rootCause: str(d.root_cause || d.rootCause || undefined) || undefined,
        imdrfProblemCode: str(d.imdrf_code || d.imdrfCode || d.problem_code || undefined) || undefined,
        country: str(d.country || d.region || undefined) || undefined,
        // Confirmed/unconfirmed fields
        complaintConfirmed: str(d.complaint_confirmed || d.complaintConfirmed || d.confirmed || undefined) || undefined,
        investigationFindings: str(d.investigation_findings || d.investigationFindings || d.findings || undefined) || undefined,
        correctiveActions: str(d.corrective_actions || d.correctiveActions || d.corrective_action || undefined) || undefined,
        productNumber: str(d.product_number || d.productNumber || d.catalog_number || d.part_number || undefined) || undefined,
        lotNumber: str(d.lot_number || d.lotNumber || d.batch_number || d.lot || undefined) || undefined,
        additionalMedicalAttention: str(d.additional_medical_attention || d.additionalMedicalAttention || undefined) || undefined,
        patientInvolvement: str(d.patient_involvement || d.patientInvolvement || undefined) || undefined,
        symptomCode: str(d.symptom_code || d.symptomCode || d.symptom || undefined) || undefined,
      };
    });
}

function mapSeverity(val: unknown): "low" | "medium" | "high" | "critical" | undefined {
  if (!val) return undefined;
  const s = String(val).toLowerCase();
  if (s.includes("critical") || s.includes("severe")) return "critical";
  if (s.includes("high") || s.includes("major")) return "high";
  if (s.includes("medium") || s.includes("moderate")) return "medium";
  if (s.includes("low") || s.includes("minor")) return "low";
  return undefined;
}

function mapHarmLevel(val: unknown): HarmLevel | undefined {
  if (!val) return undefined;
  const s = String(val).toUpperCase();
  const valid: HarmLevel[] = ["NONE", "NEGLIGIBLE", "MINOR", "SERIOUS", "CRITICAL", "DEATH"];
  for (const level of valid) {
    if (s.includes(level)) return level;
  }
  return undefined;
}

// ============================================================================
// SALES ADAPTERS
// ============================================================================

export function toSalesAtoms(atoms: GenericAtom[]): SalesEvidenceAtom[] {
  return atoms
    .filter(a => {
      const t = a.evidenceType.toLowerCase();
      return t === "sales_transactions" || t === "sales_volume" || t.includes("sales") || t.includes("distribution") || t.includes("volume") || t.includes("usage_estimate");
    })
    .map(a => {
      const d = a.normalizedData;
      return {
        atomId: a.atomId,
        evidenceType: "sales_volume" as const,
        deviceCode: str(d.device_code || d.deviceCode || d.device || ""),
        quantity: num(d.quantity || d.units_sold || d.units || d.count || d.volume || 0),
        region: str(d.region || d.geography || d.territory || d.market || "Global"),
        country: str(d.country || d.nation || undefined) || undefined,
        saleDate: str(d.sale_date || d.saleDate || undefined) || undefined,
        periodStart: str(d.period_start || d.periodStart || d.start_date || ""),
        periodEnd: str(d.period_end || d.periodEnd || d.end_date || ""),
        productName: str(d.product_name || d.productName || d.device_name || undefined) || undefined,
      };
    });
}

// ============================================================================
// INCIDENT ADAPTERS
// ============================================================================

export function toIncidentAtoms(atoms: GenericAtom[]): SeriousIncidentAtom[] {
  return atoms
    .filter(a => {
      const t = a.evidenceType.toLowerCase();
      return (t.includes("incident") || t.includes("adverse") || t.includes("vigilance")) && t !== "vigilance_submission_log";
    })
    .map(a => {
      const d = a.normalizedData;
      return {
        atomId: a.atomId,
        evidenceType: "serious_incident_record" as const,
        incidentId: str(d.incident_id || d.incidentId || d.id || a.atomId),
        deviceCode: str(d.device_code || d.deviceCode || d.device || ""),
        incidentDate: str(d.incident_date || d.incidentDate || d.date || d.event_date || ""),
        reportDate: str(d.report_date || d.reportDate || undefined) || undefined,
        description: str(d.description || d.event_description || d.narrative || ""),
        outcome: mapIncidentOutcome(d.outcome || d.patient_outcome || d.harm),
        severity: mapIncidentSeverity(d.severity || d.seriousness || d.serious),
        reportedToAuthority: bool(d.reported_to_authority || d.reportedToAuthority || d.reported, true),
        authorityReference: str(d.authority_reference || d.authorityReference || d.mdr_reference || undefined) || undefined,
        country: str(d.country || d.region || undefined) || undefined,
        imdrfAnnexACode: str(d.imdrf_annex_a || d.imdrfAnnexACode || d.investigation_result || undefined) || undefined,
        imdrfAnnexCCode: str(d.imdrf_annex_c || d.imdrfAnnexCCode || d.health_effect || undefined) || undefined,
        imdrfAnnexFCode: str(d.imdrf_annex_f || d.imdrfAnnexFCode || d.root_cause_code || undefined) || undefined,
        relatedCapa: str(d.related_capa || d.relatedCapa || d.capa_id || undefined) || undefined,
        relatedFsca: str(d.related_fsca || d.relatedFsca || d.fsca_id || undefined) || undefined,
        riskFileReference: str(d.risk_file_reference || d.riskFileReference || undefined) || undefined,
      };
    });
}

function mapIncidentOutcome(val: unknown): IncidentOutcome {
  if (!val) return "NON_SERIOUS";
  const s = String(val).toUpperCase();
  if (s.includes("DEATH")) return "DEATH";
  if (s.includes("LIFE") && s.includes("THREAT")) return "LIFE_THREATENING";
  if (s.includes("HOSPITAL")) return "HOSPITALIZATION";
  if (s.includes("DISABIL")) return "DISABILITY";
  if (s.includes("INTERVENTION")) return "INTERVENTION_REQUIRED";
  if (s.includes("OTHER") && s.includes("SERIOUS")) return "OTHER_SERIOUS";
  if (s.includes("SERIOUS")) return "OTHER_SERIOUS";
  return "NON_SERIOUS";
}

function mapIncidentSeverity(val: unknown): IncidentSeverity {
  if (!val) return "NON_SERIOUS";
  const s = String(val).toUpperCase();
  if (s.includes("SERIOUS") || s === "TRUE" || s === "YES") return "SERIOUS";
  return "NON_SERIOUS";
}

// ============================================================================
// FSCA ADAPTERS
// ============================================================================

export function toFSCAAtoms(atoms: GenericAtom[]): FSCAAtom[] {
  return atoms
    .filter(a => {
      const t = a.evidenceType.toLowerCase();
      return t.includes("fsca") || t.includes("recall") || t.includes("field_safety");
    })
    .map(a => {
      const d = a.normalizedData;
      return {
        atomId: a.atomId,
        evidenceType: "fsca_record" as const,
        fscaId: str(d.fsca_id || d.fscaId || d.recall_id || d.id || a.atomId),
        deviceCode: str(d.device_code || d.deviceCode || d.device || ""),
        actionType: mapFSCAActionType(d.action_type || d.actionType || d.type),
        initiationDate: str(d.initiation_date || d.initiationDate || d.start_date || d.date || ""),
        completionDate: str(d.completion_date || d.completionDate || d.end_date || undefined) || undefined,
        status: mapFSCAStatus(d.status || d.fsca_status),
        description: str(d.description || d.reason || ""),
        affectedUnits: num(d.affected_units || d.affectedUnits || d.quantity || undefined) || undefined,
        fsnReference: str(d.fsn_reference || d.fsnReference || undefined) || undefined,
        countries: Array.isArray(d.countries) ? d.countries.map(String) : d.country ? [str(d.country)] : undefined,
        relatedIncidents: Array.isArray(d.related_incidents) ? d.related_incidents.map(String) : undefined,
        capaReference: str(d.capa_reference || d.capaReference || d.capa_id || undefined) || undefined,
      };
    });
}

function mapFSCAActionType(val: unknown): FSCAActionType {
  if (!val) return "OTHER";
  const s = String(val).toUpperCase();
  if (s.includes("RECALL")) return "RECALL";
  if (s.includes("MODIF")) return "MODIFICATION";
  if (s.includes("ADVISORY") || s.includes("NOTICE")) return "ADVISORY";
  if (s.includes("INSPECT")) return "INSPECTION";
  return "OTHER";
}

function mapFSCAStatus(val: unknown): FSCAStatus {
  if (!val) return "INITIATED";
  const s = String(val).toUpperCase();
  if (s.includes("COMPLET")) return "COMPLETED";
  if (s.includes("ONGOING") || s.includes("IN_PROGRESS") || s.includes("ACTIVE")) return "ONGOING";
  if (s.includes("TERMINAT")) return "TERMINATED";
  return "INITIATED";
}

// ============================================================================
// CAPA ADAPTERS
// ============================================================================

export function toCAPARecords(atoms: GenericAtom[]): CAPARecord[] {
  return atoms
    .filter(a => {
      const t = a.evidenceType.toLowerCase();
      return t === "capa_record" || t === "ncr_record" || t.includes("capa") || t.includes("corrective") || t.includes("preventive");
    })
    .map(a => {
      const d = a.normalizedData;
      return {
        capaId: str(d.capa_id || d.capaId || d.id || a.atomId),
        type: mapCAPAType(d.type || d.capa_type),
        status: mapCAPAStatus(d.status || d.capa_status),
        openDate: str(d.open_date || d.openDate || d.initiation_date || d.date || ""),
        closeDate: str(d.close_date || d.closeDate || d.completion_date || undefined) || undefined,
        description: str(d.description || d.summary || ""),
        effectiveness: mapCAPAEffectiveness(d.effectiveness || d.verification_result),
        relatedIncidents: Array.isArray(d.related_incidents) ? d.related_incidents.map(String) : undefined,
        relatedFscas: Array.isArray(d.related_fscas) ? d.related_fscas.map(String) : undefined,
        riskFileReference: str(d.risk_file_reference || d.riskFileReference || undefined) || undefined,
      };
    });
}

function mapCAPAType(val: unknown): "CORRECTIVE" | "PREVENTIVE" {
  if (!val) return "CORRECTIVE";
  const s = String(val).toUpperCase();
  if (s.includes("PREVENT")) return "PREVENTIVE";
  return "CORRECTIVE";
}

function mapCAPAStatus(val: unknown): CAPAStatus {
  if (!val) return "OPEN";
  const s = String(val).toUpperCase();
  if (s.includes("CLOSED") && s.includes("EFFECT")) return "CLOSED_EFFECTIVE";
  if (s.includes("CLOSED") && s.includes("NOT")) return "CLOSED_NOT_EFFECTIVE";
  if (s.includes("CLOSED")) return "CLOSED_EFFECTIVE";
  if (s.includes("CANCEL")) return "CANCELLED";
  if (s.includes("PROGRESS") || s.includes("ACTIVE")) return "IN_PROGRESS";
  return "OPEN";
}

function mapCAPAEffectiveness(val: unknown): "EFFECTIVE" | "PARTIALLY_EFFECTIVE" | "NOT_EFFECTIVE" | "PENDING" | undefined {
  if (!val) return undefined;
  const s = String(val).toUpperCase();
  if (s.includes("NOT") && s.includes("EFFECT")) return "NOT_EFFECTIVE";
  if (s.includes("PARTIAL")) return "PARTIALLY_EFFECTIVE";
  if (s.includes("EFFECT")) return "EFFECTIVE";
  if (s.includes("PENDING")) return "PENDING";
  return undefined;
}

// ============================================================================
// LITERATURE ADAPTERS
// ============================================================================

export function toLiteratureAtoms(atoms: GenericAtom[]): LiteratureEvidenceAtom[] {
  return atoms
    .filter(a => {
      const t = a.evidenceType.toLowerCase();
      return t === "literature_findings" || t === "literature_result" || t.includes("literature") || t.includes("publication") || t.includes("reference");
    })
    .map(a => {
      const d = a.normalizedData;
      return {
        atomId: a.atomId,
        evidenceType: "literature_result" as const,
        referenceId: str(d.reference_id || d.referenceId || d.id || a.atomId),
        title: str(d.title || d.article_title || "Untitled"),
        authors: str(d.authors || d.author || undefined) || undefined,
        publicationDate: str(d.publication_date || d.publicationDate || d.date || undefined) || undefined,
        journal: str(d.journal || d.source || d.publication || undefined) || undefined,
        abstract: str(d.abstract || d.summary || undefined) || undefined,
        relevance: mapLiteratureRelevance(d.relevance || d.classification),
        deviceRelated: bool(d.device_related || d.deviceRelated, true),
        safetySignal: bool(d.safety_signal || d.safetySignal),
        safetySignalDescription: str(d.safety_signal_description || d.signalDescription || undefined) || undefined,
        newRiskIdentified: bool(d.new_risk || d.newRiskIdentified || d.new_risk_identified),
        riskDescription: str(d.risk_description || d.riskDescription || undefined) || undefined,
        stateOfArtRelevant: bool(d.state_of_art || d.stateOfArtRelevant || d.sota_relevant),
        stateOfArtFindings: str(d.sota_findings || d.stateOfArtFindings || undefined) || undefined,
        searchDatabase: str(d.search_database || d.database || d.source || undefined) || undefined,
        searchDate: str(d.search_date || d.searchDate || undefined) || undefined,
      };
    });
}

function mapLiteratureRelevance(val: unknown): LiteratureRelevance | undefined {
  if (!val) return undefined;
  const s = String(val).toUpperCase();
  if (s.includes("DIRECT")) return "DIRECTLY_RELEVANT";
  if (s.includes("INDIRECT")) return "INDIRECTLY_RELEVANT";
  if (s.includes("BACKGROUND")) return "BACKGROUND";
  if (s.includes("NOT")) return "NOT_RELEVANT";
  return undefined;
}

// ============================================================================
// PMCF ADAPTERS
// ============================================================================

export function toPMCFAtoms(atoms: GenericAtom[]): PMCFEvidenceAtom[] {
  return atoms
    .filter(a => {
      const t = a.evidenceType.toLowerCase();
      return t === "pmcf_results" || t === "pmcf_result" || t.includes("pmcf") || t.includes("clinical_follow");
    })
    .map(a => {
      const d = a.normalizedData;
      return {
        atomId: a.atomId,
        evidenceType: "pmcf_result" as const,
        studyId: str(d.study_id || d.studyId || d.id || a.atomId),
        studyName: str(d.study_name || d.studyName || d.name || d.title || ""),
        studyType: mapPMCFStudyType(d.study_type || d.studyType || d.type),
        status: mapPMCFStudyStatus(d.status || d.study_status),
        enrolledSubjects: num(d.enrolled_subjects || d.enrolledSubjects || d.subjects || undefined) || undefined,
        startDate: str(d.start_date || d.startDate || undefined) || undefined,
        endDate: str(d.end_date || d.endDate || undefined) || undefined,
        findings: str(d.findings || d.results || d.summary || undefined) || undefined,
        adverseEvents: num(d.adverse_events || d.adverseEvents || undefined) || undefined,
        deviceFailures: num(d.device_failures || d.deviceFailures || undefined) || undefined,
        clinicalEndpointsReached: d.endpoints_reached !== undefined ? bool(d.endpoints_reached) : undefined,
        deviceCode: str(d.device_code || d.deviceCode || d.device || ""),
      };
    });
}

function mapPMCFStudyType(val: unknown): PMCFStudyType {
  if (!val) return "OTHER";
  const s = String(val).toUpperCase();
  if (s.includes("REGISTRY")) return "REGISTRY";
  if (s.includes("SURVEY")) return "SURVEY";
  if (s.includes("CLINICAL") || s.includes("INVESTIGATION")) return "CLINICAL_INVESTIGATION";
  if (s.includes("LITERATURE")) return "LITERATURE_REVIEW";
  if (s.includes("PROACTIVE") || s.includes("SURVEILLANCE")) return "PROACTIVE_SURVEILLANCE";
  return "OTHER";
}

function mapPMCFStudyStatus(val: unknown): PMCFStudyStatus {
  if (!val) return "NOT_STARTED";
  const s = String(val).toUpperCase();
  if (s.includes("COMPLET")) return "COMPLETED";
  if (s.includes("ONGOING") || s.includes("ACTIVE") || s.includes("IN_PROGRESS")) return "ONGOING";
  if (s.includes("PLAN")) return "PLANNED";
  if (s.includes("TERMINAT")) return "TERMINATED";
  return "NOT_STARTED";
}

// ============================================================================
// SLOT ID TO PSUR SECTION ID MAPPING
// ============================================================================

/**
 * Maps template slot IDs to canonical PSURSectionId values.
 * Handles MDCG.ANNEXI.*, section_*, and pattern-based IDs.
 */
export function mapSlotIdToPSURSectionId(slotId: string): PSURSectionId | null {
  const id = slotId.toLowerCase();

  // MDCG standard IDs
  if (id.includes("exec") || id.includes("summary") || id.includes("section_a"))
    return "SECTION_A_PRODUCT_INFO";
  if (id.includes("device") || id.includes("scope") || id.includes("section_b"))
    return "SECTION_B_DEVICE_DESCRIPTION";
  if (id.includes("sales") || id.includes("exposure") || id.includes("section_c"))
    return "SECTION_C_SALES_EXPOSURE";
  if (id.includes("complaint") || id.includes("feedback") || id.includes("section_e") || id.includes("section_f"))
    return "SECTION_D_COMPLAINTS";
  if (id.includes("trend") || id.includes("section_g"))
    return "SECTION_E_COMPLAINT_TRENDS";
  if (id.includes("incident") || id.includes("section_d"))
    return "SECTION_F_SERIOUS_INCIDENTS";
  if (id.includes("fsca") || id.includes("recall") || id.includes("section_h"))
    return "SECTION_G_FSCA";
  if (id.includes("capa") || id.includes("section_i"))
    return "SECTION_H_VIGILANCE_SUMMARY";
  if (id.includes("literature") || id.includes("section_j"))
    return "SECTION_I_LITERATURE_REVIEW";
  if (id.includes("external") || id.includes("database") || id.includes("section_k"))
    return "SECTION_J_EXTERNAL_DATABASES";
  if (id.includes("pmcf") || id.includes("clinical") || id.includes("section_l"))
    return "SECTION_K_PMCF";
  if (id.includes("benefit") || id.includes("risk"))
    return "SECTION_L_BENEFIT_RISK";
  if (id.includes("conclusion") || id.includes("action") || id.includes("section_m"))
    return "SECTION_M_CONCLUSIONS";

  return null;
}
