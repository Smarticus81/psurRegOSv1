"""Template qualification logic."""

from ..core.types import (
    CompiledObligations,
    TemplateSchema,
    ObligationMapping,
    QualificationReport,
    QualificationStatus,
    QualificationIssue,
    SlotType,
    OutputType,
)


SLOT_OUTPUT_COMPATIBILITY = {
    SlotType.NARRATIVE: {OutputType.NARRATIVE},
    SlotType.TABLE: {OutputType.TABLE, OutputType.TABLE_REF},
    SlotType.KV: {OutputType.KV},
}


def qualify_template(
    compiled_obligations: CompiledObligations,
    template_schema: TemplateSchema,
    mapping: ObligationMapping,
) -> QualificationReport:
    """
    Qualify a template against compiled obligations.
    
    Checks:
    1. Every mandatory obligation is mapped to at least one slot
    2. Every mapped slot exists in the template
    3. Slot types are compatible with obligation allowed_output_types
    """
    issues: list[QualificationIssue] = []
    missing_mandatory: list[str] = []
    dangling_mappings: list[str] = []
    incompatible_types: list[QualificationIssue] = []
    
    obligation_lookup = {o.id: o for o in compiled_obligations.obligations}
    slot_lookup = {s.slot_id: s for s in template_schema.slots}
    mapped_obligations = {m.obligation_id for m in mapping.mappings}
    
    mandatory_obligations = compiled_obligations.get_mandatory()
    for obligation in mandatory_obligations:
        if obligation.id not in mapped_obligations:
            missing_mandatory.append(obligation.id)
            issues.append(QualificationIssue(
                issue_type="missing_mandatory",
                obligation_id=obligation.id,
                message=f"Mandatory obligation '{obligation.id}' is not mapped to any slot",
            ))
    
    for slot_mapping in mapping.mappings:
        for slot_id in slot_mapping.slot_ids:
            if slot_id not in slot_lookup:
                dangling_mappings.append(slot_id)
                issues.append(QualificationIssue(
                    issue_type="dangling_mapping",
                    obligation_id=slot_mapping.obligation_id,
                    slot_id=slot_id,
                    message=f"Slot '{slot_id}' referenced in mapping does not exist in template",
                ))
    
    for slot_mapping in mapping.mappings:
        obligation = obligation_lookup.get(slot_mapping.obligation_id)
        if obligation is None:
            continue
        
        if not obligation.allowed_output_types:
            continue
        
        for slot_id in slot_mapping.slot_ids:
            slot = slot_lookup.get(slot_id)
            if slot is None:
                continue
            
            compatible_outputs = SLOT_OUTPUT_COMPATIBILITY.get(slot.slot_type, set())
            has_compatible = any(
                out in compatible_outputs 
                for out in obligation.allowed_output_types
            )
            
            if not has_compatible:
                issue = QualificationIssue(
                    issue_type="incompatible_type",
                    obligation_id=obligation.id,
                    slot_id=slot_id,
                    message=f"Slot '{slot_id}' type '{slot.slot_type.value}' is not compatible with obligation allowed outputs: {[o.value for o in obligation.allowed_output_types]}",
                )
                incompatible_types.append(issue)
                issues.append(issue)
    
    status = QualificationStatus.FAIL if issues else QualificationStatus.PASS
    
    return QualificationReport(
        status=status,
        template_id=template_schema.template_id,
        missing_mandatory_obligations=missing_mandatory,
        dangling_mappings=dangling_mappings,
        incompatible_slot_types=incompatible_types,
        issues=issues,
    )
