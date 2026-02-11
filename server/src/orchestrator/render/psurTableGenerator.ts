/**
 * PSUR Table Generator
 * Generates company-grade tables from evidence atoms
 */

export interface EvidenceAtomData {
  atomId: string;
  evidenceType: string;
  normalizedData: any;
  provenance?: any;
}

export interface TableResult {
  markdown: string;
  evidenceAtomIds: string[];
  dataSourceFooter: string;
}

// Helper to safely get a value from nested data
function getValue(data: any, ...keys: string[]): any {
  for (const key of keys) {
    const val = data?.[key];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALES & EXPOSURE TABLES
// ═══════════════════════════════════════════════════════════════════════════════

// Known valid geographic regions for filtering
const VALID_REGIONS = new Set([
  "US", "USA", "United States", "North America",
  "EU", "Europe", "European Union", "EU (excluding UK)", "EU (incl. UK)",
  "UK", "United Kingdom", "Great Britain", "GB",
  "Canada", "CA",
  "Australia", "AU", "APAC", "Asia Pacific",
  "Japan", "JP", "China", "CN", "India", "IN",
  "Germany", "DE", "France", "FR", "Italy", "IT", "Spain", "ES",
  "Netherlands", "NL", "Belgium", "BE", "Switzerland", "CH",
  "Brazil", "BR", "Mexico", "MX", "Latin America", "LATAM",
  "Rest of World", "ROW", "Other", "Global", "Worldwide", "Total",
]);

// Check if a value looks like a valid geographic region
function isValidRegion(value: string | null | undefined): boolean {
  if (!value || value === "[MISSING]") return false;
  
  // Check against known regions (case-insensitive)
  const normalizedValue = value.trim().toLowerCase();
  for (const region of Array.from(VALID_REGIONS)) {
    if (region.toLowerCase() === normalizedValue) return true;
  }
  
  // Filter out obvious garbage (signature lines, role titles, etc.)
  const garbagePatterns = [
    /^approved by/i,
    /^reviewed by/i,
    /^issued by/i,
    /director/i,
    /specialist/i,
    /writer/i,
    /expert/i,
    /clinical/i,
    /regulatory/i,
    /affairs/i,
    /manager/i,
    /^dr\./i,
    /^\d+$/,  // Pure numbers
    /^[A-Z]{2,},/,  // Multiple state codes like "CA, SC, WI"
    /title$/i,
  ];
  
  for (const pattern of garbagePatterns) {
    if (pattern.test(value)) return false;
  }
  
  // If it's short (< 50 chars) and doesn't look like garbage, accept it
  return value.length < 50;
}

export function generateSalesTable(atoms: EvidenceAtomData[]): TableResult {
  const salesAtoms = atoms.filter(a => 
    ["sales_summary", "sales_by_region", "sales_volume", "distribution_summary"].includes(a.evidenceType)
  );
  
  const atomIds = salesAtoms.map(a => a.atomId);
  
  if (salesAtoms.length === 0) {
    return {
      markdown: "| Region | Units Sold | Market Share | Period |\n|--------|------------|--------------|--------|\n| *No sales data available* | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No sales evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| Region | Units Sold | Market Share | Period |");
  rows.push("|--------|------------|--------------|--------|");
  
  let totalUnits = 0;
  const regionTotals = new Map<string, number>();
  const validAtomIds: string[] = [];
  
  // First pass: aggregate by valid regions only
  for (const atom of salesAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    const rawRegion = getValue(data, "region", "country", "market");
    const units = Number(getValue(data, "quantity", "units_sold", "count", "volume")) || 0;
    
    // Skip rows with invalid regions or zero units
    if (!isValidRegion(rawRegion)) continue;
    if (units === 0) continue;
    
    const region = rawRegion.trim();
    const existingUnits = regionTotals.get(region) || 0;
    regionTotals.set(region, existingUnits + units);
    totalUnits += units;
    validAtomIds.push(atom.atomId);
  }
  
  // If no valid data after filtering, show message
  if (regionTotals.size === 0) {
    // Fall back to just showing the total from all atoms
    let fallbackTotal = 0;
    for (const atom of salesAtoms) {
      const data = atom.normalizedData;
      if (!data) continue;
      const units = Number(getValue(data, "quantity", "units_sold", "count", "volume")) || 0;
      fallbackTotal += units;
    }
    
    if (fallbackTotal > 0) {
      rows.push(`| Global | ${fallbackTotal.toLocaleString()} | - | - |`);
      return {
        markdown: rows.join("\n"),
        evidenceAtomIds: atomIds,
        dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.slice(0, 3).map(id => id.slice(0, 12)).join(", ")}${atomIds.length > 3 ? ` +${atomIds.length - 3} more` : ""}] (regional breakdown unavailable)`
      };
    }
    
    return {
      markdown: "| Region | Units Sold | Market Share | Period |\n|--------|------------|--------------|--------|\n| *No valid sales data available* | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: Sales evidence uploaded but region data could not be parsed"
    };
  }
  
  // Second pass: render sorted rows
  const sortedRegions = Array.from(regionTotals.entries())
    .sort((a, b) => b[1] - a[1]); // Sort by units descending
  
  for (const [region, units] of sortedRegions) {
    const share = totalUnits > 0 ? `${((units / totalUnits) * 100).toFixed(1)}%` : "-";
    rows.push(`| ${region} | ${units.toLocaleString()} | ${share} | - |`);
  }
  
  rows.push(`| **Total** | **${totalUnits.toLocaleString()}** | **100%** | - |`);
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: validAtomIds.length > 0 ? validAtomIds : atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.slice(0, 3).map(id => id.slice(0, 12)).join(", ")}${atomIds.length > 3 ? ` +${atomIds.length - 3} more` : ""}]`
  };
}

export function generateExposureTable(atoms: EvidenceAtomData[]): TableResult {
  const exposureAtoms = atoms.filter(a => 
    ["usage_estimate", "uk_population_characteristics"].includes(a.evidenceType)
  );
  
  const atomIds = exposureAtoms.map(a => a.atomId);
  
  if (exposureAtoms.length === 0) {
    return {
      markdown: "| Metric | Value | Source |\n|--------|-------|--------|\n| *No exposure data available* | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No exposure evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| Metric | Value | Source |");
  rows.push("|--------|-------|--------|");
  
  for (const atom of exposureAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    const metric = getValue(data, "metric") || "[MISSING]";
    const value = getValue(data, "value", "estimate") || "[MISSING]";
    const source = getValue(data, "source") || atom.evidenceType.replace(/_/g, " ");
    
    rows.push(`| ${metric} | ${value} | ${source} |`);
  }
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLAINTS TABLES
// ═══════════════════════════════════════════════════════════════════════════════

export function generateComplaintsTable(atoms: EvidenceAtomData[]): TableResult {
  const complaintAtoms = atoms.filter(a => 
    ["complaint_record", "complaint_summary", "complaints_by_type"].includes(a.evidenceType)
  );
  
  const atomIds = complaintAtoms.map(a => a.atomId);
  const negativeAtom = complaintAtoms.find(a => a.normalizedData?.isNegativeEvidence);
  
  if (negativeAtom) {
    return {
      markdown: "| Complaint Type | Count | Rate per 1000 | Trend |\n|----------------|-------|---------------|-------|\n| **None Reported** | 0 | 0.00 | N/A |",
      evidenceAtomIds: [negativeAtom.atomId],
      dataSourceFooter: `Data Source: Negative Evidence [${negativeAtom.atomId.slice(0, 12)}] - Confirmed zero complaints for period`
    };
  }
  
  if (complaintAtoms.length === 0) {
    return {
      markdown: "| Complaint Type | Count | Rate per 1000 | Trend |\n|----------------|-------|---------------|-------|\n| *No complaint data available* | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No complaint evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| Complaint Type | Count | Rate per 1000 | Trend |");
  rows.push("|----------------|-------|---------------|-------|");
  
  // Aggregate by type
  const byType: Record<string, { count: number; rate: string; trend: string }> = {};
  let totalCount = 0;
  
  for (const atom of complaintAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    // Handle summary records
    if (atom.evidenceType === "complaint_summary" || atom.evidenceType === "complaints_by_type") {
      const type = getValue(data, "complaint_type", "type") || "[MISSING TYPE]";
      const count = Number(getValue(data, "count")) || 0;
      const rate = getValue(data, "rate_per_1000", "rate") || "[MISSING]";
      const trend = getValue(data, "trend", "trend_vs_previous") || "[MISSING]";
      
      if (!byType[type]) {
        byType[type] = { count: 0, rate: rate, trend: trend };
      }
      byType[type].count += count;
      totalCount += count;
    }
    // Handle individual complaint records
    else if (atom.evidenceType === "complaint_record") {
      const type = getValue(data, "complaint_type", "type", "category") || "[MISSING TYPE]";
      if (!byType[type]) {
        byType[type] = { count: 0, rate: "[MISSING]", trend: "[MISSING]" };
      }
      byType[type].count += 1;
      totalCount += 1;
    }
  }
  
  for (const [type, info] of Object.entries(byType)) {
    const rate = info.rate !== "-" ? info.rate : (info.count / 1000).toFixed(2);
    rows.push(`| ${type} | ${info.count} | ${rate} | ${info.trend} |`);
  }
  
  rows.push(`| **Total** | **${totalCount}** | - | - |`);
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.slice(0, 3).map(id => id.slice(0, 12)).join(", ")}${atomIds.length > 3 ? ` +${atomIds.length - 3} more` : ""}]`
  };
}

export function generateComplaintsByRegionTable(atoms: EvidenceAtomData[]): TableResult {
  const regionAtoms = atoms.filter(a => 
    a.evidenceType === "complaints_by_region" || 
    (a.evidenceType === "complaint_record" && a.normalizedData?.region)
  );
  
  const atomIds = regionAtoms.map(a => a.atomId);
  
  if (regionAtoms.length === 0) {
    return {
      markdown: "| Region | Total | Serious | Non-Serious |\n|--------|-------|---------|-------------|\n| *No regional complaint data available* | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No regional complaint evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| Region | Total | Serious | Non-Serious |");
  rows.push("|--------|-------|---------|-------------|");
  
  // Aggregate by region
  const byRegion: Record<string, { total: number; serious: number; nonSerious: number }> = {};
  
  for (const atom of regionAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    if (atom.evidenceType === "complaints_by_region") {
      const region = getValue(data, "region") || "[MISSING REGION]";
      const total = Number(getValue(data, "total", "count")) || 0;
      const serious = Number(getValue(data, "serious")) || 0;
      const nonSerious = Number(getValue(data, "non_serious", "nonSerious")) || (total - serious);
      
      if (!byRegion[region]) {
        byRegion[region] = { total: 0, serious: 0, nonSerious: 0 };
      }
      byRegion[region].total += total;
      byRegion[region].serious += serious;
      byRegion[region].nonSerious += nonSerious;
    } else if (atom.evidenceType === "complaint_record") {
      const region = getValue(data, "region", "country") || "[MISSING REGION]";
      const isSerious = getValue(data, "serious") === "TRUE" || getValue(data, "serious") === true;
      
      if (!byRegion[region]) {
        byRegion[region] = { total: 0, serious: 0, nonSerious: 0 };
      }
      byRegion[region].total += 1;
      if (isSerious) {
        byRegion[region].serious += 1;
      } else {
        byRegion[region].nonSerious += 1;
      }
    }
  }
  
  for (const [region, info] of Object.entries(byRegion)) {
    rows.push(`| ${region} | ${info.total} | ${info.serious} | ${info.nonSerious} |`);
  }
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERIOUS INCIDENTS TABLE (IMDRF)
// ═══════════════════════════════════════════════════════════════════════════════

export function generateSeriousIncidentsTable(atoms: EvidenceAtomData[]): TableResult {
  const incidentAtoms = atoms.filter(a => 
    ["serious_incident_record", "serious_incident_records_imdrf", "serious_incident_summary", "vigilance_report"].includes(a.evidenceType)
  );
  
  const atomIds = incidentAtoms.map(a => a.atomId);
  const negativeAtom = incidentAtoms.find(a => a.normalizedData?.isNegativeEvidence);
  
  if (negativeAtom) {
    return {
      markdown: "| IMDRF Code | Description | Count | Patient Outcome |\n|------------|-------------|-------|------------------|\n| **None Reported** | No serious incidents during period | 0 | N/A |",
      evidenceAtomIds: [negativeAtom.atomId],
      dataSourceFooter: `Data Source: Negative Evidence [${negativeAtom.atomId.slice(0, 12)}] - Confirmed zero serious incidents`
    };
  }
  
  if (incidentAtoms.length === 0) {
    return {
      markdown: "| IMDRF Code | Description | Count | Patient Outcome |\n|------------|-------------|-------|------------------|\n| *No incident data available* | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No incident evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| IMDRF Code | Description | Count | Patient Outcome |");
  rows.push("|------------|-------------|-------|------------------|");
  
  let totalIncidents = 0;
  
  for (const atom of incidentAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    const code = getValue(data, "imdrf_code", "code") || "[MISSING CODE]";
    const description = getValue(data, "description") || "[MISSING]";
    const count = Number(getValue(data, "count")) || 1;
    const outcome = getValue(data, "patient_outcome", "outcome") || "[MISSING]";
    
    rows.push(`| ${code} | ${String(description).substring(0, 50)} | ${count} | ${outcome} |`);
    totalIncidents += count;
  }
  
  if (totalIncidents > 0) {
    rows.push(`| **Total** | - | **${totalIncidents}** | - |`);
  }
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FSCA TABLE
// ═══════════════════════════════════════════════════════════════════════════════

export function generateFSCATable(atoms: EvidenceAtomData[]): TableResult {
  const fscaAtoms = atoms.filter(a => 
    ["fsca_record", "fsca_summary", "recall_record"].includes(a.evidenceType)
  );
  
  const atomIds = fscaAtoms.map(a => a.atomId);
  const negativeAtom = fscaAtoms.find(a => a.normalizedData?.isNegativeEvidence);
  
  if (negativeAtom) {
    return {
      markdown: "| FSCA ID | Action Type | Initiation Date | Status | Units Affected |\n|---------|-------------|-----------------|--------|----------------|\n| **None Reported** | No FSCAs during period | - | - | 0 |",
      evidenceAtomIds: [negativeAtom.atomId],
      dataSourceFooter: `Data Source: Negative Evidence [${negativeAtom.atomId.slice(0, 12)}] - Confirmed zero FSCAs`
    };
  }
  
  if (fscaAtoms.length === 0) {
    return {
      markdown: "| FSCA ID | Action Type | Initiation Date | Status | Units Affected |\n|---------|-------------|-----------------|--------|----------------|\n| *No FSCA data available* | - | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No FSCA evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| FSCA ID | Action Type | Initiation Date | Status | Units Affected |");
  rows.push("|---------|-------------|-----------------|--------|----------------|");
  
  let fscaNum = 1;
  for (const atom of fscaAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    // Skip summary aggregates
    if (atom.evidenceType === "fsca_summary" && data.total_fscas) {
      continue;
    }
    
    // Try multiple field variations for FSCA ID
    let id = getValue(data, "fsca_id", "fscaId", "FSCA_ID", "id", "recall_id", "reference");
    if (!id || id === "-") {
      id = `[MISSING ID #${fscaNum}]`;
    }
    fscaNum++;
    
    const type = getValue(data, "action_type", "type", "fsca_type", "recall_type") || "[MISSING TYPE]";
    const date = getValue(data, "initiation_date", "date", "start_date", "open_date") || "[MISSING]";
    const status = getValue(data, "status", "fsca_status") || "[MISSING]";
    const units = Number(getValue(data, "affected_units", "units", "quantity_affected")) || 0;
    
    rows.push(`| ${id} | ${type} | ${date} | ${status} | ${units.toLocaleString()} |`);
  }
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA TABLE
// ═══════════════════════════════════════════════════════════════════════════════

export function generateCAPATable(atoms: EvidenceAtomData[]): TableResult {
  const capaAtoms = atoms.filter(a => 
    ["capa_record", "capa_summary"].includes(a.evidenceType)
  );
  
  const atomIds = capaAtoms.map(a => a.atomId);
  const negativeAtom = capaAtoms.find(a => a.normalizedData?.isNegativeEvidence);
  
  if (negativeAtom) {
    return {
      markdown: "| CAPA ID | Description | Initiation Date | Status | Effectiveness |\n|---------|-------------|-----------------|--------|---------------|\n| **None Reported** | No CAPAs during period | - | - | - |",
      evidenceAtomIds: [negativeAtom.atomId],
      dataSourceFooter: `Data Source: Negative Evidence [${negativeAtom.atomId.slice(0, 12)}] - Confirmed zero CAPAs`
    };
  }
  
  if (capaAtoms.length === 0) {
    return {
      markdown: "| CAPA ID | Description | Initiation Date | Status | Effectiveness |\n|---------|-------------|-----------------|--------|---------------|\n| *No CAPA data available* | - | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No CAPA evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| CAPA ID | Description | Initiation Date | Status | Effectiveness |");
  rows.push("|---------|-------------|-----------------|--------|---------------|");
  
  let capaNum = 1;
  for (const atom of capaAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    // Skip summary aggregates, show individual records
    if (atom.evidenceType === "capa_summary" && data.total_capas) {
      continue; // Will show individual records instead
    }
    
    // Try multiple field variations for CAPA ID
    let id = getValue(data, "capa_id", "capaId", "CAPA_ID", "id", "record_id", "reference");
    if (!id || id === "-") {
      id = `[MISSING ID #${capaNum}]`;
    }
    capaNum++;
    
    const desc = String(getValue(data, "description", "title", "summary", "capa_description") || "[MISSING]").substring(0, 40);
    const date = getValue(data, "initiation_date", "date", "open_date", "start_date", "created_date") || "[MISSING]";
    const status = getValue(data, "status", "capa_status") || "[MISSING]";
    const effectiveness = getValue(data, "effectiveness", "effective", "effectiveness_check") || "[MISSING]";
    
    rows.push(`| ${id} | ${desc} | ${date} | ${status} | ${effectiveness} |`);
  }
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LITERATURE & EXTERNAL DB TABLES
// ═══════════════════════════════════════════════════════════════════════════════

export function generateLiteratureTable(atoms: EvidenceAtomData[]): TableResult {
  const litAtoms = atoms.filter(a => 
    ["literature_review_summary", "literature_search_strategy"].includes(a.evidenceType)
  );
  
  const atomIds = litAtoms.map(a => a.atomId);
  
  if (litAtoms.length === 0) {
    return {
      markdown: "| Database | Search Date | Results | Relevant | Conclusion |\n|----------|-------------|---------|----------|------------|\n| *No literature data available* | - | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No literature evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| Database | Search Date | Results | Relevant | Conclusion |");
  rows.push("|----------|-------------|---------|----------|------------|");
  
  for (const atom of litAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    const db = getValue(data, "database", "db_name") || "[MISSING DB]";
    const date = getValue(data, "search_date", "date") || "[MISSING]";
    const results = getValue(data, "results_count", "results", "results_retrieved") || "[MISSING]";
    const relevant = getValue(data, "relevant_count", "relevant") || "[MISSING]";
    const conclusion = String(getValue(data, "conclusion", "summary", "safety_signals") || "[MISSING]").substring(0, 40);
    
    rows.push(`| ${db} | ${date} | ${results} | ${relevant} | ${conclusion} |`);
  }
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}

export function generateExternalDBTable(atoms: EvidenceAtomData[]): TableResult {
  const dbAtoms = atoms.filter(a => 
    ["external_db_summary", "external_db_query_log"].includes(a.evidenceType)
  );
  
  const atomIds = dbAtoms.map(a => a.atomId);
  
  if (dbAtoms.length === 0) {
    return {
      markdown: "| Database | Query Date | Adverse Events | Recalls | Notes |\n|----------|------------|----------------|---------|-------|\n| *No external DB data available* | - | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No external DB evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| Database | Query Date | Adverse Events | Recalls | Notes |");
  rows.push("|----------|------------|----------------|---------|-------|");
  
  for (const atom of dbAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    const db = String(getValue(data, "database", "db_name") || "[MISSING DB]");
    const date = String(getValue(data, "query_date", "date") || "[MISSING]");
    const ae = getValue(data, "adverse_events_count", "adverse_events") ?? "[MISSING]";
    const recalls = getValue(data, "recalls_count", "recalls") ?? "[MISSING]";
    const notes = String(getValue(data, "notes", "summary") || "[MISSING]").substring(0, 40);
    
    rows.push(`| ${db} | ${date} | ${ae} | ${recalls} | ${notes} |`);
  }
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PMCF TABLE
// ═══════════════════════════════════════════════════════════════════════════════

export function generatePMCFTable(atoms: EvidenceAtomData[]): TableResult {
  const pmcfAtoms = atoms.filter(a => 
    ["pmcf_summary", "pmcf_activity_record", "pmcf_report_extract"].includes(a.evidenceType)
  );
  
  const atomIds = pmcfAtoms.map(a => a.atomId);
  
  if (pmcfAtoms.length === 0) {
    return {
      markdown: "| Activity Type | Status | Start Date | Enrolled | Key Findings |\n|---------------|--------|------------|----------|---------------|\n| *No PMCF data available* | - | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No PMCF evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| Activity Type | Status | Start Date | Enrolled | Key Findings |");
  rows.push("|---------------|--------|------------|----------|--------------|");
  
  for (const atom of pmcfAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    const type = getValue(data, "activity_type", "type") || "[MISSING TYPE]";
    const status = getValue(data, "status") || "[MISSING]";
    const start = getValue(data, "start_date", "date") || "[MISSING]";
    const enrolled = getValue(data, "enrolled_subjects") || "[MISSING]";
    const findings = String(getValue(data, "key_findings", "findings", "summary") || "[MISSING]").substring(0, 50);
    
    rows.push(`| ${type} | ${status} | ${start} | ${enrolled} | ${findings} |`);
  }
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TREND TABLE
// ═══════════════════════════════════════════════════════════════════════════════

export function generateTrendTable(atoms: EvidenceAtomData[]): TableResult {
  const trendAtoms = atoms.filter(a => 
    ["trend_analysis", "signal_log"].includes(a.evidenceType)
  );
  
  const atomIds = trendAtoms.map(a => a.atomId);
  
  if (trendAtoms.length === 0) {
    return {
      markdown: "| Metric | Previous Period | Current Period | Trend | Assessment |\n|--------|-----------------|----------------|-------|------------|\n| *No trend data available* | - | - | - | - |",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No trend evidence atoms uploaded"
    };
  }

  const rows: string[] = [];
  rows.push("| Metric | Previous Period | Current Period | Trend | Assessment |");
  rows.push("|--------|-----------------|----------------|-------|------------|");
  
  for (const atom of trendAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    const metric = getValue(data, "metric", "indicator") || "[MISSING METRIC]";
    const prev = getValue(data, "previous_value", "previous") || "[MISSING]";
    const curr = getValue(data, "current_value", "current") || "[MISSING]";
    const trend = getValue(data, "trend", "direction") || "[MISSING]";
    const assessment = String(getValue(data, "assessment", "conclusion") || "[MISSING]").substring(0, 40);
    
    rows.push(`| ${metric} | ${prev} | ${curr} | ${trend} | ${assessment} |`);
  }
  
  return {
    markdown: rows.join("\n"),
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BENEFIT-RISK ASSESSMENT
// ═══════════════════════════════════════════════════════════════════════════════

export function generateBenefitRiskNarrative(atoms: EvidenceAtomData[]): TableResult {
  const brAtoms = atoms.filter(a => 
    a.evidenceType === "benefit_risk_assessment"
  );
  
  const atomIds = brAtoms.map(a => a.atomId);
  
  if (brAtoms.length === 0) {
    return {
      markdown: "*No benefit-risk assessment data available.*",
      evidenceAtomIds: [],
      dataSourceFooter: "Data Source: No benefit-risk evidence atoms uploaded"
    };
  }

  const lines: string[] = [];
  
  for (const atom of brAtoms) {
    const data = atom.normalizedData;
    if (!data) continue;
    
    const summary = getValue(data, "summary") || "";
    const benefitsRaw = getValue(data, "benefits") || "";
    const risksRaw = getValue(data, "risks") || "";
    const conclusion = getValue(data, "conclusion", "assessment") || "";
    
    if (summary) {
      lines.push(summary);
      lines.push("");
    }
    
    // Parse benefits (may be semicolon-separated string or array)
    const benefits = typeof benefitsRaw === "string" 
      ? benefitsRaw.split(";").map(s => s.trim()).filter(Boolean)
      : (Array.isArray(benefitsRaw) ? benefitsRaw : []);
    
    if (benefits.length > 0) {
      lines.push("**Clinical Benefits:**");
      for (const b of benefits) {
        lines.push(`- ${b}`);
      }
      lines.push("");
    }
    
    // Parse risks
    const risks = typeof risksRaw === "string"
      ? risksRaw.split(";").map(s => s.trim()).filter(Boolean)
      : (Array.isArray(risksRaw) ? risksRaw : []);
    
    if (risks.length > 0) {
      lines.push("**Identified Risks:**");
      for (const r of risks) {
        lines.push(`- ${r}`);
      }
      lines.push("");
    }
    
    if (conclusion && conclusion !== summary) {
      lines.push(`**Overall Assessment:** ${conclusion}`);
    }
  }
  
  return {
    markdown: lines.join("\n") || "*Benefit-risk assessment pending.*",
    evidenceAtomIds: atomIds,
    dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.map(id => id.slice(0, 12)).join(", ")}]`
  };
}
