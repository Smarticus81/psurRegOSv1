"""Registry of constraint check functions."""

from typing import Callable
from .checks import (
    check_no_invention,
    check_evidence_within_period,
    check_leading_device_unchanged,
    check_notified_body_consistent,
    check_mhra_availability_process,
)


CHECK_REGISTRY: dict[str, Callable] = {
    "no_invention": check_no_invention,
    "evidence_within_period": check_evidence_within_period,
    "leading_device_unchanged": check_leading_device_unchanged,
    "notified_body_consistent": check_notified_body_consistent,
    "mhra_availability_process": check_mhra_availability_process,
}


def get_check(check_id: str) -> Callable | None:
    """Get a check function by ID."""
    return CHECK_REGISTRY.get(check_id)


def register_check(check_id: str, check_fn: Callable) -> None:
    """Register a new check function."""
    CHECK_REGISTRY[check_id] = check_fn


def list_checks() -> list[str]:
    """List all registered check IDs."""
    return list(CHECK_REGISTRY.keys())
