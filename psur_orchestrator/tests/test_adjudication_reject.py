"""Tests for proposal rejection scenarios."""

import pytest
from datetime import date
from psur_orchestrator.core.types import (
    CompiledObligations,
    CompiledRules,
    Obligation,
    TemplateSchema,
    Slot,
    ObligationMapping,
    SlotMapping,
    SlotProposal,
    EvidenceAtom,
    SlotType,
    OutputType,
    EvidenceType,
    Transformation,
    Jurisdiction,
    AdjudicationStatus,
)
from psur_orchestrator.core.adjudication import AdjudicationEngine


@pytest.fixture
def compiled_obligations():
    return CompiledObligations(
        obligations=[
            Obligation(
                id="TEST.OBLIGATION",
                title="Test Obligation",
                jurisdiction=Jurisdiction.EU,
                mandatory=True,
                required_evidence_types=[EvidenceType.SALES_VOLUME, EvidenceType.COMPLAINT_RECORD],
                allowed_transformations=[Transformation.SUMMARIZE],
                forbidden_transformations=[Transformation.INVENT, Transformation.EXTRAPOLATE],
                allowed_output_types=[OutputType.NARRATIVE],
            ),
        ]
    )


@pytest.fixture
def compiled_rules():
    return CompiledRules(constraints=[])


@pytest.fixture
def template():
    return TemplateSchema(
        template_id="test_template",
        name="Test Template",
        slots=[
            Slot(slot_id="test_slot", path="Test Section", slot_type=SlotType.NARRATIVE),
        ],
    )


@pytest.fixture
def mapping():
    return ObligationMapping(
        mapping_id="test_mapping",
        template_id="test_template",
        mappings=[
            SlotMapping(obligation_id="TEST.OBLIGATION", slot_ids=["test_slot"]),
        ],
    )


@pytest.fixture
def partial_evidence():
    return {
        "sales_atom": EvidenceAtom(
            atom_id="sales_atom",
            evidence_type=EvidenceType.SALES_VOLUME,
            content={"total": 1000},
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        ),
    }


def test_rejects_when_forbidden_transformation_used(compiled_obligations, compiled_rules, template, mapping, partial_evidence):
    """Test rejection when a forbidden transformation is used."""
    engine = AdjudicationEngine(compiled_obligations, compiled_rules, template, mapping)
    
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={"text": "Based on extrapolation..."},
        evidence_atoms=["sales_atom"],
        claimed_basis=["TEST.OBLIGATION"],
        transformations_used=[Transformation.EXTRAPOLATE],
    )
    
    result = engine.adjudicate(proposal, partial_evidence)
    
    assert result.status == AdjudicationStatus.REJECTED
    assert any("EXTRAPOLATE" in r.message.upper() for r in result.rejection_reasons)


def test_rejects_when_evidence_types_missing(compiled_obligations, compiled_rules, template, mapping, partial_evidence):
    """Test rejection when required evidence types are missing."""
    engine = AdjudicationEngine(compiled_obligations, compiled_rules, template, mapping)
    
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={"text": "Analysis based on sales only."},
        evidence_atoms=["sales_atom"],
        claimed_basis=["TEST.OBLIGATION"],
        transformations_used=[Transformation.SUMMARIZE],
    )
    
    result = engine.adjudicate(proposal, partial_evidence)
    
    assert result.status == AdjudicationStatus.REJECTED
    assert any("EVIDENCE" in r.message.upper() or "COMPLAINT" in r.message.upper() for r in result.rejection_reasons)


def test_rejects_when_slot_not_exists():
    """Test rejection when slot does not exist in template."""
    obligations = CompiledObligations(obligations=[])
    rules = CompiledRules(constraints=[])
    template = TemplateSchema(
        template_id="test_template",
        name="Test Template",
        slots=[],
    )
    mapping = ObligationMapping(
        mapping_id="test_mapping",
        template_id="test_template",
        mappings=[],
    )
    
    engine = AdjudicationEngine(obligations, rules, template, mapping)
    
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="nonexistent_slot",
        payload={"text": "Some content"},
        evidence_atoms=[],
        claimed_basis=[],
        transformations_used=[],
    )
    
    result = engine.adjudicate(proposal, {})
    
    assert result.status == AdjudicationStatus.REJECTED
    assert any("SLOT" in r.message.upper() for r in result.rejection_reasons)


def test_rejects_invent_transformation(compiled_obligations, compiled_rules, template, mapping, partial_evidence):
    """Test rejection when INVENT transformation is used."""
    engine = AdjudicationEngine(compiled_obligations, compiled_rules, template, mapping)
    
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={"text": "Invented content without evidence."},
        evidence_atoms=["sales_atom"],
        claimed_basis=["TEST.OBLIGATION"],
        transformations_used=[Transformation.INVENT],
    )
    
    result = engine.adjudicate(proposal, partial_evidence)
    
    assert result.status == AdjudicationStatus.REJECTED
