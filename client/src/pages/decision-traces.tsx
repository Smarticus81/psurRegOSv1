/**
 * Provenance Explorer - Granular Decision Traceability
 * 
 * SOTA implementation for tracing every sentence, calculation, and claim
 * back to its source evidence, regulatory obligations, and GRKB.
 * 
 * Features:
 * - Hierarchical slot navigation
 * - Sentence-level provenance with inline markers
 * - Calculation breakdown for computed values
 * - GRKB obligation links
 * - Pre-generation validation status
 */

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
    ChevronDown,
    ChevronRight,
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    XCircle,
    Database,
    FileText,
    Calculator,
    BookOpen,
    Link2,
    Eye,
    ArrowLeft,
    Search,
    Filter,
    RefreshCw,
    ShieldCheck,
    ShieldAlert,
    Layers,
    Hash,
    GitBranch,
    ExternalLink,
    Info,
    Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Types
interface PSURCase {
    id: number;
    psurReference: string;
    deviceInfo?: { deviceName?: string; deviceCode?: string };
    status: string;
    startPeriod: string;
    endPeriod: string;
    templateId: string;
}

interface GrkbValidation {
    validationStatus: "PASS" | "FAIL" | "WARNING";
    canProceed: boolean;
    mandatoryObligationsTotal: number;
    mandatoryObligationsSatisfied: number;
    requiredEvidenceTypesTotal: number;
    requiredEvidenceTypesPresent: number;
    blockingIssues: Array<{
        obligationId: string;
        obligationText: string;
        sourceCitation: string;
        missingEvidenceTypes: string[];
        severity: string;
    }>;
    warnings: Array<{
        obligationId: string;
        obligationText: string;
        missingEvidenceTypes: string[];
    }>;
    slotDetails: Array<{
        slotId: string;
        slotTitle: string;
        status: "ready" | "blocked" | "partial";
        obligationsCovered: string[];
        obligationsMissing: string[];
        evidenceCount: number;
    }>;
}

interface SentenceAttribution {
    id: number;
    slotId: string;
    sentenceText: string;
    sentenceIndex: number;
    paragraphIndex: number;
    evidenceAtomIds: number[];
    obligationIds: string[];
    hasCalculation: boolean;
    calculationTrace?: {
        resultValue: string;
        resultType: string;
        formula: string;
        inputs: Array<{ atomId: number; field: string; value: any; sourceDocument?: string }>;
    };
    llmReasoning: string;
    confidenceScore: string;
    verificationStatus: string;
}

interface SlotHierarchy {
    slotId: string;
    title: string;
    sectionPath: string;
    status: "ready" | "blocked" | "partial" | "generated" | "empty";
    obligationCount: number;
    evidenceCount: number;
    sentenceCount: number;
    children?: SlotHierarchy[];
}

// Status styles
const STATUS_STYLES = {
    PASS: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50", label: "Ready" },
    FAIL: { icon: XCircle, color: "text-red-500", bg: "bg-red-50", label: "Blocked" },
    WARNING: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50", label: "Warnings" },
};

const SLOT_STATUS_STYLES = {
    ready: { color: "bg-emerald-500", label: "Ready" },
    blocked: { color: "bg-red-500", label: "Blocked" },
    partial: { color: "bg-amber-500", label: "Partial" },
    generated: { color: "bg-blue-500", label: "Generated" },
    empty: { color: "bg-slate-300", label: "Empty" },
};

export default function ProvenanceExplorer() {
    const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [selectedSentence, setSelectedSentence] = useState<SentenceAttribution | null>(null);
    const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [showBlockedOnly, setShowBlockedOnly] = useState(false);

    // Fetch PSUR cases
    const { data: cases = [] } = useQuery<PSURCase[]>({
        queryKey: ["/api/psur-cases"],
    });

    // Fetch GRKB validation for selected case
    const { data: validation, refetch: refetchValidation } = useQuery<GrkbValidation>({
        queryKey: ["/api/psur-cases", selectedCaseId, "grkb-validation"],
        enabled: !!selectedCaseId,
    });

    // Fetch sentence attributions for selected slot
    const { data: sentences = [] } = useQuery<SentenceAttribution[]>({
        queryKey: ["/api/psur-cases", selectedCaseId, "sentences", selectedSlotId],
        enabled: !!selectedCaseId && !!selectedSlotId,
    });

    // Auto-select first case
    useEffect(() => {
        if (cases.length > 0 && !selectedCaseId) {
            setSelectedCaseId(cases[0].id);
        }
    }, [cases, selectedCaseId]);

    const selectedCase = cases.find(c => c.id === selectedCaseId);

    // Build slot hierarchy from validation data
    const slotHierarchy = useMemo(() => {
        if (!validation?.slotDetails) return [];

        const slots = validation.slotDetails;
        const filtered = showBlockedOnly
            ? slots.filter(s => s.status === "blocked" || s.status === "partial")
            : slots;

        return filtered.filter(s =>
            !searchQuery ||
            s.slotTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.slotId.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [validation?.slotDetails, searchQuery, showBlockedOnly]);

    const toggleSlot = (slotId: string) => {
        setExpandedSlots(prev => {
            const next = new Set(prev);
            if (next.has(slotId)) next.delete(slotId);
            else next.add(slotId);
            return next;
        });
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-background">
            {/* Header */}
            <header className="shrink-0 border-b border-border bg-white dark:bg-card shadow-sm z-50">
                <div className="max-w-[1920px] mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <a href="/psur" className="p-2 rounded-lg hover:bg-secondary transition-colors">
                                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                            </a>
                            <div>
                                <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                                    <GitBranch className="w-5 h-5 text-primary" />
                                    Provenance Explorer
                                </h1>
                                <p className="text-xs text-muted-foreground">
                                    Trace every sentence to its source evidence and obligations
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <select
                                value={selectedCaseId || ""}
                                onChange={(e) => setSelectedCaseId(parseInt(e.target.value) || null)}
                                className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium min-w-[260px]"
                            >
                                <option value="">Select a report...</option>
                                {cases.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.deviceInfo?.deviceName || c.psurReference} ({c.status})
                                    </option>
                                ))}
                            </select>
                            <Button variant="outline" size="sm" onClick={() => refetchValidation()}>
                                <RefreshCw className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {!selectedCaseId ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <GitBranch className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                        <h3 className="text-xl font-bold text-foreground mb-2">Select a Report</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                            Choose a PSUR report to explore its complete provenance chain
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex">
                    {/* Left Panel: GRKB Validation + Slot Navigator */}
                    <div className="w-[340px] h-full border-r border-border flex flex-col bg-white dark:bg-card">
                        {/* GRKB Validation Summary */}
                        {validation && (
                            <div className={cn(
                                "p-4 border-b",
                                validation.validationStatus === "PASS" ? "bg-emerald-50 dark:bg-emerald-900/20" :
                                    validation.validationStatus === "FAIL" ? "bg-red-50 dark:bg-red-900/20" :
                                        "bg-amber-50 dark:bg-amber-900/20"
                            )}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        {validation.validationStatus === "PASS" ? (
                                            <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                        ) : validation.validationStatus === "FAIL" ? (
                                            <ShieldAlert className="w-5 h-5 text-red-600" />
                                        ) : (
                                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                                        )}
                                        <span className="font-bold text-sm">
                                            {validation.validationStatus === "PASS" ? "Ready to Generate" :
                                                validation.validationStatus === "FAIL" ? "Generation Blocked" :
                                                    "Warnings Present"}
                                        </span>
                                    </div>
                                    <Badge variant={validation.canProceed ? "default" : "destructive"} className="text-xs">
                                        {validation.canProceed ? "Can Proceed" : "Blocked"}
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-2 rounded bg-white/60 dark:bg-background/40">
                                        <div className="text-muted-foreground">Obligations</div>
                                        <div className="font-bold text-lg">
                                            {validation.mandatoryObligationsSatisfied}/{validation.mandatoryObligationsTotal}
                                        </div>
                                    </div>
                                    <div className="p-2 rounded bg-white/60 dark:bg-background/40">
                                        <div className="text-muted-foreground">Evidence Types</div>
                                        <div className="font-bold text-lg">
                                            {validation.requiredEvidenceTypesPresent}/{validation.requiredEvidenceTypesTotal}
                                        </div>
                                    </div>
                                </div>

                                {validation.blockingIssues && validation.blockingIssues.length > 0 && (
                                    <div className="mt-3 p-2 rounded bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
                                        <div className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">
                                            {validation.blockingIssues.length} Blocking Issue(s)
                                        </div>
                                        <div className="text-xs text-red-600 dark:text-red-400 max-h-20 overflow-y-auto space-y-1">
                                            {validation.blockingIssues.slice(0, 3).map((issue, i) => (
                                                <div key={i} className="truncate">
                                                    • {issue.sourceCitation}: Missing {issue.missingEvidenceTypes.join(", ")}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Slot Search & Filter */}
                        <div className="p-3 border-b border-border space-y-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search slots..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-8 h-8 text-sm"
                                />
                            </div>
                            <button
                                onClick={() => setShowBlockedOnly(!showBlockedOnly)}
                                className={cn(
                                    "w-full px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2",
                                    showBlockedOnly
                                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                                )}
                            >
                                <Filter className="w-3 h-3" />
                                {showBlockedOnly ? "Showing Blocked Only" : "Show All Slots"}
                            </button>
                        </div>

                        {/* Slot Tree */}
                        <div className="flex-1 overflow-y-auto">
                            {slotHierarchy.map((slot) => (
                                <div key={slot.slotId} className="border-b border-border/50 last:border-b-0">
                                    <button
                                        onClick={() => {
                                            setSelectedSlotId(slot.slotId);
                                            toggleSlot(slot.slotId);
                                        }}
                                        className={cn(
                                            "w-full px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors",
                                            selectedSlotId === slot.slotId && "bg-primary/5 border-l-2 border-l-primary"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={cn(
                                                "w-2 h-2 rounded-full",
                                                SLOT_STATUS_STYLES[slot.status].color
                                            )} />
                                            <span className="flex-1 text-sm font-medium truncate">
                                                {slot.slotTitle}
                                            </span>
                                            {expandedSlots.has(slot.slotId) ? (
                                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <BookOpen className="w-3 h-3" />
                                                {slot.obligationsCovered?.length || 0} oblig.
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Database className="w-3 h-3" />
                                                {slot.evidenceCount} atoms
                                            </span>
                                        </div>
                                    </button>

                                    {/* Expanded slot details */}
                                    {expandedSlots.has(slot.slotId) && (
                                        <div className="px-3 py-2 bg-secondary/30 text-xs space-y-1.5">
                                            {slot.obligationsCovered && slot.obligationsCovered.length > 0 && (
                                                <div>
                                                    <div className="font-semibold text-emerald-600 mb-1">✓ Covered Obligations</div>
                                                    {slot.obligationsCovered.slice(0, 3).map((obId, i) => (
                                                        <div key={i} className="text-muted-foreground truncate pl-2">
                                                            {obId}
                                                        </div>
                                                    ))}
                                                    {slot.obligationsCovered.length > 3 && (
                                                        <div className="text-muted-foreground pl-2">
                                                            +{slot.obligationsCovered.length - 3} more
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {slot.obligationsMissing && slot.obligationsMissing.length > 0 && (
                                                <div>
                                                    <div className="font-semibold text-red-600 mb-1">✗ Missing Obligations</div>
                                                    {slot.obligationsMissing.slice(0, 3).map((obId, i) => (
                                                        <div key={i} className="text-red-500 truncate pl-2">
                                                            {obId}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {slotHierarchy.length === 0 && (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    {validation ? "No slots match your filter" : "Loading slot data..."}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center Panel: Generated Content with Attribution Markers */}
                    <div className="flex-1 h-full overflow-hidden flex flex-col bg-white dark:bg-card">
                        {selectedSlotId ? (
                            <>
                                <div className="p-4 border-b border-border">
                                    <h2 className="font-bold text-foreground">
                                        {slotHierarchy.find(s => s.slotId === selectedSlotId)?.slotTitle || selectedSlotId}
                                    </h2>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {sentences.length} attributed sentences • Click any sentence to view provenance
                                    </p>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4">
                                    {sentences.length > 0 ? (
                                        <div className="space-y-2">
                                            {sentences.map((sentence) => (
                                                <div
                                                    key={sentence.id}
                                                    onClick={() => setSelectedSentence(sentence)}
                                                    className={cn(
                                                        "p-3 rounded-lg border cursor-pointer transition-all hover:border-primary/50",
                                                        selectedSentence?.id === sentence.id
                                                            ? "border-primary bg-primary/5"
                                                            : "border-border",
                                                        sentence.verificationStatus === "verified" && "border-l-4 border-l-emerald-500",
                                                        sentence.verificationStatus === "rejected" && "border-l-4 border-l-red-500"
                                                    )}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="flex-1">
                                                            <p className="text-sm leading-relaxed">{sentence.sentenceText}</p>
                                                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                                                <span className="flex items-center gap-1">
                                                                    <Database className="w-3 h-3" />
                                                                    {sentence.evidenceAtomIds?.length || 0} sources
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <BookOpen className="w-3 h-3" />
                                                                    {sentence.obligationIds?.length || 0} obligations
                                                                </span>
                                                                {sentence.hasCalculation && (
                                                                    <span className="flex items-center gap-1 text-amber-600">
                                                                        <Calculator className="w-3 h-3" />
                                                                        Calculated
                                                                    </span>
                                                                )}
                                                                <span className={cn(
                                                                    "px-1.5 py-0.5 rounded text-[10px] font-medium",
                                                                    sentence.verificationStatus === "verified"
                                                                        ? "bg-emerald-100 text-emerald-700"
                                                                        : sentence.verificationStatus === "rejected"
                                                                            ? "bg-red-100 text-red-700"
                                                                            : "bg-slate-100 text-slate-600"
                                                                )}>
                                                                    {sentence.verificationStatus || "unverified"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <Eye className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-center">
                                            <div>
                                                <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                                                <p className="text-sm text-muted-foreground">
                                                    No attributed sentences yet.<br />
                                                    Generate content to see provenance data.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex items-center justify-center text-center">
                                <div>
                                    <Layers className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                                    <h3 className="font-bold text-foreground mb-1">Select a Slot</h3>
                                    <p className="text-sm text-muted-foreground max-w-xs">
                                        Click on a slot from the left panel to view its generated content and provenance chain
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Provenance Details */}
                    <div className="w-[380px] h-full border-l border-border bg-slate-50 dark:bg-background overflow-hidden flex flex-col">
                        {selectedSentence ? (
                            <>
                                <div className="p-4 border-b border-border bg-white dark:bg-card">
                                    <h3 className="font-bold text-foreground flex items-center gap-2">
                                        <GitBranch className="w-4 h-4 text-primary" />
                                        Provenance Chain
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Complete traceability for this sentence
                                    </p>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {/* The Sentence */}
                                    <div className="p-3 rounded-lg bg-white dark:bg-card border border-border">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                            Generated Content
                                        </div>
                                        <p className="text-sm leading-relaxed italic text-foreground">
                                            "{selectedSentence.sentenceText}"
                                        </p>
                                    </div>

                                    {/* Evidence Sources */}
                                    <div className="p-3 rounded-lg bg-white dark:bg-card border border-border">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <Database className="w-3.5 h-3.5 text-blue-500" />
                                            Evidence Sources ({selectedSentence.evidenceAtomIds?.length || 0})
                                        </div>
                                        {selectedSentence.evidenceAtomIds && selectedSentence.evidenceAtomIds.length > 0 ? (
                                            <div className="space-y-2">
                                                {selectedSentence.evidenceAtomIds.map((atomId, i) => (
                                                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                                                        <Hash className="w-3 h-3 text-blue-500" />
                                                        <span className="text-xs font-mono">Atom #{atomId}</span>
                                                        <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">No evidence atoms linked</p>
                                        )}
                                    </div>

                                    {/* GRKB Obligations */}
                                    <div className="p-3 rounded-lg bg-white dark:bg-card border border-border">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <BookOpen className="w-3.5 h-3.5 text-purple-500" />
                                            GRKB Obligations ({selectedSentence.obligationIds?.length || 0})
                                        </div>
                                        {selectedSentence.obligationIds && selectedSentence.obligationIds.length > 0 ? (
                                            <div className="space-y-2">
                                                {selectedSentence.obligationIds.map((obId, i) => (
                                                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-purple-50 dark:bg-purple-900/20">
                                                        <Link2 className="w-3 h-3 text-purple-500" />
                                                        <span className="text-xs font-mono flex-1 truncate">{obId}</span>
                                                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">No obligations linked</p>
                                        )}
                                    </div>

                                    {/* Calculation Breakdown */}
                                    {selectedSentence.hasCalculation && selectedSentence.calculationTrace && (
                                        <div className="p-3 rounded-lg bg-white dark:bg-card border border-amber-200 dark:border-amber-800">
                                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                                <Calculator className="w-3.5 h-3.5 text-amber-500" />
                                                Calculation Trace
                                            </div>
                                            <div className="space-y-2">
                                                <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/20">
                                                    <div className="text-xs text-muted-foreground">Result</div>
                                                    <div className="font-bold text-amber-700 dark:text-amber-300">
                                                        {selectedSentence.calculationTrace.resultValue}
                                                    </div>
                                                </div>
                                                <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/20">
                                                    <div className="text-xs text-muted-foreground">Formula</div>
                                                    <div className="font-mono text-xs">
                                                        {selectedSentence.calculationTrace.formula}
                                                    </div>
                                                </div>
                                                <div className="text-xs font-semibold mt-2">Inputs:</div>
                                                {selectedSentence.calculationTrace.inputs.map((input, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-slate-50 dark:bg-slate-800">
                                                        <span className="font-mono text-muted-foreground">Atom #{input.atomId}</span>
                                                        <span className="text-muted-foreground">→</span>
                                                        <span className="font-medium">{input.field}: {String(input.value)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* LLM Reasoning */}
                                    {selectedSentence.llmReasoning && (
                                        <div className="p-3 rounded-lg bg-white dark:bg-card border border-border">
                                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                                <Zap className="w-3.5 h-3.5 text-emerald-500" />
                                                Generation Rationale
                                            </div>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                {selectedSentence.llmReasoning}
                                            </p>
                                        </div>
                                    )}

                                    {/* Confidence */}
                                    <div className="p-3 rounded-lg bg-white dark:bg-card border border-border">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-muted-foreground">Confidence Score</span>
                                            <span className="text-sm font-bold text-foreground">
                                                {selectedSentence.confidenceScore || "N/A"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex items-center justify-center text-center p-8">
                                <div>
                                    <Info className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                                    <h3 className="font-bold text-foreground mb-1">Select a Sentence</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Click on any sentence in the center panel to view its complete provenance chain
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
