import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Cpu, Zap, Activity, Brain, Workflow, Terminal, ArrowRight, ShieldCheck, History, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface OrchestratorStatus {
    initialized: boolean;
    euObligations: number;
    ukObligations: number;
    constraints: number;
}

interface TraceEntry {
    type: string;
    actor: string;
    decision: string;
    summary: string;
    timestamp?: string;
}

interface PSURCase {
    id: number;
    psurReference: string;
    status: string;
}

export default function AgentSystem() {
    const [activeAgent, setActiveAgent] = useState<string>("orchestrator");
    const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [recentTraces, setRecentTraces] = useState<TraceEntry[]>([]);
    const [tracesLoading, setTracesLoading] = useState(true);
    const [activePsurCase, setActivePsurCase] = useState<PSURCase | null>(null);

    // Fetch orchestrator status
    useEffect(() => {
        async function fetchStatus() {
            try {
                const res = await fetch("/api/orchestrator/status");
                if (res.ok) {
                    const data = await res.json();
                    setOrchestratorStatus(data);
                }
            } catch (e) {
                console.error("[AgentSystem] Failed to fetch orchestrator status:", e);
            } finally {
                setStatusLoading(false);
            }
        }
        fetchStatus();
    }, []);

    // Fetch recent traces from most recent PSUR case
    useEffect(() => {
        async function fetchRecentTraces() {
            try {
                // Get most recent PSUR case
                const casesRes = await fetch("/api/psur-cases");
                if (!casesRes.ok) throw new Error("Failed to fetch cases");
                
                const cases: PSURCase[] = await casesRes.json();
                const recentCase = cases.find(c => c.status === "compiling" || c.status === "compiled" || c.status === "draft");
                
                if (recentCase) {
                    setActivePsurCase(recentCase);
                    
                    // Fetch decision traces for this case
                    const tracesRes = await fetch(`/api/psur-cases/${recentCase.id}/decision-traces?limit=6`);
                    if (tracesRes.ok) {
                        const data = await tracesRes.json();
                        const traces: TraceEntry[] = (data.traces || data || []).slice(0, 6).map((t: any) => ({
                            type: t.eventType || t.type || "DECISION",
                            actor: t.actor || t.agentId || "system",
                            decision: t.decision || t.status || "RECORDED",
                            summary: t.summary || t.description || t.details?.summary || "Decision recorded",
                            timestamp: t.timestamp || t.createdAt
                        }));
                        setRecentTraces(traces);
                    }
                }
            } catch (e) {
                console.error("[AgentSystem] Failed to fetch traces:", e);
            } finally {
                setTracesLoading(false);
            }
        }
        fetchRecentTraces();
    }, []);

    const agents = [
        {
            id: "orchestrator",
            name: "Orchestrator Kernel",
            icon: Workflow,
            color: "blue",
            desc: "The central intelligence module managing the end-to-end PSUR workflow. It handles state transitions, dependency resolution, and agent spawning.",
            capabilities: ["Multi-step Workflow Control", "Parallel Agent Spawning", "Integrity Verification"]
        },
        {
            id: "ingestion",
            name: "Neural Ingestion Agent",
            icon: Brain,
            color: "emerald",
            desc: "Specialized in structural extraction of compliance data from unstructured sources. Maps raw data to canonical intelligence atoms.",
            capabilities: ["Schema Recognition", "Semantic Field Mapping", "Format Normalization"]
        },
        {
            id: "narrative",
            name: "Clinical Narrative Agent",
            icon: Zap,
            color: "amber",
            desc: "Synthesizes evidence atoms into professional regulatory prose. Ensures clinical continuity and alignment with IFU requirements.",
            capabilities: ["Natural Language Synthesis", "Citation Embedding", "Tone Alignment"]
        },
        {
            id: "validation",
            name: "Strict Gate Validator",
            icon: ShieldCheck,
            color: "destructive",
            desc: "Enforces regulatory constraints and data quality rules. Blocks the workflow if safety signals or data gaps are detected.",
            capabilities: ["Constraint Checking", "Completeness Audit", "Signal Detection"]
        }
    ];

    const activeAgentData = agents.find(a => a.id === activeAgent) || agents[0];

    // Computed kernel health from real status
    const kernelHealth = orchestratorStatus ? [
        { label: "Kernel Initialized", val: orchestratorStatus.initialized ? "Active" : "Inactive" },
        { label: "EU Obligations", val: String(orchestratorStatus.euObligations) },
        { label: "UK Obligations", val: String(orchestratorStatus.ukObligations) },
        { label: "Constraints", val: String(orchestratorStatus.constraints) }
    ] : [
        { label: "Kernel Status", val: "Loading..." }
    ];

    return (
        <div className="h-full overflow-hidden flex flex-col space-y-6 max-w-6xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary font-black tracking-tighter uppercase text-xs">
                    <Cpu className="w-3 h-3" />
                    System Architecture
                </div>
                <h1 className="text-3xl font-black tracking-tighter text-foreground">Multi-Agent Intelligence</h1>
                <p className="text-muted-foreground text-sm font-medium">High-fidelity decision engine powered by neural orchestration.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Agent Selection & Info */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {agents.map((agent) => (
                            <button
                                key={agent.id}
                                onClick={() => setActiveAgent(agent.id)}
                                className={cn(
                                    "p-4 rounded-2xl border transition-all duration-300 text-left group",
                                    activeAgent === agent.id 
                                        ? "bg-primary/5 border-primary/20 shadow-lg shadow-primary/5" 
                                        : "bg-background border-border/50 hover:border-primary/20"
                                )}
                            >
                                <agent.icon className={cn(
                                    "w-6 h-6 mb-3 transition-colors",
                                    activeAgent === agent.id ? "text-primary" : "text-muted-foreground group-hover:text-primary/60"
                                )} />
                                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{agent.id}</div>
                                <div className="text-sm font-black tracking-tight text-foreground">{agent.name}</div>
                            </button>
                        ))}
                    </div>

                    <div className="glass-card p-8 min-h-[300px] flex flex-col justify-between animate-slide-up" key={activeAgent}>
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner",
                                    activeAgentData.color === "blue" && "bg-blue-500/10 text-blue-600",
                                    activeAgentData.color === "emerald" && "bg-emerald-500/10 text-emerald-600",
                                    activeAgentData.color === "amber" && "bg-amber-500/10 text-amber-600",
                                    activeAgentData.color === "destructive" && "bg-destructive/10 text-destructive",
                                )} >
                                    <activeAgentData.icon className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black tracking-tight text-foreground">{activeAgentData.name}</h3>
                                    <div className="flex gap-2 mt-1">
                                        <Badge variant="outline" className="text-[8px] font-black tracking-widest uppercase">ACTIVE_NODE</Badge>
                                        <Badge variant="outline" className="text-[8px] font-black tracking-widest uppercase">STATELESS</Badge>
                                    </div>
                                </div>
                            </div>
                            
                            <p className="text-muted-foreground font-medium leading-relaxed italic">"{activeAgentData.desc}"</p>
                            
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">Core Capabilities</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {activeAgentData.capabilities.map((cap, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30 group hover:border-primary/20 transition-all">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                                            <span className="text-xs font-black text-foreground/80">{cap}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-border/30 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="text-center">
                                    <div className="text-lg font-black tracking-tighter text-foreground">
                                        {orchestratorStatus?.euObligations ?? "-"}
                                    </div>
                                    <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">EU Obligations</div>
                                </div>
                                <div className="w-px h-8 bg-border/30" />
                                <div className="text-center">
                                    <div className="text-lg font-black tracking-tighter text-foreground">
                                        {orchestratorStatus?.constraints ?? "-"}
                                    </div>
                                    <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Constraints</div>
                                </div>
                            </div>
                            <Link href="/instructions">
                                <button className="flex items-center gap-2 text-xs font-black text-primary hover:gap-3 transition-all">
                                    View Documentation <ExternalLink className="w-3 h-3" />
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Decision Tracing Explanation */}
                <div className="space-y-6">
                    <div className="glass-card p-6 bg-slate-950 text-slate-50 border-none shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <History className="w-24 h-24" />
                        </div>
                        
                        <div className="relative z-10 space-y-6">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-primary font-black tracking-tighter uppercase text-[10px]">
                                    <Terminal className="w-3 h-3" />
                                    Immutable Audit Trail
                                </div>
                                <h3 className="text-xl font-black tracking-tight italic">Decision Tracing</h3>
                            </div>
                            
                            <p className="text-xs text-slate-400 font-medium leading-relaxed">
                                Every decision made by the agent system is hashed and recorded in a sequential audit trail. This provides 100% transparency for regulatory submissions.
                            </p>

                            <div className="space-y-3">
                                {tracesLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                    </div>
                                ) : recentTraces.length > 0 ? (
                                    recentTraces.map((t, i) => (
                                        <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1 hover:bg-white/10 transition-all cursor-default">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[8px] font-black text-primary tracking-widest">{t.type}</span>
                                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{t.decision}</span>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-200 line-clamp-1">{t.summary}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-6 text-slate-500 text-xs">
                                        No recent traces. Run a PSUR workflow to generate decision traces.
                                    </div>
                                )}
                            </div>

                            <Link href="/traces">
                                <button className="w-full py-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all active:translate-y-0">
                                    {activePsurCase ? "View Full Trace Log" : "Go to Decision Traces"}
                                </button>
                            </Link>
                        </div>
                    </div>

                    <div className="glass-card p-6 border-emerald-500/20 bg-emerald-500/[0.02]">
                        <div className="flex items-center gap-3 mb-4">
                            <Activity className="w-4 h-4 text-emerald-600" />
                            <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Kernel Health</h4>
                        </div>
                        <div className="space-y-4">
                            {statusLoading ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                </div>
                            ) : (
                                kernelHealth.map((stat, i) => (
                                    <div key={i} className="flex items-center justify-between text-[10px] font-black">
                                        <span className="text-muted-foreground uppercase tracking-widest">{stat.label}</span>
                                        <span className={cn(
                                            stat.val === "Active" || stat.val === "Verified" || stat.val === "Optimal" || stat.val === "100%" 
                                                ? "text-emerald-600" 
                                                : stat.val === "Inactive" || stat.val === "Loading..." 
                                                    ? "text-amber-500" 
                                                    : "text-foreground"
                                        )}>{stat.val}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
