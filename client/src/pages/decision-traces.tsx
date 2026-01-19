/**
 * Decision Traces Page - Natural Language Audit Trail Viewer
 * 
 * Provides comprehensive view of all PSUR workflow decisions with:
 * - Natural language summaries
 * - Timeline view grouped by workflow steps
 * - Search functionality
 * - Entity-level drill down
 * - Compliance tracking
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface TraceEntry {
    id: number;
    traceId: string;
    sequenceNum: number;
    eventType: string;
    timestamp: string;
    actor: string;
    entityType: string | null;
    entityId: string | null;
    decision: string | null;
    humanSummary: string | null;
    regulatoryContext: any;
    complianceAssertion: any;
    reasons: string[] | null;
    workflowStep: number | null;
}

interface TraceSummary {
    traceId: string;
    workflowStatus: string;
    totalEvents: number;
    acceptedSlots: number;
    rejectedSlots: number;
    traceGaps: number;
    evidenceAtoms: number;
    negativeEvidence: number;
    obligationsSatisfied: number;
    obligationsUnsatisfied: number;
    completedSteps: number[];
    chainValid: boolean;
    startedAt: string | null;
    completedAt: string | null;
    failedStep: number | null;
    failureReason: string | null;
}

interface TimelineStep {
    step: number;
    name: string;
    eventCount: number;
    events: TraceEntry[];
    hasMore: boolean;
}

const STEP_COLORS: Record<number, string> = {
    0: "text-slate-500",
    1: "text-blue-500",
    2: "text-purple-500",
    3: "text-green-500",
    4: "text-amber-500",
    5: "text-orange-500",
    6: "text-teal-500",
    7: "text-indigo-500",
    8: "text-pink-500",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
    WORKFLOW_STARTED: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    TEMPLATE_QUALIFIED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    TEMPLATE_BLOCKED: "bg-red-500/10 text-red-600 border-red-500/20",
    CASE_CREATED: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    EVIDENCE_UPLOADED: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
    EVIDENCE_ATOM_CREATED: "bg-green-500/10 text-green-600 border-green-500/20",
    NEGATIVE_EVIDENCE_CREATED: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    SLOT_PROPOSED: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    TRACE_GAP_DETECTED: "bg-red-500/10 text-red-600 border-red-500/20",
    SLOT_ACCEPTED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    SLOT_REJECTED: "bg-red-500/10 text-red-600 border-red-500/20",
    OBLIGATION_SATISFIED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    OBLIGATION_UNSATISFIED: "bg-red-500/10 text-red-600 border-red-500/20",
    COVERAGE_COMPUTED: "bg-teal-500/10 text-teal-600 border-teal-500/20",
    DOCUMENT_RENDERED: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    BUNDLE_EXPORTED: "bg-pink-500/10 text-pink-600 border-pink-500/20",
    WORKFLOW_COMPLETED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    WORKFLOW_FAILED: "bg-red-500/10 text-red-600 border-red-500/20",
};

export default function DecisionTracesPage() {
    const [psurCaseId, setPsurCaseId] = useState<number | null>(null);
    const [availableCases, setAvailableCases] = useState<any[]>([]);
    const [summary, setSummary] = useState<TraceSummary | null>(null);
    const [timeline, setTimeline] = useState<TimelineStep[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<TraceEntry[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeView, setActiveView] = useState<"timeline" | "search" | "narrative">("timeline");
    const [narrative, setNarrative] = useState<string>("");
    const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
    const [selectedEntry, setSelectedEntry] = useState<TraceEntry | null>(null);

    // Load available PSUR cases
    useEffect(() => {
        fetch("/api/psur-cases")
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setAvailableCases(data);
                    if (data.length > 0 && !psurCaseId) {
                        setPsurCaseId(data[0].id);
                    }
                }
            })
            .catch(console.error);
    }, []);

    // Load trace data when case changes
    useEffect(() => {
        if (!psurCaseId) return;
        setLoading(true);
        
        Promise.all([
            fetch(`/api/psur-cases/${psurCaseId}/decision-traces/summary`).then(r => r.json()),
            fetch(`/api/psur-cases/${psurCaseId}/decision-traces/timeline`).then(r => r.json()),
        ])
            .then(([summaryData, timelineData]) => {
                if (summaryData.summary) setSummary(summaryData.summary);
                if (timelineData.timeline) setTimeline(timelineData.timeline);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [psurCaseId]);

    // Search function
    const handleSearch = useCallback(async () => {
        if (!psurCaseId || !searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const res = await fetch(`/api/psur-cases/${psurCaseId}/decision-traces/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setSearchResults(data.entries || []);
            setActiveView("search");
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    }, [psurCaseId, searchQuery]);

    // Load narrative
    const loadNarrative = useCallback(async () => {
        if (!psurCaseId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/psur-cases/${psurCaseId}/decision-traces/narrative`);
            const text = await res.text();
            setNarrative(text);
            setActiveView("narrative");
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [psurCaseId]);

    const toggleStep = (step: number) => {
        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(step)) {
                next.delete(step);
            } else {
                next.add(step);
            }
            return next;
        });
    };

    const formatEventType = (type: string) => {
        return type.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
    };

    const formatTimestamp = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <a href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </a>
                            <h1 className="text-xl font-semibold text-foreground">Decision Trace Viewer</h1>
                        </div>
                        
                        {/* Case Selector */}
                        <div className="flex items-center gap-3">
                            <label className="text-sm text-muted-foreground">PSUR Case:</label>
                            <select
                                value={psurCaseId || ""}
                                onChange={(e) => setPsurCaseId(parseInt(e.target.value) || null)}
                                className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                            >
                                <option value="">Select case...</option>
                                {availableCases.map(c => (
                                    <option key={c.id} value={c.id}>{c.psurReference || `Case #${c.id}`}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-6">
                {!psurCaseId ? (
                    <div className="text-center py-20 text-muted-foreground">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p>Select a PSUR case to view its decision trace</p>
                    </div>
                ) : loading && !summary ? (
                    <div className="text-center py-20">
                        <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="mt-4 text-muted-foreground">Loading trace data...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        {summary && (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                <div className="p-4 rounded-xl border border-border bg-card">
                                    <div className="text-2xl font-bold text-foreground">{summary.totalEvents}</div>
                                    <div className="text-xs text-muted-foreground">Total Decisions</div>
                                </div>
                                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                                    <div className="text-2xl font-bold text-emerald-600">{summary.acceptedSlots}</div>
                                    <div className="text-xs text-muted-foreground">Slots Accepted</div>
                                </div>
                                <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
                                    <div className="text-2xl font-bold text-red-600">{summary.rejectedSlots}</div>
                                    <div className="text-xs text-muted-foreground">Slots Rejected</div>
                                </div>
                                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                                    <div className="text-2xl font-bold text-amber-600">{summary.traceGaps}</div>
                                    <div className="text-xs text-muted-foreground">Trace Gaps</div>
                                </div>
                                <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/5">
                                    <div className="text-2xl font-bold text-green-600">{summary.obligationsSatisfied}</div>
                                    <div className="text-xs text-muted-foreground">Obligations Met</div>
                                </div>
                                <div className={cn(
                                    "p-4 rounded-xl border",
                                    summary.workflowStatus === "COMPLETED" 
                                        ? "border-emerald-500/20 bg-emerald-500/5" 
                                        : summary.workflowStatus === "FAILED"
                                            ? "border-red-500/20 bg-red-500/5"
                                            : "border-blue-500/20 bg-blue-500/5"
                                )}>
                                    <div className={cn(
                                        "text-lg font-bold",
                                        summary.workflowStatus === "COMPLETED" ? "text-emerald-600" :
                                        summary.workflowStatus === "FAILED" ? "text-red-600" : "text-blue-600"
                                    )}>
                                        {summary.workflowStatus}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Status</div>
                                </div>
                            </div>
                        )}

                        {/* Search Bar */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                    placeholder="Search decisions in natural language... (e.g., 'evidence rejected', 'obligation satisfied')"
                                    className="w-full px-4 py-3 pl-10 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground"
                                />
                                <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <button
                                onClick={handleSearch}
                                disabled={isSearching || !searchQuery.trim()}
                                className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                                {isSearching ? "Searching..." : "Search"}
                            </button>
                            <button
                                onClick={loadNarrative}
                                className="px-5 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors"
                            >
                                Export Narrative
                            </button>
                        </div>

                        {/* View Tabs */}
                        <div className="flex gap-2 border-b border-border">
                            <button
                                onClick={() => setActiveView("timeline")}
                                className={cn(
                                    "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                                    activeView === "timeline" 
                                        ? "border-primary text-primary" 
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Timeline View
                            </button>
                            <button
                                onClick={() => setActiveView("search")}
                                className={cn(
                                    "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                                    activeView === "search" 
                                        ? "border-primary text-primary" 
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Search Results {searchResults.length > 0 && `(${searchResults.length})`}
                            </button>
                            <button
                                onClick={() => setActiveView("narrative")}
                                className={cn(
                                    "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                                    activeView === "narrative" 
                                        ? "border-primary text-primary" 
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Audit Narrative
                            </button>
                        </div>

                        {/* Timeline View */}
                        {activeView === "timeline" && (
                            <div className="space-y-4">
                                {timeline.map((step) => (
                                    <div key={step.step} className="border border-border rounded-xl overflow-hidden">
                                        <button
                                            onClick={() => toggleStep(step.step)}
                                            className="w-full px-4 py-3 flex items-center justify-between bg-card hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold", STEP_COLORS[step.step], "bg-current/10")}>
                                                    {step.step}
                                                </div>
                                                <span className="font-medium text-foreground">{step.name}</span>
                                                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                                                    {step.eventCount} events
                                                </span>
                                            </div>
                                            <svg className={cn("w-5 h-5 text-muted-foreground transition-transform", expandedSteps.has(step.step) && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        
                                        {expandedSteps.has(step.step) && (
                                            <div className="border-t border-border bg-background">
                                                {step.events.map((event) => (
                                                    <div 
                                                        key={event.id}
                                                        onClick={() => setSelectedEntry(event)}
                                                        className="px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                                                                {formatTimestamp(event.timestamp)}
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={cn(
                                                                        "px-2 py-0.5 rounded text-xs font-medium border",
                                                                        EVENT_TYPE_COLORS[event.eventType] || "bg-muted text-muted-foreground"
                                                                    )}>
                                                                        {formatEventType(event.eventType)}
                                                                    </span>
                                                                    {event.decision && (
                                                                        <span className={cn(
                                                                            "px-2 py-0.5 rounded text-xs font-medium",
                                                                            event.decision === "ACCEPTED" || event.decision === "SATISFIED" || event.decision === "QUALIFIED"
                                                                                ? "bg-emerald-500/10 text-emerald-600"
                                                                                : event.decision === "REJECTED" || event.decision === "FAILED" || event.decision === "BLOCKED"
                                                                                    ? "bg-red-500/10 text-red-600"
                                                                                    : "bg-muted text-muted-foreground"
                                                                        )}>
                                                                            {event.decision}
                                                                        </span>
                                                                    )}
                                                                    {event.entityId && (
                                                                        <span className="text-xs text-muted-foreground truncate">
                                                                            {event.entityId}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {event.humanSummary && (
                                                                    <p className="text-sm text-foreground/80 line-clamp-2">
                                                                        {event.humanSummary}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {step.hasMore && (
                                                    <div className="px-4 py-2 text-center text-xs text-muted-foreground bg-muted/30">
                                                        + more events not shown
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                
                                {timeline.length === 0 && (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p>No decision trace data available for this case</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Search Results View */}
                        {activeView === "search" && (
                            <div className="space-y-3">
                                {searchResults.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <p>{searchQuery ? "No results found" : "Enter a search query to find decisions"}</p>
                                    </div>
                                ) : (
                                    searchResults.map((entry) => (
                                        <div 
                                            key={entry.id}
                                            onClick={() => setSelectedEntry(entry)}
                                            className="p-4 rounded-xl border border-border bg-card hover:bg-muted/30 cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                                                    #{entry.sequenceNum}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded text-xs font-medium border",
                                                            EVENT_TYPE_COLORS[entry.eventType] || "bg-muted text-muted-foreground"
                                                        )}>
                                                            {formatEventType(entry.eventType)}
                                                        </span>
                                                        {entry.decision && (
                                                            <span className={cn(
                                                                "px-2 py-0.5 rounded text-xs font-medium",
                                                                entry.decision === "ACCEPTED" || entry.decision === "SATISFIED"
                                                                    ? "bg-emerald-500/10 text-emerald-600"
                                                                    : entry.decision === "REJECTED" || entry.decision === "FAILED"
                                                                        ? "bg-red-500/10 text-red-600"
                                                                        : "bg-muted text-muted-foreground"
                                                            )}>
                                                                {entry.decision}
                                                            </span>
                                                        )}
                                                        <span className="text-xs text-muted-foreground">
                                                            Step {entry.workflowStep}
                                                        </span>
                                                    </div>
                                                    {entry.humanSummary && (
                                                        <p className="text-sm text-foreground">
                                                            {entry.humanSummary}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Narrative View */}
                        {activeView === "narrative" && (
                            <div className="rounded-xl border border-border bg-card overflow-hidden">
                                {narrative ? (
                                    <pre className="p-6 text-sm text-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-[70vh] overflow-y-auto">
                                        {narrative}
                                    </pre>
                                ) : (
                                    <div className="p-12 text-center text-muted-foreground">
                                        <p>Click "Export Narrative" to generate the audit narrative</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Entry Detail Modal */}
            {selectedEntry && (
                <div 
                    className="fixed inset-0 z-[100] overflow-y-auto"
                    onClick={() => setSelectedEntry(null)}
                >
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div 
                            className="relative w-full max-w-2xl bg-background border border-border rounded-2xl shadow-lg max-h-[85vh] flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                                <h3 className="text-lg font-semibold">Decision Details</h3>
                                <button 
                                    onClick={() => setSelectedEntry(null)}
                                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn(
                                        "px-3 py-1 rounded-lg text-sm font-medium border",
                                        EVENT_TYPE_COLORS[selectedEntry.eventType] || "bg-muted text-muted-foreground"
                                    )}>
                                        {formatEventType(selectedEntry.eventType)}
                                    </span>
                                    {selectedEntry.decision && (
                                        <span className={cn(
                                            "px-3 py-1 rounded-lg text-sm font-medium",
                                            selectedEntry.decision === "ACCEPTED" || selectedEntry.decision === "SATISFIED"
                                                ? "bg-emerald-500/10 text-emerald-600"
                                                : selectedEntry.decision === "REJECTED" || selectedEntry.decision === "FAILED"
                                                    ? "bg-red-500/10 text-red-600"
                                                    : "bg-muted text-muted-foreground"
                                        )}>
                                            {selectedEntry.decision}
                                        </span>
                                    )}
                                </div>
                                
                                {selectedEntry.humanSummary && (
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Summary</h4>
                                        <p className="text-foreground">{selectedEntry.humanSummary}</p>
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Sequence</h4>
                                        <p className="text-foreground">#{selectedEntry.sequenceNum}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Workflow Step</h4>
                                        <p className="text-foreground">{selectedEntry.workflowStep}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Actor</h4>
                                        <p className="text-foreground">{selectedEntry.actor}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Timestamp</h4>
                                        <p className="text-foreground">{new Date(selectedEntry.timestamp).toLocaleString()}</p>
                                    </div>
                                </div>
                                
                                {selectedEntry.entityId && (
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Entity</h4>
                                        <p className="text-foreground font-mono text-sm">
                                            {selectedEntry.entityType}: {selectedEntry.entityId}
                                        </p>
                                    </div>
                                )}
                                
                                {selectedEntry.regulatoryContext && (
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Regulatory Context</h4>
                                        <pre className="p-3 rounded-lg bg-muted text-sm font-mono overflow-x-auto">
                                            {JSON.stringify(selectedEntry.regulatoryContext, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                
                                {selectedEntry.complianceAssertion && (
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Compliance Assertion</h4>
                                        <pre className="p-3 rounded-lg bg-muted text-sm font-mono overflow-x-auto">
                                            {JSON.stringify(selectedEntry.complianceAssertion, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                
                                {selectedEntry.reasons && selectedEntry.reasons.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Reasons</h4>
                                        <ul className="list-disc list-inside text-sm text-foreground">
                                            {selectedEntry.reasons.map((r, i) => <li key={i}>{r}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
