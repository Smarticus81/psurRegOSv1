// UK MDR PSUR/PMSR Obligations and Constraints
// Based on SI 2024/1368 expectations

SOURCE "UK-SI-2024-1368" {
  jurisdiction: UK
  instrument: "Statutory Instrument"
  effective_date: 2024-06-01
  title: "UK Medical Devices Regulations 2024"
}

SOURCE "UK-MHRA-PMS-Guidance" {
  jurisdiction: UK
  instrument: "Guidance"
  effective_date: 2024-06-01
  title: "MHRA Post-Market Surveillance Guidance"
}

// Obligation: Device Lifetime and PMS Period
OBLIGATION "UK.PSUR.CONTENT.DEVICE_LIFETIME" {
  title: "Specify device lifetime and PMS period concept"
  jurisdiction: UK
  mandatory: true
  required_evidence_types: ["pmcf_summary"]
  allowed_transformations: ["summarize", "cite"]
  forbidden_transformations: ["invent"]
  required_time_scope: "device_lifetime"
  allowed_output_types: ["narrative", "kv"]
  sources: ["UK-SI-2024-1368"]
}

// Obligation: UK Statistical Methodology
OBLIGATION "UK.PSUR.CONTENT.STATISTICAL_METHODOLOGY" {
  title: "UK-specific statistical methodology for significant increases"
  jurisdiction: UK
  mandatory: true
  required_evidence_types: ["statistical_analysis", "trend_report"]
  allowed_transformations: ["summarize", "cite", "aggregate"]
  forbidden_transformations: ["invent", "extrapolate"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative", "table"]
  sources: ["UK-MHRA-PMS-Guidance"]
}

// Obligation: Patient/Public Engagement
OBLIGATION "UK.PSUR.CONTENT.PATIENT_ENGAGEMENT" {
  title: "UK patient/public engagement methodology"
  jurisdiction: UK
  mandatory: false
  required_evidence_types: ["pmcf_summary"]
  allowed_transformations: ["summarize", "cite"]
  forbidden_transformations: ["invent"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative"]
  sources: ["UK-MHRA-PMS-Guidance"]
  allow_absence_statement: true
}

// Obligation: MHRA 3 Working Days Availability
OBLIGATION "UK.PSUR.PROCESS.MHRA_AVAILABILITY" {
  title: "Process to provide PSUR to MHRA within 3 working days"
  jurisdiction: UK
  mandatory: true
  required_evidence_types: []
  allowed_transformations: ["summarize"]
  forbidden_transformations: ["invent"]
  required_time_scope: "current"
  allowed_output_types: ["narrative"]
  sources: ["UK-SI-2024-1368"]
}

// Obligation: UK Communications Processes
OBLIGATION "UK.PSUR.PROCESS.COMMUNICATIONS" {
  title: "UK communications with MHRA/UKRP/Approved Body processes"
  jurisdiction: UK
  mandatory: true
  required_evidence_types: []
  allowed_transformations: ["summarize", "cite"]
  forbidden_transformations: ["invent"]
  required_time_scope: "current"
  allowed_output_types: ["narrative"]
  sources: ["UK-SI-2024-1368"]
}

// Obligation: UK Sales and Distribution
OBLIGATION "UK.PSUR.CONTENT.SALES_VOLUME" {
  title: "Include UK sales and distribution data"
  jurisdiction: UK
  mandatory: true
  required_evidence_types: ["sales_volume"]
  allowed_transformations: ["aggregate", "tabulate"]
  forbidden_transformations: ["extrapolate", "invent"]
  required_time_scope: "psur_period"
  allowed_output_types: ["table", "kv"]
  sources: ["UK-SI-2024-1368"]
}

// Obligation: UK Incidents
OBLIGATION "UK.PSUR.CONTENT.INCIDENTS" {
  title: "Include UK incident reports"
  jurisdiction: UK
  mandatory: true
  required_evidence_types: ["serious_incident", "non_serious_incident"]
  allowed_transformations: ["summarize", "tabulate", "cite"]
  forbidden_transformations: ["invent", "infer"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative", "table"]
  sources: ["UK-SI-2024-1368"]
  allow_absence_statement: true
}

// Obligation: UK Benefit-Risk
OBLIGATION "UK.PSUR.CONTENT.BENEFIT_RISK" {
  title: "Include UK benefit-risk conclusions"
  jurisdiction: UK
  mandatory: true
  required_evidence_types: ["benefit_risk_analysis"]
  allowed_transformations: ["summarize", "cite"]
  forbidden_transformations: ["invent", "re_weight_risk"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative"]
  sources: ["UK-SI-2024-1368"]
}

// Constraint: UK Schedule Class IIa
CONSTRAINT "UK.PSUR.SCHEDULE.CLASS_IIA" {
  severity: BLOCK
  trigger: "on_schedule_check"
  if: "device_class == IIa AND interval > 730"
  then: "fail(Class IIa devices require PSUR every 2 years.)"
  sources: ["UK-SI-2024-1368"]
  jurisdiction: UK
}

// Constraint: UK Schedule Class IIb/III
CONSTRAINT "UK.PSUR.SCHEDULE.CLASS_IIB_III" {
  severity: BLOCK
  trigger: "on_schedule_check"
  if: "device_class in (IIb, III) AND interval > 365"
  then: "fail(Class IIb/III devices require annual PSUR.)"
  sources: ["UK-SI-2024-1368"]
  jurisdiction: UK
}

// Constraint: UK Time Contiguity
CONSTRAINT "UK.PSUR.SCHEDULE.CONTIGUITY" {
  severity: BLOCK
  trigger: "on_period_register"
  if: "gap_or_overlap_exists"
  then: "fail(PSUR periods must be contiguous with no gaps or overlaps.)"
  sources: ["UK-SI-2024-1368"]
  jurisdiction: UK
}

// Constraint: No Fabrication
CONSTRAINT "UK.PSUR.CONTENT.NO_FABRICATION" {
  severity: BLOCK
  trigger: "on_proposal_submit"
  if: "uses_transformation(invent)"
  then: "fail(Content fabrication is prohibited.)"
  sources: ["UK-SI-2024-1368"]
  jurisdiction: UK
}
