"""CLI for PSUR Compliance Orchestrator."""

import json
from pathlib import Path
from datetime import datetime
import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.syntax import Syntax
from rich import print as rprint

from .dsl.compiler import DSLCompiler
from .core.types import (
    TemplateSchema,
    ObligationMapping,
    EvidenceAtom,
    SlotProposal,
    AdjudicationStatus,
    Slot,
    SlotMapping,
    SlotType,
    EvidenceType,
    Transformation,
)
from .core.adjudication import AdjudicationEngine
from .core.qualification import qualify_template
from .core.trace import TraceGenerator, validate_trace_completeness
from .storage.models import Storage
from .storage.migrations import init_db, reset_db

app = typer.Typer(
    name="psur",
    help="PSUR Compliance Orchestrator - DSL-first regulatory compliance kernel",
)
console = Console()

DB_PATH = Path("psur_orchestrator.db")


def ensure_db():
    """Ensure database is initialized."""
    if not DB_PATH.exists():
        init_db(DB_PATH)


@app.command("init")
def init_command():
    """Initialize the database."""
    init_db(DB_PATH)
    console.print("[green]Database initialized successfully.[/green]")


@app.command("reset")
def reset_command(
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation"),
):
    """Reset the database (WARNING: deletes all data)."""
    if not force:
        confirm = typer.confirm("This will delete all data. Are you sure?")
        if not confirm:
            raise typer.Abort()
    
    reset_db(DB_PATH)
    console.print("[green]Database reset successfully.[/green]")


@app.command("compile")
def compile_command(
    dsl_file: Path = typer.Argument(..., help="Path to DSL file"),
    out: Path = typer.Option(None, "--out", "-o", help="Output directory for compiled JSON"),
):
    """Compile DSL file to executable JSON."""
    ensure_db()
    
    if not dsl_file.exists():
        console.print(f"[red]Error: File {dsl_file} not found.[/red]")
        raise typer.Exit(1)
    
    compiler = DSLCompiler()
    
    try:
        obligations, rules = compiler.compile_file(dsl_file)
    except Exception as e:
        console.print(f"[red]Compilation error: {e}[/red]")
        raise typer.Exit(1)
    
    storage = Storage(DB_PATH)
    storage.save_compiled_obligations(obligations)
    storage.save_compiled_rules(rules)
    
    if out:
        out.mkdir(parents=True, exist_ok=True)
        obligations_path = out / "compiled_obligations.json"
        rules_path = out / "compiled_rules.json"
        
        with open(obligations_path, "w") as f:
            f.write(obligations.model_dump_json(indent=2))
        with open(rules_path, "w") as f:
            f.write(rules.model_dump_json(indent=2))
        
        console.print(f"[green]Compiled to {obligations_path} and {rules_path}[/green]")
    
    table = Table(title="Compilation Summary")
    table.add_column("Item", style="cyan")
    table.add_column("Count", style="green")
    table.add_row("Sources", str(len(obligations.sources)))
    table.add_row("Obligations", str(len(obligations.obligations)))
    table.add_row("Constraints", str(len(rules.constraints)))
    console.print(table)


@app.command("template-register")
def template_register_command(
    template_file: Path = typer.Argument(..., help="Path to template schema JSON"),
):
    """Register a template schema."""
    ensure_db()
    
    with open(template_file) as f:
        data = json.load(f)
    
    template = TemplateSchema.model_validate(data)
    storage = Storage(DB_PATH)
    storage.save_template(template)
    
    console.print(f"[green]Template '{template.template_id}' registered with {len(template.slots)} slots.[/green]")


@app.command("mapping-register")
def mapping_register_command(
    mapping_file: Path = typer.Argument(..., help="Path to mapping JSON"),
):
    """Register an obligation-to-slot mapping."""
    ensure_db()
    
    with open(mapping_file) as f:
        data = json.load(f)
    
    mapping = ObligationMapping.model_validate(data)
    storage = Storage(DB_PATH)
    storage.save_mapping(mapping)
    
    console.print(f"[green]Mapping '{mapping.mapping_id}' registered with {len(mapping.mappings)} mappings.[/green]")


@app.command("qualify")
def qualify_command(
    template_id: str = typer.Option(..., "--template", "-t", help="Template ID"),
):
    """Qualify a template against compiled obligations."""
    ensure_db()
    storage = Storage(DB_PATH)
    
    obligations = storage.load_compiled_obligations()
    if obligations is None:
        console.print("[red]No compiled obligations found. Run 'psur compile' first.[/red]")
        raise typer.Exit(1)
    
    template = storage.load_template(template_id)
    if template is None:
        console.print(f"[red]Template '{template_id}' not found.[/red]")
        raise typer.Exit(1)
    
    mappings = [
        storage.load_mapping(f"{template_id}_mapping")
    ]
    mapping = mappings[0]
    if mapping is None:
        console.print(f"[yellow]No mapping found for template. Creating empty mapping.[/yellow]")
        mapping = ObligationMapping(mapping_id=f"{template_id}_mapping", template_id=template_id)
    
    report = qualify_template(obligations, template, mapping)
    
    if report.status.value == "PASS":
        console.print(Panel("[green]QUALIFICATION PASSED[/green]", title="Result"))
    else:
        console.print(Panel("[red]QUALIFICATION FAILED[/red]", title="Result"))
        
        if report.missing_mandatory_obligations:
            console.print("\n[yellow]Missing Mandatory Obligations:[/yellow]")
            for obl_id in report.missing_mandatory_obligations:
                console.print(f"  - {obl_id}")
        
        if report.dangling_mappings:
            console.print("\n[yellow]Dangling Mappings (slot not in template):[/yellow]")
            for slot_id in report.dangling_mappings:
                console.print(f"  - {slot_id}")
        
        if report.incompatible_slot_types:
            console.print("\n[yellow]Incompatible Slot Types:[/yellow]")
            for issue in report.incompatible_slot_types:
                console.print(f"  - {issue.message}")


@app.command("evidence-add")
def evidence_add_command(
    evidence_file: Path = typer.Argument(..., help="Path to evidence atom JSON"),
):
    """Add an evidence atom."""
    ensure_db()
    
    with open(evidence_file) as f:
        data = json.load(f)
    
    atom = EvidenceAtom.model_validate(data)
    storage = Storage(DB_PATH)
    storage.save_evidence_atom(atom)
    
    console.print(f"[green]Evidence atom '{atom.atom_id}' added (type: {atom.evidence_type.value}).[/green]")


@app.command("proposal-submit")
def proposal_submit_command(
    proposal_file: Path = typer.Argument(..., help="Path to slot proposal JSON"),
):
    """Submit a slot proposal."""
    ensure_db()
    
    with open(proposal_file) as f:
        data = json.load(f)
    
    proposal = SlotProposal.model_validate(data)
    storage = Storage(DB_PATH)
    storage.save_proposal(proposal)
    
    console.print(f"[green]Proposal '{proposal.proposal_id}' submitted for slot '{proposal.slot_id}'.[/green]")


@app.command("adjudicate")
def adjudicate_command(
    proposal_id: str = typer.Argument(..., help="Proposal ID to adjudicate"),
    template_id: str = typer.Option(..., "--template", "-t", help="Template ID"),
):
    """Adjudicate a proposal."""
    ensure_db()
    storage = Storage(DB_PATH)
    
    proposal = storage.load_proposal(proposal_id)
    if proposal is None:
        console.print(f"[red]Proposal '{proposal_id}' not found.[/red]")
        raise typer.Exit(1)
    
    obligations = storage.load_compiled_obligations()
    rules = storage.load_compiled_rules()
    template = storage.load_template(template_id)
    mapping = storage.load_mapping(f"{template_id}_mapping")
    
    if not all([obligations, rules, template]):
        console.print("[red]Missing compiled data or template. Ensure DSL is compiled and template registered.[/red]")
        raise typer.Exit(1)
    
    if mapping is None:
        mapping = ObligationMapping(mapping_id=f"{template_id}_mapping", template_id=template_id)
    
    evidence_atoms = storage.load_all_evidence_atoms()
    
    engine = AdjudicationEngine(obligations, rules, template, mapping)
    result = engine.adjudicate(proposal, evidence_atoms)
    
    storage.save_adjudication(result)
    
    if result.status == AdjudicationStatus.ACCEPTED:
        console.print(Panel("[green]ACCEPTED[/green]", title="Adjudication Result"))
        
        slot = template.get_slot(proposal.slot_id)
        if slot:
            trace_gen = TraceGenerator()
            traces = trace_gen.generate_trace(proposal, result, slot.slot_type)
            storage.save_trace_nodes(traces)
            console.print(f"[dim]Generated {len(traces)} trace nodes.[/dim]")
    else:
        console.print(Panel("[red]REJECTED[/red]", title="Adjudication Result"))
        console.print("\n[yellow]Rejection Reasons:[/yellow]")
        for reason in result.rejection_reasons:
            console.print(f"  - [{reason.rule_type}] {reason.message}")


@app.command("trace-export")
def trace_export_command(
    out: Path = typer.Option("trace.jsonl", "--out", "-o", help="Output file"),
    psur_ref: str = typer.Option(None, "--psur-ref", help="Filter by PSUR reference"),
):
    """Export trace nodes."""
    ensure_db()
    storage = Storage(DB_PATH)
    
    traces = storage.export_traces(psur_ref)
    
    with open(out, "w") as f:
        for trace in traces:
            f.write(trace.model_dump_json() + "\n")
    
    console.print(f"[green]Exported {len(traces)} trace nodes to {out}.[/green]")


@app.command("demo-seed")
def demo_seed_command():
    """Seed database with example data for demonstration."""
    ensure_db()
    
    dsl_path = Path(__file__).parent / "dsl" / "examples" / "eu_psur.dsl"
    if not dsl_path.exists():
        console.print(f"[red]Example DSL file not found: {dsl_path}[/red]")
        raise typer.Exit(1)
    
    compiler = DSLCompiler()
    obligations, rules = compiler.compile_file(dsl_path)
    
    storage = Storage(DB_PATH)
    storage.save_compiled_obligations(obligations)
    storage.save_compiled_rules(rules)
    console.print("[green]Compiled EU PSUR DSL.[/green]")
    
    template = TemplateSchema(
        template_id="mdcg_2022_21_template",
        name="MDCG 2022-21 PSUR Template",
        version="1.0",
        slots=[
            Slot(slot_id="benefit_risk", path="Section 1: Benefit-Risk Conclusions", slot_type=SlotType.NARRATIVE, required=True),
            Slot(slot_id="pmcf_findings", path="Section 2: PMCF Main Findings", slot_type=SlotType.NARRATIVE, required=True),
            Slot(slot_id="sales_data", path="Section 3: Sales Volume", slot_type=SlotType.TABLE, required=True),
            Slot(slot_id="population", path="Section 4: Population Estimate", slot_type=SlotType.KV, required=False),
            Slot(slot_id="serious_incidents", path="Section 5: Serious Incidents & FSCAs", slot_type=SlotType.TABLE, required=True),
            Slot(slot_id="non_serious", path="Section 6: Non-Serious Incidents", slot_type=SlotType.TABLE, required=True),
            Slot(slot_id="trends", path="Section 7: Trend Analysis", slot_type=SlotType.NARRATIVE, required=True),
            Slot(slot_id="literature", path="Section 8: Literature Review", slot_type=SlotType.NARRATIVE, required=True),
        ],
    )
    storage.save_template(template)
    console.print("[green]Registered example template.[/green]")
    
    mapping = ObligationMapping(
        mapping_id="mdcg_2022_21_template_mapping",
        template_id="mdcg_2022_21_template",
        mappings=[
            SlotMapping(obligation_id="EU.PSUR.CONTENT.BENEFIT_RISK", slot_ids=["benefit_risk"]),
            SlotMapping(obligation_id="EU.PSUR.CONTENT.PMCF_MAIN_FINDINGS", slot_ids=["pmcf_findings"]),
            SlotMapping(obligation_id="EU.PSUR.CONTENT.SALES_VOLUME", slot_ids=["sales_data"]),
            SlotMapping(obligation_id="EU.PSUR.CONTENT.POPULATION_ESTIMATE", slot_ids=["population"]),
            SlotMapping(obligation_id="EU.PSUR.CONTENT.SERIOUS_INCIDENTS", slot_ids=["serious_incidents"]),
            SlotMapping(obligation_id="EU.PSUR.CONTENT.NON_SERIOUS_INCIDENTS", slot_ids=["non_serious"]),
            SlotMapping(obligation_id="EU.PSUR.CONTENT.TREND_REPORT", slot_ids=["trends"]),
            SlotMapping(obligation_id="EU.PSUR.CONTENT.LITERATURE_REVIEW", slot_ids=["literature"]),
        ],
    )
    storage.save_mapping(mapping)
    console.print("[green]Registered example mapping.[/green]")
    
    from datetime import date
    atoms = [
        EvidenceAtom(
            atom_id="sales_2024",
            evidence_type=EvidenceType.SALES_VOLUME,
            content={"total_units": 15000, "regions": {"EU": 8000, "UK": 7000}},
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        ),
        EvidenceAtom(
            atom_id="complaints_2024",
            evidence_type=EvidenceType.COMPLAINT_RECORD,
            content={"total": 42, "categories": {"usability": 20, "performance": 15, "other": 7}},
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        ),
        EvidenceAtom(
            atom_id="pmcf_summary_2024",
            evidence_type=EvidenceType.PMCF_SUMMARY,
            content={"studies_completed": 2, "patients_enrolled": 500, "findings": "No new safety signals identified."},
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        ),
        EvidenceAtom(
            atom_id="benefit_risk_2024",
            evidence_type=EvidenceType.BENEFIT_RISK_ANALYSIS,
            content={"conclusion": "Favorable", "rationale": "Benefits outweigh risks based on current evidence."},
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        ),
    ]
    for atom in atoms:
        storage.save_evidence_atom(atom)
    console.print(f"[green]Added {len(atoms)} sample evidence atoms.[/green]")
    
    console.print("\n[bold]Demo seed complete![/bold]")
    console.print("\nTry these commands:")
    console.print("  psur qualify --template mdcg_2022_21_template")


@app.command("list-obligations")
def list_obligations_command():
    """List all compiled obligations."""
    ensure_db()
    storage = Storage(DB_PATH)
    
    obligations = storage.load_compiled_obligations()
    if obligations is None:
        console.print("[yellow]No compiled obligations found. Run 'psur compile' first.[/yellow]")
        return
    
    table = Table(title="Compiled Obligations")
    table.add_column("ID", style="cyan")
    table.add_column("Title", style="white")
    table.add_column("Jurisdiction", style="green")
    table.add_column("Mandatory", style="yellow")
    
    for obl in obligations.obligations:
        table.add_row(
            obl.id,
            obl.title[:40] + "..." if len(obl.title) > 40 else obl.title,
            obl.jurisdiction.value,
            "Yes" if obl.mandatory else "No",
        )
    
    console.print(table)


@app.command("list-constraints")
def list_constraints_command():
    """List all compiled constraints."""
    ensure_db()
    storage = Storage(DB_PATH)
    
    rules = storage.load_compiled_rules()
    if rules is None:
        console.print("[yellow]No compiled constraints found. Run 'psur compile' first.[/yellow]")
        return
    
    table = Table(title="Compiled Constraints")
    table.add_column("ID", style="cyan")
    table.add_column("Severity", style="red")
    table.add_column("Trigger", style="yellow")
    table.add_column("Jurisdiction", style="green")
    
    for constraint in rules.constraints:
        table.add_row(
            constraint.id,
            constraint.severity.value,
            constraint.trigger,
            constraint.jurisdiction.value if constraint.jurisdiction else "Any",
        )
    
    console.print(table)


if __name__ == "__main__":
    app()
