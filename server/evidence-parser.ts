import { createHash } from "crypto";
import { z } from "zod";
import {
  salesVolumeAtomDataSchema,
  complaintRecordAtomDataSchema,
  type SalesVolumeAtomData,
  type ComplaintRecordAtomData,
  type InsertEvidenceAtom,
} from "@shared/schema";

export interface ParsedRecord {
  data: Record<string, unknown>;
  normalizedData: Record<string, unknown> | null;
  validationErrors: string[];
  isValid: boolean;
  rowIndex: number;
}

export interface ParseResult {
  success: boolean;
  evidenceType: string;
  records: ParsedRecord[];
  validRecords: number;
  invalidRecords: number;
  errors: string[];
  warnings: string[];
}

export interface EvidenceAtomBatch {
  atoms: Omit<InsertEvidenceAtom, "id" | "createdAt">[];
  rejected: ParsedRecord[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: string[];
  };
}

const SALES_COLUMN_MAPPINGS: Record<string, string[]> = {
  deviceCode: ["device_code", "devicecode", "sku", "part_number", "partnumber", "product_code", "item_code"],
  productName: ["product_name", "productname", "device_name", "item_name", "description"],
  quantity: ["quantity", "qty", "units", "units_sold", "count", "volume"],
  region: ["region", "territory", "area"],
  country: ["country", "country_code", "nation"],
  distributionChannel: ["channel", "distribution_channel", "sales_channel"],
  saleDate: ["sale_date", "saledate", "date", "transaction_date", "order_date"],
  periodStart: ["period_start", "periodstart", "start_date", "from_date"],
  periodEnd: ["period_end", "periodend", "end_date", "to_date"],
  currency: ["currency", "currency_code"],
  revenue: ["revenue", "amount", "sales_amount", "total", "value"],
};

const COMPLAINT_COLUMN_MAPPINGS: Record<string, string[]> = {
  complaintId: ["complaint_id", "complaintid", "id", "case_id", "reference", "ticket_id"],
  deviceCode: ["device_code", "devicecode", "sku", "part_number", "product_code"],
  productName: ["product_name", "productname", "device_name", "item_name"],
  complaintDate: ["complaint_date", "complaintdate", "date", "reported_date", "received_date", "created_date"],
  reportedBy: ["reported_by", "reportedby", "reporter", "customer", "source"],
  description: ["description", "complaint_description", "details", "summary", "issue", "problem"],
  category: ["category", "type", "complaint_type", "issue_type"],
  severity: ["severity", "priority", "risk_level", "criticality"],
  deviceRelated: ["device_related", "devicerelated", "product_related", "is_device_related"],
  patientInjury: ["patient_injury", "patientinjury", "injury", "harm", "patient_harm"],
  investigationStatus: ["investigation_status", "status", "case_status", "investigation"],
  rootCause: ["root_cause", "rootcause", "cause", "reason"],
  correctiveAction: ["corrective_action", "action", "capa", "resolution"],
  imdrfCode: ["imdrf_code", "imdrfcode", "event_code", "adverse_event_code"],
  country: ["country", "country_code", "region"],
};

function normalizeColumnName(col: string): string {
  return col.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function findMappedColumn(row: Record<string, unknown>, targetField: string, mappings: Record<string, string[]>): unknown {
  const possibleNames = mappings[targetField] || [targetField];
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeColumnName(key);
    if (possibleNames.includes(normalizedKey)) {
      return value;
    }
  }
  return undefined;
}

function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    const datePatterns = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      /^(\d{4})-(\d{2})-(\d{2})$/,
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    ];
    for (const pattern of datePatterns) {
      const match = value.match(pattern);
      if (match) {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
    }
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,$\s]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

function parseBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (["yes", "true", "1", "y"].includes(lower)) return true;
    if (["no", "false", "0", "n"].includes(lower)) return false;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return null;
}

export function parseSalesRecord(row: Record<string, unknown>, rowIndex: number, defaultPeriod?: { start: string; end: string }): ParsedRecord {
  const errors: string[] = [];
  
  const deviceCode = findMappedColumn(row, "deviceCode", SALES_COLUMN_MAPPINGS);
  const productName = findMappedColumn(row, "productName", SALES_COLUMN_MAPPINGS);
  const quantity = parseNumber(findMappedColumn(row, "quantity", SALES_COLUMN_MAPPINGS));
  const region = findMappedColumn(row, "region", SALES_COLUMN_MAPPINGS);
  const country = findMappedColumn(row, "country", SALES_COLUMN_MAPPINGS);
  const distributionChannel = findMappedColumn(row, "distributionChannel", SALES_COLUMN_MAPPINGS);
  const saleDate = parseDate(findMappedColumn(row, "saleDate", SALES_COLUMN_MAPPINGS));
  const periodStart = parseDate(findMappedColumn(row, "periodStart", SALES_COLUMN_MAPPINGS)) || defaultPeriod?.start;
  const periodEnd = parseDate(findMappedColumn(row, "periodEnd", SALES_COLUMN_MAPPINGS)) || defaultPeriod?.end;
  const currency = findMappedColumn(row, "currency", SALES_COLUMN_MAPPINGS);
  const revenue = parseNumber(findMappedColumn(row, "revenue", SALES_COLUMN_MAPPINGS));

  if (!deviceCode) errors.push("Missing required field: deviceCode");
  if (quantity === null || quantity < 0) errors.push("Invalid or missing quantity");
  if (!periodStart) errors.push("Missing required field: periodStart");
  if (!periodEnd) errors.push("Missing required field: periodEnd");

  const normalizedData: SalesVolumeAtomData | null = errors.length === 0 ? {
    deviceCode: String(deviceCode),
    productName: productName ? String(productName) : undefined,
    quantity: quantity!,
    region: region ? String(region) : undefined,
    country: country ? String(country) : undefined,
    distributionChannel: distributionChannel ? String(distributionChannel) : undefined,
    saleDate: saleDate || undefined,
    periodStart: periodStart!,
    periodEnd: periodEnd!,
    currency: currency ? String(currency) : undefined,
    revenue: revenue || undefined,
  } : null;

  return {
    data: row,
    normalizedData,
    validationErrors: errors,
    isValid: errors.length === 0,
    rowIndex,
  };
}

export function parseComplaintRecord(row: Record<string, unknown>, rowIndex: number): ParsedRecord {
  const errors: string[] = [];
  
  const complaintId = findMappedColumn(row, "complaintId", COMPLAINT_COLUMN_MAPPINGS);
  const deviceCode = findMappedColumn(row, "deviceCode", COMPLAINT_COLUMN_MAPPINGS);
  const productName = findMappedColumn(row, "productName", COMPLAINT_COLUMN_MAPPINGS);
  const complaintDate = parseDate(findMappedColumn(row, "complaintDate", COMPLAINT_COLUMN_MAPPINGS));
  const reportedBy = findMappedColumn(row, "reportedBy", COMPLAINT_COLUMN_MAPPINGS);
  const description = findMappedColumn(row, "description", COMPLAINT_COLUMN_MAPPINGS);
  const category = findMappedColumn(row, "category", COMPLAINT_COLUMN_MAPPINGS);
  const severityRaw = findMappedColumn(row, "severity", COMPLAINT_COLUMN_MAPPINGS);
  const deviceRelated = parseBoolean(findMappedColumn(row, "deviceRelated", COMPLAINT_COLUMN_MAPPINGS));
  const patientInjury = parseBoolean(findMappedColumn(row, "patientInjury", COMPLAINT_COLUMN_MAPPINGS));
  const investigationStatus = findMappedColumn(row, "investigationStatus", COMPLAINT_COLUMN_MAPPINGS);
  const rootCause = findMappedColumn(row, "rootCause", COMPLAINT_COLUMN_MAPPINGS);
  const correctiveAction = findMappedColumn(row, "correctiveAction", COMPLAINT_COLUMN_MAPPINGS);
  const imdrfCode = findMappedColumn(row, "imdrfCode", COMPLAINT_COLUMN_MAPPINGS);
  const country = findMappedColumn(row, "country", COMPLAINT_COLUMN_MAPPINGS);

  if (!complaintId) errors.push("Missing required field: complaintId");
  if (!deviceCode) errors.push("Missing required field: deviceCode");
  if (!complaintDate) errors.push("Missing or invalid complaintDate");
  if (!description) errors.push("Missing required field: description");

  let severity: "low" | "medium" | "high" | "critical" | undefined;
  if (severityRaw) {
    const sev = String(severityRaw).toLowerCase();
    if (["low", "medium", "high", "critical"].includes(sev)) {
      severity = sev as "low" | "medium" | "high" | "critical";
    } else if (["1", "minor"].includes(sev)) {
      severity = "low";
    } else if (["2", "moderate"].includes(sev)) {
      severity = "medium";
    } else if (["3", "major", "serious"].includes(sev)) {
      severity = "high";
    } else if (["4", "severe", "life-threatening"].includes(sev)) {
      severity = "critical";
    }
  }

  const normalizedData: ComplaintRecordAtomData | null = errors.length === 0 ? {
    complaintId: String(complaintId),
    deviceCode: String(deviceCode),
    productName: productName ? String(productName) : undefined,
    complaintDate: complaintDate!,
    reportedBy: reportedBy ? String(reportedBy) : undefined,
    description: String(description),
    category: category ? String(category) : undefined,
    severity,
    deviceRelated: deviceRelated ?? undefined,
    patientInjury: patientInjury ?? undefined,
    investigationStatus: investigationStatus ? String(investigationStatus) : undefined,
    rootCause: rootCause ? String(rootCause) : undefined,
    correctiveAction: correctiveAction ? String(correctiveAction) : undefined,
    imdrfCode: imdrfCode ? String(imdrfCode) : undefined,
    country: country ? String(country) : undefined,
  } : null;

  return {
    data: row,
    normalizedData,
    validationErrors: errors,
    isValid: errors.length === 0,
    rowIndex,
  };
}

const INCIDENT_COLUMN_MAPPINGS: Record<string, string[]> = {
  incidentId: ["incident_id", "incidentid", "id", "case_id", "reference", "event_id", "report_number"],
  deviceCode: ["device_code", "devicecode", "sku", "product_code", "udi"],
  incidentDate: ["incident_date", "incidentdate", "date", "event_date", "occurrence_date"],
  description: ["description", "incident_description", "details", "summary", "narrative"],
  severity: ["severity", "seriousness", "harm_level", "outcome"],
  reportedTo: ["reported_to", "reportedto", "authority", "regulator", "notified_to"],
  patientOutcome: ["patient_outcome", "patientoutcome", "outcome", "harm", "injury"],
  deviceMalfunction: ["device_malfunction", "malfunction", "failure_mode"],
  country: ["country", "country_code", "region"],
  serious: ["serious", "is_serious", "reportable"],
};

const FSCA_COLUMN_MAPPINGS: Record<string, string[]> = {
  fscaId: ["fsca_id", "fscaid", "id", "reference", "action_number"],
  deviceCode: ["device_code", "devicecode", "sku", "product_code"],
  actionType: ["action_type", "actiontype", "type", "fsca_type"],
  initiationDate: ["initiation_date", "initiationdate", "start_date", "date"],
  completionDate: ["completion_date", "completiondate", "end_date", "closed_date"],
  description: ["description", "summary", "details", "action_description"],
  affectedUnits: ["affected_units", "affectedunits", "units_affected", "quantity"],
  status: ["status", "fsca_status", "action_status"],
  country: ["country", "countries", "region"],
};

const CAPA_COLUMN_MAPPINGS: Record<string, string[]> = {
  capaId: ["capa_id", "capaid", "id", "reference", "capa_number"],
  type: ["type", "capa_type", "action_type"],
  initiationDate: ["initiation_date", "initiationdate", "open_date", "created_date"],
  dueDate: ["due_date", "duedate", "target_date"],
  completionDate: ["completion_date", "completiondate", "closed_date"],
  description: ["description", "summary", "details", "issue"],
  rootCause: ["root_cause", "rootcause", "cause"],
  correctiveAction: ["corrective_action", "correctiveaction", "action", "resolution"],
  status: ["status", "capa_status"],
  effectiveness: ["effectiveness", "verification", "effective"],
};

const LITERATURE_COLUMN_MAPPINGS: Record<string, string[]> = {
  referenceId: ["reference_id", "referenceid", "id", "pubmed_id", "doi"],
  title: ["title", "article_title", "publication_title"],
  authors: ["authors", "author", "author_list"],
  publicationDate: ["publication_date", "publicationdate", "date", "pub_date"],
  journal: ["journal", "source", "publication"],
  abstract: ["abstract", "summary", "description"],
  relevance: ["relevance", "relevance_score", "applicable"],
  deviceRelated: ["device_related", "devicerelated", "related"],
  safetySignal: ["safety_signal", "safetysignal", "signal", "finding"],
};

const PMCF_COLUMN_MAPPINGS: Record<string, string[]> = {
  studyId: ["study_id", "studyid", "id", "protocol_id"],
  studyName: ["study_name", "studyname", "title", "protocol_title"],
  studyType: ["study_type", "studytype", "type", "design"],
  startDate: ["start_date", "startdate", "initiation_date"],
  endDate: ["end_date", "enddate", "completion_date"],
  status: ["status", "study_status"],
  enrolledSubjects: ["enrolled_subjects", "enrolledsubjects", "n", "sample_size", "subjects"],
  findings: ["findings", "results", "outcomes", "summary"],
  deviceCode: ["device_code", "devicecode", "product_code"],
};

const REGISTRY_COLUMN_MAPPINGS: Record<string, string[]> = {
  registryName: ["registry_name", "registryname", "database", "source"],
  queryDate: ["query_date", "querydate", "search_date", "date"],
  searchTerms: ["search_terms", "searchterms", "query", "keywords"],
  resultsCount: ["results_count", "resultscount", "hits", "count"],
  relevantFindings: ["relevant_findings", "relevantfindings", "findings", "results"],
  deviceCode: ["device_code", "devicecode", "product_code"],
};

const GENERIC_EVIDENCE_TYPES = [
  "manufacturer_master_data",
  "device_master_data", 
  "psur_case_record",
  "population_estimate",
  "exposure_model",
  "trend_metrics",
  "benefit_risk",
];

export function parseIncidentRecord(row: Record<string, unknown>, rowIndex: number): ParsedRecord {
  const errors: string[] = [];
  
  const incidentId = findMappedColumn(row, "incidentId", INCIDENT_COLUMN_MAPPINGS);
  const deviceCode = findMappedColumn(row, "deviceCode", INCIDENT_COLUMN_MAPPINGS);
  const incidentDate = parseDate(findMappedColumn(row, "incidentDate", INCIDENT_COLUMN_MAPPINGS));
  const description = findMappedColumn(row, "description", INCIDENT_COLUMN_MAPPINGS);
  const severity = findMappedColumn(row, "severity", INCIDENT_COLUMN_MAPPINGS);
  const reportedTo = findMappedColumn(row, "reportedTo", INCIDENT_COLUMN_MAPPINGS);
  const patientOutcome = findMappedColumn(row, "patientOutcome", INCIDENT_COLUMN_MAPPINGS);
  const deviceMalfunction = findMappedColumn(row, "deviceMalfunction", INCIDENT_COLUMN_MAPPINGS);
  const country = findMappedColumn(row, "country", INCIDENT_COLUMN_MAPPINGS);
  const serious = parseBoolean(findMappedColumn(row, "serious", INCIDENT_COLUMN_MAPPINGS));

  if (!incidentId) errors.push("Missing required field: incidentId");
  if (!deviceCode) errors.push("Missing required field: deviceCode");
  if (!incidentDate) errors.push("Missing or invalid incidentDate");
  if (!description) errors.push("Missing required field: description");

  const normalizedData = errors.length === 0 ? {
    incidentId: String(incidentId),
    deviceCode: String(deviceCode),
    incidentDate: incidentDate!,
    description: String(description),
    severity: severity ? String(severity) : undefined,
    reportedTo: reportedTo ? String(reportedTo) : undefined,
    patientOutcome: patientOutcome ? String(patientOutcome) : undefined,
    deviceMalfunction: deviceMalfunction ? String(deviceMalfunction) : undefined,
    country: country ? String(country) : undefined,
    serious: serious ?? undefined,
  } : null;

  return { data: row, normalizedData, validationErrors: errors, isValid: errors.length === 0, rowIndex };
}

export function parseFSCARecord(row: Record<string, unknown>, rowIndex: number): ParsedRecord {
  const errors: string[] = [];
  
  const fscaId = findMappedColumn(row, "fscaId", FSCA_COLUMN_MAPPINGS);
  const deviceCode = findMappedColumn(row, "deviceCode", FSCA_COLUMN_MAPPINGS);
  const actionType = findMappedColumn(row, "actionType", FSCA_COLUMN_MAPPINGS);
  const initiationDate = parseDate(findMappedColumn(row, "initiationDate", FSCA_COLUMN_MAPPINGS));
  const completionDate = parseDate(findMappedColumn(row, "completionDate", FSCA_COLUMN_MAPPINGS));
  const description = findMappedColumn(row, "description", FSCA_COLUMN_MAPPINGS);
  const affectedUnits = parseNumber(findMappedColumn(row, "affectedUnits", FSCA_COLUMN_MAPPINGS));
  const status = findMappedColumn(row, "status", FSCA_COLUMN_MAPPINGS);
  const country = findMappedColumn(row, "country", FSCA_COLUMN_MAPPINGS);

  if (!fscaId) errors.push("Missing required field: fscaId");
  if (!deviceCode) errors.push("Missing required field: deviceCode");
  if (!actionType) errors.push("Missing required field: actionType");
  if (!initiationDate) errors.push("Missing or invalid initiationDate");

  const normalizedData = errors.length === 0 ? {
    fscaId: String(fscaId),
    deviceCode: String(deviceCode),
    actionType: String(actionType),
    initiationDate: initiationDate!,
    completionDate: completionDate || undefined,
    description: description ? String(description) : undefined,
    affectedUnits: affectedUnits || undefined,
    status: status ? String(status) : undefined,
    country: country ? String(country) : undefined,
  } : null;

  return { data: row, normalizedData, validationErrors: errors, isValid: errors.length === 0, rowIndex };
}

export function parseCAPARecord(row: Record<string, unknown>, rowIndex: number): ParsedRecord {
  const errors: string[] = [];
  
  const capaId = findMappedColumn(row, "capaId", CAPA_COLUMN_MAPPINGS);
  const type = findMappedColumn(row, "type", CAPA_COLUMN_MAPPINGS);
  const initiationDate = parseDate(findMappedColumn(row, "initiationDate", CAPA_COLUMN_MAPPINGS));
  const dueDate = parseDate(findMappedColumn(row, "dueDate", CAPA_COLUMN_MAPPINGS));
  const completionDate = parseDate(findMappedColumn(row, "completionDate", CAPA_COLUMN_MAPPINGS));
  const description = findMappedColumn(row, "description", CAPA_COLUMN_MAPPINGS);
  const rootCause = findMappedColumn(row, "rootCause", CAPA_COLUMN_MAPPINGS);
  const correctiveAction = findMappedColumn(row, "correctiveAction", CAPA_COLUMN_MAPPINGS);
  const status = findMappedColumn(row, "status", CAPA_COLUMN_MAPPINGS);
  const effectiveness = findMappedColumn(row, "effectiveness", CAPA_COLUMN_MAPPINGS);

  if (!capaId) errors.push("Missing required field: capaId");
  if (!description) errors.push("Missing required field: description");

  const normalizedData = errors.length === 0 ? {
    capaId: String(capaId),
    type: type ? String(type) : undefined,
    initiationDate: initiationDate || undefined,
    dueDate: dueDate || undefined,
    completionDate: completionDate || undefined,
    description: String(description),
    rootCause: rootCause ? String(rootCause) : undefined,
    correctiveAction: correctiveAction ? String(correctiveAction) : undefined,
    status: status ? String(status) : undefined,
    effectiveness: effectiveness ? String(effectiveness) : undefined,
  } : null;

  return { data: row, normalizedData, validationErrors: errors, isValid: errors.length === 0, rowIndex };
}

export function parseLiteratureRecord(row: Record<string, unknown>, rowIndex: number): ParsedRecord {
  const errors: string[] = [];
  
  const referenceId = findMappedColumn(row, "referenceId", LITERATURE_COLUMN_MAPPINGS);
  const title = findMappedColumn(row, "title", LITERATURE_COLUMN_MAPPINGS);
  const authors = findMappedColumn(row, "authors", LITERATURE_COLUMN_MAPPINGS);
  const publicationDate = parseDate(findMappedColumn(row, "publicationDate", LITERATURE_COLUMN_MAPPINGS));
  const journal = findMappedColumn(row, "journal", LITERATURE_COLUMN_MAPPINGS);
  const abstract_ = findMappedColumn(row, "abstract", LITERATURE_COLUMN_MAPPINGS);
  const relevance = findMappedColumn(row, "relevance", LITERATURE_COLUMN_MAPPINGS);
  const deviceRelated = parseBoolean(findMappedColumn(row, "deviceRelated", LITERATURE_COLUMN_MAPPINGS));
  const safetySignal = findMappedColumn(row, "safetySignal", LITERATURE_COLUMN_MAPPINGS);

  if (!referenceId && !title) errors.push("Missing required field: referenceId or title");

  const normalizedData = errors.length === 0 ? {
    referenceId: referenceId ? String(referenceId) : undefined,
    title: title ? String(title) : undefined,
    authors: authors ? String(authors) : undefined,
    publicationDate: publicationDate || undefined,
    journal: journal ? String(journal) : undefined,
    abstract: abstract_ ? String(abstract_) : undefined,
    relevance: relevance ? String(relevance) : undefined,
    deviceRelated: deviceRelated ?? undefined,
    safetySignal: safetySignal ? String(safetySignal) : undefined,
  } : null;

  return { data: row, normalizedData, validationErrors: errors, isValid: errors.length === 0, rowIndex };
}

export function parsePMCFRecord(row: Record<string, unknown>, rowIndex: number): ParsedRecord {
  const errors: string[] = [];
  
  const studyId = findMappedColumn(row, "studyId", PMCF_COLUMN_MAPPINGS);
  const studyName = findMappedColumn(row, "studyName", PMCF_COLUMN_MAPPINGS);
  const studyType = findMappedColumn(row, "studyType", PMCF_COLUMN_MAPPINGS);
  const startDate = parseDate(findMappedColumn(row, "startDate", PMCF_COLUMN_MAPPINGS));
  const endDate = parseDate(findMappedColumn(row, "endDate", PMCF_COLUMN_MAPPINGS));
  const status = findMappedColumn(row, "status", PMCF_COLUMN_MAPPINGS);
  const enrolledSubjects = parseNumber(findMappedColumn(row, "enrolledSubjects", PMCF_COLUMN_MAPPINGS));
  const findings = findMappedColumn(row, "findings", PMCF_COLUMN_MAPPINGS);
  const deviceCode = findMappedColumn(row, "deviceCode", PMCF_COLUMN_MAPPINGS);

  if (!studyId && !studyName) errors.push("Missing required field: studyId or studyName");

  const normalizedData = errors.length === 0 ? {
    studyId: studyId ? String(studyId) : undefined,
    studyName: studyName ? String(studyName) : undefined,
    studyType: studyType ? String(studyType) : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    status: status ? String(status) : undefined,
    enrolledSubjects: enrolledSubjects || undefined,
    findings: findings ? String(findings) : undefined,
    deviceCode: deviceCode ? String(deviceCode) : undefined,
  } : null;

  return { data: row, normalizedData, validationErrors: errors, isValid: errors.length === 0, rowIndex };
}

export function parseRegistryRecord(row: Record<string, unknown>, rowIndex: number): ParsedRecord {
  const errors: string[] = [];
  
  const registryName = findMappedColumn(row, "registryName", REGISTRY_COLUMN_MAPPINGS);
  const queryDate = parseDate(findMappedColumn(row, "queryDate", REGISTRY_COLUMN_MAPPINGS));
  const searchTerms = findMappedColumn(row, "searchTerms", REGISTRY_COLUMN_MAPPINGS);
  const resultsCount = parseNumber(findMappedColumn(row, "resultsCount", REGISTRY_COLUMN_MAPPINGS));
  const relevantFindings = findMappedColumn(row, "relevantFindings", REGISTRY_COLUMN_MAPPINGS);
  const deviceCode = findMappedColumn(row, "deviceCode", REGISTRY_COLUMN_MAPPINGS);

  if (!registryName) errors.push("Missing required field: registryName");

  const normalizedData = errors.length === 0 ? {
    registryName: String(registryName),
    queryDate: queryDate || undefined,
    searchTerms: searchTerms ? String(searchTerms) : undefined,
    resultsCount: resultsCount || undefined,
    relevantFindings: relevantFindings ? String(relevantFindings) : undefined,
    deviceCode: deviceCode ? String(deviceCode) : undefined,
  } : null;

  return { data: row, normalizedData, validationErrors: errors, isValid: errors.length === 0, rowIndex };
}

export function parseGenericRecord(
  row: Record<string, unknown>, 
  rowIndex: number, 
  evidenceType: string,
  options?: { periodStart?: string; periodEnd?: string }
): ParsedRecord {
  const normalizedData: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined && value !== "") {
      const normalizedKey = normalizeColumnName(key);
      if (typeof value === "string") {
        const dateVal = parseDate(value);
        const numVal = parseNumber(value);
        if (dateVal && value.match(/\d{4}[-\/]\d{2}[-\/]\d{2}/)) {
          normalizedData[normalizedKey] = dateVal;
        } else if (numVal !== null && !isNaN(numVal)) {
          normalizedData[normalizedKey] = numVal;
        } else {
          normalizedData[normalizedKey] = value;
        }
      } else {
        normalizedData[normalizedKey] = value;
      }
    }
  }
  
  if (options?.periodStart) normalizedData.periodStart = options.periodStart;
  if (options?.periodEnd) normalizedData.periodEnd = options.periodEnd;
  normalizedData._evidenceType = evidenceType;

  return {
    data: row,
    normalizedData,
    validationErrors: [],
    isValid: true,
    rowIndex,
  };
}

export function parseCSV(content: string): Record<string, unknown>[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  const records: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || values.every(v => !v.trim())) continue;
    
    const record: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] || "";
    }
    records.push(record);
  }
  
  return records;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

export function generateContentHash(data: unknown): string {
  const json = JSON.stringify(data, Object.keys(data as object).sort());
  return createHash("sha256").update(json).digest("hex");
}

export function parseEvidenceFile(
  content: string,
  evidenceType: string,
  options?: {
    periodStart?: string;
    periodEnd?: string;
  }
): ParseResult {
  const records = parseCSV(content);
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (records.length === 0) {
    return {
      success: false,
      evidenceType,
      records: [],
      validRecords: 0,
      invalidRecords: 0,
      errors: ["No data records found in file"],
      warnings: [],
    };
  }

  const parsedRecords: ParsedRecord[] = [];
  
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    let parsed: ParsedRecord;
    
    if (evidenceType === "sales_volume") {
      parsed = parseSalesRecord(row, i + 1, options?.periodStart && options?.periodEnd ? {
        start: options.periodStart,
        end: options.periodEnd,
      } : undefined);
    } else if (evidenceType === "complaint_record" || evidenceType === "complaints") {
      parsed = parseComplaintRecord(row, i + 1);
    } else if (evidenceType === "incident_record" || evidenceType === "incidents") {
      parsed = parseIncidentRecord(row, i + 1);
    } else if (evidenceType === "fsca") {
      parsed = parseFSCARecord(row, i + 1);
    } else if (evidenceType === "capa") {
      parsed = parseCAPARecord(row, i + 1);
    } else if (evidenceType === "literature") {
      parsed = parseLiteratureRecord(row, i + 1);
    } else if (evidenceType === "pmcf") {
      parsed = parsePMCFRecord(row, i + 1);
    } else if (evidenceType === "registry") {
      parsed = parseRegistryRecord(row, i + 1);
    } else if (GENERIC_EVIDENCE_TYPES.includes(evidenceType)) {
      parsed = parseGenericRecord(row, i + 1, evidenceType, options);
    } else {
      parsed = {
        data: row,
        normalizedData: null,
        validationErrors: [`Unsupported evidence type: ${evidenceType}`],
        isValid: false,
        rowIndex: i + 1,
      };
    }
    
    parsedRecords.push(parsed);
  }

  const validRecords = parsedRecords.filter(r => r.isValid).length;
  const invalidRecords = parsedRecords.filter(r => !r.isValid).length;

  if (invalidRecords > 0) {
    warnings.push(`${invalidRecords} records failed validation and will be rejected`);
  }

  return {
    success: validRecords > 0,
    evidenceType,
    records: parsedRecords,
    validRecords,
    invalidRecords,
    errors,
    warnings,
  };
}

export function createEvidenceAtomBatch(
  parseResult: ParseResult,
  uploadId: number,
  options: {
    psurCaseId?: number;
    deviceScopeId?: number;
    sourceSystem: string;
    periodStart?: Date;
    periodEnd?: Date;
  }
): EvidenceAtomBatch {
  const atoms: Omit<InsertEvidenceAtom, "id" | "createdAt">[] = [];
  const rejected: ParsedRecord[] = [];
  const warnings: string[] = [];

  for (const record of parseResult.records) {
    if (!record.isValid || !record.normalizedData) {
      rejected.push(record);
      continue;
    }

    const contentHash = generateContentHash(record.normalizedData);
    
    let atomPeriodStart = options.periodStart;
    let atomPeriodEnd = options.periodEnd;
    
    if (parseResult.evidenceType === "sales_volume" && record.normalizedData) {
      const salesData = record.normalizedData as SalesVolumeAtomData;
      atomPeriodStart = new Date(salesData.periodStart);
      atomPeriodEnd = new Date(salesData.periodEnd);
    } else if (parseResult.evidenceType === "complaint_record" && record.normalizedData) {
      const complaintData = record.normalizedData as ComplaintRecordAtomData;
      atomPeriodStart = new Date(complaintData.complaintDate);
      atomPeriodEnd = atomPeriodStart;
    }

    const atomId = `${parseResult.evidenceType}:${contentHash}`;
    
    const atom: Omit<InsertEvidenceAtom, "id" | "createdAt"> = {
      atomId,
      psurCaseId: options.psurCaseId || null,
      uploadId,
      evidenceType: parseResult.evidenceType,
      sourceSystem: options.sourceSystem,
      extractDate: new Date(),
      contentHash,
      recordCount: 1,
      periodStart: atomPeriodStart,
      periodEnd: atomPeriodEnd,
      deviceScopeId: options.deviceScopeId || null,
      deviceRef: null,
      data: record.data,
      normalizedData: record.normalizedData,
      provenance: {
        atomId,
        uploadId,
        rowIndex: record.rowIndex,
        sourceSystem: options.sourceSystem,
        parsedAt: new Date().toISOString(),
      },
      validationErrors: null,
      status: "valid",
      version: 1,
      supersededBy: null,
      queryFilters: null,
    };

    atoms.push(atom);
  }

  return {
    atoms,
    rejected,
    summary: {
      total: parseResult.records.length,
      valid: atoms.length,
      invalid: rejected.length,
      warnings,
    },
  };
}
