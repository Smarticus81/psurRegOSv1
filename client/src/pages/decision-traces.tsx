/**
 * Audit Trail - Shows how each section of the report was created
 * 
 * Simple view showing:
 * - What was generated
 * - Where the data came from
 * - When it happened
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
    ArrowLeft,
    FileText,
    Database,
    Clock,
    CheckCircle,
    AlertCircle,
    Loader2,
    ChevronDown,
    ChevronRight,
    Eye,
    RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PSURCase {
    id: number;
    psurReference: string;
    deviceInfo?: { deviceName?: string };
    status: string;
}

interface TraceEntry {
    id: number;
    traceId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    decision: string;
    eventTimestamp: string;
    humanSummary?: string;
    rationale?: string;
}

interface WorkflowStep {
    id: string;
    title: string;
    status: "completed" | "running" | "pending" | "failed";
    timestamp: string;
    duration?: string;
    summary: string;
    details?: string;
    dataUsed?: string[];
    findings?: string[];
}

// Simplified status styles
const STATUS_STYLES = {
    completed: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
    running: { icon: Loader2, color: "text-blue-600", bg: "bg-blue-50" },
    pending: { icon: Clock, color: "text-gray-400", bg: "bg-gray-50" },
    failed: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
};

export default function AuditTrail() {
    const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
    const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

    // Fetch PSUR cases
    const { data: cases = [], isLoading: casesLoading } = useQuery<PSURCase[]>({
        queryKey: ["/api/psur-cases"],
    });

    // Fetch workflow data for selected case
    const { data: workflow, isLoading: workflowLoading, refetch } = useQuery<{
        steps: WorkflowStep[];
        summary: {
            totalSteps: number;
            completedSteps: number;
            status: string;
        };
    }>({
        queryKey: ["/api/psur-cases", selectedCaseId, "workflow"],
        enabled: !!selectedCaseId,
    });

    // Auto-select first case
    useEffect(() => {
        if (cases.length > 0 && !selectedCaseId) {
            setSelectedCaseId(cases[0].id);
        }
    }, [cases, selectedCaseId]);

    const selectedCase = cases.find(c => c.id === selectedCaseId);

    const toggleStep = (stepId: string) => {
        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) next.delete(stepId);
            else next.add(stepId);
            return next;
        });
    };

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <header className="shrink-0 border-b bg-white shadow-sm">
                <div className="max-w-6xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <a href="/psur" className="p-2 rounded hover:bg-gray-100">
                                <ArrowLeft className="w-4 h-4" />
                            </a>
                            <div>
                                <h1 className="text-xl font-bold">Audit Trail</h1>
                                <p className="text-sm text-muted-foreground">
                                    See how your report was created step by step
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <select
                                value={selectedCaseId || ""}
                                onChange={(e) => setSelectedCaseId(parseInt(e.target.value) || null)}
                                className="px-3 py-2 rounded-lg border bg-white text-sm min-w-[200px]"
                            >
                                <option value="">Select a report...</option>
                                {cases.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.deviceInfo?.deviceName || c.psurReference}
                                    </option>
                                ))}
                            </select>
                            <Button variant="outline" size="sm" onClick={() => refetch()}>
                                <RefreshCw className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <div className="max-w-4xl mx-auto px-6 py-8">
                    {!selectedCaseId ? (
                        <div className="text-center py-16">
                            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                            <h3 className="text-lg font-semibold mb-2">Select a Report</h3>
                            <p className="text-muted-foreground">
                                Choose a report from the dropdown above to see its audit trail
                            </p>
                        </div>
                    ) : workflowLoading ? (
                        <div className="text-center py-16">
                            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
                            <p className="text-muted-foreground">Loading audit trail...</p>
                        </div>
                    ) : workflow?.steps && workflow.steps.length > 0 ? (
                        <div className="space-y-4">
                            {/* Progress Summary */}
                            <div className="bg-white rounded-lg border p-6 mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="font-semibold">Report Progress</h2>
                                    {workflow.summary && (
                                        <Badge variant={workflow.summary.status === "completed" ? "default" : "secondary"}>
                                            {workflow.summary.status}
                                        </Badge>
                                    )}
                                </div>
                                {workflow.summary && (
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                                            <div
                                                className="bg-green-500 h-2 rounded-full transition-all"
                                                style={{
                                                    width: `${(workflow.summary.completedSteps / workflow.summary.totalSteps) * 100}%`
                                                }}
                                            />
                                        </div>
                                        <span className="text-sm text-muted-foreground">
                                            {workflow.summary.completedSteps} of {workflow.summary.totalSteps} steps
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Steps List */}
                            <div className="space-y-3">
                                {workflow.steps.map((step, index) => {
                                    const StatusIcon = STATUS_STYLES[step.status].icon;
                                    const isExpanded = expandedSteps.has(step.id);

                                    return (
                                        <div
                                            key={step.id}
                                            className={cn(
                                                "bg-white rounded-lg border transition-all",
                                                step.status === "failed" && "border-red-200"
                                            )}
                                        >
                                            <button
                                                onClick={() => toggleStep(step.id)}
                                                className="w-full p-4 flex items-start gap-4 text-left"
                                            >
                                                <div className={cn(
                                                    "p-2 rounded-lg shrink-0",
                                                    STATUS_STYLES[step.status].bg
                                                )}>
                                                    <StatusIcon className={cn(
                                                        "w-5 h-5",
                                                        STATUS_STYLES[step.status].color,
                                                        step.status === "running" && "animate-spin"
                                                    )} />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs text-muted-foreground">
                                                            Step {index + 1}
                                                        </span>
                                                        {step.duration && (
                                                            <span className="text-xs text-muted-foreground">
                                                                • {step.duration}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h3 className="font-medium">{step.title}</h3>
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        {step.summary}
                                                    </p>
                                                </div>

                                                {isExpanded ? (
                                                    <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                                                ) : (
                                                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                                                )}
                                            </button>

                                            {isExpanded && (
                                                <div className="px-4 pb-4 border-t bg-gray-50/50">
                                                    <div className="pt-4 space-y-4">
                                                        {step.details && (
                                                            <div>
                                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                                                                    What Happened
                                                                </h4>
                                                                <p className="text-sm">{step.details}</p>
                                                            </div>
                                                        )}

                                                        {step.dataUsed && step.dataUsed.length > 0 && (
                                                            <div>
                                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                                                                    Data Sources Used
                                                                </h4>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {step.dataUsed.map((source, i) => (
                                                                        <span
                                                                            key={i}
                                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs"
                                                                        >
                                                                            <Database className="w-3 h-3" />
                                                                            {source}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {step.findings && step.findings.length > 0 && (
                                                            <div>
                                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                                                                    Key Findings
                                                                </h4>
                                                                <ul className="space-y-1">
                                                                    {step.findings.map((finding, i) => (
                                                                        <li key={i} className="text-sm flex items-start gap-2">
                                                                            <span className="text-green-500 mt-0.5">•</span>
                                                                            {finding}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}

                                                        <div className="text-xs text-muted-foreground">
                                                            {new Date(step.timestamp).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-16">
                            <Clock className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                            <h3 className="text-lg font-semibold mb-2">No Activity Yet</h3>
                            <p className="text-muted-foreground max-w-md mx-auto">
                                This report hasn't been generated yet. Start the generation process from the PSUR page to see the audit trail.
                            </p>
                            <Button variant="outline" className="mt-4" asChild>
                                <a href="/psur">Go to PSUR Dashboard</a>
                            </Button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
