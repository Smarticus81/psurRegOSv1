/**
 * Global Agent Activity Monitor
 * 
 * Real-time system-wide view of all active AI agents across all PSUR workflows.
 * Shows which agents are currently running, their status, and performance metrics.
 */

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
    Activity,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Zap,
    Brain,
    Database,
    FileText,
    Table2,
    BarChart3,
    AlertCircle,
    TrendingUp,
    Sparkles,
    Trash2,
} from "lucide-react";

interface ActiveAgent {
    psurCaseId: number;
    runId: string;
    agentName: string;
    phase: string;
    slotId: string;
    slotTitle: string;
    status: "created" | "started" | "running" | "completed" | "failed";
    startedAt: number;
    completedAt?: number;
    durationMs?: number;
    error?: string;
}

interface WorkflowInfo {
    psurCaseId: number;
    status: string;
    agentCount: number;
    lastActivity: number;
}

// LocalStorage keys
const STORAGE_KEY_COMPLETED = 'agent-activity-completed';
const STORAGE_KEY_FAILED = 'agent-activity-failed';
const STORAGE_KEY_STATS = 'agent-activity-stats';

// Helper functions for localStorage
const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.warn(`Failed to load ${key} from localStorage:`, error);
        return defaultValue;
    }
};

const saveToStorage = <T,>(key: string, value: T): void => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`Failed to save ${key} to localStorage:`, error);
    }
};

export default function AgentActivityPage() {
    const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([]);
    const [completedAgents, setCompletedAgents] = useState<ActiveAgent[]>(() => 
        loadFromStorage<ActiveAgent[]>(STORAGE_KEY_COMPLETED, [])
    );
    const [failedAgents, setFailedAgents] = useState<ActiveAgent[]>(() => 
        loadFromStorage<ActiveAgent[]>(STORAGE_KEY_FAILED, [])
    );
    const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
    const eventSourcesRef = useRef<Map<number, EventSource>>(new Map());
    const [systemStats, setSystemStats] = useState(() => 
        loadFromStorage(STORAGE_KEY_STATS, {
            totalProcessed: 0,
            avgDuration: 0,
            successRate: 100,
        })
    );
    
    // Connect to all active PSUR cases
    useEffect(() => {
        const fetchActiveCases = async () => {
            try {
                const res = await fetch("/api/psur-cases");
                if (!res.ok) return;
                
                const cases = await res.json();
                
                // Update workflows info
                const workflowsInfo = cases
                    .filter((c: any) => c.status === "GENERATING" || c.status === "RUNNING")
                    .map((c: any) => ({
                        psurCaseId: c.id,
                        status: c.status,
                        agentCount: activeAgents.filter(a => a.psurCaseId === c.id).length,
                        lastActivity: Date.now(),
                    }));
                
                setWorkflows(workflowsInfo);
                
                // Connect to each active case's stream
                workflowsInfo.forEach((workflow: WorkflowInfo) => {
                    if (!eventSourcesRef.current.has(workflow.psurCaseId)) {
                        const es = new EventSource(`/api/orchestrator/cases/${workflow.psurCaseId}/stream`);
                        
                        es.addEventListener("runtime", (msg: any) => {
                            try {
                                const event = JSON.parse(msg.data);
                                handleRuntimeEvent(workflow.psurCaseId, event);
                            } catch (e) {
                                console.error("Failed to parse runtime event:", e);
                            }
                        });
                        
                        es.onerror = () => {
                            console.warn(`Stream closed for case ${workflow.psurCaseId}`);
                            eventSourcesRef.current.get(workflow.psurCaseId)?.close();
                            eventSourcesRef.current.delete(workflow.psurCaseId);
                        };
                        
                        eventSourcesRef.current.set(workflow.psurCaseId, es);
                    }
                });
                
                // Clean up closed connections
                const activeCaseIds = new Set(workflowsInfo.map((w: WorkflowInfo) => w.psurCaseId));
                eventSourcesRef.current.forEach((es, caseId) => {
                    if (!activeCaseIds.has(caseId)) {
                        es.close();
                        eventSourcesRef.current.delete(caseId);
                    }
                });
            } catch (e) {
                console.error("Failed to fetch active cases:", e);
            }
        };
        
        fetchActiveCases();
        const interval = setInterval(fetchActiveCases, 5000);
        
        return () => {
            clearInterval(interval);
            eventSourcesRef.current.forEach(es => es.close());
        };
    }, [activeAgents]);
    
    // Persist completed agents to localStorage
    useEffect(() => {
        saveToStorage(STORAGE_KEY_COMPLETED, completedAgents);
    }, [completedAgents]);
    
    // Persist failed agents to localStorage
    useEffect(() => {
        saveToStorage(STORAGE_KEY_FAILED, failedAgents);
    }, [failedAgents]);
    
    // Update system stats
    useEffect(() => {
        const total = completedAgents.length + failedAgents.length;
        const avgDur = completedAgents.length > 0
            ? completedAgents.reduce((sum, a) => sum + (a.durationMs || 0), 0) / completedAgents.length
            : 0;
        const successRate = total > 0
            ? (completedAgents.length / total) * 100
            : 100;
        
        const newStats = {
            totalProcessed: total,
            avgDuration: avgDur,
            successRate,
        };
        
        setSystemStats(newStats);
        saveToStorage(STORAGE_KEY_STATS, newStats);
    }, [completedAgents, failedAgents]);
    
    const handleRuntimeEvent = (psurCaseId: number, event: any) => {
        if (event.kind === "agent.created" || event.kind === "agent.started") {
            const agent: ActiveAgent = {
                psurCaseId,
                runId: event.runId,
                agentName: event.agent || "Unknown Agent",
                phase: event.phase,
                slotId: event.slotId,
                slotTitle: event.slotId?.replace(/_/g, " ") || "Unknown Slot",
                status: event.kind === "agent.created" ? "created" : "started",
                startedAt: event.ts,
            };
            
            setActiveAgents(prev => {
                const existing = prev.find(a => a.runId === event.runId);
                if (existing) {
                    return prev.map(a => a.runId === event.runId ? { ...a, status: "started" } : a);
                }
                return [...prev, agent];
            });
        }
        
        if (event.kind === "agent.completed") {
            setActiveAgents(prev => {
                const agent = prev.find(a => a.runId === event.runId);
                if (agent) {
                    const completed = {
                        ...agent,
                        status: "completed" as const,
                        completedAt: event.ts,
                        durationMs: event.durationMs,
                    };
                    setCompletedAgents(p => [completed, ...p].slice(0, 100));
                    return prev.filter(a => a.runId !== event.runId);
                }
                return prev;
            });
        }
        
        if (event.kind === "agent.failed") {
            setActiveAgents(prev => {
                const agent = prev.find(a => a.runId === event.runId);
                if (agent) {
                    const failed = {
                        ...agent,
                        status: "failed" as const,
                        error: event.error,
                        completedAt: event.ts,
                    };
                    setFailedAgents(p => [failed, ...p].slice(0, 50));
                    return prev.filter(a => a.runId !== event.runId);
                }
                return prev;
            });
        }
    };
    
    const getPhaseIcon = (phase: string) => {
        switch (phase) {
            case "narrative": return FileText;
            case "table": return Table2;
            case "chart": return BarChart3;
            default: return Brain;
        }
    };
    
    const getPhaseColor = (phase: string) => {
        switch (phase) {
            case "narrative": return "text-purple-500 bg-purple-100 dark:bg-purple-900/20";
            case "table": return "text-blue-500 bg-blue-100 dark:bg-blue-900/20";
            case "chart": return "text-emerald-500 bg-emerald-100 dark:bg-emerald-900/20";
            default: return "text-gray-500 bg-gray-100 dark:bg-gray-900/20";
        }
    };
    
    const handleClearHistory = () => {
        if (confirm("Clear all agent history? This will remove completed and failed agent records. Active agents will not be affected.")) {
            setCompletedAgents([]);
            setFailedAgents([]);
            localStorage.removeItem(STORAGE_KEY_COMPLETED);
            localStorage.removeItem(STORAGE_KEY_FAILED);
            localStorage.removeItem(STORAGE_KEY_STATS);
        }
    };
    
    return (
        <div className="container mx-auto p-6 space-y-6 max-w-[1800px]">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                        <Activity className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Agent Activity Monitor</h1>
                        <p className="text-sm text-muted-foreground">
                            Real-time system-wide view of all AI agents across workflows
                        </p>
                    </div>
                </div>
                
                {(completedAgents.length > 0 || failedAgents.length > 0) && (
                    <button
                        onClick={handleClearHistory}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-destructive/10 hover:border-destructive/30 text-muted-foreground hover:text-destructive transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-sm font-medium">Clear History</span>
                    </button>
                )}
            </div>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card rounded-xl border p-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-muted-foreground">Active Now</div>
                        <Zap className="w-4 h-4 text-primary animate-pulse" />
                    </div>
                    <div className="text-4xl font-bold text-primary tabular-nums">
                        {activeAgents.length}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        {workflows.length} active workflows
                    </div>
                </div>
                
                <div className="glass-card rounded-xl border p-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-muted-foreground">Completed</div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="text-4xl font-bold text-emerald-500 tabular-nums">
                        {completedAgents.length}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        {systemStats.successRate.toFixed(1)}% success rate
                    </div>
                    {completedAgents.length > 0 && (
                        <div className="text-[10px] text-muted-foreground/60 mt-2 flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            <span>Persisted across sessions</span>
                        </div>
                    )}
                </div>
                
                <div className="glass-card rounded-xl border p-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-muted-foreground">Avg Duration</div>
                        <Clock className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="text-4xl font-bold text-blue-500 tabular-nums">
                        {(systemStats.avgDuration / 1000).toFixed(1)}s
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        per agent execution
                    </div>
                </div>
                
                <div className="glass-card rounded-xl border p-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-muted-foreground">Failed</div>
                        <AlertCircle className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="text-4xl font-bold text-red-500 tabular-nums">
                        {failedAgents.length}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        requiring attention
                    </div>
                </div>
            </div>
            
            {/* Active Agents */}
            <div className="glass-card rounded-xl border">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-primary animate-pulse" />
                            <h2 className="text-lg font-bold">Currently Running</h2>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {activeAgents.length} active {activeAgents.length === 1 ? "agent" : "agents"}
                        </div>
                    </div>
                </div>
                
                <div className="p-6">
                    {activeAgents.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                                <Brain className="w-8 h-8 text-muted-foreground/50" />
                            </div>
                            <p className="text-lg font-medium text-foreground mb-1">No Active Agents</p>
                            <p className="text-sm text-muted-foreground">
                                Agents will appear here when workflows are running
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {activeAgents.map(agent => {
                                const PhaseIcon = getPhaseIcon(agent.phase);
                                const elapsed = Date.now() - agent.startedAt;
                                
                                return (
                                    <div
                                        key={agent.runId}
                                        className="p-5 rounded-xl border-2 border-primary bg-gradient-to-br from-primary/10 to-primary/5 shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className={cn(
                                                "flex items-center gap-2 px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wide",
                                                getPhaseColor(agent.phase)
                                            )}>
                                                <PhaseIcon className="w-3.5 h-3.5" />
                                                {agent.phase}
                                            </div>
                                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                        </div>
                                        
                                        <div className="mb-3">
                                            <div className="text-sm font-bold text-foreground mb-1 line-clamp-1">
                                                {agent.agentName}
                                            </div>
                                            <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                                {agent.slotTitle}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between pt-3 border-t border-border/50">
                                            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5" />
                                                <span className="font-mono font-semibold">{(elapsed / 1000).toFixed(1)}s</span>
                                            </div>
                                            <div className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                                                Case #{agent.psurCaseId}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Recently Completed */}
            <div className="glass-card rounded-xl border">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-lg font-bold">Recently Completed</h2>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Last {completedAgents.length} executions
                        </div>
                    </div>
                </div>
                
                <div className="p-6">
                    {completedAgents.length === 0 ? (
                        <div className="text-center py-12">
                            <Sparkles className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No completed agents yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                            {completedAgents.map(agent => {
                                const PhaseIcon = getPhaseIcon(agent.phase);
                                
                                return (
                                    <div
                                        key={agent.runId}
                                        className="p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 transition-colors group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                            <div className={cn(
                                                "p-1.5 rounded",
                                                getPhaseColor(agent.phase)
                                            )}>
                                                <PhaseIcon className="w-3 h-3" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-foreground truncate">
                                                    {agent.agentName}
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {agent.slotTitle} · Case #{agent.psurCaseId}
                                                </div>
                                            </div>
                                            <div className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 shrink-0 bg-emerald-500/10 px-2 py-1 rounded">
                                                {agent.durationMs ? `${(agent.durationMs / 1000).toFixed(2)}s` : "-"}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Failed Agents */}
            {failedAgents.length > 0 && (
                <div className="glass-card rounded-xl border border-red-500/30">
                    <div className="px-6 py-4 border-b bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-red-500" />
                                <h2 className="text-lg font-bold">Failed Agents</h2>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {failedAgents.length} failures
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-6">
                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                            {failedAgents.map(agent => {
                                const PhaseIcon = getPhaseIcon(agent.phase);
                                
                                return (
                                    <div
                                        key={agent.runId}
                                        className="p-3 rounded-lg border bg-red-500/5 border-red-500/20 hover:bg-red-500/10 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                            <div className={cn(
                                                "p-1.5 rounded",
                                                getPhaseColor(agent.phase)
                                            )}>
                                                <PhaseIcon className="w-3 h-3" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-foreground truncate">
                                                    {agent.agentName}
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {agent.slotTitle} · Case #{agent.psurCaseId}
                                                </div>
                                            </div>
                                        </div>
                                        {agent.error && (
                                            <div className="ml-7 text-xs text-red-600 dark:text-red-400 bg-red-500/5 px-2 py-1 rounded border border-red-500/20">
                                                {agent.error}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
