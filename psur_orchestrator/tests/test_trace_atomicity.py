"""Tests for trace atomicity requirements."""

import pytest
from psur_orchestrator.core.types import (
    SlotProposal,
    AdjudicationResult,
    AdjudicationStatus,
    SlotType,
    Transformation,
)
from psur_orchestrator.core.trace import TraceGenerator, validate_trace_completeness


@pytest.fixture
def accepted_adjudication():
    return AdjudicationResult(
        adjudication_id="test_adj",
        proposal_id="test_proposal",
        status=AdjudicationStatus.ACCEPTED,
    )


def test_narrative_generates_paragraph_traces(accepted_adjudication):
    """Test that narrative content produces paragraph-level traces."""
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={
            "text": "This is the first paragraph.\n\nThis is the second paragraph.\n\nThis is the third paragraph."
        },
        evidence_atoms=["atom1"],
        transformations_used=[Transformation.SUMMARIZE],
    )
    
    generator = TraceGenerator()
    traces = generator.generate_trace(proposal, accepted_adjudication, SlotType.NARRATIVE)
    
    assert len(traces) == 3
    assert all(t.fragment_type == "paragraph" for t in traces)


def test_table_generates_cell_traces(accepted_adjudication):
    """Test that table content produces cell-level traces."""
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={
            "rows": [
                {"cells": [{"value": "A1"}, {"value": "B1"}]},
                {"cells": [{"value": "A2"}, {"value": "B2"}]},
            ]
        },
        evidence_atoms=["atom1"],
        transformations_used=[Transformation.TABULATE],
    )
    
    generator = TraceGenerator()
    traces = generator.generate_trace(proposal, accepted_adjudication, SlotType.TABLE)
    
    assert len(traces) == 4
    assert all(t.fragment_type == "cell" for t in traces)


def test_kv_generates_per_key_traces(accepted_adjudication):
    """Test that KV content produces per-key traces."""
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={
            "pairs": {
                "key1": "value1",
                "key2": "value2",
                "key3": "value3",
            }
        },
        evidence_atoms=["atom1"],
        transformations_used=[Transformation.SUMMARIZE],
    )
    
    generator = TraceGenerator()
    traces = generator.generate_trace(proposal, accepted_adjudication, SlotType.KV)
    
    assert len(traces) == 3
    assert all(t.fragment_type == "kv_pair" for t in traces)


def test_trace_completeness_validation(accepted_adjudication):
    """Test that trace completeness validation works."""
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={
            "text": "Paragraph one.\n\nParagraph two."
        },
        evidence_atoms=["atom1"],
        transformations_used=[Transformation.SUMMARIZE],
    )
    
    generator = TraceGenerator()
    traces = generator.generate_trace(proposal, accepted_adjudication, SlotType.NARRATIVE)
    
    is_complete = validate_trace_completeness(proposal, traces, SlotType.NARRATIVE)
    assert is_complete is True


def test_trace_completeness_fails_with_missing_traces(accepted_adjudication):
    """Test that validation fails when traces are missing."""
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={
            "text": "Paragraph one.\n\nParagraph two."
        },
        evidence_atoms=["atom1"],
        transformations_used=[Transformation.SUMMARIZE],
    )
    
    is_complete = validate_trace_completeness(proposal, [], SlotType.NARRATIVE)
    assert is_complete is False


def test_traces_contain_evidence_reference(accepted_adjudication):
    """Test that traces contain evidence atom references."""
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={"text": "Single paragraph."},
        evidence_atoms=["atom1", "atom2"],
        transformations_used=[Transformation.SUMMARIZE],
    )
    
    generator = TraceGenerator()
    traces = generator.generate_trace(proposal, accepted_adjudication, SlotType.NARRATIVE)
    
    assert len(traces) == 1
    assert traces[0].evidence_atoms == ["atom1", "atom2"]


def test_traces_contain_regulatory_basis(accepted_adjudication):
    """Test that traces contain regulatory basis."""
    proposal = SlotProposal(
        proposal_id="test_proposal",
        agent_id="test_agent",
        slot_id="test_slot",
        payload={"text": "Content based on regulation."},
        evidence_atoms=["atom1"],
        claimed_basis=["EU.PSUR.CONTENT.BENEFIT_RISK"],
        transformations_used=[Transformation.SUMMARIZE],
    )
    
    generator = TraceGenerator()
    traces = generator.generate_trace(proposal, accepted_adjudication, SlotType.NARRATIVE)
    
    assert traces[0].regulatory_basis == ["EU.PSUR.CONTENT.BENEFIT_RISK"]
