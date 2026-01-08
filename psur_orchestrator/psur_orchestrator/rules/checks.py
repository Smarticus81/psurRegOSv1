"""Predefined constraint checks."""

from ..core.types import (
    SlotProposal,
    EvidenceAtom,
    PSURPeriod,
    Transformation,
)


def check_no_invention(proposal: SlotProposal) -> tuple[bool, str]:
    """Check that no invention transformation is used."""
    forbidden = {Transformation.INVENT, Transformation.INFER, Transformation.EXTRAPOLATE}
    used_forbidden = set(proposal.transformations_used) & forbidden
    
    if used_forbidden:
        return False, f"Forbidden transformations used: {[t.value for t in used_forbidden]}"
    return True, "No forbidden transformations"


def check_evidence_within_period(
    atoms: list[EvidenceAtom],
    period: PSURPeriod,
) -> tuple[bool, list[str]]:
    """Check that all evidence atoms fall within the PSUR period."""
    issues = []
    
    for atom in atoms:
        if atom.period_start and atom.period_start < period.start_date:
            issues.append(f"Atom {atom.atom_id} starts before PSUR period")
        if atom.period_end and atom.period_end > period.end_date:
            issues.append(f"Atom {atom.atom_id} ends after PSUR period")
    
    return len(issues) == 0, issues


def check_leading_device_unchanged(
    previous_leading_device: str | None,
    current_leading_device: str,
) -> tuple[bool, str]:
    """Check that leading device has not changed (EU grouping rule)."""
    if previous_leading_device is None:
        return True, "No previous leading device"
    
    if previous_leading_device != current_leading_device:
        return False, "Leading device cannot change. Issue a new PSUR."
    
    return True, "Leading device unchanged"


def check_notified_body_consistent(
    devices: list[dict],
) -> tuple[bool, str]:
    """Check that all grouped devices have the same notified body."""
    notified_bodies = {d.get("notified_body") for d in devices if d.get("notified_body")}
    
    if len(notified_bodies) > 1:
        return False, f"Grouped devices have different notified bodies: {notified_bodies}"
    
    return True, "Notified body consistent"


def check_mhra_availability_process(
    has_process: bool,
) -> tuple[bool, str]:
    """Check UK requirement: process to provide PSUR to MHRA within 3 working days."""
    if not has_process:
        return False, "UK requires documented process to provide PSUR to MHRA within 3 working days"
    return True, "MHRA availability process documented"
