"""Renderer stub for outputting reports (markdown for now)."""

from ..core.types import (
    TemplateSchema,
    SlotProposal,
    AdjudicationResult,
    AdjudicationStatus,
    SlotType,
)


class MarkdownRenderer:
    """Renders accepted slot payloads to markdown."""
    
    def __init__(self, template: TemplateSchema):
        self.template = template
    
    def render(
        self,
        accepted_proposals: list[tuple[SlotProposal, AdjudicationResult]],
    ) -> str:
        """Render all accepted proposals to markdown."""
        lines = ["# PSUR Report", "", "---", ""]
        
        slot_order = [slot.slot_id for slot in self.template.slots]
        proposals_by_slot = {p.slot_id: p for p, a in accepted_proposals}
        
        for slot_id in slot_order:
            slot = self.template.get_slot(slot_id)
            if slot is None:
                continue
            
            proposal = proposals_by_slot.get(slot_id)
            if proposal is None:
                lines.append(f"## {slot.path}")
                lines.append("")
                lines.append("*[No content provided]*")
                lines.append("")
                continue
            
            lines.append(f"## {slot.path}")
            lines.append("")
            
            if slot.slot_type == SlotType.NARRATIVE:
                text = proposal.payload.get("text", "")
                lines.append(text)
            elif slot.slot_type == SlotType.TABLE:
                table_md = self._render_table(proposal.payload)
                lines.append(table_md)
            elif slot.slot_type == SlotType.KV:
                kv_md = self._render_kv(proposal.payload)
                lines.append(kv_md)
            
            lines.append("")
        
        return "\n".join(lines)
    
    def _render_table(self, payload: dict) -> str:
        """Render table payload to markdown table."""
        headers = payload.get("headers", [])
        rows = payload.get("rows", [])
        
        if not headers and rows:
            first_row = rows[0].get("cells", [])
            headers = [f"Col {i+1}" for i in range(len(first_row))]
        
        lines = []
        
        if headers:
            header_line = "| " + " | ".join(str(h) for h in headers) + " |"
            separator = "| " + " | ".join("---" for _ in headers) + " |"
            lines.append(header_line)
            lines.append(separator)
        
        for row in rows:
            cells = row.get("cells", [])
            cell_values = []
            for cell in cells:
                if isinstance(cell, dict):
                    cell_values.append(str(cell.get("value", "")))
                else:
                    cell_values.append(str(cell))
            row_line = "| " + " | ".join(cell_values) + " |"
            lines.append(row_line)
        
        return "\n".join(lines)
    
    def _render_kv(self, payload: dict) -> str:
        """Render key-value payload to markdown."""
        pairs = payload.get("pairs", {})
        
        if isinstance(pairs, dict):
            items = pairs.items()
        else:
            items = [(p.get("key"), p.get("value")) for p in pairs]
        
        lines = []
        for key, value in items:
            lines.append(f"- **{key}**: {value}")
        
        return "\n".join(lines)
