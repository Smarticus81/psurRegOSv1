"""Compiler that transforms AST to executable JSON structures."""

from datetime import datetime
from pathlib import Path
from .ast import DSLProgram, SourceNode, ObligationNode, ConstraintNode
from .parser import DSLParser
from ..core.types import (
    RegulatorySource,
    Obligation,
    Constraint,
    CompiledObligations,
    CompiledRules,
    Jurisdiction,
    Severity,
    EvidenceType,
    Transformation,
    OutputType,
)


class DSLCompiler:
    """Compiles DSL AST to executable JSON structures."""
    
    def __init__(self):
        self.parser = DSLParser()
    
    def _map_jurisdiction(self, value: str | None) -> Jurisdiction:
        if value is None:
            return Jurisdiction.EU
        return Jurisdiction(value)
    
    def _map_severity(self, value: str) -> Severity:
        return Severity(value)
    
    def _map_evidence_type(self, value: str) -> EvidenceType:
        return EvidenceType(value.lower())
    
    def _map_transformation(self, value: str) -> Transformation:
        return Transformation(value.lower())
    
    def _map_output_type(self, value: str) -> OutputType:
        return OutputType(value.lower())
    
    def _compile_source(self, node: SourceNode) -> RegulatorySource:
        return RegulatorySource(
            id=node.id,
            jurisdiction=self._map_jurisdiction(node.jurisdiction),
            instrument=node.instrument or "Unknown",
            effective_date=node.effective_date,
            title=node.title,
        )
    
    def _compile_obligation(self, node: ObligationNode) -> Obligation:
        return Obligation(
            id=node.id,
            title=node.title or node.id,
            jurisdiction=self._map_jurisdiction(node.jurisdiction),
            mandatory=node.mandatory,
            required_evidence_types=[
                self._map_evidence_type(e) for e in (node.required_evidence_types or []) if e
            ],
            allowed_transformations=[
                self._map_transformation(t) for t in (node.allowed_transformations or []) if t
            ],
            forbidden_transformations=[
                self._map_transformation(t) for t in (node.forbidden_transformations or []) if t
            ],
            required_time_scope=node.required_time_scope,
            allowed_output_types=[
                self._map_output_type(o) for o in (node.allowed_output_types or []) if o
            ],
            sources=[s for s in (node.sources or []) if s],
            allow_absence_statement=node.allow_absence_statement,
        )
    
    def _compile_constraint(self, node: ConstraintNode) -> Constraint:
        return Constraint(
            id=node.id,
            severity=self._map_severity(node.severity),
            trigger=node.trigger or "",
            condition=node.condition or "",
            action=node.action or "",
            sources=node.sources,
            jurisdiction=self._map_jurisdiction(node.jurisdiction) if node.jurisdiction else None,
        )
    
    def compile(self, program: DSLProgram) -> tuple[CompiledObligations, CompiledRules]:
        """Compile AST program to executable structures."""
        sources = [self._compile_source(s) for s in program.sources]
        obligations = [self._compile_obligation(o) for o in program.obligations]
        constraints = [self._compile_constraint(c) for c in program.constraints]
        
        compiled_obligations = CompiledObligations(
            version="1.0",
            compiled_at=datetime.utcnow(),
            sources=sources,
            obligations=obligations,
        )
        
        compiled_rules = CompiledRules(
            version="1.0",
            compiled_at=datetime.utcnow(),
            constraints=constraints,
        )
        
        return compiled_obligations, compiled_rules
    
    def compile_file(self, path: Path) -> tuple[CompiledObligations, CompiledRules]:
        """Parse and compile a DSL file."""
        program = self.parser.parse_file(path)
        
        for imp in program.imports:
            import_path = path.parent / imp.path
            if import_path.exists():
                imported_program = self.parser.parse_file(import_path)
                program.sources.extend(imported_program.sources)
                program.obligations.extend(imported_program.obligations)
                program.constraints.extend(imported_program.constraints)
        
        return self.compile(program)
    
    def compile_string(self, dsl_content: str) -> tuple[CompiledObligations, CompiledRules]:
        """Parse and compile DSL content from string."""
        program = self.parser.parse(dsl_content)
        return self.compile(program)
