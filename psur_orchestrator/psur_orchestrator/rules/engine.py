"""Rules engine for constraint evaluation."""

from datetime import date, timedelta
from ..core.types import (
    Constraint,
    CompiledRules,
    PSURPeriod,
    Severity,
    Jurisdiction,
)


class ConstraintEvaluator:
    """Evaluates constraints against context."""
    
    def __init__(self, rules: CompiledRules):
        self.rules = rules
    
    def evaluate(self, constraint: Constraint, context: dict) -> tuple[bool, str]:
        """
        Evaluate a constraint against a context.
        Returns (passed, message).
        """
        if "changed" in constraint.condition:
            field = constraint.condition.split('"')[1]
            if field in context.get("changed_fields", []):
                return False, constraint.action
        
        if "overlap" in constraint.condition:
            periods = context.get("periods", [])
            for i, p1 in enumerate(periods):
                for p2 in periods[i+1:]:
                    if p1.overlaps(p2):
                        return False, "Period overlap detected"
        
        if "gap" in constraint.condition:
            periods = context.get("periods", [])
            sorted_periods = sorted(periods, key=lambda p: p.start_date)
            for i in range(1, len(sorted_periods)):
                if sorted_periods[i].has_gap(sorted_periods[i-1]):
                    return False, "Period gap detected"
        
        return True, "Constraint passed"
    
    def evaluate_all(
        self,
        trigger: str,
        context: dict,
        jurisdiction: Jurisdiction | None = None,
    ) -> list[tuple[Constraint, bool, str]]:
        """Evaluate all constraints matching a trigger."""
        results = []
        
        for constraint in self.rules.constraints:
            if constraint.trigger != trigger:
                continue
            if jurisdiction and constraint.jurisdiction and constraint.jurisdiction != jurisdiction:
                continue
            
            passed, message = self.evaluate(constraint, context)
            results.append((constraint, passed, message))
        
        return results
    
    def get_blocking_failures(
        self,
        trigger: str,
        context: dict,
        jurisdiction: Jurisdiction | None = None,
    ) -> list[tuple[Constraint, str]]:
        """Get all BLOCK-severity constraint failures."""
        results = self.evaluate_all(trigger, context, jurisdiction)
        return [
            (constraint, message)
            for constraint, passed, message in results
            if not passed and constraint.severity == Severity.BLOCK
        ]


def validate_period_contiguity(periods: list[PSURPeriod]) -> tuple[bool, list[str]]:
    """
    Validate that periods are contiguous (no gaps, no overlaps).
    Returns (valid, list of issues).
    """
    if not periods:
        return True, []
    
    sorted_periods = sorted(periods, key=lambda p: p.start_date)
    issues = []
    
    for i, period in enumerate(sorted_periods):
        for j, other in enumerate(sorted_periods):
            if i != j and period.overlaps(other):
                issues.append(
                    f"Period {period.period_id} overlaps with {other.period_id}"
                )
    
    for i in range(1, len(sorted_periods)):
        current = sorted_periods[i]
        previous = sorted_periods[i-1]
        if current.has_gap(previous):
            expected = previous.end_date + timedelta(days=1)
            issues.append(
                f"Gap between {previous.period_id} (ends {previous.end_date}) "
                f"and {current.period_id} (starts {current.start_date}). "
                f"Expected start: {expected}"
            )
    
    return len(issues) == 0, issues


def get_schedule_constraint(
    jurisdiction: Jurisdiction,
    device_class: str,
) -> timedelta:
    """Get the required PSUR schedule interval for a device class."""
    if jurisdiction == Jurisdiction.EU:
        if device_class in ("III", "IIb"):
            return timedelta(days=365)
        elif device_class == "IIa":
            return timedelta(days=730)
        else:
            return timedelta(days=365 * 5)
    
    elif jurisdiction == Jurisdiction.UK:
        if device_class in ("III", "IIb"):
            return timedelta(days=365)
        elif device_class == "IIa":
            return timedelta(days=730)
        else:
            return timedelta(days=365 * 5)
    
    return timedelta(days=365)
