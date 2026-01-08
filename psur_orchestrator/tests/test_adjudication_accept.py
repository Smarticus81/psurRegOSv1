"""Tests for proposal acceptance scenarios."""

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
                required_evidence_types=[EvidenceType.SALES_VOLUME],
                allowed_transformations=[Transformation.SUMMARIZE, Transformation.CITE],
                forbidden_transformations=[Transformation.INVENT],
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
def valid_evidence():
    return {
        "sales_atom": EvidenceAtom(
            atom_id="sales_atom",
            evidence_type=EvidenceType.SALES_VOLUME,
            content={"total": 1000},
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        ),
    }


def test_accepts_valid_proposal(compiled_obligations, compiled_rules, template, mapping, valid_evidence):
    """Test that a valid proposal is accepted."""
    engine = AdjudicationEngine(compiled_obligations, compiled_rules, template, mapping)
    
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={"text": "Sales totaled 1000 units for the period."},
        evidence_atoms=["sales_atom"],
        claimed_basis=["TEST.OBLIGATION"],
        transformations_used=[Transformation.SUMMARIZE],
    )
    
    result = engine.adjudicate(proposal, valid_evidence)
    
    assert result.status == AdjudicationStatus.ACCEPTED


def test_accepts_with_multiple_allowed_transformations(compiled_obligations, compiled_rules, template, mapping, valid_evidence):
    """Test acceptance with multiple allowed transformations."""
    engine = AdjudicationEngine(compiled_obligations, compiled_rules, template, mapping)
    
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={"text": "As reported in the sales data (see ref), total units were 1000."},
        evidence_atoms=["sales_atom"],
        claimed_basis=["TEST.OBLIGATION"],
        transformations_used=[Transformation.SUMMARIZE, Transformation.CITE],
    )
    
    result = engine.adjudicate(proposal, valid_evidence)
    
    assert result.status == AdjudicationStatus.ACCEPTED


def test_accepts_proposal_with_no_transformations(compiled_obligations, compiled_rules, template, mapping, valid_evidence):
    """Test acceptance when no transformations are declared."""
    engine = AdjudicationEngine(compiled_obligations, compiled_rules, template, mapping)
    
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={"text": "Direct quote from evidence."},
        evidence_atoms=["sales_atom"],
        claimed_basis=["TEST.OBLIGATION"],
        transformations_used=[],
    )
    
    result = engine.adjudicate(proposal, valid_evidence)
    
    assert result.status == AdjudicationStatus.ACCEPTED
