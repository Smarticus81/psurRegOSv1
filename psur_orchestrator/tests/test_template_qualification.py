"""Tests for template qualification."""

import pytest
from psur_orchestrator.core.types import (
    CompiledObligations,
    Obligation,
    TemplateSchema,
    Slot,
    ObligationMapping,
    SlotMapping,
    SlotType,
    OutputType,
    Jurisdiction,
    QualificationStatus,
)
from psur_orchestrator.core.qualification import qualify_template


@pytest.fixture
def sample_obligations():
    return CompiledObligations(
        obligations=[
            Obligation(
                id="MANDATORY_1",
                title="Mandatory Obligation 1",
                jurisdiction=Jurisdiction.EU,
                mandatory=True,
                allowed_output_types=[OutputType.NARRATIVE],
            ),
            Obligation(
                id="MANDATORY_2",
                title="Mandatory Obligation 2",
                jurisdiction=Jurisdiction.EU,
                mandatory=True,
                allowed_output_types=[OutputType.TABLE],
            ),
            Obligation(
                id="OPTIONAL_1",
                title="Optional Obligation",
                jurisdiction=Jurisdiction.EU,
                mandatory=False,
                allowed_output_types=[OutputType.NARRATIVE],
            ),
        ]
    )


@pytest.fixture
def valid_template():
    return TemplateSchema(
        template_id="test_template",
        name="Test Template",
        slots=[
            Slot(slot_id="slot_1", path="Section 1", slot_type=SlotType.NARRATIVE),
            Slot(slot_id="slot_2", path="Section 2", slot_type=SlotType.TABLE),
        ],
    )


@pytest.fixture
def valid_mapping():
    return ObligationMapping(
        mapping_id="test_mapping",
        template_id="test_template",
        mappings=[
            SlotMapping(obligation_id="MANDATORY_1", slot_ids=["slot_1"]),
            SlotMapping(obligation_id="MANDATORY_2", slot_ids=["slot_2"]),
        ],
    )


def test_qualification_passes_with_valid_mapping(sample_obligations, valid_template, valid_mapping):
    """Test that qualification passes when all mandatory obligations are mapped."""
    report = qualify_template(sample_obligations, valid_template, valid_mapping)
    assert report.status == QualificationStatus.PASS


def test_qualification_fails_when_mandatory_unmapped(sample_obligations, valid_template):
    """Test that qualification fails when a mandatory obligation is not mapped."""
    incomplete_mapping = ObligationMapping(
        mapping_id="incomplete_mapping",
        template_id="test_template",
        mappings=[
            SlotMapping(obligation_id="MANDATORY_1", slot_ids=["slot_1"]),
        ],
    )
    
    report = qualify_template(sample_obligations, valid_template, incomplete_mapping)
    
    assert report.status == QualificationStatus.FAIL
    assert "MANDATORY_2" in report.missing_mandatory_obligations


def test_qualification_fails_with_dangling_mapping(sample_obligations, valid_template):
    """Test that qualification fails when mapping references non-existent slot."""
    dangling_mapping = ObligationMapping(
        mapping_id="dangling_mapping",
        template_id="test_template",
        mappings=[
            SlotMapping(obligation_id="MANDATORY_1", slot_ids=["slot_1"]),
            SlotMapping(obligation_id="MANDATORY_2", slot_ids=["nonexistent_slot"]),
        ],
    )
    
    report = qualify_template(sample_obligations, valid_template, dangling_mapping)
    
    assert report.status == QualificationStatus.FAIL
    assert "nonexistent_slot" in report.dangling_mappings


def test_qualification_fails_with_incompatible_slot_type(sample_obligations):
    """Test that qualification fails when slot type is incompatible with obligation."""
    template = TemplateSchema(
        template_id="test_template",
        name="Test Template",
        slots=[
            Slot(slot_id="slot_1", path="Section 1", slot_type=SlotType.NARRATIVE),
            Slot(slot_id="slot_2", path="Section 2", slot_type=SlotType.NARRATIVE),
        ],
    )
    
    mapping = ObligationMapping(
        mapping_id="test_mapping",
        template_id="test_template",
        mappings=[
            SlotMapping(obligation_id="MANDATORY_1", slot_ids=["slot_1"]),
            SlotMapping(obligation_id="MANDATORY_2", slot_ids=["slot_2"]),
        ],
    )
    
    report = qualify_template(sample_obligations, template, mapping)
    
    assert report.status == QualificationStatus.FAIL
    assert len(report.incompatible_slot_types) > 0
