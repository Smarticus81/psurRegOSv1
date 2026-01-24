import crypto from "crypto";

export function toISODate(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const mm = m[1].padStart(2, "0");
      const dd = m[2].padStart(2, "0");
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }

  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    return d.toISOString().slice(0, 10);
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return null;
}

export function toBool(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(s)) return true;
    if (["false", "no", "n", "0"].includes(s)) return false;
  }
  return null;
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function makeAtomId(prefix: string, contentHash?: string): string {
  // Use content hash for deterministic IDs (same data = same ID for deduplication)
  if (contentHash) {
    return `${prefix}:${contentHash.slice(0, 12)}`;
  }
  // Fallback to random only if no hash provided (legacy compatibility)
  return `${prefix}:${crypto.randomBytes(6).toString("hex")}`;
}

export function normalizeEnum(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value).trim().toLowerCase().replace(/\s+/g, "_");
}

export function normalizeSeverity(value: unknown): "low" | "medium" | "high" | "critical" | undefined {
  if (value == null || value === "") return undefined;
  const sev = String(value).toLowerCase().replace(/_/g, " ").trim();
  
  if (["low", "medium", "high", "critical"].includes(sev)) {
    return sev as "low" | "medium" | "high" | "critical";
  }
  if (["1", "minor", "non serious", "unknown"].includes(sev)) return "low";
  if (["2", "moderate"].includes(sev)) return "medium";
  if (["3", "major", "serious", "serious incident"].includes(sev)) return "high";
  if (["4", "severe", "life-threatening", "life threatening"].includes(sev)) return "critical";
  
  return undefined;
}

export interface ProvenanceForNormalize {
  sourceSystem: string;
  sourceFile: string;
  sourceFileSha256: string;
  uploadId?: number;
  uploadedAt: string;
  uploadedBy?: string;
}

export interface ComplaintRowInput {
  row: Record<string, unknown>;
  deviceRef: {
    deviceCode: string;
    deviceName?: string;
    udiDi?: string;
  };
  psurPeriod: {
    periodStart: string;
    periodEnd: string;
  };
  provenance: ProvenanceForNormalize;
}

export interface NormalizedComplaintAtom {
  atomId: string;
  atomType: "complaint_record";
  version: number;
  status: "valid" | "invalid" | "superseded";
  psurPeriod: {
    periodStart: string;
    periodEnd: string;
  };
  deviceRef: {
    deviceCode: string;
    deviceName?: string;
    udiDi?: string;
  };
  provenance: ProvenanceForNormalize;
  contentHash: string;
  payload: {
    complaintId: string;
    deviceCode: string;
    complaintDate: string;
    description: string;
    category?: string;
    severity?: "low" | "medium" | "high" | "critical";
    patientImpact?: boolean;
    rootCause?: string;
    resolutionDate?: string;
    resolutionSummary?: string;
    lotNumber?: string;
    serialNumber?: string;
    reporterType?: "patient" | "healthcare_professional" | "distributor" | "other";
    country?: string;
    region?: string;
    investigationStatus?: string;
  };
  createdAt: string;
}

const COMPLAINT_FIELD_ALIASES: Record<string, string[]> = {
  complaint_id: ["complaint_id", "complaintid", "id", "case_id", "reference", "ticket_id"],
  device_code: ["device_code", "devicecode", "sku", "part_number", "product_code", "basic_udi_di", "catalog_number"],
  product_name: ["product_name", "productname", "device_name", "item_name"],
  complaint_date: ["complaint_date", "complaintdate", "date", "reported_date", "received_date", "created_date", "event_date", "eventdate"],
  reported_by: ["reported_by", "reportedby", "reporter", "customer", "source"],
  description: ["description", "complaint_description", "details", "summary", "issue", "problem", "narrative_summary", "narrative"],
  category: ["category", "type", "complaint_type", "issue_type", "event_type"],
  severity: ["severity", "priority", "risk_level", "criticality", "seriousness"],
  patient_impact: ["patient_injury", "patientinjury", "injury", "harm", "patient_harm", "patient_impact"],
  root_cause: ["root_cause", "rootcause", "cause", "reason"],
  resolution_date: ["resolution_date", "resolutiondate", "closed_date", "completion_date"],
  resolution_summary: ["resolution_summary", "resolutionsummary", "corrective_action", "resolution"],
  lot_number: ["lot_number", "lotnumber", "batch", "lot"],
  serial_number: ["serial_number", "serialnumber", "serial"],
  reporter_type: ["reporter_type", "reportertype", "source_type"],
  country: ["country", "country_code"],
  region: ["region", "area", "territory"],
  investigation_status: ["investigation_status", "status", "case_status", "investigation"],
};

function findCanonicalValue(row: Record<string, unknown>, canonicalField: string): unknown {
  const aliases = COMPLAINT_FIELD_ALIASES[canonicalField] || [canonicalField];
  for (const alias of aliases) {
    const lowerAlias = alias.toLowerCase();
    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase() === lowerAlias && value != null && value !== "") {
        return value;
      }
    }
  }
  return null;
}

export function normalizeComplaintRecordRow(input: ComplaintRowInput): {
  atom: NormalizedComplaintAtom;
  errors: string[];
} {
  const { row, deviceRef, psurPeriod, provenance } = input;
  const errors: string[] = [];

  const complaintId = findCanonicalValue(row, "complaint_id");
  const deviceCode = findCanonicalValue(row, "device_code") || deviceRef.deviceCode;
  const complaintDateRaw = findCanonicalValue(row, "complaint_date");
  const description = findCanonicalValue(row, "description");
  const category = findCanonicalValue(row, "category");
  const severityRaw = findCanonicalValue(row, "severity");
  const patientImpactRaw = findCanonicalValue(row, "patient_impact");
  const rootCause = findCanonicalValue(row, "root_cause");
  const resolutionDateRaw = findCanonicalValue(row, "resolution_date");
  const resolutionSummary = findCanonicalValue(row, "resolution_summary");
  const lotNumber = findCanonicalValue(row, "lot_number");
  const serialNumber = findCanonicalValue(row, "serial_number");
  const reporterTypeRaw = findCanonicalValue(row, "reporter_type");
  const country = findCanonicalValue(row, "country");
  const region = findCanonicalValue(row, "region");
  const investigationStatus = findCanonicalValue(row, "investigation_status");

  const complaintDate = toISODate(complaintDateRaw);
  const resolutionDate = toISODate(resolutionDateRaw);
  const patientImpact = toBool(patientImpactRaw);
  const severity = normalizeSeverity(severityRaw);

  if (!complaintId) errors.push("Missing required field: complaintId");
  if (!deviceCode) errors.push("Missing required field: deviceCode");
  if (!complaintDate) errors.push("Missing or invalid complaintDate");
  if (!description) errors.push("Missing required field: description");

  let reporterType: "patient" | "healthcare_professional" | "distributor" | "other" | undefined;
  if (reporterTypeRaw) {
    const rt = String(reporterTypeRaw).toLowerCase().replace(/\s+/g, "_");
    if (["patient", "healthcare_professional", "distributor", "other"].includes(rt)) {
      reporterType = rt as typeof reporterType;
    }
  }

  const payload = {
    complaintId: String(complaintId || ""),
    deviceCode: String(deviceCode || ""),
    complaintDate: complaintDate || "",
    description: String(description || ""),
    category: category ? String(category) : undefined,
    severity,
    patientImpact: patientImpact ?? undefined,
    rootCause: rootCause ? String(rootCause) : undefined,
    resolutionDate: resolutionDate || undefined,
    resolutionSummary: resolutionSummary ? String(resolutionSummary) : undefined,
    lotNumber: lotNumber ? String(lotNumber) : undefined,
    serialNumber: serialNumber ? String(serialNumber) : undefined,
    reporterType,
    country: country ? String(country) : undefined,
    region: region ? String(region) : undefined,
    investigationStatus: investigationStatus ? normalizeEnum(investigationStatus) || undefined : undefined,
  };

  const payloadForHash = JSON.stringify(payload, Object.keys(payload).sort());
  const contentHash = sha256Hex(payloadForHash);
  const atomId = makeAtomId("complaint_record", contentHash);

  const atom: NormalizedComplaintAtom = {
    atomId,
    atomType: "complaint_record",
    version: 1,
    status: errors.length === 0 ? "valid" : "invalid",
    psurPeriod,
    deviceRef: {
      deviceCode: String(deviceCode || deviceRef.deviceCode),
      deviceName: deviceRef.deviceName,
      udiDi: deviceRef.udiDi,
    },
    provenance,
    contentHash,
    payload,
    createdAt: new Date().toISOString(),
  };

  return { atom, errors };
}

export interface SalesRowInput {
  row: Record<string, unknown>;
  deviceRef: {
    deviceCode: string;
    deviceName?: string;
    udiDi?: string;
  };
  psurPeriod: {
    periodStart: string;
    periodEnd: string;
  };
  provenance: ProvenanceForNormalize;
}

const SALES_FIELD_ALIASES: Record<string, string[]> = {
  device_code: ["device_code", "devicecode", "sku", "product_code", "part_number", "item_code"],
  product_name: ["product_name", "productname", "device_name", "item_name", "description"],
  quantity: ["quantity", "qty", "units", "volume", "count", "units_sold"],
  region: ["region", "territory", "area", "market"],
  country: ["country", "country_code", "nation"],
  distribution_channel: ["distribution_channel", "channel", "sales_channel"],
  sale_date: ["sale_date", "saledate", "date", "transaction_date", "order_date"],
  period_start: ["period_start", "periodstart", "start_date", "from_date"],
  period_end: ["period_end", "periodend", "end_date", "to_date"],
  currency: ["currency", "currency_code"],
  revenue: ["revenue", "amount", "sales_amount", "total", "value"],
};

function findSalesCanonicalValue(row: Record<string, unknown>, canonicalField: string): unknown {
  const aliases = SALES_FIELD_ALIASES[canonicalField] || [canonicalField];
  for (const alias of aliases) {
    const lowerAlias = alias.toLowerCase();
    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase() === lowerAlias && value != null && value !== "") {
        return value;
      }
    }
  }
  return null;
}

export interface NormalizedSalesAtom {
  atomId: string;
  atomType: "sales_volume";
  version: number;
  status: "valid" | "invalid" | "superseded";
  psurPeriod: {
    periodStart: string;
    periodEnd: string;
  };
  deviceRef: {
    deviceCode: string;
    deviceName?: string;
    udiDi?: string;
  };
  provenance: ProvenanceForNormalize;
  contentHash: string;
  payload: {
    deviceCode: string;
    productName?: string;
    quantity: number;
    region?: string;
    country?: string;
    distributionChannel?: string;
    saleDate?: string;
    periodStart: string;
    periodEnd: string;
    currency?: string;
    revenue?: number;
  };
  createdAt: string;
}

export function normalizeSalesVolumeRow(input: SalesRowInput): {
  atom: NormalizedSalesAtom;
  errors: string[];
} {
  const { row, deviceRef, psurPeriod, provenance } = input;
  const errors: string[] = [];

  const deviceCode = findSalesCanonicalValue(row, "device_code") || deviceRef.deviceCode;
  const productName = findSalesCanonicalValue(row, "product_name");
  const quantityRaw = findSalesCanonicalValue(row, "quantity");
  const region = findSalesCanonicalValue(row, "region");
  const country = findSalesCanonicalValue(row, "country");
  const distributionChannel = findSalesCanonicalValue(row, "distribution_channel");
  const saleDateRaw = findSalesCanonicalValue(row, "sale_date");
  const periodStartRaw = findSalesCanonicalValue(row, "period_start");
  const periodEndRaw = findSalesCanonicalValue(row, "period_end");
  const currency = findSalesCanonicalValue(row, "currency");
  const revenueRaw = findSalesCanonicalValue(row, "revenue");

  const saleDate = toISODate(saleDateRaw);
  const periodStart = toISODate(periodStartRaw) || psurPeriod.periodStart;
  const periodEnd = toISODate(periodEndRaw) || psurPeriod.periodEnd;

  let quantity: number | null = null;
  if (quantityRaw != null) {
    const parsed = typeof quantityRaw === "number" ? quantityRaw : parseFloat(String(quantityRaw).replace(/[,\s]/g, ""));
    if (!isNaN(parsed) && parsed >= 0) {
      quantity = parsed;
    }
  }

  let revenue: number | undefined;
  if (revenueRaw != null) {
    const parsed = typeof revenueRaw === "number" ? revenueRaw : parseFloat(String(revenueRaw).replace(/[,$\s]/g, ""));
    if (!isNaN(parsed)) {
      revenue = parsed;
    }
  }

  if (!deviceCode) errors.push("Missing required field: deviceCode");
  if (quantity === null || quantity < 0) errors.push("Invalid or missing quantity");
  if (!periodStart) errors.push("Missing required field: periodStart");
  if (!periodEnd) errors.push("Missing required field: periodEnd");

  const payload = {
    deviceCode: String(deviceCode || ""),
    productName: productName ? String(productName) : undefined,
    quantity: quantity ?? 0,
    region: region ? String(region) : undefined,
    country: country ? String(country) : undefined,
    distributionChannel: distributionChannel ? String(distributionChannel) : undefined,
    saleDate: saleDate || undefined,
    periodStart: periodStart || "",
    periodEnd: periodEnd || "",
    currency: currency ? String(currency) : undefined,
    revenue,
  };

  const payloadForHash = JSON.stringify(payload, Object.keys(payload).sort());
  const contentHash = sha256Hex(payloadForHash);
  const atomId = makeAtomId("sales_volume", contentHash);

  const atom: NormalizedSalesAtom = {
    atomId,
    atomType: "sales_volume",
    version: 1,
    status: errors.length === 0 ? "valid" : "invalid",
    psurPeriod: {
      periodStart: periodStart || psurPeriod.periodStart,
      periodEnd: periodEnd || psurPeriod.periodEnd,
    },
    deviceRef: {
      deviceCode: String(deviceCode || deviceRef.deviceCode),
      deviceName: deviceRef.deviceName,
      udiDi: deviceRef.udiDi,
    },
    provenance,
    contentHash,
    payload,
    createdAt: new Date().toISOString(),
  };

  return { atom, errors };
}
