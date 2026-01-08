// EU MDR PSUR Obligations and Constraints
// Based on MDCG 2022-21 guidance

SOURCE "MDCG-2022-21§2.2.1" {
  jurisdiction: EU
  instrument: "Guidance"
  effective_date: 2022-12-01
  title: "MDCG 2022-21 PSUR Content Requirements"
}

SOURCE "MDCG-2022-21§2.2.2" {
  jurisdiction: EU
  instrument: "Guidance"
  effective_date: 2022-12-01
  title: "MDCG 2022-21 PMCF Requirements"
}

SOURCE "MDCG-2022-21§4.1" {
  jurisdiction: EU
  instrument: "Guidance"
  effective_date: 2022-12-01
  title: "MDCG 2022-21 Grouping Requirements"
}

SOURCE "EU-MDR-Art86" {
  jurisdiction: EU
  instrument: "Regulation"
  effective_date: 2021-05-26
  title: "EU MDR Article 86 - PSUR Requirements"
}

// Obligation: Benefit-Risk Conclusions
OBLIGATION "EU.PSUR.CONTENT.BENEFIT_RISK" {
  title: "Include benefit-risk conclusions"
  jurisdiction: EU
  mandatory: true
  required_evidence_types: ["benefit_risk_analysis", "serious_incident", "complaint_record"]
  allowed_transformations: ["summarize", "cite", "aggregate"]
  forbidden_transformations: ["invent", "re_weight_risk", "extrapolate"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative"]
  sources: ["EU-MDR-Art86", "MDCG-2022-21§2.2.1"]
}

// Obligation: Main PMCF Findings
OBLIGATION "EU.PSUR.CONTENT.PMCF_MAIN_FINDINGS" {
  title: "Include main findings of PMCF"
  jurisdiction: EU
  mandatory: true
  required_evidence_types: ["pmcf_summary"]
  allowed_transformations: ["summarize", "cite", "cross_reference"]
  forbidden_transformations: ["infer", "invent", "re_weight_risk", "extrapolate"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative", "table_ref"]
  sources: ["MDCG-2022-21§2.2.2"]
}

// Obligation: Sales Volume
OBLIGATION "EU.PSUR.CONTENT.SALES_VOLUME" {
  title: "Include sales volume data"
  jurisdiction: EU
  mandatory: true
  required_evidence_types: ["sales_volume"]
  allowed_transformations: ["aggregate", "tabulate"]
  forbidden_transformations: ["extrapolate", "invent"]
  required_time_scope: "psur_period"
  allowed_output_types: ["table", "kv"]
  sources: ["MDCG-2022-21§2.2.1"]
}

// Obligation: Population Estimate
OBLIGATION "EU.PSUR.CONTENT.POPULATION_ESTIMATE" {
  title: "Include population estimate and usage frequency"
  jurisdiction: EU
  mandatory: false
  required_evidence_types: ["population_estimate", "sales_volume"]
  allowed_transformations: ["summarize", "aggregate", "cite"]
  forbidden_transformations: ["invent"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative", "kv"]
  sources: ["MDCG-2022-21§2.2.1"]
  allow_absence_statement: true
}

// Obligation: Serious Incidents and FSCAs
OBLIGATION "EU.PSUR.CONTENT.SERIOUS_INCIDENTS" {
  title: "Include serious incidents and FSCAs"
  jurisdiction: EU
  mandatory: true
  required_evidence_types: ["serious_incident", "fsca"]
  allowed_transformations: ["summarize", "tabulate", "cite"]
  forbidden_transformations: ["invent", "infer"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative", "table"]
  sources: ["EU-MDR-Art86", "MDCG-2022-21§2.2.1"]
  allow_absence_statement: true
}

// Obligation: Non-Serious Incidents
OBLIGATION "EU.PSUR.CONTENT.NON_SERIOUS_INCIDENTS" {
  title: "Include non-serious incidents and undesirable side effects"
  jurisdiction: EU
  mandatory: true
  required_evidence_types: ["non_serious_incident", "complaint_record"]
  allowed_transformations: ["summarize", "aggregate", "tabulate"]
  forbidden_transformations: ["invent", "infer"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative", "table"]
  sources: ["MDCG-2022-21§2.2.1"]
  allow_absence_statement: true
}

// Obligation: Trend Reporting
OBLIGATION "EU.PSUR.CONTENT.TREND_REPORT" {
  title: "Include trend reporting information"
  jurisdiction: EU
  mandatory: true
  required_evidence_types: ["trend_report", "complaint_record"]
  allowed_transformations: ["summarize", "aggregate", "cite"]
  forbidden_transformations: ["invent", "extrapolate"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative", "table"]
  sources: ["MDCG-2022-21§2.2.1"]
}

// Obligation: Literature Review
OBLIGATION "EU.PSUR.CONTENT.LITERATURE_REVIEW" {
  title: "Include literature review and database scan results"
  jurisdiction: EU
  mandatory: true
  required_evidence_types: ["literature_review", "external_database_scan"]
  allowed_transformations: ["summarize", "cite", "cross_reference"]
  forbidden_transformations: ["invent"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative"]
  sources: ["MDCG-2022-21§2.2.1"]
}

// Constraint: Leading Device Fixed
CONSTRAINT "EU.PSUR.GROUPING.LEADING_DEVICE_FIXED" {
  severity: BLOCK
  trigger: "on_group_update"
  if: "changed(leading_device)"
  then: "fail(Leading device cannot change. Issue a new PSUR.)"
  sources: ["MDCG-2022-21§4.1"]
  jurisdiction: EU
}

// Constraint: Same Notified Body
CONSTRAINT "EU.PSUR.GROUPING.SAME_NOTIFIED_BODY" {
  severity: BLOCK
  trigger: "on_group_update"
  if: "different(notified_body)"
  then: "fail(Grouped devices must have the same notified body.)"
  sources: ["MDCG-2022-21§4.1"]
  jurisdiction: EU
}

// Constraint: No Fabrication
CONSTRAINT "EU.PSUR.CONTENT.NO_FABRICATION" {
  severity: BLOCK
  trigger: "on_proposal_submit"
  if: "uses_transformation(invent)"
  then: "fail(Content fabrication is prohibited.)"
  sources: ["MDCG-2022-21§2.2.1"]
  jurisdiction: EU
}

// Constraint: Time Contiguity
CONSTRAINT "EU.PSUR.SCHEDULE.CONTIGUITY" {
  severity: BLOCK
  trigger: "on_period_register"
  if: "gap_or_overlap_exists"
  then: "fail(PSUR periods must be contiguous with no gaps or overlaps.)"
  sources: ["EU-MDR-Art86"]
  jurisdiction: EU
}
