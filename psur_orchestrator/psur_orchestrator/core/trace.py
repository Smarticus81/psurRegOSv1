"""Ultra-atomic trace system."""

import uuid
from datetime import datetime
from ..core.types import (
    SlotProposal,
    AdjudicationResult,
    AdjudicationStatus,
    TraceNode,
    SlotType,
)


class TraceGenerator:
    """Generates ultra-atomic trace nodes for accepted proposals."""
    
    def generate_trace(
        self,
        proposal: SlotProposal,
        adjudication: AdjudicationResult,
        slot_type: SlotType,
    ) -> list[TraceNode]:
        """
        Generate trace nodes for an accepted proposal.
        
        - Narrative: paragraph-level (split by blank lines)
        - Table: cell-level
        - KV: per-key
        """
        if adjudication.status != AdjudicationStatus.ACCEPTED:
            raise ValueError("Cannot generate trace for rejected proposal")
        
        if slot_type == SlotType.NARRATIVE:
            return self._trace_narrative(proposal, adjudication)
        elif slot_type == SlotType.TABLE:
            return self._trace_table(proposal, adjudication)
        elif slot_type == SlotType.KV:
            return self._trace_kv(proposal, adjudication)
        else:
            raise ValueError(f"Unknown slot type: {slot_type}")
    
    def _trace_narrative(
        self,
        proposal: SlotProposal,
        adjudication: AdjudicationResult,
    ) -> list[TraceNode]:
        """Generate paragraph-level trace nodes for narrative content."""
        nodes = []
        content = proposal.payload.get("text", "")
        
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        
        if not paragraphs and content.strip():
            paragraphs = [content.strip()]
        
        for idx, paragraph in enumerate(paragraphs):
            node = TraceNode(
                trace_id=f"{adjudication.adjudication_id}-{idx}",
                adjudication_id=adjudication.adjudication_id,
                slot_id=proposal.slot_id,
                fragment_type="paragraph",
                fragment_index=idx,
                fragment_content=paragraph,
                evidence_atoms=proposal.evidence_atoms,
                transformations=proposal.transformations_used,
                regulatory_basis=proposal.claimed_basis,
                agent_id=proposal.agent_id,
                created_at=datetime.utcnow(),
            )
            nodes.append(node)
        
        return nodes
    
    def _trace_table(
        self,
        proposal: SlotProposal,
        adjudication: AdjudicationResult,
    ) -> list[TraceNode]:
        """Generate cell-level trace nodes for table content."""
        nodes = []
        rows = proposal.payload.get("rows", [])
        
        cell_idx = 0
        for row_idx, row in enumerate(rows):
            cells = row.get("cells", [])
            for col_idx, cell in enumerate(cells):
                cell_content = str(cell.get("value", "")) if isinstance(cell, dict) else str(cell)
                node = TraceNode(
                    trace_id=f"{adjudication.adjudication_id}-{cell_idx}",
                    adjudication_id=adjudication.adjudication_id,
                    slot_id=proposal.slot_id,
                    fragment_type="cell",
                    fragment_index=cell_idx,
                    fragment_content=cell_content,
                    evidence_atoms=proposal.evidence_atoms,
                    transformations=proposal.transformations_used,
                    regulatory_basis=proposal.claimed_basis,
                    agent_id=proposal.agent_id,
                    created_at=datetime.utcnow(),
                )
                nodes.append(node)
                cell_idx += 1
        
        return nodes
    
    def _trace_kv(
        self,
        proposal: SlotProposal,
        adjudication: AdjudicationResult,
    ) -> list[TraceNode]:
        """Generate per-key trace nodes for key-value content."""
        nodes = []
        kv_pairs = proposal.payload.get("pairs", {})
        
        if isinstance(kv_pairs, dict):
            items = list(kv_pairs.items())
        else:
            items = [(p.get("key"), p.get("value")) for p in kv_pairs]
        
        for idx, (key, value) in enumerate(items):
            node = TraceNode(
                trace_id=f"{adjudication.adjudication_id}-{idx}",
                adjudication_id=adjudication.adjudication_id,
                slot_id=proposal.slot_id,
                fragment_type="kv_pair",
                fragment_index=idx,
                fragment_content=f"{key}: {value}",
                evidence_atoms=proposal.evidence_atoms,
                transformations=proposal.transformations_used,
                regulatory_basis=proposal.claimed_basis,
                agent_id=proposal.agent_id,
                created_at=datetime.utcnow(),
            )
            nodes.append(node)
        
        return nodes


def validate_trace_completeness(
    proposal: SlotProposal,
    traces: list[TraceNode],
    slot_type: SlotType,
) -> bool:
    """
    Validate that trace nodes completely cover the proposal content.
    Returns True if no output exists without trace.
    """
    if not traces:
        return False
    
    if slot_type == SlotType.NARRATIVE:
        content = proposal.payload.get("text", "")
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        if not paragraphs and content.strip():
            paragraphs = [content.strip()]
        return len(traces) >= len(paragraphs)
    
    elif slot_type == SlotType.TABLE:
        rows = proposal.payload.get("rows", [])
        total_cells = sum(len(row.get("cells", [])) for row in rows)
        return len(traces) >= total_cells
    
    elif slot_type == SlotType.KV:
        kv_pairs = proposal.payload.get("pairs", {})
        if isinstance(kv_pairs, dict):
            return len(traces) >= len(kv_pairs)
        return len(traces) >= len(kv_pairs)
    
    return False
