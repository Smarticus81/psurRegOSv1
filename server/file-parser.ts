import * as XLSX from "xlsx";

export interface ParsedRow {
  [key: string]: unknown;
}

export interface FileParseResult {
  success: boolean;
  rows: ParsedRow[];
  columns: string[];
  errors: string[];
  fileType: "csv" | "xlsx";
  sheetName?: string;
}

export function parseFileBuffer(buffer: Buffer, filename: string): FileParseResult {
  const ext = filename.toLowerCase().split(".").pop();
  
  if (ext === "xlsx" || ext === "xls") {
    return parseExcelBuffer(buffer);
  } else if (ext === "csv") {
    return parseCsvBuffer(buffer);
  } else {
    return {
      success: false,
      rows: [],
      columns: [],
      errors: [`Unsupported file type: ${ext}. Use CSV or XLSX.`],
      fileType: "csv",
    };
  }
}

function parseExcelBuffer(buffer: Buffer): FileParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    
    if (!sheetName) {
      return {
        success: false,
        rows: [],
        columns: [],
        errors: ["No sheets found in Excel file"],
        fileType: "xlsx",
      };
    }
    
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(worksheet, { 
      raw: false,
      defval: null,
    });
    
    if (jsonData.length === 0) {
      return {
        success: false,
        rows: [],
        columns: [],
        errors: ["No data found in Excel file"],
        fileType: "xlsx",
        sheetName,
      };
    }
    
    const columns = Object.keys(jsonData[0] || {});
    
    return {
      success: true,
      rows: jsonData,
      columns,
      errors: [],
      fileType: "xlsx",
      sheetName,
    };
  } catch (error) {
    return {
      success: false,
      rows: [],
      columns: [],
      errors: [`Failed to parse Excel file: ${error instanceof Error ? error.message : "Unknown error"}`],
      fileType: "xlsx",
    };
  }
}

function parseCsvBuffer(buffer: Buffer): FileParseResult {
  try {
    const content = buffer.toString("utf-8");
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      return {
        success: false,
        rows: [],
        columns: [],
        errors: ["Empty CSV file"],
        fileType: "csv",
      };
    }
    
    const headerLine = lines[0];
    const columns = parseCSVLine(headerLine);
    
    const rows: ParsedRow[] = [];
    const errors: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const values = parseCSVLine(line);
      
      if (values.length !== columns.length) {
        errors.push(`Row ${i + 1}: Column count mismatch (expected ${columns.length}, got ${values.length})`);
        continue;
      }
      
      const row: ParsedRow = {};
      for (let j = 0; j < columns.length; j++) {
        row[columns[j]] = values[j] || null;
      }
      rows.push(row);
    }
    
    return {
      success: true,
      rows,
      columns,
      errors,
      fileType: "csv",
    };
  } catch (error) {
    return {
      success: false,
      rows: [],
      columns: [],
      errors: [`Failed to parse CSV file: ${error instanceof Error ? error.message : "Unknown error"}`],
      fileType: "csv",
    };
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
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

export function normalizeColumnName(col: string): string {
  return col.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export function detectColumnMappings(
  columns: string[],
  evidenceType: string
): {
  autoMapped: Record<string, string>;
  unmapped: string[];
  requiredFields: string[];
  optionalFields: string[];
} {
  const columnMappings = getColumnMappingsForType(evidenceType);
  const requiredFields = getRequiredFieldsForType(evidenceType);
  const optionalFields = getOptionalFieldsForType(evidenceType);
  
  const autoMapped: Record<string, string> = {};
  const mappedSourceColumns = new Set<string>();
  
  for (const [targetField, possibleNames] of Object.entries(columnMappings)) {
    for (const col of columns) {
      const normalizedCol = normalizeColumnName(col);
      if (possibleNames.includes(normalizedCol) && !mappedSourceColumns.has(col)) {
        autoMapped[col] = targetField;
        mappedSourceColumns.add(col);
        break;
      }
    }
  }
  
  const unmapped = columns.filter(col => !mappedSourceColumns.has(col));
  
  return { autoMapped, unmapped, requiredFields, optionalFields };
}

function getColumnMappingsForType(evidenceType: string): Record<string, string[]> {
  switch (evidenceType) {
    case "sales_volume":
      return {
        deviceCode: ["device_code", "devicecode", "sku", "part_number", "partnumber", "product_code", "item_code"],
        productName: ["product_name", "productname", "device_name", "item_name", "description"],
        quantity: ["quantity", "qty", "units", "units_sold", "count", "volume"],
        region: ["region", "territory", "area"],
        country: ["country", "country_code", "nation"],
        distributionChannel: ["channel", "distribution_channel", "sales_channel"],
        periodStart: ["period_start", "periodstart", "start_date", "from_date"],
        periodEnd: ["period_end", "periodend", "end_date", "to_date"],
        currency: ["currency", "currency_code"],
        revenue: ["revenue", "amount", "sales_amount", "total", "value"],
      };
    case "complaint_record":
      return {
        complaintId: ["complaint_id", "complaintid", "id", "case_id", "reference", "ticket_id"],
        deviceCode: ["device_code", "devicecode", "sku", "part_number", "product_code"],
        eventDate: ["event_date", "eventdate", "incident_date", "occurrence_date"],
        receivedDate: ["received_date", "receiveddate", "complaint_date", "date", "reported_date", "created_date"],
        country: ["country", "country_code", "region"],
        seriousness: ["seriousness", "severity", "priority", "risk_level", "criticality"],
        eventType: ["event_type", "eventtype", "type", "category", "complaint_type", "issue_type"],
        problemCode: ["problem_code", "problemcode", "imdrf_code", "event_code"],
        healthImpact: ["health_impact", "healthimpact", "patient_impact", "harm", "injury", "patient_injury"],
        investigationStatus: ["investigation_status", "investigationstatus", "status", "case_status"],
        description: ["description", "complaint_description", "details", "summary", "issue", "problem"],
      };
    default:
      return {};
  }
}

function getRequiredFieldsForType(evidenceType: string): string[] {
  switch (evidenceType) {
    case "sales_volume":
      return ["periodStart", "periodEnd", "region", "quantity"];
    case "complaint_record":
      return ["complaintId", "eventDate", "receivedDate", "country", "seriousness", "eventType", "problemCode", "healthImpact", "investigationStatus"];
    default:
      return [];
  }
}

function getOptionalFieldsForType(evidenceType: string): string[] {
  switch (evidenceType) {
    case "sales_volume":
      return ["deviceCode", "productName", "country", "distributionChannel", "currency", "revenue"];
    case "complaint_record":
      return ["deviceCode", "productName", "description"];
    default:
      return [];
  }
}

export function applyColumnMapping(
  rows: ParsedRow[],
  mapping: Record<string, string>
): ParsedRow[] {
  return rows.map(row => {
    const mappedRow: ParsedRow = {};
    for (const [sourceCol, targetField] of Object.entries(mapping)) {
      if (targetField && row[sourceCol] !== undefined) {
        mappedRow[targetField] = row[sourceCol];
      }
    }
    for (const [key, value] of Object.entries(row)) {
      if (!mapping[key]) {
        mappedRow[key] = value;
      }
    }
    return mappedRow;
  });
}
