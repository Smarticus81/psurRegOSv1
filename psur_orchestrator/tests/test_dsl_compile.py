"""Tests for DSL compilation."""

import pytest
from pathlib import Path
from psur_orchestrator.dsl.compiler import DSLCompiler
from psur_orchestrator.core.types import Jurisdiction, EvidenceType, Transformation


DSL_EXAMPLES_PATH = Path(__file__).parent.parent / "psur_orchestrator" / "dsl" / "examples"


def test_compile_eu_psur():
    """Test that EU PSUR DSL compiles successfully."""
    compiler = DSLCompiler()
    dsl_path = DSL_EXAMPLES_PATH / "eu_psur.dsl"
    
    obligations, rules = compiler.compile_file(dsl_path)
    
    assert len(obligations.sources) >= 4
    assert len(obligations.obligations) >= 8
    assert len(rules.constraints) >= 4


def test_compile_uk_psur():
    """Test that UK PSUR DSL compiles successfully."""
    compiler = DSLCompiler()
    dsl_path = DSL_EXAMPLES_PATH / "uk_psur.dsl"
    
    obligations, rules = compiler.compile_file(dsl_path)
    
    assert len(obligations.sources) >= 2
    assert len(obligations.obligations) >= 6
    assert len(rules.constraints) >= 4


def test_compiled_json_valid():
    """Test that compiled output is valid JSON."""
    compiler = DSLCompiler()
    dsl_path = DSL_EXAMPLES_PATH / "eu_psur.dsl"
    
    obligations, rules = compiler.compile_file(dsl_path)
    
    obligations_json = obligations.model_dump_json()
    rules_json = rules.model_dump_json()
    
    assert len(obligations_json) > 0
    assert len(rules_json) > 0


def test_obligation_fields():
    """Test that obligation fields are correctly parsed."""
    compiler = DSLCompiler()
    dsl_path = DSL_EXAMPLES_PATH / "eu_psur.dsl"
    
    obligations, _ = compiler.compile_file(dsl_path)
    
    benefit_risk = next(
        (o for o in obligations.obligations if "BENEFIT_RISK" in o.id),
        None
    )
    
    assert benefit_risk is not None
    assert benefit_risk.jurisdiction == Jurisdiction.EU
    assert benefit_risk.mandatory is True
    assert EvidenceType.BENEFIT_RISK_ANALYSIS in benefit_risk.required_evidence_types
    assert Transformation.INVENT in benefit_risk.forbidden_transformations


def test_constraint_severity():
    """Test that constraint severity is correctly parsed."""
    compiler = DSLCompiler()
    dsl_path = DSL_EXAMPLES_PATH / "eu_psur.dsl"
    
    _, rules = compiler.compile_file(dsl_path)
    
    from psur_orchestrator.core.types import Severity
    
    blocking_constraints = [c for c in rules.constraints if c.severity == Severity.BLOCK]
    assert len(blocking_constraints) >= 3


def test_compile_string():
    """Test compiling DSL from string."""
    compiler = DSLCompiler()
    
    dsl_content = '''
    SOURCE "TEST-SOURCE" {
      jurisdiction: EU
      instrument: "Test"
      effective_date: 2024-01-01
    }
    
    OBLIGATION "TEST.OBLIGATION" {
      title: "Test obligation"
      jurisdiction: EU
      mandatory: true
      required_evidence_types: ["sales_volume"]
      allowed_transformations: ["summarize"]
      forbidden_transformations: ["invent"]
      allowed_output_types: ["narrative"]
      sources: ["TEST-SOURCE"]
    }
    '''
    
    obligations, rules = compiler.compile_string(dsl_content)
    
    assert len(obligations.sources) == 1
    assert len(obligations.obligations) == 1
    assert obligations.sources[0].id == "TEST-SOURCE"
    assert obligations.obligations[0].id == "TEST.OBLIGATION"
