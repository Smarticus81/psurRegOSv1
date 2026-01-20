import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { EvidenceIngestionPanel } from "@/components/evidence-ingestion-panel";
import { cn } from "@/lib/utils";
import { FileText, Settings, Info, LayoutDashboard, Search, CheckCircle2, AlertCircle, Trash2, ArrowRight, Loader2, ChevronDown, ChevronUp } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type WizardStep = 1 | 2 | 3 | 4 | 5;

type CreateCasePayload = {
    psurReference: string;
    version: number;
    templateId: string;
    jurisdictions: string[];
    startPeriod: string;
    endPeriod: string;
    deviceIds: number[];
    leadingDeviceId: number;
    status: string;
};

type CreateCaseResponse = { id: number; psurReference: string };
type AtomCountsResponse = { 
    psurCaseId: number; 
    totals: { all: number }; 
    byType: Record<string, number>;
    // Enhanced coverage - includes ALL evidence types from uploaded sources
    coverage?: {
        coveredSources: string[];           // e.g., ["fsca", "complaints", "sales"]
        coveredTypes: string[];             // ALL types from uploaded sources
        coverageBySource: Record<string, string[]>;  // e.g., { fsca: ["fsca_record", "recall_record"] }
        coveredByType: Record<string, { count: number; covered: boolean; source: string | null }>;
    };
};
type WorkflowStep = { step: number; name: string; status: string; error?: string };
type RunWorkflowResponse = {
    scope: { templateId: string; jurisdictions: string[]; deviceCode: string; periodStart: string; periodEnd: string };
    case: { psurCaseId: number; psurRef: string; version: number };
    steps: WorkflowStep[];
};
type TraceSummary = { totalEvents: number; acceptedSlots: number; rejectedSlots: number; chainValid: boolean };
type Device = { id: number; deviceName: string; deviceCode: string; riskClass: string };

// Column mapping types
type ColumnMapping = {
    sourceColumn: string;
    targetField: string;
    confidence: number;
    autoMapped: boolean;
};

type MappingConfig = {
    evidenceType: string;
    mappings: ColumnMapping[];
    unmappedSource: string[];
    unmappedTarget: string[];
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

interface ApiError extends Error {
    status?: number;
    existingCase?: { id: number; psurReference: string; status: string; startPeriod: string; endPeriod: string };
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
    const resp = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers || {}) } });
    const text = await resp.text();
    const json = text ? JSON.parse(text) : null;
    if (!resp.ok) {
        const err = new Error(json?.message || json?.error || `HTTP ${resp.status}`) as ApiError;
        err.status = resp.status;
        if (json?.existingCase) err.existingCase = json.existingCase;
        throw err;
    }
    return json as T;
}

function formatType(t: string): string { return t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "); }

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE CONTENT VIEWER - Shows sections as they're rendered in real-time
// ═══════════════════════════════════════════════════════════════════════════════

interface LiveSection {
    slotId: string;
    title: string;
    content: string;
    status: "pending" | "generating" | "done";
}

function LiveContentViewer({ 
    psurCaseId, 
    documentStyle, 
    runtimeEvents,
    isGenerating 
}: { 
    psurCaseId: number;
    documentStyle: string;
    runtimeEvents: any[];
    isGenerating: boolean;
}) {
    const [sections, setSections] = useState<LiveSection[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [lastFetch, setLastFetch] = useState(0);
    
    // Fetch live content periodically while generating
    useEffect(() => {
        if (!psurCaseId) return;
        
        const fetchLiveContent = async () => {
            try {
                const res = await fetch(`/api/psur-cases/${psurCaseId}/live-content`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.sections && Array.isArray(data.sections)) {
                        setSections(data.sections);
                        // Auto-expand newly completed sections
                        const newlyDone = data.sections.filter((s: LiveSection) => s.status === "done" && s.content);
                        if (newlyDone.length > 0) {
                            setExpandedSections(prev => {
                                const next = new Set(prev);
                                newlyDone.forEach((s: LiveSection) => next.add(s.slotId));
                                return next;
                            });
                        }
                    }
                }
            } catch (e) {
                // Silently fail
            }
            setLastFetch(Date.now());
        };
        
        fetchLiveContent();
        
        // Poll while generating
        let interval: NodeJS.Timeout | null = null;
        if (isGenerating) {
            interval = setInterval(fetchLiveContent, 2000);
        }
        
        return () => { if (interval) clearInterval(interval); };
    }, [psurCaseId, isGenerating]);
    
    const toggleSection = (slotId: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(slotId)) {
                next.delete(slotId);
            } else {
                next.add(slotId);
            }
            return next;
        });
    };
    
    const doneCount = sections.filter(s => s.status === "done").length;
    const generatingCount = sections.filter(s => s.status === "generating").length;
    const pendingCount = sections.filter(s => s.status === "pending").length;
    
    return (
        <div className="mt-6 w-full glass-card overflow-hidden rounded-2xl border border-border/30">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between bg-background/80">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                        <svg className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                    <div className="text-sm font-semibold text-foreground">Live Document Preview</div>
                    <div className="flex items-center gap-2 text-xs">
                        {doneCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                {doneCount} done
                            </span>
                        )}
                        {generatingCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 animate-pulse">
                                {generatingCount} generating
                            </span>
                        )}
                        {pendingCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {pendingCount} pending
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {runtimeEvents.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            {runtimeEvents[0]?.agent && `Agent: ${runtimeEvents[0].agent}`}
                        </span>
                    )}
                </div>
            </div>
            
            {/* Content */}
            {isExpanded && (
                <div className="max-h-[60vh] overflow-y-auto bg-background/50">
                    {sections.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <svg className="w-8 h-8 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-sm">Waiting for content generation to begin...</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/30">
                            {sections.map((section) => (
                                <div key={section.slotId} className="group">
                                    {/* Section Header */}
                                    <button
                                        onClick={() => section.content && toggleSection(section.slotId)}
                                        className={cn(
                                            "w-full px-4 py-3 flex items-center justify-between text-left transition-colors",
                                            section.content ? "hover:bg-muted/50 cursor-pointer" : "cursor-default"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            {/* Status Indicator */}
                                            <div className={cn(
                                                "w-2 h-2 rounded-full shrink-0",
                                                section.status === "done" ? "bg-emerald-500" :
                                                section.status === "generating" ? "bg-primary animate-pulse" :
                                                "bg-muted-foreground/30"
                                            )} />
                                            
                                            {/* Title */}
                                            <span className={cn(
                                                "text-sm font-medium",
                                                section.status === "done" ? "text-foreground" :
                                                section.status === "generating" ? "text-primary" :
                                                "text-muted-foreground"
                                            )}>
                                                {section.title || section.slotId}
                                            </span>
                                            
                                            {/* Status Badge */}
                                            {section.status === "generating" && (
                                                <span className="text-xs text-primary animate-pulse">Writing...</span>
                                            )}
                                        </div>
                                        
                                        {/* Expand Arrow */}
                                        {section.content && (
                                            <svg className={cn(
                                                "w-4 h-4 text-muted-foreground transition-transform",
                                                expandedSections.has(section.slotId) && "rotate-90"
                                            )} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        )}
                                    </button>
                                    
                                    {/* Section Content */}
                                    {expandedSections.has(section.slotId) && section.content && (
                                        <div className="px-4 pb-4 animate-in slide-in-from-top-2">
                                            <div className="ml-5 pl-4 border-l-2 border-border/50">
                                                <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground leading-relaxed">
                                                    {section.content.split("\n\n").slice(0, 3).map((para, i) => (
                                                        <p key={i} className="mb-2">{para.substring(0, 500)}{para.length > 500 && "..."}</p>
                                                    ))}
                                                    {section.content.split("\n\n").length > 3 && (
                                                        <p className="text-xs text-muted-foreground/60 italic">
                                                            ... and {section.content.split("\n\n").length - 3} more paragraphs
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL COMPONENT (Redesigned - Fixed centering and shadows)
// ═══════════════════════════════════════════════════════════════════════════════

function Modal({ open, onClose, title, size = "lg", children }: { 
    open: boolean; onClose: () => void; title: string; size?: "md" | "lg" | "xl" | "full"; children: React.ReactNode 
}) {
    // Prevent body scroll when modal is open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [open]);
    
    if (!open) return null;
    const sizeClass = {
        md: "max-w-2xl",
        lg: "max-w-4xl", 
        xl: "max-w-6xl",
        full: "max-w-[95vw]"
    }[size];
    
    return (
        <div 
            className="fixed inset-0 z-[100] overflow-y-auto"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            {/* Backdrop - no shadow, just blur */}
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />
            
            {/* Centering container */}
            <div className="flex min-h-full items-center justify-center p-4">
                {/* Modal */}
                <div 
                    className={cn(
                        "relative w-full transform transition-all",
                        sizeClass,
                        "bg-background border border-border rounded-2xl shadow-lg",
                        "max-h-[85vh] flex flex-col",
                        "animate-scale-in"
                    )}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                        <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
                        <button 
                            onClick={onClose} 
                            className="p-2 rounded-lg hover:bg-muted transition-colors"
                        >
                            <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">{children}</div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLUMN MAPPING TOOL WITH VERIFICATION & PROFILE SAVE
// ═══════════════════════════════════════════════════════════════════════════════

// Field schemas matching backend evidence-parser.ts COLUMN_MAPPINGS
// These are the canonical field names the backend expects after column mapping
const EVIDENCE_FIELD_SCHEMAS: Record<string, string[]> = {
    // CER inputs
    cer_extract: ["sourceDocument", "sectionReference", "content", "extractionDate", "deviceCode"],
    clinical_evaluation_extract: ["sourceDocument", "sectionReference", "content", "extractionDate", "deviceCode"],
    // Sales
    sales_volume: ["deviceCode", "region", "country", "periodStart", "periodEnd", "quantity", "revenue", "distributionChannel"],
    // Complaints
    complaint_record: ["complaintId", "deviceCode", "complaintDate", "description", "severity", "region", "country", "rootCause", "correctiveAction", "patientOutcome", "investigationStatus", "serious"],
    serious_incident_record: ["incidentId", "deviceCode", "incidentDate", "description", "severity", "patientOutcome", "reportedTo", "imdrfCode"],
    // FSCA
    fsca_record: ["fscaId", "deviceCode", "initiationDate", "description", "affectedUnits", "status", "correctiveAction", "region"],
    // PMCF
    pmcf_result: ["studyId", "studyType", "startDate", "endDate", "sampleSize", "findings", "conclusions", "status"],
    // Risk
    benefit_risk_assessment: ["assessment", "benefitSummary", "riskSummary", "conclusion", "periodStart", "periodEnd", "deviceCode"],
    // CAPA
    capa_record: ["capaId", "deviceCode", "openDate", "closeDate", "description", "rootCause", "correctiveAction", "status", "effectiveness"],
    // Admin
    device_registry_record: ["deviceCode", "deviceName", "model", "manufacturer", "udi", "riskClass", "intendedPurpose"],
};

type SavedMappingProfile = {
    id: number;
    name: string;
    evidenceType: string;
    columnMappings: Record<string, string>;
    usageCount: number;
};

function ColumnMappingTool({ 
    sourceColumns, 
    evidenceType, 
    onMappingComplete 
}: { 
    sourceColumns: string[];
    evidenceType: string;
    onMappingComplete: (mappings: ColumnMapping[]) => void;
}) {
    const targetFields = EVIDENCE_FIELD_SCHEMAS[evidenceType] || [];
    const [mappings, setMappings] = useState<ColumnMapping[]>([]);
    const [isVerified, setIsVerified] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [profileName, setProfileName] = useState("");
    const [saving, setSaving] = useState(false);
    const [savedProfile, setSavedProfile] = useState<SavedMappingProfile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [profileApplied, setProfileApplied] = useState(false);
    
    // Check for existing saved mapping profile on mount
    useEffect(() => {
        const checkForProfile = async () => {
            setLoadingProfile(true);
            try {
                const res = await fetch("/api/column-mapping-profiles/match", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ evidenceType, sourceColumns })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.found && data.profile) {
                        setSavedProfile(data.profile);
                        
                        // If profile can be auto-applied (verified previously), apply it immediately
                        if (data.canAutoApply) {
                            applyProfile(data.profile);
                            setProfileApplied(true);
                            setIsVerified(true);
                        }
                    } else {
                        // No saved profile, do auto-mapping with SOTA agent
                        await performAutoMapping();
                    }
                } else {
                    await performAutoMapping();
                }
            } catch {
                await performAutoMapping();
            } finally {
                setLoadingProfile(false);
            }
        };
        
        checkForProfile();
    }, [sourceColumns, evidenceType]);
    
    const applyProfile = (profile: SavedMappingProfile) => {
        const profileMappings: ColumnMapping[] = [];
        const mappingsData = profile.columnMappings as Record<string, string>;
        
        for (const [sourceCol, targetField] of Object.entries(mappingsData)) {
            // Find matching source column (case-insensitive)
            const matchedSource = sourceColumns.find(
                s => s.toLowerCase().replace(/[\s_-]/g, "") === sourceCol.toLowerCase().replace(/[\s_-]/g, "")
            );
            if (matchedSource) {
                profileMappings.push({
                    sourceColumn: matchedSource,
                    targetField,
                    confidence: 1.0,
                    autoMapped: false
                });
            }
        }
        
        setMappings(profileMappings);
    };
    
    const performAutoMapping = async () => {
        // Try SOTA backend agent first
        try {
            const res = await fetch("/api/ingest/auto-map", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceColumns,
                    evidenceType
                })
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.mappings) {
                    const agentMappings: ColumnMapping[] = data.mappings
                        .filter((m: any) => m.targetField)
                        .map((m: any) => ({
                            sourceColumn: m.sourceColumn,
                            targetField: m.targetField,
                            confidence: m.confidence,
                            autoMapped: m.method !== "user_provided"
                        }));
                    
                    setMappings(agentMappings);
                    return;
                }
            }
        } catch {
            // Fall back to local matching
        }
        
        // Local fallback with enhanced matching
        const autoMappings: ColumnMapping[] = [];
        const usedSource = new Set<string>();
        const usedTarget = new Set<string>();
        
        // Enhanced alias dictionary - keys are canonical field names matching backend expectations
        const COLUMN_ALIASES: Record<string, string[]> = {
            // Complaint fields
            complaintId: ["complaint_id", "complaint id", "complaintid", "complaint_number", "complaint number", "case_id", "caseid", "ticket_id", "reference", "ref_no", "ccr_number", "qms_number", "record_id"],
            complaintDate: ["complaint_date", "complaintdate", "date_received", "received_date", "datereceived", "date_reported", "report_date", "created_date", "entry_date", "date_opened", "csi_notification_date", "notification_date"],
            deviceCode: ["device_code", "devicecode", "product_code", "product_number", "product number", "part_number", "sku", "model", "catalog_number", "item_number", "material_number"],
            description: ["description", "desc", "details", "narrative", "summary", "issue", "problem", "complaint_text", "notes", "comments", "nonconformity"],
            severity: ["severity", "seriousness", "priority", "criticality", "harm_level", "risk_level", "grade", "class"],
            region: ["region", "sales_region", "market", "territory", "location", "area", "geo", "zone", "distribution_location"],
            country: ["country", "country_code", "countrycode", "nation", "customer_country", "site_country"],
            rootCause: ["root_cause", "rootcause", "cause", "failure_mode", "reason", "finding", "determination", "investigation_findings"],
            correctiveAction: ["corrective_action", "correctiveaction", "corrective_actions", "action_taken", "fix", "remediation", "response"],
            patientOutcome: ["patient_outcome", "patientoutcome", "patient_involvement", "patient_status", "injury", "harm"],
            investigationStatus: ["investigation_status", "status", "state", "disposition", "progress", "stage", "open_closed", "workflow_status"],
            serious: ["serious", "mdr_issued", "reportable", "is_serious"],
            // Sales fields  
            quantity: ["quantity", "qty", "units", "volume", "units_sold", "count", "amount"],
            revenue: ["revenue", "sales", "sales_amount", "value", "total_sales"],
            periodStart: ["period_start", "start_date", "from_date", "begin_date"],
            periodEnd: ["period_end", "end_date", "to_date", "through_date"],
            // FSCA fields
            fscaId: ["fsca_id", "fscaid", "recall_id", "recall_number", "field_action_id"],
            affectedUnits: ["affected_units", "units_affected", "affected_quantity", "scope"],
            // CAPA fields
            capaId: ["capa_id", "capaid", "capa_number", "nc_number", "nonconformance_id"],
            openDate: ["open_date", "date_opened", "initiation_date", "start_date"],
            closeDate: ["close_date", "date_closed", "closure_date", "completion_date"],
            effectiveness: ["effectiveness", "effectiveness_check", "verification_result"]
        };
        
        sourceColumns.forEach(src => {
            const srcNorm = src.toLowerCase().replace(/[_\s-]/g, "");
            let bestMatch: { field: string; score: number } | null = null;
            
            targetFields.forEach(target => {
                if (usedTarget.has(target)) return;
                const targetNorm = target.toLowerCase().replace(/[_\s-]/g, "");
                
                let score = 0;
                
                // Check exact match
                if (srcNorm === targetNorm) {
                    score = 1.0;
                }
                // Check aliases
                else {
                    const aliases = COLUMN_ALIASES[target] || [];
                    for (const alias of aliases) {
                        const aliasNorm = alias.toLowerCase().replace(/[_\s-]/g, "");
                        if (srcNorm === aliasNorm) {
                            score = 0.95;
                            break;
                        }
                        if (srcNorm.includes(aliasNorm) || aliasNorm.includes(srcNorm)) {
                            score = Math.max(score, 0.8);
                        }
                    }
                }
                // Partial match
                if (score === 0) {
                    if (srcNorm.includes(targetNorm) || targetNorm.includes(srcNorm)) {
                        score = 0.7;
                    }
                    else if (srcNorm.split("").filter(c => targetNorm.includes(c)).length / srcNorm.length > 0.6) {
                        score = 0.5;
                    }
                }
                
                if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                    bestMatch = { field: target, score };
                }
            });
            
            if (bestMatch && bestMatch.score >= 0.5) {
                autoMappings.push({
                    sourceColumn: src,
                    targetField: bestMatch.field,
                    confidence: bestMatch.score,
                    autoMapped: true
                });
                usedSource.add(src);
                usedTarget.add(bestMatch.field);
            }
        });
        
        setMappings(autoMappings);
    };
    
    const unmappedSource = sourceColumns.filter(s => !mappings.find(m => m.sourceColumn === s));
    const unmappedTarget = targetFields.filter(t => !mappings.find(m => m.targetField === t));
    const lowConfidenceMappings = mappings.filter(m => m.confidence < 0.9 && m.autoMapped);
    const hasIssues = lowConfidenceMappings.length > 0 || unmappedTarget.length > 0;
    
    const updateMapping = (sourceColumn: string, targetField: string) => {
        setIsVerified(false);
        setMappings(prev => {
            const existing = prev.find(m => m.sourceColumn === sourceColumn);
            if (existing) {
                if (targetField === "") {
                    return prev.filter(m => m.sourceColumn !== sourceColumn);
                }
                return prev.map(m => m.sourceColumn === sourceColumn ? { ...m, targetField, autoMapped: false, confidence: 1 } : m);
            }
            return [...prev, { sourceColumn, targetField, confidence: 1, autoMapped: false }];
        });
    };
    
    const addMapping = (sourceColumn: string, targetField: string) => {
        if (!sourceColumn || !targetField) return;
        setIsVerified(false);
        setMappings(prev => [...prev, { sourceColumn, targetField, confidence: 1, autoMapped: false }]);
    };
    
    const removeMapping = (sourceColumn: string) => {
        setIsVerified(false);
        setMappings(prev => prev.filter(m => m.sourceColumn !== sourceColumn));
    };
    
    const handleVerify = () => {
        setIsVerified(true);
    };
    
    const handleSaveProfile = async () => {
        if (!profileName.trim()) return;
        setSaving(true);
        
        try {
            // Convert mappings to the format needed for storage
            const columnMappings: Record<string, string> = {};
            for (const m of mappings) {
                columnMappings[m.sourceColumn] = m.targetField;
            }
            
            const res = await fetch("/api/column-mapping-profiles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: profileName,
                    evidenceType,
                    columnMappings
                })
            });
            
            if (res.ok) {
                const newProfile = await res.json();
                setSavedProfile(newProfile);
                setShowSaveDialog(false);
                setProfileName("");
            }
        } catch (e) {
            console.error("Failed to save profile:", e);
        } finally {
            setSaving(false);
        }
    };
    
    if (loadingProfile) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Checking for saved mapping profiles...</span>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            {/* Profile Status Banner */}
            {profileApplied && savedProfile && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <span className="text-sm font-medium text-emerald-700">Verified mapping profile applied: </span>
                            <span className="text-sm text-emerald-600">{savedProfile.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">(Used {savedProfile.usageCount} times)</span>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-7">
                        This mapping was previously verified by a human. You can proceed directly or review below.
                    </p>
                </div>
            )}
            
            {/* Low Confidence Warning */}
            {!profileApplied && hasIssues && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-sm font-medium text-amber-700">Review Required</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-7">
                        {lowConfidenceMappings.length > 0 && `${lowConfidenceMappings.length} mapping(s) have low confidence. `}
                        {unmappedTarget.length > 0 && `${unmappedTarget.length} required field(s) are not mapped. `}
                        Please verify before proceeding.
                    </p>
                </div>
            )}
            
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="font-semibold">Column Mapping</h4>
                    <p className="text-sm text-muted-foreground">Map your source columns to {formatType(evidenceType)} fields</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="px-2 py-1 rounded bg-green-500/10 text-green-600 border border-green-500/20">
                        {mappings.length} mapped
                    </span>
                    {lowConfidenceMappings.length > 0 && (
                        <span className="px-2 py-1 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20">
                            {lowConfidenceMappings.length} uncertain
                        </span>
                    )}
                    {unmappedTarget.length > 0 && (
                        <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            {unmappedTarget.length} required
                        </span>
                    )}
                    {isVerified && (
                        <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Verified
                        </span>
                    )}
                </div>
            </div>
            
            {/* Mapping Grid */}
            <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                {/* Headers */}
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Source Column</div>
                <div></div>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Target Field</div>
                
                {/* Existing Mappings */}
                {mappings.map((m, i) => {
                    const isLowConfidence = m.confidence < 0.9 && m.autoMapped;
                    return (
                        <div key={i} className="contents group">
                            <div className={`px-3 py-2 rounded-l border ${
                                isLowConfidence 
                                    ? "border-orange-500/50 bg-orange-500/10" 
                                    : m.autoMapped 
                                        ? "border-blue-500/30 bg-blue-500/5" 
                                        : "border-border bg-muted/30"
                            }`}>
                                <span className="text-sm font-medium">{m.sourceColumn}</span>
                                {m.autoMapped && (
                                    <span className={`ml-2 text-[10px] ${isLowConfidence ? "text-orange-500" : "text-blue-500"}`}>
                                        {isLowConfidence ? `${Math.round(m.confidence * 100)}%` : "AUTO"}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center justify-center px-2">
                                <svg className={`w-5 h-5 ${isLowConfidence ? "text-orange-500" : "text-muted-foreground"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    className={`flex-1 px-3 py-2 rounded-r border bg-background text-sm ${
                                        isLowConfidence ? "border-orange-500/50" : "border-border"
                                    }`}
                                    value={m.targetField}
                                    onChange={e => updateMapping(m.sourceColumn, e.target.value)}
                                >
                                    <option value={m.targetField}>{m.targetField}</option>
                                    {unmappedTarget.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={() => removeMapping(m.sourceColumn)}
                                    className="p-2 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Unmapped Sections */}
            {(unmappedSource.length > 0 || unmappedTarget.length > 0) && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    {/* Unmapped Source */}
                    <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">Unmapped Source Columns</div>
                        <div className="flex flex-wrap gap-1">
                            {unmappedSource.map(s => (
                                <span key={s} className="px-2 py-1 text-xs rounded bg-muted border border-border">{s}</span>
                            ))}
                            {unmappedSource.length === 0 && <span className="text-xs text-muted-foreground">All columns mapped</span>}
                        </div>
                    </div>
                    
                    {/* Unmapped Target */}
                    <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">Required Fields (Unmapped)</div>
                        <div className="flex flex-wrap gap-1">
                            {unmappedTarget.map(t => (
                                <span key={t} className="px-2 py-1 text-xs rounded bg-amber-500/10 border border-amber-500/20 text-amber-600">{t}</span>
                            ))}
                            {unmappedTarget.length === 0 && <span className="text-xs text-green-600">All fields covered</span>}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Add Mapping */}
            {unmappedSource.length > 0 && unmappedTarget.length > 0 && (
                <div className="flex items-center gap-2 pt-2">
                    <select className="flex-1 px-3 py-2 rounded border border-border bg-background text-sm" id="add-source">
                        <option value="">Select source column...</option>
                        {unmappedSource.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    <select className="flex-1 px-3 py-2 rounded border border-border bg-background text-sm" id="add-target">
                        <option value="">Select target field...</option>
                        {unmappedTarget.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                        onClick={() => {
                            const src = (document.getElementById("add-source") as HTMLSelectElement).value;
                            const tgt = (document.getElementById("add-target") as HTMLSelectElement).value;
                            addMapping(src, tgt);
                        }}
                        className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                    >
                        Add
                    </button>
                </div>
            )}
            
            {/* Save Profile Dialog */}
            {showSaveDialog && (
                <div className="p-4 rounded-lg border border-border bg-muted/30">
                    <h5 className="font-medium mb-2">Save Mapping Profile</h5>
                    <p className="text-xs text-muted-foreground mb-3">
                        Save this verified mapping for future uploads. The system will automatically apply it when the same column structure is detected.
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Profile name (e.g., 'QMS Complaints Export')"
                            value={profileName}
                            onChange={e => setProfileName(e.target.value)}
                            className="flex-1 px-3 py-2 rounded border border-border bg-background text-sm"
                        />
                        <button
                            onClick={handleSaveProfile}
                            disabled={saving || !profileName.trim()}
                            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Save Profile"}
                        </button>
                        <button
                            onClick={() => { setShowSaveDialog(false); setProfileName(""); }}
                            className="px-3 py-2 rounded border border-border text-sm hover:bg-muted"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                    {isVerified && !savedProfile && !showSaveDialog && (
                        <button
                            onClick={() => setShowSaveDialog(true)}
                            className="px-3 py-2 rounded border border-border text-sm hover:bg-muted flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                            Save as Profile
                        </button>
                    )}
                </div>
                
                <div className="flex items-center gap-2">
                    {!isVerified && (
                        <button
                            onClick={handleVerify}
                            className="px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Verify Mapping
                        </button>
                    )}
                    <button
                        onClick={() => onMappingComplete(mappings)}
                        disabled={!isVerified}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                            isVerified 
                                ? "bg-green-600 text-white hover:bg-green-700" 
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                        }`}
                    >
                        Apply Mapping ({mappings.length} fields)
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED AI INGESTION WITH MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

function EnhancedIngestionPanel({ 
    psurCaseId, deviceCode, periodStart, periodEnd, onComplete 
}: { 
    psurCaseId: number; deviceCode: string; periodStart: string; periodEnd: string; onComplete: () => void;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [sourceType, setSourceType] = useState("complaints");
    const [parsing, setParsing] = useState(false);
    const [parsedData, setParsedData] = useState<{ columns: string[]; rows: Record<string, unknown>[]; preview: Record<string, unknown>[] } | null>(null);
    const [showMapping, setShowMapping] = useState(false);
    const [mappings, setMappings] = useState<ColumnMapping[]>([]);
    const [creating, setCreating] = useState(false);
    const [docxSections, setDocxSections] = useState<{ title: string; content: string; type: string }[]>([]);
    
    // 8 high-level input categories aligned with sourceMapping.ts
    const sourceTypes = [
        { id: "cer", label: "CER Documents", formats: "DOCX, PDF", evidenceType: "cer_extract" },
        { id: "sales", label: "Sales Data", formats: "Excel, CSV, JSON", evidenceType: "sales_volume" },
        { id: "complaints", label: "Complaints", formats: "Excel, CSV, JSON", evidenceType: "complaint_record" },
        { id: "fsca", label: "FSCA Records", formats: "Excel, CSV, JSON", evidenceType: "fsca_record" },
        { id: "pmcf", label: "PMCF Data", formats: "DOCX, PDF, Excel", evidenceType: "pmcf_result" },
        { id: "risk", label: "Risk Documents", formats: "DOCX, PDF", evidenceType: "benefit_risk_assessment" },
        { id: "capa", label: "CAPA Records", formats: "Excel, CSV", evidenceType: "capa_record" },
        { id: "admin", label: "Admin Data", formats: "Excel, CSV", evidenceType: "device_registry_record" },
    ];
    
    const currentSource = sourceTypes.find(s => s.id === sourceType);
    
    const parseFile = async () => {
        if (!file) return;
        setParsing(true);
        
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("sourceType", sourceType);
            
            const res = await fetch("/api/ingest/parse-preview", { method: "POST", body: formData });
            
            if (res.ok) {
                const data = await res.json();
                
                if (data.type === "tabular") {
                    setParsedData({ columns: data.columns, rows: data.rows, preview: data.preview });
                    setShowMapping(true);
                } else if (data.type === "document") {
                    setDocxSections(data.sections || []);
                }
            } else {
                // Fallback: simulate parsing for demo
                const ext = file.name.split(".").pop()?.toLowerCase();
                if (ext === "xlsx" || ext === "csv") {
                    setParsedData({
                        columns: ["ID", "Date", "Description", "Severity", "Region", "Status"],
                        rows: [],
                        preview: [
                            { ID: "C001", Date: "2024-01-15", Description: "Device malfunction", Severity: "Medium", Region: "EU", Status: "Closed" },
                            { ID: "C002", Date: "2024-02-20", Description: "User error reported", Severity: "Low", Region: "US", Status: "Open" },
                        ]
                    });
                    setShowMapping(true);
                } else if (ext === "docx" || ext === "pdf") {
                    setDocxSections([
                        { title: "Executive Summary", content: "This document contains...", type: "narrative" },
                        { title: "Clinical Data", content: "Study results indicate...", type: "data" },
                        { title: "Conclusions", content: "Based on the analysis...", type: "narrative" },
                    ]);
                }
            }
        } catch (e) {
            console.error("Parse error:", e);
        } finally {
            setParsing(false);
        }
    };
    
    const createAtoms = async () => {
        setCreating(true);
        try {
            // Convert mappings array to object format expected by backend
            // Backend expects: { "Source Column Name": "target_field_name" }
            const columnMappingsObj: Record<string, string> = {};
            for (const m of mappings) {
                if (m.targetField) {
                    columnMappingsObj[m.sourceColumn] = m.targetField;
                }
            }
            
            // Create records from mapped data
            const formData = new FormData();
            formData.append("psur_case_id", String(psurCaseId));
            formData.append("device_code", deviceCode);
            formData.append("period_start", periodStart);
            formData.append("period_end", periodEnd);
            formData.append("evidence_type", currentSource?.evidenceType || "complaint_record");
            if (file) formData.append("file", file);
            
            // Send column_mappings in the format backend expects
            formData.append("column_mappings", JSON.stringify(columnMappingsObj));
            
            const res = await fetch("/api/evidence/upload", { method: "POST", body: formData });
            if (res.ok) {
                onComplete();
            } else {
                const err = await res.json();
                console.error("Upload failed:", err);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setCreating(false);
        }
    };
    
    return (
        <div className="space-y-5">
            {/* Source Type Selection */}
            <div>
                <label className="text-sm font-medium mb-2 block">Source Type</label>
                <div className="grid grid-cols-4 gap-2">
                    {sourceTypes.map(s => (
                        <button
                            key={s.id}
                            onClick={() => { setSourceType(s.id); setParsedData(null); setShowMapping(false); setDocxSections([]); }}
                            className={`p-3 rounded-lg border text-left transition-all ${
                                sourceType === s.id 
                                    ? "border-blue-500 bg-blue-500/10" 
                                    : "border-border hover:border-blue-300"
                            }`}
                        >
                            <div className="font-medium text-sm">{s.label}</div>
                            <div className="text-[10px] text-muted-foreground">{s.formats}</div>
                        </button>
                    ))}
                </div>
            </div>
            
            {/* File Upload */}
            <div>
                <label className="text-sm font-medium mb-2 block">Upload File</label>
                <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                        <input
                            type="file"
                            accept=".xlsx,.csv,.xls,.json,.docx,.pdf"
                            onChange={e => { setFile(e.target.files?.[0] || null); setParsedData(null); setShowMapping(false); }}
                            className="w-full px-4 py-3 rounded-lg border border-dashed border-border bg-muted/30 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700 cursor-pointer"
                        />
                    </div>
                    {file && !showMapping && !docxSections.length && (
                        <button
                            onClick={parseFile}
                            disabled={parsing}
                            className="px-4 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            {parsing ? "Parsing..." : "Parse File"}
                        </button>
                    )}
                </div>
                {file && <p className="text-xs text-muted-foreground mt-1">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
            </div>
            
            {/* Tabular Data Preview & Mapping */}
            {parsedData && showMapping && (
                <div className="space-y-4">
                    {/* Preview Table */}
                    <div>
                        <label className="text-sm font-medium mb-2 block">Data Preview (first {parsedData.preview.length} rows)</label>
                        <div className="rounded-lg border overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            {parsedData.columns.map(col => (
                                                <th key={col} className="px-3 py-2 text-left font-medium text-xs">{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {parsedData.preview.map((row, i) => (
                                            <tr key={i} className="hover:bg-muted/30">
                                                {parsedData.columns.map(col => (
                                                    <td key={col} className="px-3 py-2 text-xs">{String(row[col] || "-")}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    {/* Column Mapping Tool */}
                    <div className="rounded-lg border p-4">
                        <ColumnMappingTool
                            sourceColumns={parsedData.columns}
                            evidenceType={currentSource?.evidenceType || "complaint_record"}
                            onMappingComplete={(m) => { setMappings(m); }}
                        />
                    </div>
                    
                    {/* Create Records */}
                    {mappings.length > 0 && (
                        <button
                            onClick={createAtoms}
                            disabled={creating}
                            className="w-full py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                            {creating ? "Processing Records..." : `Import ${parsedData.rows.length || parsedData.preview.length} Records`}
                        </button>
                    )}
                </div>
            )}
            
            {/* DOCX/PDF Section Mapping */}
            {docxSections.length > 0 && (
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium mb-2 block">Document Sections Detected</label>
                        <div className="space-y-2">
                            {docxSections.map((section, i) => (
                                <div key={i} className="p-3 rounded-lg border bg-muted/30">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-sm">{section.title}</span>
                                        <select className="px-2 py-1 rounded border border-border bg-background text-xs">
                                            <option value="">Map to evidence type...</option>
                                            <option value="cer_extract">CER Extract</option>
                                            <option value="pmcf_result">PMCF Result</option>
                                            <option value="benefit_risk_assessment">Benefit-Risk Assessment</option>
                                            <option value="clinical_evaluation_extract">Clinical Evaluation</option>
                                        </select>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">{section.content}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <button
                        onClick={createAtoms}
                        disabled={creating}
                        className="w-full py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                        {creating ? "Extracting..." : `Extract Evidence from ${docxSections.length} Sections`}
                    </button>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECONCILE STEP - Handle Missing Evidence Types
// ═══════════════════════════════════════════════════════════════════════════════

function ReconcileStep({
    psurCaseId,
    deviceCode,
    periodStart,
    periodEnd,
    requiredTypes,
    counts,
    missingTypes,
    coveredTypes,
    isTypeCovered,
    onRefresh,
    onUpload,
}: {
    psurCaseId: number;
    deviceCode: string;
    periodStart: string;
    periodEnd: string;
    requiredTypes: string[];
    counts: AtomCountsResponse | null;
    missingTypes: string[];
    coveredTypes: Set<string>;
    isTypeCovered: (t: string) => boolean;
    onRefresh: () => void;
    onUpload: () => void;
}) {
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
    const [markingNA, setMarkingNA] = useState(false);
    const [naReason, setNaReason] = useState("");
    const [showNAModal, setShowNAModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadType, setUploadType] = useState<string | null>(null);
    
    const toggleType = (t: string) => {
        const newSet = new Set(selectedTypes);
        if (newSet.has(t)) {
            newSet.delete(t);
        } else {
            newSet.add(t);
        }
        setSelectedTypes(newSet);
    };
    
    const selectAllMissing = () => {
        setSelectedTypes(new Set(missingTypes));
    };
    
    const clearSelection = () => {
        setSelectedTypes(new Set());
    };
    
    const markSelectedAsNA = async () => {
        if (selectedTypes.size === 0) return;
        setMarkingNA(true);
        try {
            const resp = await fetch("/api/evidence/mark-na", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    psurCaseId,
                    deviceCode,
                    periodStart,
                    periodEnd,
                    evidenceTypes: Array.from(selectedTypes),
                    reason: naReason || undefined,
                }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);
            setSelectedTypes(new Set());
            setNaReason("");
            setShowNAModal(false);
            onRefresh();
        } catch (e: any) {
            console.error("Failed to mark as N/A:", e);
        } finally {
            setMarkingNA(false);
        }
    };
    
    const openUploadForType = (type: string) => {
        setUploadType(type);
        setShowUploadModal(true);
    };

    return (
        <div className="h-full flex flex-col space-y-8 animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-1">Reconcile Evidence</h2>
                    <p className="text-muted-foreground">Review requirement status and mark non-applicable evidence types.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="ios-pill bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        {requiredTypes.length - missingTypes.length} Complete
                    </div>
                    {missingTypes.length > 0 && (
                        <div className="ios-pill bg-amber-500/10 text-amber-600 border-amber-500/20">
                            {missingTypes.length} Missing
                        </div>
                    )}
                </div>
            </div>

            {/* Action Bar */}
            {missingTypes.length > 0 && (
                <div className="glass-card p-4 flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={selectAllMissing}
                            className="ios-pill hover:bg-white/80 active:scale-95 transition-all"
                        >
                            Select All Missing
                        </button>
                        {selectedTypes.size > 0 && (
                            <button 
                                onClick={clearSelection}
                                className="text-sm font-medium text-muted-foreground hover:text-foreground px-4"
                            >
                                Clear Selection
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={onUpload}
                            className="glossy-button bg-primary text-primary-foreground shadow-lg"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span>Upload Data</span>
                        </button>
                        <button 
                            onClick={() => selectedTypes.size > 0 && setShowNAModal(true)}
                            disabled={selectedTypes.size === 0}
                            className="glossy-button bg-white text-foreground border-border/50 disabled:opacity-40"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            <span>Mark as N/A ({selectedTypes.size})</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Evidence Type Grid */}
            <div className="flex-1 overflow-visible">
                {missingTypes.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-scale-in">
                        <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center shadow-inner">
                            <svg className="w-12 h-12 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-foreground tracking-tight">System Fully Synchronized</h3>
                        <p className="text-lg text-muted-foreground max-w-md">
                            All required regulatory evidence has been successfully reconciled and mapped.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {/* Missing Types */}
                        <div>
                            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                Action Required ({missingTypes.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {missingTypes.map(t => (
                                    <div 
                                        key={t} 
                                        onClick={() => toggleType(t)}
                                        className={cn(
                                            "glass-card p-6 cursor-pointer group hover:scale-105",
                                            selectedTypes.has(t) 
                                                ? "border-primary bg-primary/5 shadow-2xl scale-[1.02]" 
                                                : "hover:bg-white/80"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-6">
                                            <div className={cn(
                                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                                                selectedTypes.has(t) ? "bg-primary border-primary" : "border-muted-foreground/30"
                                            )}>
                                                {selectedTypes.has(t) && (
                                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); openUploadForType(t); }}
                                                className="w-10 h-10 rounded-full flex items-center justify-center bg-secondary/50 hover:bg-white transition-all text-muted-foreground hover:text-primary shadow-sm"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                </svg>
                                            </button>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{formatType(t)}</div>
                                            <div className="text-sm font-medium text-amber-600/80">Missing Evidence</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Completed Requirements */}
                        <div>
                            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                Verified Evidence ({requiredTypes.length - missingTypes.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80">
                                {requiredTypes.filter(t => isTypeCovered(t)).map(t => {
                                    const atomCount = counts?.byType?.[t] || 0;
                                    const coverageInfo = counts?.coverage?.coveredByType?.[t];
                                    return (
                                        <div key={t} className="glass-card p-6 bg-emerald-500/[0.02] border-emerald-500/10">
                                            <div className="flex items-center justify-between mb-6">
                                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shadow-sm">
                                                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="ios-pill bg-emerald-500/5 text-emerald-600 font-bold border-none text-sm">{atomCount > 0 ? atomCount : "Synced"}</span>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="text-lg font-bold text-foreground">{formatType(t)}</div>
                                                {coverageInfo?.source && atomCount === 0 && (
                                                    <div className="text-xs font-medium text-muted-foreground">Certified via {coverageInfo.source}</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Mark as N/A Modal */}
            {showNAModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNAModal(false)}>
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div className="relative max-w-lg w-full rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-border">
                            <h3 className="text-lg font-semibold text-foreground">Mark Evidence as N/A</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Confirm that the selected evidence types have no applicable data for this PSUR period.
                            </p>
                        </div>
                        <div className="p-5">
                            <div className="mb-4">
                                <label className="text-sm font-medium text-foreground mb-2 block">Selected Types ({selectedTypes.size})</label>
                                <div className="flex flex-wrap gap-1">
                                    {Array.from(selectedTypes).map(t => (
                                        <span key={t} className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-xs">
                                            {formatType(t)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="text-sm font-medium text-foreground mb-2 block">Justification (Optional)</label>
                                <textarea
                                    value={naReason}
                                    onChange={e => setNaReason(e.target.value)}
                                    placeholder="e.g., No FSCAs were issued during this reporting period..."
                                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                                    rows={3}
                                />
                            </div>
                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                <div className="flex items-start gap-2">
                                    <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <div className="text-sm text-amber-300">
                                        This will create "negative evidence" records confirming no data exists for these types. This is auditable and traceable.
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t border-border flex items-center justify-end gap-3">
                            <button 
                                onClick={() => setShowNAModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={markSelectedAsNA}
                                disabled={markingNA}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 flex items-center gap-2"
                            >
                                {markingNA ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Marking...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Confirm N/A ({selectedTypes.size} types)
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload for Specific Type Modal */}
            {showUploadModal && uploadType && (
                <Modal open={showUploadModal} onClose={() => { setShowUploadModal(false); setUploadType(null); }} title={`Upload ${formatType(uploadType)}`} size="md">
                    <SingleTypeUploadForm 
                        psurCaseId={psurCaseId}
                        deviceCode={deviceCode}
                        periodStart={periodStart}
                        periodEnd={periodEnd}
                        evidenceType={uploadType}
                        onSuccess={() => { onRefresh(); setShowUploadModal(false); setUploadType(null); }}
                    />
                </Modal>
            )}
        </div>
    );
}

// Single type upload form for reconciliation
function SingleTypeUploadForm({ 
    psurCaseId, deviceCode, periodStart, periodEnd, evidenceType, onSuccess 
}: {
    psurCaseId: number; deviceCode: string; periodStart: string; periodEnd: string; evidenceType: string; onSuccess: () => void;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    async function upload() {
        if (!file) return;
        setBusy(true); setMsg("");
        try {
            const form = new FormData();
            form.append("psur_case_id", String(psurCaseId));
            form.append("device_code", deviceCode);
            form.append("period_start", periodStart);
            form.append("period_end", periodEnd);
            form.append("evidence_type", evidenceType);
            form.append("file", file);
            const resp = await fetch("/api/evidence/upload", { method: "POST", body: form });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);
            setMsg(`Imported ${data.summary?.atomsCreated || 0} records`);
            setFile(null);
            setTimeout(onSuccess, 1000);
        } catch (e: any) { setMsg(`Error: ${e.message}`); }
        finally { setBusy(false); }
    }

    return (
        <div className="space-y-4">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="text-sm text-blue-300">
                    Upload data specifically for <span className="font-semibold">{formatType(evidenceType)}</span>
                </div>
            </div>
            <div>
                <label className="text-sm font-medium mb-1 block">File (.xlsx, .csv)</label>
                <input 
                    type="file" 
                    accept=".xlsx,.csv,.xls" 
                    className="w-full border rounded px-3 py-2 bg-background" 
                    onChange={e => setFile(e.target.files?.[0] || null)} 
                />
            </div>
            <div className="flex items-center gap-3">
                <button 
                    onClick={upload} 
                    disabled={busy || !file} 
                    className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
                >
                    {busy ? "Uploading..." : "Upload"}
                </button>
                {msg && <span className="text-sm">{msg}</span>}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN WIZARD
// ═══════════════════════════════════════════════════════════════════════════════

// Type for existing PSUR cases from API
interface ExistingCase {
    id: number;
    psurReference: string;
    templateId: string;
    jurisdictions: string[];
    startPeriod: string;
    endPeriod: string;
    deviceIds: number[];
    leadingDeviceId: number;
    status: string;
    createdAt: string;
}

export default function PsurWizard() {
    const [step, setStep] = useState<WizardStep>(1);

    // Draft state
    const [deviceCode, setDeviceCode] = useState("JS3000X");
    const [deviceId, setDeviceId] = useState(1);
    const [templateId, setTemplateId] = useState("MDCG_2022_21_ANNEX_I");
    const [jurisdictions, setJurisdictions] = useState<string[]>(["EU_MDR"]);
    const [periodStart, setPeriodStart] = useState("2024-01-01");
    const [periodEnd, setPeriodEnd] = useState("2024-12-31");
    const [psurCaseId, setPsurCaseId] = useState<number | null>(null);
    const [psurRef, setPsurRef] = useState<string | null>(null);
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState("");
    const [conflictCase, setConflictCase] = useState<{ id: number; psurReference: string; status: string } | null>(null);

    // Device Information (for report generation)
    const [deviceName, setDeviceName] = useState("");
    const [manufacturerName, setManufacturerName] = useState("");
    const [udiDi, setUdiDi] = useState("");
    const [gmdnCode, setGmdnCode] = useState("");
    const [intendedPurpose, setIntendedPurpose] = useState("");
    const [deviceRiskClass, setDeviceRiskClass] = useState<"I" | "IIa" | "IIb" | "III">("IIa");
    const [showDeviceDetails, setShowDeviceDetails] = useState(false);

    // Data
    const [devices, setDevices] = useState<Device[]>([]);
    const [existingDrafts, setExistingDrafts] = useState<ExistingCase[]>([]);
    const [counts, setCounts] = useState<AtomCountsResponse | null>(null);
    const [requiredTypes, setRequiredTypes] = useState<string[]>([]);
    const [loadingDraft, setLoadingDraft] = useState(false);

    // Workflow
    const [runBusy, setRunBusy] = useState(false);
    const [runResult, setRunResult] = useState<RunWorkflowResponse | null>(null);
    const [pollingActive, setPollingActive] = useState(false);
    const [pollFailures, setPollFailures] = useState(0);
    const [pollError, setPollError] = useState("");
    const [runtimeEvents, setRuntimeEvents] = useState<any[]>([]);
    const [runtimeConnected, setRuntimeConnected] = useState(false);
    const runtimeEsRef = useRef<EventSource | null>(null);

    // Polling for workflow progress
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        
        if (pollingActive && psurCaseId) {
            interval = setInterval(async () => {
                try {
                    const data = await api<RunWorkflowResponse>(`/api/orchestrator/cases/${psurCaseId}`);
                    setRunResult(data);
                    setPollError("");
                    setPollFailures(0);
                    
                    // Check if everything is finished
                    const isFinished = data.steps.every(s => s.status === "COMPLETED" || s.status === "FAILED" || s.status === "BLOCKED");
                    if (isFinished) {
                        setPollingActive(false);
                        setRunBusy(false);
                    }
                } catch (e: any) {
                    const message = e?.message || "Connection lost";
                    setPollError(message);
                    setPollFailures(prev => {
                        const next = prev + 1;
                        if (next >= 3) {
                            setPollingActive(false);
                            setRunBusy(false);
                        }
                        return next;
                    });
                }
            }, 5000);
        }
        
        return () => { if (interval) clearInterval(interval); };
    }, [pollingActive, psurCaseId]);

    // Realtime runtime events (SSE)
    useEffect(() => {
        if (!psurCaseId) return;
        // connect when we are running/polling or in compile step
        if (!pollingActive && !runBusy) return;

        // close any previous stream (may already be closed, which is fine)
        try { 
            runtimeEsRef.current?.close(); 
        } catch (e) {
            // EventSource may already be closed - this is expected during cleanup
            console.debug("[RuntimeStream] Previous stream cleanup:", e);
        }
        setRuntimeConnected(false);

        const es = new EventSource(`/api/orchestrator/cases/${psurCaseId}/stream`);
        runtimeEsRef.current = es;

        es.addEventListener("open", () => setRuntimeConnected(true));
        es.addEventListener("error", () => setRuntimeConnected(false));
        es.addEventListener("runtime", (msg: any) => {
            try {
                const data = JSON.parse(msg.data);
                setRuntimeEvents(prev => {
                    const next = [data, ...prev];
                    return next.slice(0, 200);
                });
            } catch (e) {
                console.error("[RuntimeStream] Failed to parse runtime event:", e, msg?.data?.slice?.(0, 200));
            }
        });

        return () => {
            try { 
                es.close(); 
            } catch (e) {
                // EventSource cleanup - may already be closed
                console.debug("[RuntimeStream] Stream cleanup:", e);
            }
            runtimeEsRef.current = null;
            setRuntimeConnected(false);
        };
    }, [psurCaseId, pollingActive, runBusy]);
    const [traceSummary, setTraceSummary] = useState<TraceSummary | null>(null);
    
    // AI Options - Default to ON for SOTA narrative generation
    const [enableAIGeneration, setEnableAIGeneration] = useState(true);
    
    // Document Style Options
    type DocumentStyle = "corporate" | "regulatory" | "premium";
    const [documentStyle, setDocumentStyle] = useState<DocumentStyle>("corporate");
    const [enableCharts, setEnableCharts] = useState(true);

    // Modals
    const [showIngestionModal, setShowIngestionModal] = useState(false);
    const [showEvidenceModal, setShowEvidenceModal] = useState(false);
    const [isEvidenceGridOpen, setIsEvidenceGridOpen] = useState(true);

    // Load data
    useEffect(() => { 
        api<Device[]>("/api/devices")
            .then(setDevices)
            .catch((e) => console.error("[PSURWizard] Failed to load devices:", e)); 
    }, []);
    useEffect(() => { 
        api<ExistingCase[]>("/api/psur-cases")
            .then(cases => setExistingDrafts(cases.filter(c => c.status === "draft")))
            .catch((e) => console.error("[PSURWizard] Failed to load PSUR cases:", e)); 
    }, []);
    useEffect(() => {
        api<{ requiredEvidenceTypes: string[] }>(`/api/templates/${templateId}/requirements`)
            .then(d => setRequiredTypes(d.requiredEvidenceTypes?.sort() || ["sales_volume", "complaint_record", "fsca_record"]))
            .catch(() => setRequiredTypes(["sales_volume", "complaint_record", "fsca_record"]));
    }, [templateId]);

    const refreshCounts = useCallback(async () => {
        if (!psurCaseId) return;
        try { setCounts(await api<AtomCountsResponse>(`/api/evidence/atoms/counts?psur_case_id=${psurCaseId}`)); }
        catch { setCounts(null); }
    }, [psurCaseId]);

    useEffect(() => { if (psurCaseId) refreshCounts(); }, [psurCaseId, refreshCounts]);

    // Actions
    async function createDraft() {
        setCreateBusy(true); setCreateError(""); setConflictCase(null);
        try {
            const data = await api<CreateCaseResponse>("/api/psur-cases", {
                method: "POST",
                body: JSON.stringify({
                    psurReference: `PSUR-${Date.now().toString(36).toUpperCase()}`,
                    version: 1, templateId, jurisdictions, startPeriod: periodStart, endPeriod: periodEnd,
                    deviceIds: [deviceId], leadingDeviceId: deviceId, status: "draft",
                    // Include device information for the case
                    deviceInfo: {
                        deviceCode,
                        deviceName: deviceName || deviceCode,
                        manufacturerName,
                        udiDi,
                        gmdnCode,
                        intendedPurpose,
                        riskClass: deviceRiskClass,
                    }
                }),
            });
            setPsurCaseId(data.id); setPsurRef(data.psurReference);
            
            // Create device_registry_record evidence atom if device info was provided
            if (deviceName || manufacturerName || intendedPurpose) {
                try {
                    await api("/api/evidence/atoms/batch", {
                        method: "POST",
                        body: JSON.stringify({
                            psurCaseId: data.id,
                            evidenceType: "device_registry_record",
                            atoms: [{
                                device_code: deviceCode,
                                device_name: deviceName || deviceCode,
                                name: deviceName || deviceCode,
                                manufacturer_name: manufacturerName,
                                udi_di: udiDi,
                                gmdn_code: gmdnCode,
                                gmdn: gmdnCode,
                                intended_purpose: intendedPurpose,
                                intended_use: intendedPurpose,
                                risk_class: deviceRiskClass,
                                classification: `Class ${deviceRiskClass}`,
                                model: deviceCode,
                                isUserProvided: true,
                                _provenance: {
                                    sourceFile: "user_input",
                                    extractedAt: new Date().toISOString(),
                                    deviceRef: { deviceCode },
                                }
                            }],
                        }),
                    });
                    console.log("[PSURWizard] Created device_registry_record from user input");
                } catch (atomErr) {
                    console.warn("[PSURWizard] Failed to create device_registry_record atom:", atomErr);
                }
            }
            
            setStep(2);
            // Remove from existing drafts list since it's now active
            setExistingDrafts(prev => prev.filter(c => c.id !== data.id));
        } catch (e: any) {
            const apiErr = e as ApiError;
            if (apiErr.status === 409 && apiErr.existingCase) {
                // Conflict - case already exists for this device/period
                setConflictCase(apiErr.existingCase);
                setCreateError(`A case already exists: ${apiErr.existingCase.psurReference} (${apiErr.existingCase.status}). Resume it or change the surveillance period.`);
            } else {
                setCreateError(e?.message || "Failed");
            }
        }
        finally { setCreateBusy(false); }
    }

    async function resumeConflictCase() {
        if (!conflictCase) return;
        // Fetch the full case data and resume it
        setLoadingDraft(true); setCreateError("");
        try {
            const cases = await api<ExistingCase[]>("/api/psur-cases");
            const caseData = cases.find(c => c.id === conflictCase.id);
            if (caseData) {
                await resumeDraft(caseData);
            } else {
                setCreateError("Could not find the existing case");
            }
        } catch (e: any) {
            setCreateError(e?.message || "Failed to load case");
        } finally {
            setLoadingDraft(false);
            setConflictCase(null);
        }
    }

    async function resumeDraft(caseData: ExistingCase) {
        setLoadingDraft(true); setCreateError("");
        try {
            // Load draft details and set state
            setPsurCaseId(caseData.id);
            setPsurRef(caseData.psurReference);
            setTemplateId(caseData.templateId);
            setJurisdictions(caseData.jurisdictions || ["EU_MDR"]);
            setPeriodStart(caseData.startPeriod.split("T")[0]);
            setPeriodEnd(caseData.endPeriod.split("T")[0]);
            setDeviceId(caseData.leadingDeviceId);
            
            // Find device code from devices list
            const device = devices.find(d => d.id === caseData.leadingDeviceId);
            if (device) setDeviceCode(device.deviceCode);
            
            // Load evidence counts for this draft
            const countsData = await api<AtomCountsResponse>(`/api/evidence/atoms/counts?psur_case_id=${caseData.id}`);
            setCounts(countsData);
            
            // Determine which step to go to based on evidence
            const hasEvidence = countsData.totals.all > 0;
            setStep(hasEvidence ? 2 : 2); // Go to upload step, user can proceed from there
            
        } catch (e: any) { setCreateError(e?.message || "Failed to load draft"); }
        finally { setLoadingDraft(false); }
    }

    async function runWorkflow() {
        if (!psurCaseId) return;
        setRunBusy(true);
        setPollingActive(true);
        setPollError("");
        setPollFailures(0);
        try {
            await api<{ ok: true; psurCaseId: number; status: string }>("/api/orchestrator/run", {
                method: "POST",
                body: JSON.stringify({ templateId, jurisdictions, deviceCode, deviceId, periodStart, periodEnd, psurCaseId, enableAIGeneration, documentStyle, enableCharts }),
            });
            // Prime UI immediately (avoid waiting for first polling tick)
            try {
                const current = await api<RunWorkflowResponse>(`/api/orchestrator/cases/${psurCaseId}`);
                setRunResult(current);
            } catch (primeErr) {
                // Non-fatal: initial status fetch failed, polling will catch up
                console.debug("[PSURWizard] Initial status fetch failed (will retry via polling):", primeErr);
            }
        } catch (e) {
            setPollingActive(false);
            setRunBusy(false);
        }
    }

    async function cancelDrafting() {
        if (!psurCaseId) return;
        try {
            await fetch(`/api/orchestrator/cases/${psurCaseId}/cancel`, { method: "POST" });
        } catch (e) {
            // Cancellation request may fail if workflow already completed - still update UI state
            console.warn("[PSURWizard] Cancel request failed (workflow may have completed):", e);
        }
        setPollingActive(false);
        setRunBusy(false);
        setPollError("Cancelled");
    }


    // Reset wizard
    function resetWizard() {
        setStep(1);
        setPsurCaseId(null);
        setPsurRef(null);
        setCounts(null);
        setRunResult(null);
        setTraceSummary(null);
        setCreateError("");
        setPollingActive(false);
        setRunBusy(false);
        setPollFailures(0);
        setPollError("");
        // Refresh existing drafts list
        api<ExistingCase[]>("/api/psur-cases")
            .then(cases => setExistingDrafts(cases.filter(c => c.status === "draft")))
            .catch((e) => console.error("[PSURWizard] Failed to refresh drafts list:", e));
    }

    // Computed
    const totalAtoms = counts?.totals.all || 0;
    
    // Enhanced coverage: a type is "covered" if it has atoms OR if its source was uploaded
    // This ensures that when FSCA is uploaded with "N/A" for recalls, both fsca_record AND recall_record are covered
    const coveredTypes = new Set<string>(counts?.coverage?.coveredTypes || []);
    const missingTypes = requiredTypes.filter(t => {
        const hasAtoms = (counts?.byType?.[t] || 0) > 0;
        const isCoveredBySource = coveredTypes.has(t);
        return !hasAtoms && !isCoveredBySource;
    });
    
    // Helper to check if a type is covered (either has atoms or source was uploaded)
    const isTypeCovered = (t: string): boolean => {
        return (counts?.byType?.[t] || 0) > 0 || coveredTypes.has(t);
    };
    
    const canGoStep2 = !!psurCaseId;
    const canGoStep3 = canGoStep2 && totalAtoms > 0;
    const canGoStep4 = canGoStep3;
    const canGoStep5 = canGoStep4;
    const allComplete = runResult?.steps.every(s => s.status === "COMPLETED");

    return (
        <div className="h-full flex flex-col space-y-12 pb-24">
            {/* Minimalist Step Indicator */}
            <div className="flex items-center justify-center gap-4">
                {[1, 2, 3, 4, 5].map(n => {
                    const isCompleted = step > n;
                    const isActive = step === n;
                    const isDisabled = (n === 2 && !canGoStep2) || (n === 3 && !canGoStep3) || (n === 4 && !canGoStep4) || (n === 5 && !canGoStep5);
                    const label = ["Draft", "Evidence", "Reconcile", "Review", "Compile"][n - 1];

                    return (
                        <div key={n} className="flex items-center gap-4">
                            <button
                                onClick={() => !isDisabled && setStep(n as WizardStep)}
                                disabled={isDisabled}
                                className={cn(
                                    "group relative flex items-center gap-3 px-6 py-2.5 rounded-full transition-all duration-500",
                                    isActive 
                                        ? "bg-primary text-primary-foreground shadow-2xl scale-110 z-10" 
                                        : isCompleted
                                            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                            : "bg-white/50 text-muted-foreground border border-border/50 hover:bg-white disabled:opacity-30"
                                )}
                            >
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border",
                                    isActive ? "bg-white text-primary border-white" : "border-current"
                                )}>
                                    {isCompleted ? (
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : n}
                                </div>
                                <span className="text-sm font-bold tracking-tight">{label}</span>
                            </button>
                            {n < 5 && <div className="w-8 h-px bg-border/30" />}
                        </div>
                    );
                })}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-h-0">
                {/* STEP 1: CREATE DRAFT */}
                {step === 1 && (
                    <div className="max-w-4xl mx-auto space-y-12 animate-slide-up">
                        <div className="text-center space-y-4">
                            <h2 className="text-4xl font-semibold tracking-tight text-foreground leading-tight">Create a new PSUR Draft</h2>
                            <p className="text-lg text-muted-foreground max-w-lg mx-auto">Configure device, reporting period, and jurisdiction to begin your periodic safety update report draft.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Template & Jurisdictions */}
                            <div className="glass-card p-8 space-y-8">
                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-muted-foreground">Template</label>
                                    <div className="p-4 rounded-xl bg-secondary/50 flex items-center gap-3">
                                        <FileText className="w-5 h-5 text-muted-foreground" />
                                        <div>
                                            <div className="font-medium text-foreground">MDCG 2022-21 Annex I</div>
                                            <div className="text-xs text-muted-foreground">EU MDR Compliant</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-muted-foreground">Jurisdictions</label>
                                    <div className="flex gap-3">
                                        {["EU_MDR", "UK_MDR"].map(j => (
                                            <label key={j} className={cn(
                                                "flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-200",
                                                jurisdictions.includes(j) 
                                                    ? "bg-foreground/5 border-foreground/20 text-foreground" 
                                                    : "bg-transparent border-border text-muted-foreground hover:border-foreground/20"
                                            )}>
                                                <input type="checkbox" checked={jurisdictions.includes(j)} onChange={() => setJurisdictions(jurisdictions.includes(j) ? jurisdictions.filter(x => x !== j) : [...jurisdictions, j])} className="hidden" />
                                                <span className="text-sm font-medium">{j.replace("_", " ")}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Device & Period */}
                            <div className="glass-card p-8 space-y-6">
                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-muted-foreground">Device Code</label>
                                    {devices.length > 0 ? (
                                        <select 
                                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 transition-all outline-none appearance-none cursor-pointer"
                                            value={deviceId}
                                            onChange={e => { setDeviceId(parseInt(e.target.value)); const d = devices.find(x => x.id === parseInt(e.target.value)); if (d) setDeviceCode(d.deviceCode); }}
                                        >
                                            {devices.map(d => <option key={d.id} value={d.id}>{d.deviceCode}</option>)}
                                        </select>
                                    ) : (
                                        <input 
                                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 outline-none"
                                            value={deviceCode} 
                                            onChange={e => setDeviceCode(e.target.value)} 
                                            placeholder="Enter device code"
                                        />
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-muted-foreground">Reporting Period</label>
                                    <div className="flex items-center gap-3">
                                        <input type="date" className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 outline-none" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
                                        <span className="text-muted-foreground">to</span>
                                        <input type="date" className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 outline-none" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Device Information Section */}
                        <div className="glass-card p-8 space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-foreground">Device Information</h3>
                                    <p className="text-sm text-muted-foreground">Enter device details for accurate PSUR generation</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowDeviceDetails(!showDeviceDetails)}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                        showDeviceDetails
                                            ? "bg-foreground/10 text-foreground"
                                            : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                                    )}
                                >
                                    {showDeviceDetails ? "Hide Details" : "Add Details"}
                                </button>
                            </div>

                            {showDeviceDetails && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Device Name</label>
                                        <input
                                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 outline-none"
                                            value={deviceName}
                                            onChange={e => setDeviceName(e.target.value)}
                                            placeholder="e.g., LEEP Electrode System"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Manufacturer</label>
                                        <input
                                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 outline-none"
                                            value={manufacturerName}
                                            onChange={e => setManufacturerName(e.target.value)}
                                            placeholder="e.g., CooperSurgical, Inc."
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">UDI-DI</label>
                                        <input
                                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 outline-none"
                                            value={udiDi}
                                            onChange={e => setUdiDi(e.target.value)}
                                            placeholder="e.g., 00850003829XXX"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">GMDN Code</label>
                                        <input
                                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 outline-none"
                                            value={gmdnCode}
                                            onChange={e => setGmdnCode(e.target.value)}
                                            placeholder="e.g., 35421"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Risk Class</label>
                                        <select
                                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 outline-none appearance-none cursor-pointer"
                                            value={deviceRiskClass}
                                            onChange={e => setDeviceRiskClass(e.target.value as "I" | "IIa" | "IIb" | "III")}
                                        >
                                            <option value="I">Class I</option>
                                            <option value="IIa">Class IIa</option>
                                            <option value="IIb">Class IIb</option>
                                            <option value="III">Class III</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Intended Purpose</label>
                                        <textarea
                                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 outline-none min-h-[80px] resize-none"
                                            value={intendedPurpose}
                                            onChange={e => setIntendedPurpose(e.target.value)}
                                            placeholder="e.g., The device is intended for use in electrosurgical procedures for the removal of abnormal cervical tissue..."
                                        />
                                    </div>
                                </div>
                            )}

                            {!showDeviceDetails && (
                                <div className="text-sm text-muted-foreground bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                                    <strong className="text-amber-600">Recommended:</strong> Adding device details ensures your PSUR report accurately reflects your device information instead of using default data.
                                </div>
                            )}
                        </div>

                        <div className="space-y-6">
                            <button 
                                onClick={createDraft} 
                                disabled={createBusy || !!psurCaseId}
                                className="w-full py-4 rounded-2xl border border-border hover:border-foreground/20 hover:bg-secondary/50 text-foreground font-medium transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                                {createBusy ? (
                                    <>
                                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> 
                                        <span>Creating...</span>
                                    </>
                                ) : psurCaseId ? (
                                    <>
                                        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> 
                                        <span>Draft Created</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                        <span>Create PSUR Draft</span>
                                    </>
                                )}
                            </button>
                            
                            {createError && (
                                <div className="text-center space-y-2">
                                    <div className="text-sm text-destructive">{createError}</div>
                                    {conflictCase && (
                                        <button
                                            onClick={resumeConflictCase}
                                            disabled={loadingDraft}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors text-sm font-medium"
                                        >
                                            {loadingDraft ? (
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            )}
                                            <span>Resume {conflictCase.psurReference}</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Resume Existing Draft - Limited to 3 most recent */}
                        {existingDrafts.length > 0 && !psurCaseId && (
                            <div className="animate-slide-up" style={{ animationDelay: "200ms" }}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-medium text-muted-foreground tracking-wide">Recent Drafts</h3>
                                </div>
                                <div className="space-y-2">
                                    {existingDrafts.slice(0, 3).map(c => {
                                        const device = devices.find(d => d.id === c.leadingDeviceId);
                                        return (
                                            <div key={c.id} 
                                                className="p-4 rounded-2xl bg-secondary/30 hover:bg-secondary/50 cursor-pointer group transition-all duration-200 flex items-center justify-between"
                                                onClick={() => !loadingDraft && resumeDraft(c)}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                                        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-foreground">{device?.deviceCode || c.psurReference}</div>
                                                        <div className="text-xs text-muted-foreground">{c.jurisdictions?.join(", ").replace(/_/g, " ")}</div>
                                                    </div>
                                                </div>
                                                <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2: UPLOAD */}
                {step === 2 && psurCaseId && (
                    <div className="max-w-5xl mx-auto space-y-12 animate-slide-up">
                        <div className="text-center space-y-3">
                            <h2 className="text-3xl font-semibold tracking-tight text-foreground">Upload Evidence</h2>
                            <p className="text-muted-foreground max-w-lg mx-auto">Add supporting documents and data files for your PSUR report.</p>
                        </div>

                        {/* Top Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="glass-card p-8 bg-primary/5 border-primary/10 shadow-xl group hover:scale-105">
                                <div className="text-sm font-black text-primary uppercase tracking-[0.2em] mb-4">Intelligence Atoms</div>
                                <div className="text-6xl font-black text-primary tracking-tighter group-hover:scale-110 transition-transform">{totalAtoms}</div>
                            </div>
                            <div className="glass-card p-8 bg-emerald-500/5 border-emerald-500/10 shadow-xl group hover:scale-105">
                                <div className="text-sm font-black text-emerald-600 uppercase tracking-[0.2em] mb-4">Requirements Status</div>
                                <div className="text-6xl font-black text-emerald-600 tracking-tighter group-hover:scale-110 transition-transform">{((requiredTypes.length - missingTypes.length) / requiredTypes.length * 100).toFixed(0)}%</div>
                            </div>
                            <div className="glass-card p-8 bg-amber-500/5 border-amber-500/10 shadow-xl group hover:scale-105">
                                <div className="text-sm font-black text-amber-600 uppercase tracking-[0.2em] mb-4">Verification Gaps</div>
                                <div className="text-6xl font-black text-amber-600 tracking-tighter group-hover:scale-110 transition-transform">{missingTypes.length}</div>
                            </div>
                        </div>

                        {/* Large Action Panels */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <button onClick={() => setShowIngestionModal(true)} className="glass-card p-10 text-left space-y-8 group hover:shadow-2xl active:scale-95">
                                <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-inner">
                                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                </div>
                                <div className="space-y-4">
                                    <h3 className="text-3xl font-black tracking-tighter text-foreground group-hover:text-primary transition-colors">AI Document Ingestion</h3>
                                    <p className="text-lg text-muted-foreground font-medium leading-relaxed">Neural-powered extraction for CER, Risk, and PMCF dossiers with automated entity recognition.</p>
                                </div>
                            </button>

                            <button onClick={() => setShowEvidenceModal(true)} className="glass-card p-10 text-left space-y-8 group hover:shadow-2xl active:scale-95">
                                <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-500 shadow-inner">
                                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                </div>
                                <div className="space-y-4">
                                    <h3 className="text-3xl font-black tracking-tighter text-foreground group-hover:text-emerald-600 transition-colors">Direct Evidence Mapping</h3>
                                    <p className="text-lg text-muted-foreground font-medium leading-relaxed">High-velocity structured data import for Sales, Complaints, and FSCA repositories.</p>
                                </div>
                            </button>
                        </div>

                        {/* Evidence Status Grid */}
                        <div className="glass-card p-10 space-y-10 shadow-2xl">
                            <div className="flex items-center justify-between cursor-pointer group" onClick={() => setIsEvidenceGridOpen(!isEvidenceGridOpen)}>
                                <div className="flex items-center gap-4">
                                    <h3 className="text-2xl font-black tracking-tighter text-foreground">Compliance Matrix</h3>
                                    {isEvidenceGridOpen ? <ChevronUp className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" /> : <ChevronDown className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />}
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); refreshCounts(); }} className="w-12 h-12 rounded-full flex items-center justify-center bg-secondary hover:bg-white hover:text-primary transition-all active:rotate-180">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                            </div>
                            
                            {isEvidenceGridOpen && (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                    {requiredTypes.map(t => {
                                        const c = counts?.byType?.[t] || 0;
                                        const isCovered = isTypeCovered(t);
                                        const coverageInfo = counts?.coverage?.coveredByType?.[t];
                                        const sourceName = coverageInfo?.source;
                                        return (
                                            <div key={t} className={cn(
                                                "p-6 rounded-3xl border transition-all duration-500 flex flex-col justify-between h-40 group hover:-translate-y-2",
                                                isCovered ? "bg-emerald-500/[0.03] border-emerald-500/20 shadow-lg shadow-emerald-500/5" : "bg-secondary/30 border-border/50 hover:border-amber-500/30"
                                            )}>
                                                <div className="flex items-start justify-between">
                                                    <span className={cn(
                                                        "text-[10px] font-black uppercase tracking-[0.2em]",
                                                        isCovered ? "text-emerald-600" : "text-muted-foreground"
                                                    )}>
                                                        {formatType(t)}
                                                    </span>
                                                    {isCovered && <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>}
                                                </div>
                                                <div className="space-y-4">
                                                    <div className={cn(
                                                        "text-4xl font-black tracking-tighter transition-all group-hover:scale-110 origin-left",
                                                        isCovered ? "text-foreground" : "text-muted-foreground/30"
                                                    )}>
                                                        {c}
                                                    </div>
                                                    <div className={cn(
                                                        "ios-pill inline-flex border-none text-[10px] font-black",
                                                        c > 0 ? "bg-emerald-500 text-white" 
                                                        : isCovered ? "bg-primary text-white" 
                                                        : "bg-muted text-muted-foreground"
                                                    )}>
                                                        {c > 0 ? "READY" : isCovered ? sourceName?.toUpperCase() : "MISSING"}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* STEP 3: RECONCILE - Handle Missing Evidence Types */}
                {step === 3 && psurCaseId && (
                    <ReconcileStep 
                        psurCaseId={psurCaseId}
                        deviceCode={deviceCode}
                        periodStart={periodStart}
                        periodEnd={periodEnd}
                        requiredTypes={requiredTypes}
                        counts={counts}
                        missingTypes={missingTypes}
                        coveredTypes={coveredTypes}
                        isTypeCovered={isTypeCovered}
                        onRefresh={refreshCounts}
                        onUpload={() => setShowIngestionModal(true)}
                    />
                )}

                {/* STEP 4: REVIEW */}
                {step === 4 && psurCaseId && (
                    <div className="h-full flex flex-col">
                        {/* Stats Row */}
                        <div className="grid grid-cols-4 gap-3 mb-3">
                            <div className="p-4 rounded-xl glass-card border border-primary/20 text-center">
                                <div className="text-2xl font-bold text-primary">{totalAtoms}</div>
                                <div className="text-xs text-muted-foreground">Total Atoms</div>
                            </div>
                            <div className="p-4 rounded-xl glass-card border border-emerald-500/20 text-center">
                                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{requiredTypes.length - missingTypes.length}</div>
                                <div className="text-xs text-muted-foreground">Requirements Met</div>
                            </div>
                            <div className="p-4 rounded-xl glass-card border border-amber-500/20 text-center">
                                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{missingTypes.length}</div>
                                <div className="text-xs text-muted-foreground">Types Missing</div>
                            </div>
                            <div className={`p-4 rounded-xl glass-card border text-center ${missingTypes.length === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                                <div className={`text-lg font-bold ${missingTypes.length === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{missingTypes.length === 0 ? "Ready" : "Incomplete"}</div>
                                <div className="text-xs text-muted-foreground">Status</div>
                            </div>
                        </div>

                        {/* Evidence Grid */}
                        <div className="flex-1 min-h-0 overflow-y-auto glass-card rounded-xl p-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {requiredTypes.map(t => {
                                    const c = counts?.byType?.[t] || 0;
                                    const isCovered = isTypeCovered(t);
                                    const coverageInfo = counts?.coverage?.coveredByType?.[t];
                                    return (
                                        <div key={t} className={cn(
                                            "flex items-center justify-between px-3 py-2 rounded-lg border transition-all",
                                            isCovered 
                                                ? c > 0 
                                                    ? "bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-500/5" 
                                                    : "bg-primary/10 border-primary/30 dark:bg-primary/5"
                                                : "bg-destructive/10 border-destructive/30 dark:bg-destructive/5"
                                        )}>
                                            <span className="text-sm font-medium truncate mr-2 text-foreground">{formatType(t)}</span>
                                            <span className={cn(
                                                "text-sm font-bold",
                                                c > 0 ? "text-emerald-600 dark:text-emerald-400" 
                                                : isCovered ? "text-primary" 
                                                : "text-destructive"
                                            )}>
                                                {c > 0 ? c : isCovered ? `(${coverageInfo?.source || "covered"})` : "-"}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {missingTypes.length > 0 && (
                            <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                                Missing: {missingTypes.slice(0, 5).map(formatType).join(", ")}{missingTypes.length > 5 && ` +${missingTypes.length - 5} more`}
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 5: COMPILE - Minimalist iOS Design */}
                {step === 5 && psurCaseId && (
                    <div className="h-full flex flex-col -mx-4 -my-2">
                        {/* Pre-compile configuration */}
                        {!runResult ? (
                            <div className="flex-1 flex flex-col">
                                {/* Header */}
                                <div className="text-center mb-8">
                                    <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Generate Document</h2>
                                    <p className="text-muted-foreground">Configure your PSUR output settings</p>
                                </div>

                                {/* Configuration Grid */}
                                <div className="grid grid-cols-2 gap-8 max-w-3xl mx-auto w-full mb-8">
                                    {/* Left Column - Summary */}
                                    <div className="glass-card p-6 space-y-5">
                                        <h3 className="text-sm font-semibold text-foreground mb-4">Report Summary</h3>
                                        {[
                                            { label: "Template", value: templateId.split("_")[0] },
                                            { label: "Jurisdictions", value: jurisdictions.join(", ") },
                                            { label: "Device", value: deviceCode },
                                            { label: "Period", value: `${periodStart} to ${periodEnd}` },
                                            { label: "Total Inputs", value: String(totalAtoms) },
                                        ].map((item, i) => (
                                            <div key={i} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
                                                <span className="text-sm text-muted-foreground">{item.label}</span>
                                                <span className="text-sm font-medium text-foreground">{item.value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Right Column - Options */}
                                    <div className="glass-card p-6 space-y-6">
                                        <h3 className="text-sm font-semibold text-foreground mb-4">Output Options</h3>
                                        
                                        {/* Smart Narrative Toggle */}
                                        <label className="flex items-center justify-between cursor-pointer group">
                                            <div>
                                                <div className="text-sm font-medium text-foreground">Smart Narrative</div>
                                                <div className="text-xs text-muted-foreground">Auto-generate contextual summaries</div>
                                            </div>
                                            <div className={`relative w-11 h-6 rounded-full transition-all ${enableAIGeneration ? "bg-primary" : "bg-border"}`}>
                                                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enableAIGeneration ? "left-5" : "left-0.5"}`}></div>
                                            </div>
                                        </label>

                                        {/* Charts Toggle */}
                                        <label className="flex items-center justify-between cursor-pointer group">
                                            <div>
                                                <div className="text-sm font-medium text-foreground">Visual Charts</div>
                                                <div className="text-xs text-muted-foreground">Include trend visualizations</div>
                                            </div>
                                            <div className={`relative w-11 h-6 rounded-full transition-all ${enableCharts ? "bg-primary" : "bg-border"}`}>
                                                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enableCharts ? "left-5" : "left-0.5"}`}></div>
                                            </div>
                                        </label>

                                        {/* Document Style */}
                                        <div>
                                            <div className="text-sm font-medium text-foreground mb-3">Document Style</div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {([
                                                    { value: "corporate" as const, label: "Corporate" },
                                                    { value: "regulatory" as const, label: "Regulatory" },
                                                    { value: "premium" as const, label: "Premium" },
                                                ]).map(style => (
                                                    <button 
                                                        key={style.value}
                                                        onClick={() => setDocumentStyle(style.value)}
                                                        className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-all ${
                                                            documentStyle === style.value 
                                                                ? "bg-primary text-primary-foreground shadow-sm"
                                                                : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                                                        }`}
                                                    >
                                                        {style.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Generate Button */}
                                <div className="flex justify-center">
                                    <button 
                                        onClick={runWorkflow} 
                                        disabled={runBusy}
                                        className="px-8 py-4 rounded-2xl bg-foreground text-background font-medium shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center gap-3"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Generate PSUR
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Compilation in progress / Complete */
                            <div className="flex-1 flex gap-6">
                                {/* Left Panel - Progress */}
                                <div className="w-80 flex flex-col">
                                    <div className="glass-card p-6 flex-1">
                                        <h3 className="text-sm font-semibold text-foreground mb-6">Generation Progress</h3>
                                        {pollError && (
                                            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                                                Connection issue: {pollError}
                                            </div>
                                        )}
                                        
                                        {/* Steps */}
                                        <div className="space-y-1">
                                            {runResult.steps.map((s, i) => (
                                                <div key={s.step} className="flex items-start gap-3 py-3">
                                                    {/* Status Icon */}
                                                    <div className="mt-0.5">
                                                        {s.status === "COMPLETED" ? (
                                                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                            </div>
                                                        ) : s.status === "FAILED" ? (
                                                            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                                            </div>
                                                        ) : s.status === "RUNNING" ? (
                                                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                                                <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                            </div>
                                                        ) : (
                                                            <div className="w-5 h-5 rounded-full bg-border flex items-center justify-center">
                                                                <span className="text-[10px] text-muted-foreground font-medium">{s.step}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Step Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`text-sm font-medium ${
                                                            s.status === "COMPLETED" ? "text-foreground" :
                                                            s.status === "RUNNING" ? "text-primary" :
                                                            s.status === "FAILED" ? "text-red-500" : "text-muted-foreground"
                                                        }`}>{s.name}</div>
                                                        {s.status === "RUNNING" && (
                                                            <div className="mt-1.5 h-1 bg-border rounded-full overflow-hidden">
                                                                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }}></div>
                                                            </div>
                                                        )}
                                                        {s.error && <div className="text-xs text-red-500 mt-1">{s.error}</div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Stats */}
                                        {traceSummary && (
                                            <div className="mt-6 pt-6 border-t border-border/30 grid grid-cols-2 gap-3">
                                                <div className="text-center p-3 rounded-xl bg-secondary/30">
                                                    <div className="text-lg font-semibold text-foreground">{traceSummary.totalEvents}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Events</div>
                                                </div>
                                                <div className="text-center p-3 rounded-xl bg-emerald-500/10">
                                                    <div className="text-lg font-semibold text-emerald-600">{traceSummary.acceptedSlots}</div>
                                                    <div className="text-[10px] text-emerald-600 uppercase tracking-wider">Processed</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Panel - Document Preview / Success */}
                                <div className="flex-1 flex flex-col">
                                    <div className="glass-card flex-1 flex flex-col overflow-hidden">
                                        {allComplete ? (
                                            /* Success State */
                                            <div className="flex-1 flex flex-col">
                                                {/* Preview Header */}
                                                <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between bg-white/40">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                                            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-semibold text-foreground">Document Ready</div>
                                                            <div className="text-xs text-muted-foreground">PSUR_{psurCaseId}.{documentStyle}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Document Preview */}
                                                <div className="flex-1 p-6 overflow-auto bg-secondary/20">
                                                    <iframe 
                                                        src={`/api/psur-cases/${psurCaseId}/psur.html?style=${documentStyle}`}
                                                        className="w-full h-full rounded-lg border border-border/30 bg-white shadow-sm"
                                                        title="PSUR Preview"
                                                    />
                                                </div>

                                                {/* Download Actions */}
                                                <div className="px-6 py-4 border-t border-border/30 bg-white/40">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex gap-2">
                                                            <a href={`/api/psur-cases/${psurCaseId}/psur.docx?style=${documentStyle}`} download 
                                                               className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-all flex items-center gap-2 shadow-sm">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                                DOCX
                                                            </a>
                                                            <a href={`/api/psur-cases/${psurCaseId}/psur.pdf?style=${documentStyle}`} download 
                                                               className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-all flex items-center gap-2 shadow-sm">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                                PDF
                                                            </a>
                                                            <a href={`/api/audit-bundles/${psurCaseId}/download`} 
                                                               className="px-4 py-2 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all flex items-center gap-2">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                                                Audit Bundle
                                                            </a>
                                                        </div>
                                                        <button onClick={resetWizard}
                                                            className="px-4 py-2 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:bg-secondary/50 transition-all flex items-center gap-2">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                            </svg>
                                                            New Report
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Building State */
                                            <div className="flex-1 flex flex-col items-center justify-center p-8">
                                                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                                                    <svg className="w-8 h-8 text-primary animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                </div>
                                                <h3 className="text-lg font-semibold text-foreground mb-2">Building Your Document</h3>
                                                <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">
                                                    Processing inputs and generating your regulatory report...
                                                </p>
                                                
                                                {/* Streaming text effect */}
                                                <div className="w-full max-w-md glass-card p-4 rounded-xl">
                                                    <div className="font-mono text-xs text-muted-foreground space-y-1">
                                                        {runResult.steps.filter(s => s.status === "COMPLETED" || s.status === "RUNNING").map((s, i) => (
                                                            <div key={i} className={`flex items-center gap-2 ${s.status === "RUNNING" ? "text-primary" : ""}`}>
                                                                <span className="text-emerald-500">{s.status === "COMPLETED" ? "Done" : "..."}</span>
                                                                <span>{s.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="mt-6 flex items-center gap-3">
                                                    <button
                                                        onClick={cancelDrafting}
                                                        className="px-4 py-2 rounded-xl bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-all shadow-sm"
                                                    >
                                                        Cancel Drafting
                                                    </button>
                                                    <div className={cn(
                                                        "text-xs font-mono px-3 py-2 rounded-lg border",
                                                        runtimeConnected ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10" : "border-border text-muted-foreground bg-secondary/30"
                                                    )}>
                                                        {runtimeConnected ? "runtime:connected" : "runtime:disconnected"}
                                                    </div>
                                                </div>

                                                {/* Live Content Viewer */}
                                                <LiveContentViewer 
                                                    psurCaseId={psurCaseId!}
                                                    documentStyle={documentStyle}
                                                    runtimeEvents={runtimeEvents}
                                                    isGenerating={!allComplete}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Compact Navigation (Hidden on Step 1) */}
            {step > 1 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
                    <div className="glass-card px-4 py-3 flex items-center gap-6 shadow-2xl rounded-full">
                        <button 
                            onClick={() => setStep((step - 1) as WizardStep)} 
                            disabled={step === 1} 
                            className="w-12 h-12 rounded-full flex items-center justify-center bg-secondary hover:bg-white text-muted-foreground hover:text-foreground transition-all active:scale-90 disabled:opacity-20"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-muted-foreground tracking-[0.2em] uppercase">Phase</span>
                            <span className="text-lg font-black text-foreground tabular-nums">{step} <span className="text-muted-foreground/30 mx-1">/</span> 5</span>
                        </div>

                        <button 
                            onClick={() => setStep((step + 1) as WizardStep)} 
                            disabled={step === 5 || (step === 1 && !canGoStep2) || (step === 2 && !canGoStep3) || (step === 3 && !canGoStep4) || (step === 4 && !canGoStep5)} 
                            className="w-12 h-12 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-all active:scale-90 disabled:opacity-20"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Smart Ingestion Modal */}
            <Modal open={showIngestionModal} onClose={() => setShowIngestionModal(false)} title="Import Data Source" size="xl">
                <EvidenceIngestionPanel 
                    psurCaseId={psurCaseId!} 
                    deviceCode={deviceCode} 
                    periodStart={periodStart} 
                    periodEnd={periodEnd} 
                    onEvidenceCreated={() => { refreshCounts(); setShowIngestionModal(false); }} 
                />
            </Modal>

            {/* Manual Upload Modal */}
            <Modal open={showEvidenceModal} onClose={() => setShowEvidenceModal(false)} title="Structured Evidence Import" size="md">
                <ManualUploadForm psurCaseId={psurCaseId!} deviceCode={deviceCode} periodStart={periodStart} periodEnd={periodEnd} requiredTypes={requiredTypes} onSuccess={() => { refreshCounts(); setShowEvidenceModal(false); }} />
            </Modal>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANUAL UPLOAD FORM
// ═══════════════════════════════════════════════════════════════════════════════

function ManualUploadForm({ psurCaseId, deviceCode, periodStart, periodEnd, requiredTypes, onSuccess }: {
    psurCaseId: number; deviceCode: string; periodStart: string; periodEnd: string; requiredTypes: string[]; onSuccess: () => void;
}) {
    const [evidenceType, setEvidenceType] = useState(requiredTypes[0] || "complaint_record");
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    async function upload() {
        if (!file) return;
        setBusy(true); setMsg("");
        try {
            const form = new FormData();
            form.append("psur_case_id", String(psurCaseId));
            form.append("device_code", deviceCode);
            form.append("period_start", periodStart);
            form.append("period_end", periodEnd);
            form.append("evidence_type", evidenceType);
            form.append("file", file);
            const resp = await fetch("/api/evidence/upload", { method: "POST", body: form });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);
            setMsg(`Imported ${data.summary?.atomsCreated || 0} records`);
            setFile(null);
            setTimeout(onSuccess, 1000);
        } catch (e: any) { setMsg(`Error: ${e.message}`); }
        finally { setBusy(false); }
    }

    return (
        <div className="space-y-8 animate-slide-up">
            <div className="space-y-4">
                <label className="text-sm font-black uppercase tracking-widest text-muted-foreground">Evidence Category</label>
                <select 
                    className="w-full bg-secondary/50 border-none rounded-2xl px-6 py-4 font-bold text-lg focus:ring-2 focus:ring-primary/50 outline-none cursor-pointer" 
                    value={evidenceType} 
                    onChange={e => setEvidenceType(e.target.value)}
                >
                    {requiredTypes.map(t => <option key={t} value={t}>{formatType(t)}</option>)}
                </select>
            </div>
            
            <div className="space-y-4">
                <label className="text-sm font-black uppercase tracking-widest text-muted-foreground">Intelligence Payload (.xlsx, .csv)</label>
                <div className="relative group">
                    <input 
                        type="file" 
                        accept=".xlsx,.csv,.xls" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                        onChange={e => setFile(e.target.files?.[0] || null)} 
                    />
                    <div className="glass-card p-8 border-2 border-dashed border-border/50 group-hover:border-primary/50 transition-all flex flex-col items-center justify-center text-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        </div>
                        <div>
                            <div className="font-bold text-foreground">{file ? file.name : "Select Intelligence Source"}</div>
                            <div className="text-sm text-muted-foreground font-medium">Drag and drop or click to browse</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <button 
                    onClick={upload} 
                    disabled={busy || !file} 
                    className="glossy-button bg-primary text-primary-foreground py-4 px-10 shadow-xl disabled:opacity-50"
                >
                    {busy ? (
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                            <span>INGESTING...</span>
                        </div>
                    ) : "INGEST PAYLOAD"}
                </button>
                {msg && <span className="font-bold text-emerald-600 animate-pulse">{msg.toUpperCase()}</span>}
            </div>
        </div>
    );
}
