"""Core type definitions for PSUR Compliance Orchestrator."""

from datetime import date, datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field
import hashlib
import json


class Jurisdiction(str, Enum):
    EU = "EU"
    UK = "UK"
    FDA = "FDA"
    HEALTH_CANADA = "HEALTH_CANADA"
    TGA = "TGA"


class Severity(str, Enum):
    BLOCK = "BLOCK"
    WARN = "WARN"


class SlotType(str, Enum):
    NARRATIVE = "narrative"
    TABLE = "table"
    KV = "kv"


class OutputType(str, Enum):
    NARRATIVE = "narrative"
    TABLE = "table"
    TABLE_REF = "table_ref"
    KV = "kv"


class EvidenceType(str, Enum):
    SALES_VOLUME = "sales_volume"
    POPULATION_ESTIMATE = "population_estimate"
    COMPLAINT_RECORD = "complaint_record"
    NON_SERIOUS_INCIDENT = "non_serious_incident"
    SERIOUS_INCIDENT = "serious_incident"
    FSCA = "fsca"
    TREND_REPORT = "trend_report"
    LITERATURE_REVIEW = "literature_review"
    EXTERNAL_DATABASE_SCAN = "external_database_scan"
    PMCF_SUMMARY = "pmcf_summary"
    CAPA_SUMMARY = "capa_summary"
    BENEFIT_RISK_ANALYSIS = "benefit_risk_analysis"
    SIMILAR_DEVICE_INFO = "similar_device_info"
    STATISTICAL_ANALYSIS = "statistical_analysis"


class Transformation(str, Enum):
    SUMMARIZE = "summarize"
    CITE = "cite"
    CROSS_REFERENCE = "cross_reference"
    AGGREGATE = "aggregate"
    TABULATE = "tabulate"
    QUOTE = "quote"
    INFER = "infer"
    INVENT = "invent"
    RE_WEIGHT_RISK = "re_weight_risk"
    EXTRAPOLATE = "extrapolate"


class AdjudicationStatus(str, Enum):
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class QualificationStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"


class RegulatorySource(BaseModel):
    """A regulatory source document reference."""
    id: str
    jurisdiction: Jurisdiction
    instrument: str
    effective_date: date | None = None
    title: str | None = None


class Obligation(BaseModel):
    """A regulatory obligation that must be satisfied."""
    id: str
    title: str
    jurisdiction: Jurisdiction
    mandatory: bool = True
    required_evidence_types: list[EvidenceType] = Field(default_factory=list)
    allowed_transformations: list[Transformation] = Field(default_factory=list)
    forbidden_transformations: list[Transformation] = Field(default_factory=list)
    required_time_scope: str | None = None
    allowed_output_types: list[OutputType] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    allow_absence_statement: bool = False


class Constraint(BaseModel):
    """A constraint rule that blocks or warns on violations."""
    id: str
    severity: Severity
    trigger: str
    condition: str
    action: str
    sources: list[str] = Field(default_factory=list)
    jurisdiction: Jurisdiction | None = None


class CompiledObligations(BaseModel):
    """Compiled obligation graph from DSL."""
    version: str = "1.0"
    compiled_at: datetime = Field(default_factory=datetime.utcnow)
    sources: list[RegulatorySource] = Field(default_factory=list)
    obligations: list[Obligation] = Field(default_factory=list)
    
    def get_by_jurisdiction(self, jurisdiction: Jurisdiction) -> list[Obligation]:
        return [o for o in self.obligations if o.jurisdiction == jurisdiction]
    
    def get_mandatory(self) -> list[Obligation]:
        return [o for o in self.obligations if o.mandatory]


class CompiledRules(BaseModel):
    """Compiled constraint rules from DSL."""
    version: str = "1.0"
    compiled_at: datetime = Field(default_factory=datetime.utcnow)
    constraints: list[Constraint] = Field(default_factory=list)
    
    def get_by_trigger(self, trigger: str) -> list[Constraint]:
        return [c for c in self.constraints if c.trigger == trigger]


class Slot(BaseModel):
    """A template slot that can receive content."""
    slot_id: str
    path: str
    slot_type: SlotType
    required: bool = False
    constraints: dict[str, Any] = Field(default_factory=dict)


class TemplateSchema(BaseModel):
    """A template definition with slots."""
    template_id: str
    name: str
    version: str = "1.0"
    slots: list[Slot] = Field(default_factory=list)
    
    def get_slot(self, slot_id: str) -> Slot | None:
        for slot in self.slots:
            if slot.slot_id == slot_id:
                return slot
        return None


class SlotMapping(BaseModel):
    """Mapping from obligation to template slot."""
    obligation_id: str
    slot_ids: list[str]
    render_rules: dict[str, Any] = Field(default_factory=dict)


class ObligationMapping(BaseModel):
    """Complete mapping configuration."""
    mapping_id: str
    template_id: str
    mappings: list[SlotMapping] = Field(default_factory=list)
    
    def get_slots_for_obligation(self, obligation_id: str) -> list[str]:
        for m in self.mappings:
            if m.obligation_id == obligation_id:
                return m.slot_ids
        return []
    
    def get_obligations_for_slot(self, slot_id: str) -> list[str]:
        return [m.obligation_id for m in self.mappings if slot_id in m.slot_ids]


class EvidenceAtom(BaseModel):
    """An immutable evidence record with provenance."""
    atom_id: str
    evidence_type: EvidenceType
    content: dict[str, Any]
    source_file: str | None = None
    source_hash: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    provenance_hash: str | None = None
    
    def model_post_init(self, __context: Any) -> None:
        if self.provenance_hash is None:
            self.provenance_hash = self._compute_hash()
    
    def _compute_hash(self) -> str:
        data = {
            "atom_id": self.atom_id,
            "evidence_type": self.evidence_type.value,
            "content": self.content,
            "source_file": self.source_file,
        }
        return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]


class SlotProposal(BaseModel):
    """A proposal submitted by an agent for a slot."""
    proposal_id: str
    agent_id: str
    slot_id: str
    payload: dict[str, Any]
    evidence_atoms: list[str] = Field(default_factory=list)
    claimed_basis: list[str] = Field(default_factory=list)
    transformations_used: list[Transformation] = Field(default_factory=list)
    submitted_at: datetime = Field(default_factory=datetime.utcnow)


class CheckResult(BaseModel):
    """Result of a single adjudication check."""
    check_id: str
    check_type: str
    passed: bool
    message: str
    obligation_id: str | None = None
    constraint_id: str | None = None


class RejectionReason(BaseModel):
    """A specific reason for proposal rejection."""
    rule_id: str
    rule_type: str
    obligation_id: str | None = None
    message: str


class AdjudicationResult(BaseModel):
    """Complete result of proposal adjudication."""
    adjudication_id: str
    proposal_id: str
    status: AdjudicationStatus
    check_results: list[CheckResult] = Field(default_factory=list)
    rejection_reasons: list[RejectionReason] = Field(default_factory=list)
    adjudicated_at: datetime = Field(default_factory=datetime.utcnow)


class TraceNode(BaseModel):
    """Atomic trace node linking output to evidence."""
    trace_id: str
    adjudication_id: str
    slot_id: str
    fragment_type: str
    fragment_index: int
    fragment_content: str
    evidence_atoms: list[str] = Field(default_factory=list)
    transformations: list[Transformation] = Field(default_factory=list)
    regulatory_basis: list[str] = Field(default_factory=list)
    agent_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PSURPeriod(BaseModel):
    """A PSUR reporting period."""
    period_id: str
    psur_ref: str
    start_date: date
    end_date: date
    jurisdiction: Jurisdiction
    device_class: str | None = None
    
    def overlaps(self, other: "PSURPeriod") -> bool:
        return self.start_date <= other.end_date and other.start_date <= self.end_date
    
    def has_gap(self, previous: "PSURPeriod") -> bool:
        from datetime import timedelta
        expected_start = previous.end_date + timedelta(days=1)
        return self.start_date != expected_start


class QualificationIssue(BaseModel):
    """An issue found during template qualification."""
    issue_type: str
    obligation_id: str | None = None
    slot_id: str | None = None
    message: str


class QualificationReport(BaseModel):
    """Result of template qualification."""
    status: QualificationStatus
    template_id: str
    missing_mandatory_obligations: list[str] = Field(default_factory=list)
    dangling_mappings: list[str] = Field(default_factory=list)
    incompatible_slot_types: list[QualificationIssue] = Field(default_factory=list)
    issues: list[QualificationIssue] = Field(default_factory=list)
