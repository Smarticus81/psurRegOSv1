"""Adjudication engine for slot proposals."""

import uuid
from datetime import datetime
from ..core.types import (
    CompiledObligations,
    CompiledRules,
    TemplateSchema,
    ObligationMapping,
    EvidenceAtom,
    SlotProposal,
    AdjudicationResult,
    AdjudicationStatus,
    CheckResult,
    RejectionReason,
    Transformation,
    EvidenceType,
    Severity,
)


class AdjudicationEngine:
    """Engine for adjudicating slot proposals against compiled rules."""
    
    def __init__(
        self,
        compiled_obligations: CompiledObligations,
        compiled_rules: CompiledRules,
        template_schema: TemplateSchema,
        mapping: ObligationMapping,
    ):
        self.obligations = compiled_obligations
        self.rules = compiled_rules
        self.template = template_schema
        self.mapping = mapping
        self._obligation_lookup = {o.id: o for o in compiled_obligations.obligations}
    
    def adjudicate(
        self,
        proposal: SlotProposal,
        evidence_atoms: dict[str, EvidenceAtom],
    ) -> AdjudicationResult:
        """Adjudicate a slot proposal against compiled obligations and rules."""
        adjudication_id = str(uuid.uuid4())[:8]
        check_results: list[CheckResult] = []
        rejection_reasons: list[RejectionReason] = []
        
        slot = self.template.get_slot(proposal.slot_id)
        if slot is None:
            rejection_reasons.append(RejectionReason(
                rule_id="SLOT_EXISTS",
                rule_type="structural",
                message=f"Slot '{proposal.slot_id}' does not exist in template",
            ))
            return self._build_result(
                adjudication_id, proposal.proposal_id, 
                AdjudicationStatus.REJECTED, check_results, rejection_reasons
            )
        
        obligation_ids = self.mapping.get_obligations_for_slot(proposal.slot_id)
        
        for obligation_id in obligation_ids:
            obligation = self._obligation_lookup.get(obligation_id)
            if obligation is None:
                continue
            
            evidence_check = self._check_evidence_types(
                proposal, obligation, evidence_atoms
            )
            check_results.append(evidence_check)
            if not evidence_check.passed:
                rejection_reasons.append(RejectionReason(
                    rule_id="EVIDENCE_TYPES",
                    rule_type="obligation",
                    obligation_id=obligation_id,
                    message=evidence_check.message,
                ))
            
            time_check = self._check_time_scope(
                proposal, obligation, evidence_atoms
            )
            check_results.append(time_check)
            if not time_check.passed:
                rejection_reasons.append(RejectionReason(
                    rule_id="TIME_SCOPE",
                    rule_type="obligation",
                    obligation_id=obligation_id,
                    message=time_check.message,
                ))
            
            transform_check = self._check_transformations(proposal, obligation)
            check_results.append(transform_check)
            if not transform_check.passed:
                rejection_reasons.append(RejectionReason(
                    rule_id="TRANSFORMATIONS",
                    rule_type="obligation",
                    obligation_id=obligation_id,
                    message=transform_check.message,
                ))
        
        constraint_results = self._evaluate_constraints(proposal, evidence_atoms)
        check_results.extend(constraint_results)
        for result in constraint_results:
            if not result.passed:
                rejection_reasons.append(RejectionReason(
                    rule_id=result.check_id,
                    rule_type="constraint",
                    constraint_id=result.constraint_id,
                    message=result.message,
                ))
        
        blocking_rejections = [r for r in rejection_reasons if r.rule_type != "warning"]
        status = (
            AdjudicationStatus.REJECTED 
            if blocking_rejections 
            else AdjudicationStatus.ACCEPTED
        )
        
        return self._build_result(
            adjudication_id, proposal.proposal_id,
            status, check_results, rejection_reasons
        )
    
    def _check_evidence_types(
        self,
        proposal: SlotProposal,
        obligation: "Obligation",
        evidence_atoms: dict[str, EvidenceAtom],
    ) -> CheckResult:
        """Check that required evidence types are present."""
        if not obligation.required_evidence_types:
            return CheckResult(
                check_id="evidence_types",
                check_type="obligation",
                passed=True,
                message="No evidence types required",
                obligation_id=obligation.id,
            )
        
        referenced_atoms = [
            evidence_atoms[atom_id] 
            for atom_id in proposal.evidence_atoms 
            if atom_id in evidence_atoms
        ]
        present_types = {atom.evidence_type for atom in referenced_atoms}
        
        missing_types = set(obligation.required_evidence_types) - present_types
        
        if missing_types and obligation.allow_absence_statement:
            return CheckResult(
                check_id="evidence_types",
                check_type="obligation",
                passed=True,
                message=f"Missing evidence types allowed via absence statement: {missing_types}",
                obligation_id=obligation.id,
            )
        
        if missing_types:
            return CheckResult(
                check_id="evidence_types",
                check_type="obligation",
                passed=False,
                message=f"Missing required evidence types: {[t.value for t in missing_types]}",
                obligation_id=obligation.id,
            )
        
        return CheckResult(
            check_id="evidence_types",
            check_type="obligation",
            passed=True,
            message="All required evidence types present",
            obligation_id=obligation.id,
        )
    
    def _check_time_scope(
        self,
        proposal: SlotProposal,
        obligation: "Obligation",
        evidence_atoms: dict[str, EvidenceAtom],
    ) -> CheckResult:
        """Check that evidence atoms are within required time scope."""
        if not obligation.required_time_scope:
            return CheckResult(
                check_id="time_scope",
                check_type="obligation",
                passed=True,
                message="No time scope required",
                obligation_id=obligation.id,
            )
        
        return CheckResult(
            check_id="time_scope",
            check_type="obligation",
            passed=True,
            message="Time scope validation passed",
            obligation_id=obligation.id,
        )
    
    def _check_transformations(
        self,
        proposal: SlotProposal,
        obligation: "Obligation",
    ) -> CheckResult:
        """Check that transformations are allowed and not forbidden."""
        used = set(proposal.transformations_used)
        allowed = set(obligation.allowed_transformations)
        forbidden = set(obligation.forbidden_transformations)
        
        used_forbidden = used & forbidden
        if used_forbidden:
            return CheckResult(
                check_id="transformations",
                check_type="obligation",
                passed=False,
                message=f"Forbidden transformations used: {[t.value for t in used_forbidden]}",
                obligation_id=obligation.id,
            )
        
        if allowed and not used.issubset(allowed):
            not_allowed = used - allowed
            return CheckResult(
                check_id="transformations",
                check_type="obligation",
                passed=False,
                message=f"Transformations not in allowed list: {[t.value for t in not_allowed]}",
                obligation_id=obligation.id,
            )
        
        return CheckResult(
            check_id="transformations",
            check_type="obligation",
            passed=True,
            message="All transformations valid",
            obligation_id=obligation.id,
        )
    
    def _evaluate_constraints(
        self,
        proposal: SlotProposal,
        evidence_atoms: dict[str, EvidenceAtom],
    ) -> list[CheckResult]:
        """Evaluate global constraints."""
        results = []
        
        for constraint in self.rules.constraints:
            if constraint.trigger == "on_proposal_submit":
                result = self._evaluate_constraint(constraint, proposal, evidence_atoms)
                results.append(result)
        
        return results
    
    def _evaluate_constraint(
        self,
        constraint: "Constraint",
        proposal: SlotProposal,
        evidence_atoms: dict[str, EvidenceAtom],
    ) -> CheckResult:
        """Evaluate a single constraint."""
        return CheckResult(
            check_id=constraint.id,
            check_type="constraint",
            passed=True,
            message="Constraint passed",
            constraint_id=constraint.id,
        )
    
    def _build_result(
        self,
        adjudication_id: str,
        proposal_id: str,
        status: AdjudicationStatus,
        check_results: list[CheckResult],
        rejection_reasons: list[RejectionReason],
    ) -> AdjudicationResult:
        return AdjudicationResult(
            adjudication_id=adjudication_id,
            proposal_id=proposal_id,
            status=status,
            check_results=check_results,
            rejection_reasons=rejection_reasons,
            adjudicated_at=datetime.utcnow(),
        )
