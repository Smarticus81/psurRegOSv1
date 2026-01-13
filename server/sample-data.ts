import { CANONICAL_EVIDENCE_TYPES } from "@shared/schema";

export interface SampleFile {
  filename: string;
  type: string;
  content: string;
}

function generateCSV(headers: string[], rows: Record<string, any>[]): string {
  const headerLine = headers.join(",");
  const dataLines = rows.map(row => 
    headers.map(h => {
      const val = row[h] ?? "";
      const strVal = String(val);
      return strVal.includes(",") || strVal.includes('"') || strVal.includes("\n") 
        ? `"${strVal.replace(/"/g, '""')}"` 
        : strVal;
    }).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

export function getAllSamples(): SampleFile[] {
  const samples: SampleFile[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // SALES DATA
  // ═══════════════════════════════════════════════════════════════════════════
  
  samples.push({
    filename: "sample_sales_volume.csv",
    type: "sales_volume",
    content: generateCSV(
      ["device_code", "product_name", "quantity", "region", "country", "sale_date", "period_start", "period_end"],
      [
        { device_code: "CM-PRO-001", product_name: "CardioMonitor Pro", quantity: 1250, region: "EU", country: "Germany", sale_date: "2024-03-15", period_start: "2024-01-01", period_end: "2024-12-31" },
        { device_code: "CM-PRO-001", product_name: "CardioMonitor Pro", quantity: 890, region: "EU", country: "France", sale_date: "2024-03-20", period_start: "2024-01-01", period_end: "2024-12-31" },
        { device_code: "CM-PRO-001", product_name: "CardioMonitor Pro", quantity: 2100, region: "Americas", country: "USA", sale_date: "2024-04-01", period_start: "2024-01-01", period_end: "2024-12-31" },
        { device_code: "CM-PRO-001", product_name: "CardioMonitor Pro", quantity: 560, region: "UK", country: "United Kingdom", sale_date: "2024-05-10", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_sales_summary.csv",
    type: "sales_summary",
    content: generateCSV(
      ["region", "quantity", "market_share", "period", "period_start", "period_end"],
      [
        { region: "European Union", quantity: 2140, market_share: "12.5%", period: "2024", period_start: "2024-01-01", period_end: "2024-12-31" },
        { region: "United Kingdom", quantity: 560, market_share: "8.2%", period: "2024", period_start: "2024-01-01", period_end: "2024-12-31" },
        { region: "Americas", quantity: 2100, market_share: "6.8%", period: "2024", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_distribution_summary.csv",
    type: "distribution_summary",
    content: generateCSV(
      ["region", "quantity", "distribution_channel", "period_start", "period_end"],
      [
        { region: "EU", quantity: 2140, distribution_channel: "Direct Sales + Distributors", period_start: "2024-01-01", period_end: "2024-12-31" },
        { region: "UK", quantity: 560, distribution_channel: "Authorized Distributor", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_usage_estimate.csv",
    type: "usage_estimate",
    content: generateCSV(
      ["metric", "value", "estimate", "source", "period_start", "period_end"],
      [
        { metric: "Estimated Patient Exposures", value: "15000", estimate: "15,000 patients", source: "Internal calculation based on sales", period_start: "2024-01-01", period_end: "2024-12-31" },
        { metric: "Average Usage per Device", value: "3.1", estimate: "3.1 patients/device/year", source: "Usage data from connected devices", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_sales_by_region.csv",
    type: "sales_by_region",
    content: generateCSV(
      ["region", "quantity", "units_sold", "market_share", "period", "period_start", "period_end"],
      [
        { region: "EU - Germany", quantity: 1250, units_sold: 1250, market_share: "15.2%", period: "2024", period_start: "2024-01-01", period_end: "2024-12-31" },
        { region: "EU - France", quantity: 890, units_sold: 890, market_share: "11.3%", period: "2024", period_start: "2024-01-01", period_end: "2024-12-31" },
        { region: "UK", quantity: 560, units_sold: 560, market_share: "8.2%", period: "2024", period_start: "2024-01-01", period_end: "2024-12-31" },
        { region: "Americas", quantity: 2100, units_sold: 2100, market_share: "6.8%", period: "2024", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_uk_population_characteristics.csv",
    type: "uk_population_characteristics",
    content: generateCSV(
      ["metric", "value", "source", "period_start", "period_end"],
      [
        { metric: "UK Patient Population", value: "1,680 patients", source: "NHS Registry Data", period_start: "2024-01-01", period_end: "2024-12-31" },
        { metric: "Average Patient Age", value: "62 years", source: "Clinical Follow-up Data", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLAINTS DATA
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_complaint_record.csv",
    type: "complaint_record",
    content: generateCSV(
      ["complaint_id", "device_code", "complaint_date", "description", "complaint_type", "type", "category", "severity", "device_related", "patient_injury", "investigation_status", "root_cause", "country", "region", "serious"],
      [
        { complaint_id: "CMP-2024-001", device_code: "CM-PRO-001", complaint_date: "2024-02-15", description: "Display intermittently shows incorrect heart rate reading", complaint_type: "Malfunction", type: "Malfunction", category: "malfunction", severity: "medium", device_related: "TRUE", patient_injury: "FALSE", investigation_status: "closed", root_cause: "Software calibration drift - corrected in v2.1 update", country: "Germany", region: "EU", serious: "FALSE" },
        { complaint_id: "CMP-2024-002", device_code: "CM-PRO-001", complaint_date: "2024-04-22", description: "Battery depletes faster than specified after 18 months use", complaint_type: "Performance", type: "Performance", category: "performance", severity: "low", device_related: "TRUE", patient_injury: "FALSE", investigation_status: "closed", root_cause: "Normal battery degradation within specifications", country: "France", region: "EU", serious: "FALSE" },
        { complaint_id: "CMP-2024-003", device_code: "CM-PRO-001", complaint_date: "2024-06-10", description: "Alarm sound volume inconsistent", complaint_type: "Use Error", type: "Use Error", category: "use_error", severity: "low", device_related: "FALSE", patient_injury: "FALSE", investigation_status: "closed", root_cause: "User had volume setting at minimum", country: "UK", region: "UK", serious: "FALSE" },
        { complaint_id: "CMP-2024-004", device_code: "CM-PRO-001", complaint_date: "2024-08-05", description: "Device did not power on after charging", complaint_type: "Malfunction", type: "Malfunction", category: "malfunction", severity: "medium", device_related: "TRUE", patient_injury: "FALSE", investigation_status: "closed", root_cause: "Charging contact corrosion - isolated manufacturing batch", country: "USA", region: "Americas", serious: "FALSE" },
      ]
    )
  });

  samples.push({
    filename: "sample_complaint_summary.csv",
    type: "complaint_summary",
    content: generateCSV(
      ["complaint_type", "type", "count", "rate_per_1000", "trend", "period_start", "period_end"],
      [
        { complaint_type: "Malfunction", type: "Malfunction", count: 2, rate_per_1000: "0.42", trend: "Stable", period_start: "2024-01-01", period_end: "2024-12-31" },
        { complaint_type: "Performance", type: "Performance", count: 1, rate_per_1000: "0.21", trend: "Decreasing", period_start: "2024-01-01", period_end: "2024-12-31" },
        { complaint_type: "Use Error", type: "Use Error", count: 1, rate_per_1000: "0.21", trend: "Stable", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_complaints_by_region.csv",
    type: "complaints_by_region",
    content: generateCSV(
      ["region", "total", "count", "serious", "non_serious", "period_start", "period_end"],
      [
        { region: "EU", total: 2, count: 2, serious: 0, non_serious: 2, period_start: "2024-01-01", period_end: "2024-12-31" },
        { region: "UK", total: 1, count: 1, serious: 0, non_serious: 1, period_start: "2024-01-01", period_end: "2024-12-31" },
        { region: "Americas", total: 1, count: 1, serious: 0, non_serious: 1, period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_complaints_by_type.csv",
    type: "complaints_by_type",
    content: generateCSV(
      ["complaint_type", "count", "percentage", "trend_vs_previous", "period_start", "period_end"],
      [
        { complaint_type: "Malfunction", count: 2, percentage: "50%", trend_vs_previous: "-15%", period_start: "2024-01-01", period_end: "2024-12-31" },
        { complaint_type: "Performance", count: 1, percentage: "25%", trend_vs_previous: "-20%", period_start: "2024-01-01", period_end: "2024-12-31" },
        { complaint_type: "Use Error", count: 1, percentage: "25%", trend_vs_previous: "0%", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_customer_feedback_summary.csv",
    type: "customer_feedback_summary",
    content: generateCSV(
      ["feedback_category", "count", "sentiment", "action_required", "period_start", "period_end"],
      [
        { feedback_category: "Product Quality", count: 12, sentiment: "Positive", action_required: "No", period_start: "2024-01-01", period_end: "2024-12-31" },
        { feedback_category: "Ease of Use", count: 8, sentiment: "Positive", action_required: "No", period_start: "2024-01-01", period_end: "2024-12-31" },
        { feedback_category: "Documentation", count: 3, sentiment: "Neutral", action_required: "Review IFU clarity", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIOUS INCIDENTS DATA
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_serious_incident_summary.csv",
    type: "serious_incident_summary",
    content: generateCSV(
      ["imdrf_code", "code", "description", "count", "patient_outcome", "outcome", "period_start", "period_end"],
      [
        { imdrf_code: "E0501", code: "E0501", description: "Alarm failure - delayed clinical response", count: 1, patient_outcome: "No permanent harm", outcome: "No permanent harm", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_serious_incident_records_imdrf.csv",
    type: "serious_incident_records_imdrf",
    content: generateCSV(
      ["incident_id", "imdrf_code", "code", "description", "incident_date", "count", "patient_outcome", "outcome", "reported_to", "device_code", "country"],
      [
        { incident_id: "SI-2024-001", imdrf_code: "E0501", code: "E0501", description: "Alarm system failed to activate during arrhythmia event", incident_date: "2024-04-15", count: 1, patient_outcome: "Temporary harm - patient recovered fully", outcome: "Temporary harm - patient recovered fully", reported_to: "BfArM", device_code: "CM-PRO-001", country: "Germany" },
      ]
    )
  });

  samples.push({
    filename: "sample_vigilance_report.csv",
    type: "vigilance_report",
    content: generateCSV(
      ["report_id", "incident_type", "imdrf_code", "description", "count", "patient_outcome", "report_date", "authority", "status"],
      [
        { report_id: "VIG-2024-001", incident_type: "Serious Incident", imdrf_code: "E0501", description: "Alarm failure reported to competent authority", count: 1, patient_outcome: "Temporary harm", report_date: "2024-04-20", authority: "BfArM", status: "Closed" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TREND & SIGNAL DATA
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_trend_analysis.csv",
    type: "trend_analysis",
    content: generateCSV(
      ["metric", "indicator", "previous_value", "previous", "current_value", "current", "trend", "direction", "assessment", "conclusion", "period_start", "period_end"],
      [
        { metric: "Complaint Rate", indicator: "Complaint Rate", previous_value: "1.2/1000", previous: "1.2/1000", current_value: "0.84/1000", current: "0.84/1000", trend: "Decreasing", direction: "Decreasing", assessment: "Favorable - 30% reduction in complaint rate", conclusion: "Favorable - 30% reduction in complaint rate", period_start: "2024-01-01", period_end: "2024-12-31" },
        { metric: "Serious Incident Rate", indicator: "Serious Incident Rate", previous_value: "0.21/1000", previous: "0.21/1000", current_value: "0.21/1000", current: "0.21/1000", trend: "Stable", direction: "Stable", assessment: "Acceptable - within expected range", conclusion: "Acceptable - within expected range", period_start: "2024-01-01", period_end: "2024-12-31" },
        { metric: "FSCA Rate", indicator: "FSCA Rate", previous_value: "0/1000", previous: "0/1000", current_value: "0.21/1000", current: "0.21/1000", trend: "Slight Increase", direction: "Slight Increase", assessment: "Within acceptable limits - single event", conclusion: "Within acceptable limits - single event", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  samples.push({
    filename: "sample_signal_log.csv",
    type: "signal_log",
    content: generateCSV(
      ["signal_id", "metric", "indicator", "detection_date", "description", "assessment", "conclusion", "action_taken", "status"],
      [
        { signal_id: "SIG-2024-001", metric: "Alarm Reliability", indicator: "Alarm Reliability", detection_date: "2024-05-01", description: "Potential signal: 2 alarm-related complaints in Q1", assessment: "Investigated - root cause identified as software issue", conclusion: "Investigated - root cause identified as software issue", action_taken: "Software update v2.1 deployed", status: "Closed" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FSCA DATA
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_fsca_record.csv",
    type: "fsca_record",
    content: generateCSV(
      ["fsca_id", "id", "device_code", "action_type", "type", "initiation_date", "date", "description", "status", "affected_units", "units"],
      [
        { fsca_id: "FSCA-2024-001", id: "FSCA-2024-001", device_code: "CM-PRO-001", action_type: "Software Update", type: "Software Update", initiation_date: "2024-05-15", date: "2024-05-15", description: "Mandatory software update to address alarm timing issue", status: "Completed", affected_units: 4800, units: 4800 },
      ]
    )
  });

  samples.push({
    filename: "sample_fsca_summary.csv",
    type: "fsca_summary",
    content: generateCSV(
      ["fsca_id", "id", "action_type", "type", "initiation_date", "date", "status", "affected_units", "units", "completion_rate", "period_start", "period_end"],
      [
        { fsca_id: "FSCA-2024-001", id: "FSCA-2024-001", action_type: "Software Update", type: "Software Update", initiation_date: "2024-05-15", date: "2024-05-15", status: "Completed", affected_units: 4800, units: 4800, completion_rate: "98%", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPA DATA
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_capa_record.csv",
    type: "capa_record",
    content: generateCSV(
      ["capa_id", "id", "description", "initiation_date", "date", "status", "effectiveness", "root_cause", "corrective_action"],
      [
        { capa_id: "CAPA-2024-001", id: "CAPA-2024-001", description: "Alarm timing algorithm improvement", initiation_date: "2024-04-25", date: "2024-04-25", status: "Completed", effectiveness: "Effective", root_cause: "Software timing drift under specific conditions", corrective_action: "Algorithm update in v2.1, enhanced testing protocol" },
        { capa_id: "CAPA-2024-002", id: "CAPA-2024-002", description: "Charging contact quality enhancement", initiation_date: "2024-08-15", date: "2024-08-15", status: "Completed", effectiveness: "Effective", root_cause: "Supplier material variance", corrective_action: "Updated supplier specifications, incoming inspection added" },
      ]
    )
  });

  samples.push({
    filename: "sample_capa_summary.csv",
    type: "capa_summary",
    content: generateCSV(
      ["total_capas", "completed", "open", "effectiveness_rate", "period_start", "period_end"],
      [
        { total_capas: 2, completed: 2, open: 0, effectiveness_rate: "100%", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LITERATURE & EXTERNAL DB DATA
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_literature_review_summary.csv",
    type: "literature_review_summary",
    content: generateCSV(
      ["database", "db_name", "search_date", "date", "results_count", "results", "relevant_count", "relevant", "safety_signals", "conclusion", "summary"],
      [
        { database: "PubMed", db_name: "PubMed", search_date: "2024-11-15", date: "2024-11-15", results_count: 47, results: 47, relevant_count: 12, relevant: 12, safety_signals: "None identified", conclusion: "No new safety concerns identified in published literature", summary: "No new safety concerns identified in published literature" },
        { database: "EMBASE", db_name: "EMBASE", search_date: "2024-11-15", date: "2024-11-15", results_count: 38, results: 38, relevant_count: 8, relevant: 8, safety_signals: "None identified", conclusion: "Literature consistent with known safety profile", summary: "Literature consistent with known safety profile" },
      ]
    )
  });

  samples.push({
    filename: "sample_literature_search_strategy.csv",
    type: "literature_search_strategy",
    content: generateCSV(
      ["database", "search_terms", "date_range", "filters_applied", "results_retrieved"],
      [
        { database: "PubMed/EMBASE", search_terms: "cardiac monitor AND (safety OR adverse)", date_range: "2024-01-01 to 2024-12-31", filters_applied: "English language, human studies", results_retrieved: 85 },
      ]
    )
  });

  samples.push({
    filename: "sample_external_db_summary.csv",
    type: "external_db_summary",
    content: generateCSV(
      ["database", "db_name", "query_date", "date", "adverse_events_count", "adverse_events", "recalls_count", "recalls", "notes", "summary"],
      [
        { database: "MAUDE", db_name: "MAUDE", query_date: "2024-11-20", date: "2024-11-20", adverse_events_count: 3, adverse_events: 3, recalls_count: 0, recalls: 0, notes: "3 events identified - all previously known and addressed", summary: "3 events identified - all previously known and addressed" },
        { database: "Eudamed", db_name: "Eudamed", query_date: "2024-11-20", date: "2024-11-20", adverse_events_count: 1, adverse_events: 1, recalls_count: 0, recalls: 0, notes: "1 event - correlates with our vigilance report", summary: "1 event - correlates with our vigilance report" },
      ]
    )
  });

  samples.push({
    filename: "sample_external_db_query_log.csv",
    type: "external_db_query_log",
    content: generateCSV(
      ["database", "db_name", "query_date", "date", "query_parameters", "adverse_events_count", "adverse_events", "recalls_count", "recalls", "reviewer"],
      [
        { database: "MAUDE", db_name: "MAUDE", query_date: "2024-11-20", date: "2024-11-20", query_parameters: "Device: cardiac monitor, Date: 2024", adverse_events_count: 3, adverse_events: 3, recalls_count: 0, recalls: 0, reviewer: "Regulatory Affairs Team" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PMCF DATA
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_pmcf_summary.csv",
    type: "pmcf_summary",
    content: generateCSV(
      ["activity_type", "type", "status", "start_date", "date", "end_date", "key_findings", "findings", "summary", "enrolled_subjects"],
      [
        { activity_type: "Clinical Registry", type: "Clinical Registry", status: "Ongoing", start_date: "2023-01-01", date: "2023-01-01", end_date: "", key_findings: "No new safety signals detected, device performance within specifications", findings: "No new safety signals detected, device performance within specifications", summary: "No new safety signals detected, device performance within specifications", enrolled_subjects: 450 },
      ]
    )
  });

  samples.push({
    filename: "sample_pmcf_activity_record.csv",
    type: "pmcf_activity_record",
    content: generateCSV(
      ["activity_id", "activity_type", "type", "status", "start_date", "date", "end_date", "enrolled_subjects", "key_findings", "findings"],
      [
        { activity_id: "PMCF-REG-001", activity_type: "Long-term Registry Study", type: "Long-term Registry Study", status: "Ongoing", start_date: "2023-01-01", date: "2023-01-01", end_date: "", enrolled_subjects: 450, key_findings: "12-month follow-up: 98.2% device reliability, 2 non-serious AEs", findings: "12-month follow-up: 98.2% device reliability, 2 non-serious AEs" },
        { activity_id: "PMCF-SURV-001", activity_type: "User Survey", type: "User Survey", status: "Completed", start_date: "2024-06-01", date: "2024-06-01", end_date: "2024-08-31", enrolled_subjects: 200, key_findings: "94% user satisfaction, suggestions for IFU improvement noted", findings: "94% user satisfaction, suggestions for IFU improvement noted" },
      ]
    )
  });

  samples.push({
    filename: "sample_pmcf_report_extract.csv",
    type: "pmcf_report_extract",
    content: generateCSV(
      ["section", "content", "key_findings", "findings", "summary", "extraction_date"],
      [
        { section: "Safety Conclusions", content: "PMCF data confirms the established safety profile. No new risks identified.", key_findings: "PMCF data confirms the established safety profile. No new risks identified.", findings: "PMCF data confirms the established safety profile. No new risks identified.", summary: "PMCF data confirms the established safety profile. No new risks identified.", extraction_date: "2024-12-01" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BENEFIT-RISK ASSESSMENT
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_benefit_risk_assessment.csv",
    type: "benefit_risk_assessment",
    content: generateCSV(
      ["summary", "benefits", "risks", "conclusion", "assessment", "period_start", "period_end"],
      [
        { summary: "The CardioMonitor Pro continues to demonstrate a favorable benefit-risk profile. Clinical benefits include continuous cardiac monitoring with 99.1% accuracy, early arrhythmia detection, and improved patient outcomes through timely intervention.", benefits: "Continuous monitoring;Early detection of cardiac events;99.1% accuracy;Non-invasive;Improved patient outcomes", risks: "1 serious incident (alarm failure) - addressed via FSCA;4 non-serious complaints - all resolved;No patient deaths or permanent harm", conclusion: "FAVORABLE - The benefits of cardiac monitoring and early intervention significantly outweigh the identified risks, which have been appropriately mitigated.", assessment: "FAVORABLE - The benefits of cardiac monitoring and early intervention significantly outweigh the identified risks, which have been appropriately mitigated.", period_start: "2024-01-01", period_end: "2024-12-31" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMINISTRATIVE & REGULATORY DATA
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_manufacturer_profile.csv",
    type: "manufacturer_profile",
    content: generateCSV(
      ["manufacturer_name", "address", "srn", "content", "contact", "role"],
      [
        { manufacturer_name: "CardioTech Medical Devices GmbH", address: "Medizinstrasse 42, 80331 Munich, Germany", srn: "DE-MF-000012345", content: "CardioTech Medical Devices GmbH, Medizinstrasse 42, 80331 Munich, Germany", contact: "regulatory@cardiotech.de", role: "Manufacturer" },
      ]
    )
  });

  samples.push({
    filename: "sample_device_registry_record.csv",
    type: "device_registry_record",
    content: generateCSV(
      ["device_name", "model", "udi_di", "risk_class", "content", "intended_purpose", "registration_status"],
      [
        { device_name: "CardioMonitor Pro", model: "CM-PRO-001", udi_di: "4260012345678901234", risk_class: "IIb", content: "CardioMonitor Pro (CM-PRO-001), Class IIb cardiac monitoring device", intended_purpose: "Continuous cardiac monitoring for detection and recording of arrhythmias", registration_status: "Active" },
      ]
    )
  });

  samples.push({
    filename: "sample_regulatory_certificate_record.csv",
    type: "regulatory_certificate_record",
    content: generateCSV(
      ["certificate_type", "certificate_number", "content", "notified_body", "issue_date", "expiry_date", "scope"],
      [
        { certificate_type: "EU MDR Certificate", certificate_number: "CE-1234-MDR-2023", content: "EU MDR Certificate CE-1234-MDR-2023 issued by TUV SUD", notified_body: "TUV SUD (0123)", issue_date: "2023-05-15", expiry_date: "2028-05-14", scope: "CardioMonitor Pro - cardiac monitoring system" },
        { certificate_type: "UK MDR Certificate", certificate_number: "UK-9876-2023", content: "UK MDR Certificate UK-9876-2023 issued by BSI", notified_body: "BSI (0086)", issue_date: "2023-06-01", expiry_date: "2028-05-31", scope: "CardioMonitor Pro - cardiac monitoring system" },
      ]
    )
  });

  samples.push({
    filename: "sample_previous_psur_actions.csv",
    type: "previous_psur_actions",
    content: generateCSV(
      ["action_id", "id", "description", "date", "status", "effectiveness", "psur_reference"],
      [
        { action_id: "PREV-001", id: "PREV-001", description: "IFU update to clarify alarm settings", date: "2023-08-15", status: "Completed", effectiveness: "Verified effective - no related complaints since update", psur_reference: "PSUR-2023-001" },
      ]
    )
  });

  samples.push({
    filename: "sample_notified_body_review_record.csv",
    type: "notified_body_review_record",
    content: generateCSV(
      ["review_date", "date", "reviewer", "content", "findings", "outcome", "next_review"],
      [
        { review_date: "2024-03-15", date: "2024-03-15", reviewer: "TUV SUD", content: "Annual surveillance audit - no major findings", findings: "No major findings. 2 minor observations addressed within 30 days.", outcome: "Certificate maintained", next_review: "2025-03-15" },
      ]
    )
  });

  samples.push({
    filename: "sample_psur_period_change_record.csv",
    type: "psur_period_change_record",
    content: generateCSV(
      ["change_type", "id", "description", "date", "status", "justification", "approved_by"],
      [
        { change_type: "No Change", id: "PER-2024", description: "PSUR reporting period maintained as annual", date: "2024-01-01", status: "Active", justification: "No change to PSUR periodicity required based on safety profile", approved_by: "Regulatory Affairs Director" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT EXTRACTS
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_ifu_extract.csv",
    type: "ifu_extract",
    content: generateCSV(
      ["section", "content", "version", "extraction_date"],
      [
        { section: "Intended Use", content: "The CardioMonitor Pro is intended for continuous non-invasive monitoring of cardiac rhythm in adult patients. The device detects and records arrhythmias and provides audible/visual alarms for clinical intervention.", version: "IFU v3.2", extraction_date: "2024-12-01" },
        { section: "Contraindications", content: "Not intended for use in patients with implanted pacemakers or ICDs without clinical supervision. Not suitable for diagnostic purposes without clinical confirmation.", version: "IFU v3.2", extraction_date: "2024-12-01" },
      ]
    )
  });

  samples.push({
    filename: "sample_device_lifetime_record.csv",
    type: "device_lifetime_record",
    content: generateCSV(
      ["metric", "content", "value", "basis", "review_date"],
      [
        { metric: "Device Lifetime", content: "Estimated device lifetime: 5 years from date of manufacture", value: "5 years", basis: "Based on accelerated aging studies and real-world data", review_date: "2024-06-01" },
      ]
    )
  });

  samples.push({
    filename: "sample_cer_extract.csv",
    type: "cer_extract",
    content: generateCSV(
      ["section", "content", "key_findings", "version", "extraction_date"],
      [
        { section: "Clinical Evidence Summary", content: "Clinical evidence demonstrates that the CardioMonitor Pro meets its intended performance claims with acceptable risk profile.", key_findings: "Sensitivity: 99.1%, Specificity: 98.5% for arrhythmia detection", version: "CER v2.0", extraction_date: "2024-12-01" },
      ]
    )
  });

  samples.push({
    filename: "sample_rmf_extract.csv",
    type: "rmf_extract",
    content: generateCSV(
      ["section", "content", "key_risks", "risk_control_measures", "residual_risk", "version"],
      [
        { section: "Risk Summary", content: "Key risks identified and controlled per ISO 14971:2019", key_risks: "Alarm failure, Battery failure, Measurement inaccuracy", risk_control_measures: "Redundant alarm systems, Battery monitoring, Auto-calibration", residual_risk: "Acceptable", version: "RMF v4.1" },
      ]
    )
  });

  samples.push({
    filename: "sample_previous_psur_extract.csv",
    type: "previous_psur_extract",
    content: generateCSV(
      ["psur_reference", "content", "period", "key_conclusions", "actions_taken"],
      [
        { psur_reference: "PSUR-2023-001", content: "Previous PSUR concluded with favorable benefit-risk assessment", period: "2023-01-01 to 2023-12-31", key_conclusions: "Benefit-risk remains favorable, no safety concerns requiring immediate action", actions_taken: "IFU update implemented, trending parameters enhanced" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MDCG-SPECIFIC EVIDENCE TYPES
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_clinical_evaluation_extract.csv",
    type: "clinical_evaluation_extract",
    content: generateCSV(
      ["section", "content", "key_findings", "version", "extraction_date"],
      [
        { section: "Clinical Evidence Summary", content: "Clinical evaluation confirms device safety and performance. Sufficient clinical evidence from literature, PMS data, and clinical investigations supports the intended purpose.", key_findings: "Device meets essential requirements, acceptable benefit-risk ratio", version: "CER v2.0", extraction_date: "2024-12-01" },
      ]
    )
  });

  samples.push({
    filename: "sample_pms_plan_extract.csv",
    type: "pms_plan_extract",
    content: generateCSV(
      ["section", "content", "summary", "version", "extraction_date"],
      [
        { section: "PMS Activities", content: "The PMS Plan defines systematic monitoring of device performance through complaint handling, vigilance reporting, literature review, PMCF activities, and customer feedback collection.", summary: "Comprehensive PMS system in place per EU MDR requirements", version: "PMS Plan v2.1", extraction_date: "2024-12-01" },
      ]
    )
  });

  samples.push({
    filename: "sample_change_control_record.csv",
    type: "change_control_record",
    content: generateCSV(
      ["change_id", "id", "description", "date", "status", "type", "impact_assessment"],
      [
        { change_id: "CHG-2024-001", id: "CHG-2024-001", description: "Software update v2.1 - alarm timing improvement", date: "2024-05-15", status: "Implemented", type: "Design Change", impact_assessment: "Safety improvement, no new risks introduced" },
        { change_id: "CHG-2024-002", id: "CHG-2024-002", description: "Labeling update - clarified alarm settings", date: "2024-06-15", status: "Implemented", type: "Labeling Change", impact_assessment: "Usability improvement" },
      ]
    )
  });

  samples.push({
    filename: "sample_pms_activity_log.csv",
    type: "pms_activity_log",
    content: generateCSV(
      ["activity_id", "id", "activity_type", "description", "date", "status", "outcome"],
      [
        { activity_id: "PMS-2024-001", id: "PMS-2024-001", activity_type: "Complaint Review", description: "Q1 complaint trending and analysis", date: "2024-04-15", status: "Completed", outcome: "No concerning trends identified" },
        { activity_id: "PMS-2024-002", id: "PMS-2024-002", activity_type: "Literature Search", description: "Quarterly literature search", date: "2024-06-30", status: "Completed", outcome: "No new safety signals from literature" },
        { activity_id: "PMS-2024-003", id: "PMS-2024-003", activity_type: "External DB Query", description: "MAUDE/Eudamed database search", date: "2024-11-20", status: "Completed", outcome: "4 events identified, all previously known" },
      ]
    )
  });

  samples.push({
    filename: "sample_data_source_register.csv",
    type: "data_source_register",
    content: generateCSV(
      ["source_id", "id", "source_name", "description", "data_type", "frequency", "responsible_party"],
      [
        { source_id: "DS-001", id: "DS-001", source_name: "Complaint Database", description: "Internal complaint management system", data_type: "Complaints, Feedback", frequency: "Continuous", responsible_party: "Quality Assurance" },
        { source_id: "DS-002", id: "DS-002", source_name: "MAUDE", description: "FDA Medical Device Adverse Event Database", data_type: "Adverse Events", frequency: "Quarterly", responsible_party: "Regulatory Affairs" },
        { source_id: "DS-003", id: "DS-003", source_name: "Eudamed", description: "EU Medical Device Database", data_type: "Vigilance Reports", frequency: "Quarterly", responsible_party: "Regulatory Affairs" },
        { source_id: "DS-004", id: "DS-004", source_name: "PubMed/EMBASE", description: "Scientific literature databases", data_type: "Publications", frequency: "Quarterly", responsible_party: "Clinical Affairs" },
      ]
    )
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHANGE LOGS
  // ═══════════════════════════════════════════════════════════════════════════

  samples.push({
    filename: "sample_recall_record.csv",
    type: "recall_record",
    content: generateCSV(
      ["id", "description", "date", "status", "reason", "units_affected", "corrective_action"],
      [
        { id: "No Recalls", description: "No recalls during reporting period", date: "2024-12-31", status: "N/A", reason: "N/A", units_affected: 0, corrective_action: "N/A" },
      ]
    )
  });

  samples.push({
    filename: "sample_ncr_record.csv",
    type: "ncr_record",
    content: generateCSV(
      ["ncr_id", "id", "description", "date", "status", "root_cause", "corrective_action"],
      [
        { ncr_id: "NCR-2024-001", id: "NCR-2024-001", description: "Minor labeling discrepancy identified during audit", date: "2024-03-20", status: "Closed", root_cause: "Template version control error", corrective_action: "Updated document control procedure" },
      ]
    )
  });

  samples.push({
    filename: "sample_labeling_change_log.csv",
    type: "labeling_change_log",
    content: generateCSV(
      ["change_id", "id", "description", "date", "status", "affected_documents", "reason"],
      [
        { change_id: "LAB-2024-001", id: "LAB-2024-001", description: "IFU updated to v3.2 - alarm setting clarification", date: "2024-06-15", status: "Implemented", affected_documents: "IFU, Quick Start Guide", reason: "Customer feedback and FSCA requirements" },
      ]
    )
  });

  samples.push({
    filename: "sample_rmf_change_log.csv",
    type: "rmf_change_log",
    content: generateCSV(
      ["change_id", "id", "description", "date", "status", "affected_sections", "risk_impact"],
      [
        { change_id: "RMF-2024-001", id: "RMF-2024-001", description: "Updated alarm failure risk assessment post-FSCA", date: "2024-07-01", status: "Implemented", affected_sections: "4.2 - Alarm Hazards", risk_impact: "Residual risk reduced from Tolerable to Broadly Acceptable" },
      ]
    )
  });

  samples.push({
    filename: "sample_cer_change_log.csv",
    type: "cer_change_log",
    content: generateCSV(
      ["change_id", "id", "description", "date", "status", "trigger", "version_change"],
      [
        { change_id: "CER-2024-001", id: "CER-2024-001", description: "Annual CER update with 2024 PMS data", date: "2024-11-15", status: "Completed", trigger: "Annual review", version_change: "v1.9 to v2.0" },
      ]
    )
  });

  return samples;
}

export function getSamplesForTemplate(templateId: string): SampleFile[] {
  // For now, return all samples - in future could filter by template requirements
  return getAllSamples();
}
