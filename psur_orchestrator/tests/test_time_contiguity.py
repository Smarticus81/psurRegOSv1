"""Tests for time/period contiguity validation."""

import pytest
from datetime import date, timedelta
from psur_orchestrator.core.types import PSURPeriod, Jurisdiction
from psur_orchestrator.rules.engine import validate_period_contiguity, get_schedule_constraint


def test_contiguous_periods_pass():
    """Test that contiguous periods pass validation."""
    periods = [
        PSURPeriod(
            period_id="p1",
            psur_ref="PSUR-001",
            start_date=date(2023, 1, 1),
            end_date=date(2023, 12, 31),
            jurisdiction=Jurisdiction.EU,
        ),
        PSURPeriod(
            period_id="p2",
            psur_ref="PSUR-002",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            jurisdiction=Jurisdiction.EU,
        ),
    ]
    
    valid, issues = validate_period_contiguity(periods)
    assert valid is True
    assert len(issues) == 0


def test_overlapping_periods_fail():
    """Test that overlapping periods fail validation."""
    periods = [
        PSURPeriod(
            period_id="p1",
            psur_ref="PSUR-001",
            start_date=date(2023, 1, 1),
            end_date=date(2024, 1, 15),
            jurisdiction=Jurisdiction.EU,
        ),
        PSURPeriod(
            period_id="p2",
            psur_ref="PSUR-002",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            jurisdiction=Jurisdiction.EU,
        ),
    ]
    
    valid, issues = validate_period_contiguity(periods)
    assert valid is False
    assert any("overlap" in issue.lower() for issue in issues)


def test_gap_between_periods_fail():
    """Test that gaps between periods fail validation."""
    periods = [
        PSURPeriod(
            period_id="p1",
            psur_ref="PSUR-001",
            start_date=date(2023, 1, 1),
            end_date=date(2023, 11, 30),
            jurisdiction=Jurisdiction.EU,
        ),
        PSURPeriod(
            period_id="p2",
            psur_ref="PSUR-002",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            jurisdiction=Jurisdiction.EU,
        ),
    ]
    
    valid, issues = validate_period_contiguity(periods)
    assert valid is False
    assert any("gap" in issue.lower() for issue in issues)


def test_single_period_valid():
    """Test that a single period is always valid."""
    periods = [
        PSURPeriod(
            period_id="p1",
            psur_ref="PSUR-001",
            start_date=date(2023, 1, 1),
            end_date=date(2023, 12, 31),
            jurisdiction=Jurisdiction.EU,
        ),
    ]
    
    valid, issues = validate_period_contiguity(periods)
    assert valid is True


def test_empty_periods_valid():
    """Test that empty period list is valid."""
    valid, issues = validate_period_contiguity([])
    assert valid is True


def test_schedule_class_iii_annual():
    """Test that Class III devices require annual PSUR."""
    interval = get_schedule_constraint(Jurisdiction.EU, "III")
    assert interval == timedelta(days=365)


def test_schedule_class_iia_biennial():
    """Test that Class IIa devices require biennial PSUR."""
    interval = get_schedule_constraint(Jurisdiction.EU, "IIa")
    assert interval == timedelta(days=730)


def test_uk_schedule_matches_eu():
    """Test that UK schedule requirements match EU."""
    eu_iii = get_schedule_constraint(Jurisdiction.EU, "III")
    uk_iii = get_schedule_constraint(Jurisdiction.UK, "III")
    assert eu_iii == uk_iii
    
    eu_iia = get_schedule_constraint(Jurisdiction.EU, "IIa")
    uk_iia = get_schedule_constraint(Jurisdiction.UK, "IIa")
    assert eu_iia == uk_iia


def test_period_overlap_detection():
    """Test PSURPeriod.overlaps method."""
    p1 = PSURPeriod(
        period_id="p1",
        psur_ref="PSUR-001",
        start_date=date(2023, 1, 1),
        end_date=date(2023, 12, 31),
        jurisdiction=Jurisdiction.EU,
    )
    
    p2_overlap = PSURPeriod(
        period_id="p2",
        psur_ref="PSUR-002",
        start_date=date(2023, 6, 1),
        end_date=date(2024, 5, 31),
        jurisdiction=Jurisdiction.EU,
    )
    
    p3_no_overlap = PSURPeriod(
        period_id="p3",
        psur_ref="PSUR-003",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
        jurisdiction=Jurisdiction.EU,
    )
    
    assert p1.overlaps(p2_overlap) is True
    assert p1.overlaps(p3_no_overlap) is False


def test_period_gap_detection():
    """Test PSURPeriod.has_gap method."""
    p1 = PSURPeriod(
        period_id="p1",
        psur_ref="PSUR-001",
        start_date=date(2023, 1, 1),
        end_date=date(2023, 12, 31),
        jurisdiction=Jurisdiction.EU,
    )
    
    p2_no_gap = PSURPeriod(
        period_id="p2",
        psur_ref="PSUR-002",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
        jurisdiction=Jurisdiction.EU,
    )
    
    p3_has_gap = PSURPeriod(
        period_id="p3",
        psur_ref="PSUR-003",
        start_date=date(2024, 2, 1),
        end_date=date(2024, 12, 31),
        jurisdiction=Jurisdiction.EU,
    )
    
    assert p2_no_gap.has_gap(p1) is False
    assert p3_has_gap.has_gap(p1) is True
