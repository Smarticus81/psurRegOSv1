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
  normalizedData: SalesVolumeAtomData | ComplaintRecordAtomData | null;
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
    } else if (evidenceType === "complaint_record") {
      parsed = parseComplaintRecord(row, i + 1);
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

    const atom: Omit<InsertEvidenceAtom, "id" | "createdAt"> = {
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
      data: record.data,
      normalizedData: record.normalizedData,
      provenance: {
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
