/**
 * SOTA Real-Time Compilation Viewer
 * 
 * Shows live progress of PSUR document generation with:
 * - Phase tracking (Narratives, Tables, Charts, Formatting)
 * - Individual agent progress with confidence scores
 * - Live section preview as content is generated
 * - Performance metrics and timing
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
    FileText,
    Table2,
    BarChart3,
    FileCheck,
    CheckCircle2,
    Loader2,
    Clock,
    Zap,
    TrendingUp,
    ChevronDown,
    ChevronRight,
    Sparkles,
    Database,
    Eye,
} from "lucide-react";

interface CompilationPhase {
    phase: "narratives" | "tables" | "charts" | "formatting" | "complete";
    status: "pending" | "active" | "complete";
    startedAt?: number;
    completedAt?: number;
}

interface AgentProgress {
    agentName: string;
    slotId: string;
    slotTitle: string;
    type: "narrative" | "table" | "chart";
    status: "pending" | "generating" | "complete" | "failed";
    confidence?: number;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
    dataPoints?: number;
    wordCount?: number;
    error?: string;
}

interface LiveSection {
    slotId: string;
    title: string;
    content: string;
    status: "pending" | "generating" | "done";
}

interface CompilationRuntimeViewerProps {
    psurCaseId: number;
    isGenerating: boolean;
}

export function CompilationRuntimeViewer({ psurCaseId, isGenerating }: CompilationRuntimeViewerProps) {
    const [phases, setPhases] = useState<CompilationPhase[]>([
        { phase: "narratives", status: "pending" },
        { phase: "tables", status: "pending" },
        { phase: "charts", status: "pending" },
        { phase: "formatting", status: "pending" },
        { phase: "complete", status: "pending" },
    ]);
    const [agents, setAgents] = useState<AgentProgress[]>([]);
    const [sections, setSections] = useState<LiveSection[]>([]);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [runtimeEvents, setRuntimeEvents] = useState<any[]>([]);
    const [totalStartTime, setTotalStartTime] = useState<number | null>(null);
    
    // Connect to real-time runtime events (SSE)
    useEffect(() => {
        if (!psurCaseId) return;
        
        const es = new EventSource(`/api/orchestrator/cases/${psurCaseId}/stream`);
        
        es.addEventListener("runtime", (msg: any) => {
            try {
                const event = JSON.parse(msg.data);
                setRuntimeEvents(prev => [event, ...prev].slice(0, 100));
                
                // Process runtime events to update agent progress
                if (event.kind === "agent.started") {
                    const agentType = event.phase as "narrative" | "table" | "chart";
                    setAgents(prev => {
                        const existing = prev.find(a => a.slotId === event.slotId && a.type === agentType);
                        if (existing) {
                            return prev.map(a => 
                                a.slotId === event.slotId && a.type === agentType
                                    ? { ...a, status: "generating" as const, startedAt: event.ts }
                                    : a
                            );
                        }
                        return [...prev, {
                            agentName: event.agent,
                            slotId: event.slotId,
                            slotTitle: event.slotId.replace(/MDCG\.ANNEXI\./g, "").replace(/_/g, " "),
                            type: agentType,
                            status: "generating" as const,
                            startedAt: event.ts,
                        }];
                    });
                    
                    // Update phases based on agent type
                    if (agentType === "narrative") {
                        setPhases(prev => prev.map(p => 
                            p.phase === "narratives" && p.status === "pending" 
                                ? { ...p, status: "active" as const, startedAt: event.ts }
                                : p
                        ));
                    } else if (agentType === "table") {
                        setPhases(prev => prev.map(p => 
                            p.phase === "narratives" && p.status === "active"
                                ? { ...p, status: "complete" as const, completedAt: event.ts }
                                : p.phase === "tables" && p.status === "pending"
                                ? { ...p, status: "active" as const, startedAt: event.ts }
                                : p
                        ));
                    } else if (agentType === "chart") {
                        setPhases(prev => prev.map(p => 
                            p.phase === "tables" && p.status === "active"
                                ? { ...p, status: "complete" as const, completedAt: event.ts }
                                : p.phase === "charts" && p.status === "pending"
                                ? { ...p, status: "active" as const, startedAt: event.ts }
                                : p
                        ));
                    }
                }
                
                if (event.kind === "agent.completed") {
                    const agentType = event.phase as "narrative" | "table" | "chart";
                    setAgents(prev => prev.map(a => 
                        a.slotId === event.slotId && a.type === agentType
                            ? { ...a, status: "complete" as const, completedAt: event.ts, durationMs: event.durationMs }
                            : a
                    ));
                }
                
                if (event.kind === "agent.failed") {
                    const agentType = event.phase as "narrative" | "table" | "chart";
                    setAgents(prev => prev.map(a => 
                        a.slotId === event.slotId && a.type === agentType
                            ? { ...a, status: "failed" as const, error: event.error }
                            : a
                    ));
                }
                
                if (event.kind === "workflow.started") {
                    setTotalStartTime(event.ts);
                }
            } catch (e) {
                console.error("Failed to parse runtime event:", e);
            }
        });
        
        return () => es.close();
    }, [psurCaseId]);
    
    // Fetch live content for preview
    useEffect(() => {
        if (!psurCaseId || !isGenerating) return;
        
        const fetchLiveContent = async () => {
            try {
                const res = await fetch(`/api/psur-cases/${psurCaseId}/live-content`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.sections && Array.isArray(data.sections)) {
                        setSections(data.sections);
                    }
                }
            } catch (e) {
                // Silent fail
            }
        };
        
        fetchLiveContent();
        const interval = setInterval(fetchLiveContent, 1000); // Poll every 1s for live updates
        
        return () => clearInterval(interval);
    }, [psurCaseId, isGenerating]);
    
    const narrativeAgents = agents.filter(a => a.type === "narrative");
    const tableAgents = agents.filter(a => a.type === "table");
    const chartAgents = agents.filter(a => a.type === "chart");
    
    const narrativesComplete = narrativeAgents.every(a => a.status === "complete");
    const tablesComplete = tableAgents.every(a => a.status === "complete");
    const chartsComplete = chartAgents.every(a => a.status === "complete");
    
    const currentPhase = phases.find(p => p.status === "active");
    const elapsed = totalStartTime ? Date.now() - totalStartTime : 0;
    
    const getPhaseIcon = (phase: string) => {
        switch (phase) {
            case "narratives": return Sparkles;
            case "tables": return Table2;
            case "charts": return BarChart3;
            case "formatting": return FileCheck;
            case "complete": return CheckCircle2;
            default: return FileText;
        }
    };
    
    const getAgentStatusColor = (status: string) => {
        switch (status) {
            case "complete": return "text-emerald-500";
            case "generating": return "text-primary animate-pulse";
            case "failed": return "text-red-500";
            default: return "text-muted-foreground";
        }
    };
    
    return (
        <div className="glass-card overflow-hidden rounded-2xl border border-border/30">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold text-foreground">Compilation Runtime</h3>
                            <p className="text-xs text-muted-foreground">Real-time document generation</p>
                        </div>
                    </div>
                    {totalStartTime && (
                        <div className="text-right">
                            <div className="text-2xl font-bold text-primary tabular-nums">
                                {Math.floor(elapsed / 1000)}s
                            </div>
                            <div className="text-xs text-muted-foreground">elapsed</div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Phase Progress */}
            <div className="p-6 border-b border-border/30">
                <div className="flex items-center gap-2 mb-4">
                    <div className="text-sm font-semibold text-foreground">Pipeline Status</div>
                </div>
                <div className="flex items-center gap-2">
                    {phases.slice(0, 4).map((phase, idx) => {
                        const Icon = getPhaseIcon(phase.phase);
                        const isActive = phase.status === "active";
                        const isComplete = phase.status === "complete";
                        
                        return (
                            <div key={phase.phase} className="flex items-center flex-1">
                                <div className={cn(
                                    "flex-1 rounded-xl p-4 transition-all",
                                    isActive && "bg-primary/10 border-2 border-primary shadow-lg shadow-primary/20",
                                    isComplete && "bg-emerald-500/10 border border-emerald-500/30",
                                    !isActive && !isComplete && "bg-muted/30 border border-border/30"
                                )}>
                                    <div className="flex items-center gap-2">
                                        <Icon className={cn(
                                            "w-4 h-4",
                                            isActive && "text-primary animate-pulse",
                                            isComplete && "text-emerald-500",
                                            !isActive && !isComplete && "text-muted-foreground"
                                        )} />
                                        <div className="text-xs font-medium capitalize">
                                            {phase.phase}
                                        </div>
                                        {isActive && (
                                            <Loader2 className="w-3 h-3 text-primary animate-spin ml-auto" />
                                        )}
                                        {isComplete && (
                                            <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto" />
                                        )}
                                    </div>
                                </div>
                                {idx < 3 && (
                                    <div className={cn(
                                        "w-8 h-0.5 transition-all",
                                        isComplete ? "bg-emerald-500" : "bg-border/30"
                                    )} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {/* Active Agents */}
            {agents.length > 0 && (
                <div className="p-6 border-b border-border/30">
                    <div className="flex items-center gap-2 mb-4">
                        <Database className="w-4 h-4 text-primary" />
                        <div className="text-sm font-semibold text-foreground">Active Processing</div>
                        <div className="text-xs text-muted-foreground ml-auto">
                            {agents.filter(a => a.status === "complete").length} / {agents.length} complete
                        </div>
                    </div>
                    
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {/* Narratives */}
                        {narrativeAgents.length > 0 && (
                            <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                                    <Sparkles className="w-3 h-3" />
                                    Narratives ({narrativeAgents.filter(a => a.status === "complete").length}/{narrativeAgents.length})
                                </div>
                                {narrativeAgents.map(agent => (
                                    <div key={`${agent.slotId}-narrative`} className={cn(
                                        "p-3 rounded-lg border transition-all",
                                        agent.status === "complete" && "bg-emerald-500/5 border-emerald-500/30",
                                        agent.status === "generating" && "bg-primary/5 border-primary/30 shadow-md",
                                        agent.status === "pending" && "bg-muted/30 border-border/30",
                                        agent.status === "failed" && "bg-red-500/5 border-red-500/30"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            {agent.status === "generating" && (
                                                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                                            )}
                                            {agent.status === "complete" && (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                            )}
                                            {agent.status === "pending" && (
                                                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-foreground truncate">
                                                    {agent.slotTitle}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                    {agent.wordCount && `${agent.wordCount} words · `}
                                                    {agent.confidence && `${agent.confidence}% confidence`}
                                                    {agent.durationMs && ` · ${(agent.durationMs / 1000).toFixed(1)}s`}
                                                </div>
                                            </div>
                                            {agent.confidence !== undefined && (
                                                <div className={cn(
                                                    "text-xs font-bold px-2 py-1 rounded",
                                                    agent.confidence >= 90 ? "bg-emerald-100 text-emerald-700" :
                                                    agent.confidence >= 70 ? "bg-amber-100 text-amber-700" :
                                                    "bg-red-100 text-red-700"
                                                )}>
                                                    {agent.confidence}%
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {/* Tables */}
                        {tableAgents.length > 0 && (
                            <div className="space-y-1 mt-4">
                                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                                    <Table2 className="w-3 h-3" />
                                    Tables ({tableAgents.filter(a => a.status === "complete").length}/{tableAgents.length})
                                </div>
                                {tableAgents.map(agent => (
                                    <div key={`${agent.slotId}-table`} className={cn(
                                        "p-3 rounded-lg border transition-all",
                                        agent.status === "complete" && "bg-emerald-500/5 border-emerald-500/30",
                                        agent.status === "generating" && "bg-primary/5 border-primary/30 shadow-md",
                                        agent.status === "pending" && "bg-muted/30 border-border/30"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            {agent.status === "generating" && (
                                                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                                            )}
                                            {agent.status === "complete" && (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-foreground truncate">
                                                    {agent.slotTitle}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                    {agent.dataPoints && `${agent.dataPoints} rows`}
                                                    {agent.durationMs && ` · ${(agent.durationMs / 1000).toFixed(1)}s`}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {/* Charts */}
                        {chartAgents.length > 0 && (
                            <div className="space-y-1 mt-4">
                                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                                    <BarChart3 className="w-3 h-3" />
                                    Charts ({chartAgents.filter(a => a.status === "complete").length}/{chartAgents.length})
                                </div>
                                {chartAgents.map(agent => (
                                    <div key={`${agent.slotId}-chart`} className={cn(
                                        "p-3 rounded-lg border transition-all",
                                        agent.status === "complete" && "bg-emerald-500/5 border-emerald-500/30",
                                        agent.status === "generating" && "bg-primary/5 border-primary/30 shadow-md",
                                        agent.status === "pending" && "bg-muted/30 border-border/30"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            {agent.status === "generating" && (
                                                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                                            )}
                                            {agent.status === "complete" && (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-foreground truncate">
                                                    {agent.slotTitle}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                    {agent.dataPoints && `${agent.dataPoints} data points`}
                                                    {agent.durationMs && ` · ${(agent.durationMs / 1000).toFixed(1)}s`}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* Live Section Preview */}
            {sections.length > 0 && (
                <div className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Eye className="w-4 h-4 text-primary" />
                        <div className="text-sm font-semibold text-foreground">Live Preview</div>
                        <div className="text-xs text-muted-foreground ml-auto">
                            {sections.filter(s => s.status === "done").length} / {sections.length} sections ready
                        </div>
                    </div>
                    
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                        {sections.map(section => (
                            <div key={section.slotId} className="border border-border/30 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => {
                                        setExpandedSections(prev => {
                                            const next = new Set(prev);
                                            if (next.has(section.slotId)) {
                                                next.delete(section.slotId);
                                            } else {
                                                next.add(section.slotId);
                                            }
                                            return next;
                                        });
                                    }}
                                    className="w-full p-3 flex items-center gap-3 hover:bg-secondary/50 transition-colors"
                                >
                                    {expandedSections.has(section.slotId) ? (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                    )}
                                    <div className={cn(
                                        "w-2 h-2 rounded-full shrink-0",
                                        section.status === "done" && "bg-emerald-500",
                                        section.status === "generating" && "bg-primary animate-pulse",
                                        section.status === "pending" && "bg-muted-foreground"
                                    )} />
                                    <div className="flex-1 text-left">
                                        <div className="text-sm font-medium text-foreground">
                                            {section.title}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {section.status === "done" && section.content && `${section.content.split(" ").length} words`}
                                            {section.status === "generating" && "Generating..."}
                                            {section.status === "pending" && "Waiting"}
                                        </div>
                                    </div>
                                </button>
                                
                                {expandedSections.has(section.slotId) && section.content && (
                                    <div className="px-6 py-4 bg-secondary/20 border-t border-border/30">
                                        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                            {section.content.substring(0, 500)}
                                            {section.content.length > 500 && "..."}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Performance Summary */}
            {!isGenerating && agents.length > 0 && (
                <div className="px-6 py-4 bg-emerald-50 border-t border-emerald-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            <span className="text-sm font-semibold text-emerald-900">
                                Compilation Complete
                            </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-emerald-700">
                            <div className="flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                {narrativeAgents.length} narratives
                            </div>
                            <div className="flex items-center gap-1">
                                <Table2 className="w-3 h-3" />
                                {tableAgents.length} tables
                            </div>
                            <div className="flex items-center gap-1">
                                <BarChart3 className="w-3 h-3" />
                                {chartAgents.length} charts
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {(elapsed / 1000).toFixed(0)}s total
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
