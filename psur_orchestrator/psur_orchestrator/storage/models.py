"""SQLite database models and operations."""

import sqlite3
import json
from datetime import datetime, date
from pathlib import Path
from typing import Any
from ..core.types import (
    RegulatorySource,
    Obligation,
    Constraint,
    CompiledObligations,
    CompiledRules,
    TemplateSchema,
    ObligationMapping,
    EvidenceAtom,
    SlotProposal,
    AdjudicationResult,
    TraceNode,
    PSURPeriod,
)


DB_PATH = Path("psur_orchestrator.db")


def get_connection() -> sqlite3.Connection:
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def json_serializer(obj: Any) -> str:
    """JSON serializer for complex types."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "value"):
        return obj.value
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


class Storage:
    """Storage operations for the orchestrator."""
    
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or DB_PATH
    
    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def save_compiled_obligations(self, compiled: CompiledObligations) -> None:
        """Save compiled obligations to database."""
        with self._conn() as conn:
            data = compiled.model_dump_json()
            conn.execute(
                "INSERT OR REPLACE INTO compiled_obligations (id, data, compiled_at) VALUES (?, ?, ?)",
                ("current", data, compiled.compiled_at.isoformat()),
            )
    
    def load_compiled_obligations(self) -> CompiledObligations | None:
        """Load compiled obligations from database."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT data FROM compiled_obligations WHERE id = ?", ("current",)
            ).fetchone()
            if row:
                return CompiledObligations.model_validate_json(row["data"])
            return None
    
    def save_compiled_rules(self, compiled: CompiledRules) -> None:
        """Save compiled rules to database."""
        with self._conn() as conn:
            data = compiled.model_dump_json()
            conn.execute(
                "INSERT OR REPLACE INTO compiled_rules (id, data, compiled_at) VALUES (?, ?, ?)",
                ("current", data, compiled.compiled_at.isoformat()),
            )
    
    def load_compiled_rules(self) -> CompiledRules | None:
        """Load compiled rules from database."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT data FROM compiled_rules WHERE id = ?", ("current",)
            ).fetchone()
            if row:
                return CompiledRules.model_validate_json(row["data"])
            return None
    
    def save_template(self, template: TemplateSchema) -> None:
        """Save template schema to database."""
        with self._conn() as conn:
            data = template.model_dump_json()
            conn.execute(
                "INSERT OR REPLACE INTO templates (id, data) VALUES (?, ?)",
                (template.template_id, data),
            )
    
    def load_template(self, template_id: str) -> TemplateSchema | None:
        """Load template schema from database."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT data FROM templates WHERE id = ?", (template_id,)
            ).fetchone()
            if row:
                return TemplateSchema.model_validate_json(row["data"])
            return None
    
    def save_mapping(self, mapping: ObligationMapping) -> None:
        """Save obligation mapping to database."""
        with self._conn() as conn:
            data = mapping.model_dump_json()
            conn.execute(
                "INSERT OR REPLACE INTO mappings (id, template_id, data) VALUES (?, ?, ?)",
                (mapping.mapping_id, mapping.template_id, data),
            )
    
    def load_mapping(self, mapping_id: str) -> ObligationMapping | None:
        """Load obligation mapping from database."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT data FROM mappings WHERE id = ?", (mapping_id,)
            ).fetchone()
            if row:
                return ObligationMapping.model_validate_json(row["data"])
            return None
    
    def save_evidence_atom(self, atom: EvidenceAtom) -> None:
        """Save evidence atom to database."""
        with self._conn() as conn:
            data = atom.model_dump_json()
            conn.execute(
                "INSERT OR REPLACE INTO evidence_atoms (id, evidence_type, data) VALUES (?, ?, ?)",
                (atom.atom_id, atom.evidence_type.value, data),
            )
    
    def load_evidence_atom(self, atom_id: str) -> EvidenceAtom | None:
        """Load evidence atom from database."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT data FROM evidence_atoms WHERE id = ?", (atom_id,)
            ).fetchone()
            if row:
                return EvidenceAtom.model_validate_json(row["data"])
            return None
    
    def load_all_evidence_atoms(self) -> dict[str, EvidenceAtom]:
        """Load all evidence atoms."""
        with self._conn() as conn:
            rows = conn.execute("SELECT id, data FROM evidence_atoms").fetchall()
            return {
                row["id"]: EvidenceAtom.model_validate_json(row["data"])
                for row in rows
            }
    
    def save_proposal(self, proposal: SlotProposal) -> None:
        """Save slot proposal to database."""
        with self._conn() as conn:
            data = proposal.model_dump_json()
            conn.execute(
                "INSERT OR REPLACE INTO proposals (id, slot_id, data) VALUES (?, ?, ?)",
                (proposal.proposal_id, proposal.slot_id, data),
            )
    
    def load_proposal(self, proposal_id: str) -> SlotProposal | None:
        """Load slot proposal from database."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT data FROM proposals WHERE id = ?", (proposal_id,)
            ).fetchone()
            if row:
                return SlotProposal.model_validate_json(row["data"])
            return None
    
    def save_adjudication(self, result: AdjudicationResult) -> None:
        """Save adjudication result to database."""
        with self._conn() as conn:
            data = result.model_dump_json()
            conn.execute(
                "INSERT OR REPLACE INTO adjudications (id, proposal_id, status, data) VALUES (?, ?, ?, ?)",
                (result.adjudication_id, result.proposal_id, result.status.value, data),
            )
    
    def load_adjudication(self, adjudication_id: str) -> AdjudicationResult | None:
        """Load adjudication result from database."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT data FROM adjudications WHERE id = ?", (adjudication_id,)
            ).fetchone()
            if row:
                return AdjudicationResult.model_validate_json(row["data"])
            return None
    
    def save_trace_node(self, node: TraceNode) -> None:
        """Save trace node to database."""
        with self._conn() as conn:
            data = node.model_dump_json()
            conn.execute(
                "INSERT OR REPLACE INTO trace_nodes (id, adjudication_id, slot_id, data) VALUES (?, ?, ?, ?)",
                (node.trace_id, node.adjudication_id, node.slot_id, data),
            )
    
    def save_trace_nodes(self, nodes: list[TraceNode]) -> None:
        """Save multiple trace nodes."""
        for node in nodes:
            self.save_trace_node(node)
    
    def load_traces_for_adjudication(self, adjudication_id: str) -> list[TraceNode]:
        """Load all trace nodes for an adjudication."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT data FROM trace_nodes WHERE adjudication_id = ?",
                (adjudication_id,),
            ).fetchall()
            return [TraceNode.model_validate_json(row["data"]) for row in rows]
    
    def export_traces(self, psur_ref: str | None = None) -> list[TraceNode]:
        """Export all trace nodes, optionally filtered by PSUR reference."""
        with self._conn() as conn:
            rows = conn.execute("SELECT data FROM trace_nodes").fetchall()
            return [TraceNode.model_validate_json(row["data"]) for row in rows]
