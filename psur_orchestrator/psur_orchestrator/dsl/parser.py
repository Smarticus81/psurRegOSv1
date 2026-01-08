"""DSL parser using Lark grammar."""

from datetime import date
from pathlib import Path
from lark import Lark, Transformer, v_args
from .ast import (
    SourceNode,
    ObligationNode,
    ConstraintNode,
    ImportNode,
    DSLProgram,
)


GRAMMAR_PATH = Path(__file__).parent / "grammar.lark"


class DSLTransformer(Transformer):
    """Transform parse tree to AST nodes."""
    
    def STRING(self, token):
        return token.value[1:-1]
    
    def DATE(self, token):
        return date.fromisoformat(token.value)
    
    def JURISDICTION(self, token):
        return token.value
    
    def SEVERITY(self, token):
        return token.value
    
    def BOOLEAN(self, token):
        return token.value == "true"
    
    def string_list(self, items):
        return list(items)
    
    @v_args(inline=True)
    def sf_jurisdiction(self, val):
        return ("jurisdiction", val)
    
    @v_args(inline=True)
    def sf_instrument(self, val):
        return ("instrument", val)
    
    @v_args(inline=True)
    def sf_effective_date(self, val):
        return ("effective_date", val)
    
    @v_args(inline=True)
    def sf_title(self, val):
        return ("title", val)
    
    def source_decl(self, items):
        source_id = items[0]
        fields = {}
        for item in items[1:]:
            if isinstance(item, tuple):
                fields[item[0]] = item[1]
        return SourceNode(
            id=source_id,
            jurisdiction=fields.get("jurisdiction"),
            instrument=fields.get("instrument"),
            effective_date=fields.get("effective_date"),
            title=fields.get("title"),
        )
    
    @v_args(inline=True)
    def of_title(self, val):
        return ("title", val)
    
    @v_args(inline=True)
    def of_jurisdiction(self, val):
        return ("jurisdiction", val)
    
    @v_args(inline=True)
    def of_mandatory(self, val):
        return ("mandatory", val)
    
    @v_args(inline=True)
    def of_required_evidence_types(self, val):
        return ("required_evidence_types", val)
    
    @v_args(inline=True)
    def of_allowed_transformations(self, val):
        return ("allowed_transformations", val)
    
    @v_args(inline=True)
    def of_forbidden_transformations(self, val):
        return ("forbidden_transformations", val)
    
    @v_args(inline=True)
    def of_required_time_scope(self, val):
        return ("required_time_scope", val)
    
    @v_args(inline=True)
    def of_allowed_output_types(self, val):
        return ("allowed_output_types", val)
    
    @v_args(inline=True)
    def of_sources(self, val):
        return ("sources", val)
    
    @v_args(inline=True)
    def of_allow_absence_statement(self, val):
        return ("allow_absence_statement", val)
    
    def obligation_decl(self, items):
        obl_id = items[0]
        fields = {
            "required_evidence_types": [],
            "allowed_transformations": [],
            "forbidden_transformations": [],
            "allowed_output_types": [],
            "sources": [],
            "mandatory": True,
            "allow_absence_statement": False,
        }
        for item in items[1:]:
            if isinstance(item, tuple):
                fields[item[0]] = item[1]
        return ObligationNode(
            id=obl_id,
            title=fields.get("title"),
            jurisdiction=fields.get("jurisdiction"),
            mandatory=fields.get("mandatory", True),
            required_evidence_types=fields.get("required_evidence_types", []),
            allowed_transformations=fields.get("allowed_transformations", []),
            forbidden_transformations=fields.get("forbidden_transformations", []),
            required_time_scope=fields.get("required_time_scope"),
            allowed_output_types=fields.get("allowed_output_types", []),
            sources=fields.get("sources", []),
            allow_absence_statement=fields.get("allow_absence_statement", False),
        )
    
    @v_args(inline=True)
    def cf_severity(self, val):
        return ("severity", val)
    
    @v_args(inline=True)
    def cf_trigger(self, val):
        return ("trigger", val)
    
    @v_args(inline=True)
    def cf_if(self, val):
        return ("condition", val)
    
    @v_args(inline=True)
    def cf_then(self, val):
        return ("action", val)
    
    @v_args(inline=True)
    def cf_sources(self, val):
        return ("sources", val)
    
    @v_args(inline=True)
    def cf_jurisdiction(self, val):
        return ("jurisdiction", val)
    
    def constraint_decl(self, items):
        cons_id = items[0]
        fields = {"sources": []}
        for item in items[1:]:
            if isinstance(item, tuple):
                fields[item[0]] = item[1]
        return ConstraintNode(
            id=cons_id,
            severity=fields.get("severity", "BLOCK"),
            trigger=fields.get("trigger"),
            condition=fields.get("condition"),
            action=fields.get("action"),
            sources=fields.get("sources", []),
            jurisdiction=fields.get("jurisdiction"),
        )
    
    @v_args(inline=True)
    def import_decl(self, path):
        return ImportNode(path=path)
    
    def declaration(self, items):
        return items[0]
    
    def start(self, declarations):
        program = DSLProgram()
        for decl in declarations:
            if isinstance(decl, SourceNode):
                program.sources.append(decl)
            elif isinstance(decl, ObligationNode):
                program.obligations.append(decl)
            elif isinstance(decl, ConstraintNode):
                program.constraints.append(decl)
            elif isinstance(decl, ImportNode):
                program.imports.append(decl)
        return program


class DSLParser:
    """Parser for PSUR DSL files."""
    
    def __init__(self):
        with open(GRAMMAR_PATH) as f:
            grammar = f.read()
        self.parser = Lark(grammar, parser="lalr", transformer=DSLTransformer())
    
    def parse(self, dsl_content: str) -> DSLProgram:
        """Parse DSL content and return AST."""
        return self.parser.parse(dsl_content)
    
    def parse_file(self, path: Path) -> DSLProgram:
        """Parse DSL file and return AST."""
        with open(path) as f:
            content = f.read()
        return self.parse(content)
