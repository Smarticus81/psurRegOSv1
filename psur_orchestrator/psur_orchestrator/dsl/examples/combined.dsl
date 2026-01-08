// Combined EU + UK PSUR Obligations and Constraints
// For devices marketed in both jurisdictions

IMPORT "eu_psur.dsl"
IMPORT "uk_psur.dsl"

// Additional combined obligations for multi-jurisdiction devices

SOURCE "COMBINED-GUIDANCE" {
  jurisdiction: EU
  instrument: "Internal"
  effective_date: 2024-01-01
  title: "Combined EU/UK PSUR Guidance"
}

// Obligation: Cross-Jurisdiction Comparison
OBLIGATION "COMBINED.PSUR.CONTENT.COMPARISON" {
  title: "Include cross-jurisdiction incident comparison"
  jurisdiction: EU
  mandatory: false
  required_evidence_types: ["serious_incident", "non_serious_incident"]
  allowed_transformations: ["summarize", "aggregate", "tabulate"]
  forbidden_transformations: ["invent"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative", "table"]
  sources: ["COMBINED-GUIDANCE"]
  allow_absence_statement: true
}

// Constraint: Consistent Benefit-Risk Across Jurisdictions
CONSTRAINT "COMBINED.PSUR.CONSISTENCY" {
  severity: WARN
  trigger: "on_finalize"
  if: "eu_benefit_risk != uk_benefit_risk"
  then: "warn(Benefit-risk conclusions differ between EU and UK sections.)"
  sources: ["COMBINED-GUIDANCE"]
}
