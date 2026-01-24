import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Sparkles, RotateCcw, Loader2, FileText, AlertCircle, Database, Zap, Check, Clock, Cpu, Info, ChevronDown, ChevronUp, Edit3, FileJson, TableIcon, BarChart3, Activity, Shield, ClipboardList } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TemplatePreviewProps {
    instructionKey: string;
    template: string;
    variables: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPE CATEGORIES - Organized by PSUR section/purpose
// ═══════════════════════════════════════════════════════════════════════════════

const EVIDENCE_CATEGORIES = {
    DEVICE_INFO: {
        label: "Device Information",
        icon: Shield,
        color: "blue",
        fields: ["deviceName", "device_name", "deviceCode", "device_code", "riskClass", "risk_class", "gmdnCode", "basicUdi", "manufacturer"]
    },
    REGULATORY: {
        label: "Regulatory Context",
        icon: ClipboardList,
        color: "purple",
        fields: ["templateId", "template_id", "jurisdictions", "jurisdiction", "region", "notifiedBody", "regulatoryFramework"]
    },
    PERIOD: {
        label: "Reporting Period",
        icon: Clock,
        color: "amber",
        fields: ["periodStart", "period_start", "startDate", "start_date", "periodEnd", "period_end", "endDate", "end_date", "reportingPeriod", "dateRange"]
    },
    SAFETY_DATA: {
        label: "Safety & Vigilance",
        icon: Activity,
        color: "red",
        fields: ["totalComplaints", "total_complaints", "seriousComplaints", "reportableEvents", "reportable_events", "safetySignals", "malfunctions", "injuries", "deaths", "fscaRecords", "vigilanceData"]
    },
    CLINICAL_DATA: {
        label: "Clinical Evidence",
        icon: FileText,
        color: "emerald",
        fields: ["literatureRecords", "literature_records", "clinicalStudies", "pmcfStudies", "clinicalEvidence", "benefitRiskData", "clinicalOutcomes"]
    },
    TABLE_DATA: {
        label: "Tables & Structures",
        icon: TableIcon,
        color: "indigo",
        fields: ["tableData", "table_data", "headers", "rows", "columns", "tableJson", "structuredData"]
    },
    CHART_DATA: {
        label: "Charts & Trends",
        icon: BarChart3,
        color: "cyan",
        fields: ["chartData", "chart_data", "trendData", "trend_data", "dataPoints", "timeSeries", "chartJson", "chartType"]
    },
    COUNTS: {
        label: "Numerical Metrics",
        icon: FileJson,
        color: "slate",
        fields: ["totalUnits", "total_units", "unitsSold", "count", "total", "volume", "quantity", "sampleSize", "n"]
    },
    ANALYSIS: {
        label: "Analysis Context",
        icon: Eye,
        color: "violet",
        fields: ["analysisType", "analysis_type", "methodology", "context", "purpose", "scope", "findings", "conclusions"]
    }
};

// Comprehensive sample values covering ALL agent types
const SAMPLE_VALUES: Record<string, string> = {
    // Device info
    deviceName: "CardioMonitor Pro X3000",
    device_name: "CardioMonitor Pro X3000",
    deviceCode: "CMN-X3000-EU",
    device_code: "CMN-X3000-EU",
    deviceInfo: "CardioMonitor Pro X3000 (Class IIb cardiac monitoring device)",
    device_info: "CardioMonitor Pro X3000 (Class IIb cardiac monitoring device)",
    manufacturer: "MedTech Innovations GmbH",
    manufacturerName: "MedTech Innovations GmbH",
    manufacturer_name: "MedTech Innovations GmbH",

    // Regulatory
    jurisdiction: "EU MDR",
    jurisdictions: "EU MDR, UK MDR",
    riskClass: "Class IIb",
    risk_class: "Class IIb",

    // Periods
    period: "2024",
    reportingPeriod: "January 1, 2024 – December 31, 2024",
    reporting_period: "January 1, 2024 – December 31, 2024",
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    start_date: "2024-01-01",
    end_date: "2024-12-31",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",

    // Numbers
    incidentCount: "47",
    incident_count: "47",
    seriousIncidents: "12",
    serious_incidents: "12",
    complaintCount: "156",
    complaint_count: "156",
    totalRecords: "1,247",
    total_records: "1,247",
    salesVolume: "12,450",
    sales_volume: "12,450",
    atomCount: "203",
    atom_count: "203",
    evidenceCount: "203",
    evidence_count: "203",
    recordCount: "1,247",
    fscaCount: "1",
    seriousOutcomes: "0 deaths, 2 serious injuries (resolved)",
    dataPointCount: "156",
    categoryCount: "6",
    regionCount: "12",
    timePointCount: "12",

    // Trends
    trendDirection: "decreasing",
    trend_direction: "decreasing",
    changePercent: "-15%",
    change_percent: "-15%",
    baselineValue: "1.52 per 1000 units",

    // Slot/Section
    sectionTitle: "Post-Market Clinical Follow-up Results",
    section_title: "Post-Market Clinical Follow-up Results",
    slotTitle: "Executive Summary",
    slot_title: "Executive Summary",
    slotRequirements: "Provide comprehensive overview of safety and performance conclusions for the reporting period",
    templateGuidance: "Focus on key findings, benefit-risk assessment, and any recommended actions",

    // Evidence
    content: "The post-market surveillance data demonstrates consistent device performance throughout the reporting period.",
    text: "No unexpected safety signals were identified during the surveillance period.",
    summary: "Overall device performance remains within acceptable parameters with a favorable benefit-risk profile.",
    evidenceSummary: "Analysis of 203 evidence atoms from 5 data sources: complaints database, MAUDE, vigilance reports, PMCF studies, and sales records.",
    evidence_summary: "Analysis of 203 evidence atoms from 5 data sources.",
    evidenceRecords: "[ATOM-COMP-001] Complaint: Sensor malfunction reported, patient unharmed. [ATOM-COMP-002] Complaint: Display error during monitoring session. [ATOM-INC-001] Serious incident: False alarm led to monitoring interruption.",
    clinicalSummary: "Clinical studies demonstrate 99.2% diagnostic accuracy with established safety profile",
    riskSummary: "Risk profile unchanged from previous assessment. Known risks adequately mitigated.",

    // Tables
    tableData: "See Annex I for detailed incident table",
    table_data: "See Annex I for detailed incident table",
    tableType: "Serious Incidents Summary",
    columns: "Incident ID | Date | Description | IMDRF Code | Patient Outcome | Status",
    evidenceData: "Complaint and incident data from CardioMonitor Pro X3000 across EU markets during 2024 reporting period",

    // Charts
    chartTitle: "Complaint Distribution by Category (2024)",

    // Document analysis
    filename: "complaints_report_2024.xlsx",
    documentType: "Excel Spreadsheet",
    tableCount: "3",
    sectionCount: "5",
    documentSummary: "Document contains customer complaint data with complaint IDs, dates, categories, and resolutions.",
    ruleBasedResults: "Detected: complaint_id column, date_received column, severity classification",
    availableEvidenceTypes: "complaints, incidents, sales, capa, literature, pmcf",

    // Field mapping
    sourceColumn: "Complaint Number",
    sampleValues: '["CCR-2024-001", "CCR-2024-002", "CCR-2024-003"]',
    targetFields: "complaintId, incidentId, capaId, referenceNumber, deviceSerialNumber",
    targetField: "complaintId",
    confidence: "0.95",
    reasoning: "Column name and value pattern suggest complaint identifier",
    evidenceType: "complaints",
    requiredFields: "complaintId, dateReceived, description, severity, status",

    // Severity
    description: "Patient reported the device displayed incorrect heart rate reading of 180 BPM when actual rate was 72 BPM.",
    outcome: "No injury, patient concern only",

    // Compliance
    requirementText: "The PSUR shall include a summary of all serious incidents reported during the reporting period",
    sourceArticle: "EU MDR Article 86.1(a)",

    // Misc
    confidenceScore: "0.92",
    confidence_score: "0.92",
    version: "1.0",
    status: "APPROVED",
    context: "Preview of agent behavior with sample PSUR data",
};

export function TemplatePreview({ instructionKey, template, variables: providedVariables }: TemplatePreviewProps) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [previewOutput, setPreviewOutput] = useState<string | null>(null);
    const [previewMeta, setPreviewMeta] = useState<{ agentCategory?: string; promptType?: string; model?: string; latencyMs?: number } | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autoFilled, setAutoFilled] = useState(false);
    const { toast } = useToast();

    // Find all {variable} placeholders in the template
    const detectedVars = useMemo(() => {
        const matches = template.match(/\{([a-zA-Z0-9_]+)\}/g);
        if (!matches) return [];
        return Array.from(new Set(matches.map(m => m.slice(1, -1))));
    }, [template]);

    const variables = providedVariables.length > 0 ? providedVariables : detectedVars;

    // Count how many are filled
    const filledCount = variables.filter(v => values[v]?.trim()).length;
    const allFilled = filledCount === variables.length || variables.length === 0;

    // Auto-fill on mount/key change/variables change
    useEffect(() => {
        if (variables.length === 0) {
            setAutoFilled(true);
            return;
        }
        const newValues: Record<string, string> = {};
        variables.forEach(v => {
            // Try multiple case variations to find a match
            const val = SAMPLE_VALUES[v] 
                || SAMPLE_VALUES[v.toLowerCase()] 
                || SAMPLE_VALUES[v.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')] 
                || SAMPLE_VALUES[v.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]
                || `Sample ${v.replace(/_/g, ' ')}`;
            newValues[v] = val;
        });
        setValues(newValues);
        setAutoFilled(true);
        setPreviewOutput(null);
        setPreviewMeta(null);
        setError(null);
    }, [instructionKey, variables.join(',')]); // Re-run when variables list changes

    // Fill all with sample data
    const fillWithSamples = () => {
        const newValues: Record<string, string> = {};
        variables.forEach(v => {
            newValues[v] = SAMPLE_VALUES[v] || SAMPLE_VALUES[v.toLowerCase()] || SAMPLE_VALUES[v.replace(/([A-Z])/g, '_$1').toLowerCase()] || "Sample value";
        });
        setValues(newValues);
        setError(null);
    };

    // Clear all
    const clearAll = () => {
        setValues({});
        setPreviewOutput(null);
        setPreviewMeta(null);
        setError(null);
        setAutoFilled(false);
    };

    // Call actual LLM API for generation - works even with no variables
    const generatePreview = async () => {
        setIsGenerating(true);
        setError(null);

        try {
            const response = await apiRequest("POST", `/api/system-instructions/${instructionKey}/preview`, {
                variables: values,
                template: template  // Send the EDITED template, not the DB version
            });
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            setPreviewOutput(data.output);
            setPreviewMeta({
                agentCategory: data.agentCategory,
                promptType: data.promptType,
                model: data.model,
                latencyMs: data.latencyMs,
            });
            
            toast({
                title: "Preview Generated",
                description: `Using ${data.model || 'AI'} in ${data.latencyMs || 0}ms`,
            });
        } catch (err: any) {
            console.error("Preview generation failed:", err);
            setError(err.message || "Failed to generate preview. Check if LLM API keys are configured.");
            toast({
                title: "Generation Failed",
                description: err.message || "Failed to call AI service.",
                variant: "destructive"
            });
        } finally {
            setIsGenerating(false);
        }
    };

    // One-click preview (auto-fill + generate)
    const quickPreview = async () => {
        fillWithSamples();
        setTimeout(() => generatePreview(), 100);
    };

    // Categorize variables by evidence type
    const categorizedVars = useMemo(() => {
        const result: { category: string; label: string; icon: any; color: string; vars: string[] }[] = [];
        const assigned = new Set<string>();

        Object.entries(EVIDENCE_CATEGORIES).forEach(([key, cat]) => {
            const matchingVars = variables.filter(v => {
                const vLower = v.toLowerCase();
                return cat.fields.some(f => vLower.includes(f.toLowerCase()) || f.toLowerCase().includes(vLower));
            });
            if (matchingVars.length > 0) {
                result.push({ category: key, label: cat.label, icon: cat.icon, color: cat.color, vars: matchingVars });
                matchingVars.forEach(v => assigned.add(v));
            }
        });

        // Add uncategorized vars
        const uncategorized = variables.filter(v => !assigned.has(v));
        if (uncategorized.length > 0) {
            result.push({ category: "OTHER", label: "Other Fields", icon: Edit3, color: "gray", vars: uncategorized });
        }

        return result;
    }, [variables]);

    const [showInputs, setShowInputs] = useState(true);

    const colorClasses: Record<string, { bg: string; border: string; text: string; icon: string }> = {
        blue: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", text: "text-blue-700 dark:text-blue-300", icon: "text-blue-500" },
        purple: { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", text: "text-purple-700 dark:text-purple-300", icon: "text-purple-500" },
        amber: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-300", icon: "text-amber-500" },
        red: { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", text: "text-red-700 dark:text-red-300", icon: "text-red-500" },
        emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300", icon: "text-emerald-500" },
        indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/30", border: "border-indigo-200 dark:border-indigo-800", text: "text-indigo-700 dark:text-indigo-300", icon: "text-indigo-500" },
        cyan: { bg: "bg-cyan-50 dark:bg-cyan-950/30", border: "border-cyan-200 dark:border-cyan-800", text: "text-cyan-700 dark:text-cyan-300", icon: "text-cyan-500" },
        slate: { bg: "bg-slate-50 dark:bg-slate-950/30", border: "border-slate-200 dark:border-slate-800", text: "text-slate-700 dark:text-slate-300", icon: "text-slate-500" },
        violet: { bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-200 dark:border-violet-800", text: "text-violet-700 dark:text-violet-300", icon: "text-violet-500" },
        gray: { bg: "bg-gray-50 dark:bg-gray-950/30", border: "border-gray-200 dark:border-gray-800", text: "text-gray-700 dark:text-gray-300", icon: "text-gray-500" },
    };

    return (
        <div className="h-full flex flex-col">
            {/* Compact Header Bar */}
            <div className="flex items-center gap-4 pb-3 mb-3 border-b">
                <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-indigo-500" />
                    <span className="font-semibold text-sm">AI Preview</span>
                </div>
                
                <div className="flex items-center gap-2 flex-1">
                    {previewMeta?.promptType && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                            {previewMeta.promptType.replace(/_/g, ' ')}
                        </span>
                    )}
                    {previewMeta?.agentCategory && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                            {previewMeta.agentCategory}
                        </span>
                    )}
                    {previewMeta?.model && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                            {previewMeta.model}
                        </span>
                    )}
                    {previewMeta?.latencyMs && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                            {previewMeta.latencyMs}ms
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowInputs(!showInputs)} className="h-7 gap-1 text-xs">
                        {showInputs ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showInputs ? "Hide" : "Show"} Data
                    </Button>
                    <Button variant="outline" size="sm" onClick={fillWithSamples} className="h-7 gap-1 text-xs">
                        <Database className="w-3 h-3" /> Reset
                    </Button>
                    <Button variant="outline" size="sm" onClick={clearAll} className="h-7 gap-1 text-xs">
                        <RotateCcw className="w-3 h-3" /> Clear
                    </Button>
                    <Button
                        onClick={quickPreview}
                        disabled={isGenerating}
                        size="sm"
                        className="h-7 gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                    >
                        {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Generate
                    </Button>
                </div>
            </div>

            {/* Main Content - Horizontal Split */}
            <div className="flex-1 min-h-0 flex gap-4">
                {/* LEFT: Input Data Cards (Collapsible) */}
                {showInputs && (
                    <div className="w-[400px] flex-shrink-0 flex flex-col border rounded-lg bg-card overflow-hidden">
                        <div className="px-3 py-2 border-b bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sample Data Inputs</span>
                            <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-medium",
                                allFilled ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" : "bg-amber-100 text-amber-700"
                            )}>
                                {filledCount}/{variables.length} filled
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                            {variables.length === 0 ? (
                                <div className="p-4 rounded-lg border-2 border-dashed text-center text-muted-foreground">
                                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    <p className="text-sm font-medium">No Variables</p>
                                    <p className="text-xs">This prompt uses server-side sample data</p>
                                </div>
                            ) : (
                                categorizedVars.map(cat => {
                                    const colors = colorClasses[cat.color] || colorClasses.gray;
                                    const Icon = cat.icon;
                                    return (
                                        <div key={cat.category} className={cn("rounded-lg border p-3", colors.bg, colors.border)}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Icon className={cn("w-4 h-4", colors.icon)} />
                                                <span className={cn("text-xs font-semibold", colors.text)}>{cat.label}</span>
                                                <span className="text-[10px] text-muted-foreground ml-auto">{cat.vars.length} field{cat.vars.length > 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="space-y-2">
                                                {cat.vars.map(v => {
                                                    const currentValue = values[v] || "";
                                                    const isLong = currentValue.length > 60;
                                                    return (
                                                        <div key={v} className="bg-white dark:bg-slate-900 rounded border p-2">
                                                            <Label className="text-[10px] font-mono text-muted-foreground mb-1 block">
                                                                {`{${v}}`}
                                                                {currentValue && <span className="text-green-600 ml-1">✓</span>}
                                                            </Label>
                                                            {isLong ? (
                                                                <textarea
                                                                    value={currentValue}
                                                                    onChange={(e) => setValues(prev => ({ ...prev, [v]: e.target.value }))}
                                                                    className="w-full h-16 text-xs p-1.5 border rounded resize-none bg-white dark:bg-slate-950 focus:ring-1 focus:ring-indigo-400"
                                                                    placeholder={`Enter ${v}`}
                                                                />
                                                            ) : (
                                                                <Input
                                                                    value={currentValue}
                                                                    onChange={(e) => setValues(prev => ({ ...prev, [v]: e.target.value }))}
                                                                    className="h-7 text-xs"
                                                                    placeholder={`Enter ${v}`}
                                                                />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* RIGHT: Output Preview */}
                <div className="flex-1 min-w-0 flex flex-col border rounded-lg bg-card overflow-hidden">
                    <div className="px-3 py-2 border-b bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Generated Output</span>
                        {previewOutput && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px]"
                                onClick={() => {
                                    navigator.clipboard.writeText(previewOutput);
                                    toast({ title: "Copied to clipboard" });
                                }}
                            >
                                Copy
                            </Button>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto p-4 bg-white dark:bg-slate-950">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center">
                                <div className="text-center">
                                    <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-indigo-500" />
                                    <p className="text-sm font-medium animate-pulse">Generating with AI...</p>
                                    <p className="text-xs text-muted-foreground mt-1">Connecting to LLM</p>
                                </div>
                            </div>
                        ) : error ? (
                            <div className="h-full flex items-center justify-center">
                                <div className="text-center max-w-xs">
                                    <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-500" />
                                    <p className="text-sm font-semibold text-red-700">Generation Failed</p>
                                    <p className="text-xs text-red-600 mt-1">{error}</p>
                                    <Button size="sm" variant="outline" className="mt-4" onClick={generatePreview}>
                                        Try Again
                                    </Button>
                                </div>
                            </div>
                        ) : previewOutput ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <div
                                    className="text-sm leading-relaxed whitespace-pre-wrap"
                                    dangerouslySetInnerHTML={{
                                        __html: previewOutput
                                            .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2 text-indigo-900 dark:text-indigo-100 border-b pb-1">$1</h1>')
                                            .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2 text-indigo-800 dark:text-indigo-200">$1</h2>')
                                            .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
                                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                                            .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
                                            .replace(/\n/g, '<br>')
                                    }}
                                />
                                <div className="mt-6 pt-3 border-t border-dashed text-[10px] text-muted-foreground flex justify-between">
                                    <span>AI GENERATED</span>
                                    <span>{new Date().toLocaleString()}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center">
                                <div className="text-center p-8 border-2 border-dashed rounded-xl max-w-md">
                                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20 text-indigo-500" />
                                    <p className="text-base font-semibold">Ready to Generate</p>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        {variables.length > 0 
                                            ? `${filledCount} of ${variables.length} fields populated with sample data.`
                                            : "No input fields required for this prompt."
                                        }
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Click <strong>Generate</strong> to test with real LLM
                                    </p>
                                    <Button 
                                        size="sm" 
                                        className="mt-4 gap-2"
                                        onClick={generatePreview}
                                        disabled={isGenerating}
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        Generate Now
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
