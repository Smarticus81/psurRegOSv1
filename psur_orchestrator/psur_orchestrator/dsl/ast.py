"""AST node definitions for DSL parsing."""

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass
class SourceNode:
    """AST node for SOURCE declaration."""
    id: str
    jurisdiction: str | None = None
    instrument: str | None = None
    effective_date: date | None = None
    title: str | None = None


@dataclass
class ObligationNode:
    """AST node for OBLIGATION declaration."""
    id: str
    title: str | None = None
    jurisdiction: str | None = None
    mandatory: bool = True
    required_evidence_types: list[str] = field(default_factory=list)
    allowed_transformations: list[str] = field(default_factory=list)
    forbidden_transformations: list[str] = field(default_factory=list)
    required_time_scope: str | None = None
    allowed_output_types: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    allow_absence_statement: bool = False


@dataclass
class ConstraintNode:
    """AST node for CONSTRAINT declaration."""
    id: str
    severity: str = "BLOCK"
    trigger: str | None = None
    condition: str | None = None
    action: str | None = None
    sources: list[str] = field(default_factory=list)
    jurisdiction: str | None = None


@dataclass
class ImportNode:
    """AST node for IMPORT declaration."""
    path: str


@dataclass
class DSLProgram:
    """Complete parsed DSL program."""
    sources: list[SourceNode] = field(default_factory=list)
    obligations: list[ObligationNode] = field(default_factory=list)
    constraints: list[ConstraintNode] = field(default_factory=list)
    imports: list[ImportNode] = field(default_factory=list)
