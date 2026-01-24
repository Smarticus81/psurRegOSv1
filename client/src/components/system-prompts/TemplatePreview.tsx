import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, Sparkles, RotateCcw, Loader2, FileText, AlertCircle, Database } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TemplatePreviewProps {
    instructionKey: string;
    template: string;
    variables: string[];
}

// ACTUAL realistic sample values - not placeholders
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

    // Numbers - actual values
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

    // Trends
    trendDirection: "decreasing",
    trend_direction: "decreasing",
    changePercent: "-15%",
    change_percent: "-15%",

    // Content
    sectionTitle: "Post-Market Clinical Follow-up Results",
    section_title: "Post-Market Clinical Follow-up Results",
    slotTitle: "Executive Summary",
    slot_title: "Executive Summary",

    // Text content
    content: "The post-market surveillance data demonstrates consistent device performance throughout the reporting period.",
    text: "No unexpected safety signals were identified during the surveillance period.",
    summary: "Overall device performance remains within acceptable parameters with a favorable benefit-risk profile.",
    evidenceSummary: "Analysis of 203 evidence records from 5 data sources: complaints database, MAUDE, vigilance reports, PMCF studies, and sales records.",
    evidence_summary: "Analysis of 203 evidence records from 5 data sources.",

    // Tables
    tableData: "See Annex I for detailed incident table",
    table_data: "See Annex I for detailed incident table",

    // Misc
    confidenceScore: "0.92",
    confidence_score: "0.92",
    version: "1.0",
    status: "APPROVED",
};

export function TemplatePreview({ instructionKey, template, variables: providedVariables }: TemplatePreviewProps) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [previewOutput, setPreviewOutput] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
    const allFilled = filledCount === variables.length && variables.length > 0;

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
        setError(null);
    };

    // Call actual LLM API for generation
    const generatePreview = async () => {
        if (!allFilled) {
            toast({
                title: "Missing Information",
                description: "Please fill in all blanks before generating the preview.",
                variant: "destructive"
            });
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            const response = await apiRequest("POST", `/api/system-instructions/${instructionKey}/preview`, {
                variables: values
            });
            const data = await response.json();
            setPreviewOutput(data.output);
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

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Explanation */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                    <div>
                        <h3 className="font-semibold text-indigo-900 dark:text-indigo-100">Live AI Preview</h3>
                        <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">
                            Input actual values below to see the <strong>real AI response</strong>. This calls the live LLM service using your current template.
                        </p>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={fillWithSamples} variant="outline" size="sm" className="gap-2">
                    <Database className="w-4 h-4" />
                    Use Sample Data
                </Button>
                <Button onClick={clearAll} variant="ghost" size="sm" className="gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Clear
                </Button>

                <div className="flex-1" />

                <span className="text-sm text-muted-foreground mr-2">
                    {filledCount}/{variables.length} fields ready
                </span>

                <Button
                    onClick={generatePreview}
                    disabled={!allFilled || isGenerating}
                    size="sm"
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                    {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                    ) : (
                        <><Sparkles className="w-4 h-4" /> Generate Actual Preview</>
                    )}
                </Button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: Input fields */}
                <div className="flex flex-col gap-3 overflow-hidden border rounded-lg p-4 bg-card">
                    <h4 className="font-semibold text-sm border-b pb-2 flex items-center justify-between">
                        Input Data
                        {allFilled && <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">✓ Ready</Badge>}
                    </h4>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                        {variables.length === 0 ? (
                            <div className="p-6 rounded-lg border-2 border-dashed text-center text-muted-foreground">
                                <p className="font-medium">No input fields</p>
                                <p className="text-sm mt-1">This prompt has no variable inputs.</p>
                            </div>
                        ) : (
                            variables.map(v => (
                                <div key={v} className="space-y-1">
                                    <Label className="text-xs font-medium flex items-center justify-between">
                                        <span className="capitalize">{v.replace(/_/g, ' ')}</span>
                                        {values[v]?.trim() && (
                                            <span className="text-[10px] text-green-600 font-normal">✓ Filled</span>
                                        )}
                                    </Label>
                                    <Input
                                        placeholder={SAMPLE_VALUES[v] || SAMPLE_VALUES[v.toLowerCase()] || `Enter ${v}`}
                                        value={values[v] || ""}
                                        onChange={(e) => setValues(prev => ({ ...prev, [v]: e.target.value }))}
                                        className="h-9 text-sm focus-visible:ring-indigo-500"
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Output preview */}
                <div className="flex flex-col gap-3 overflow-hidden border rounded-lg p-4 bg-card">
                    <h4 className="font-semibold text-sm border-b pb-2">
                        AI Generated Output
                    </h4>

                    <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900/50 rounded p-4">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-500" />
                                    <p className="text-sm animate-pulse">Assistant is thinking...</p>
                                    <p className="text-xs text-muted-foreground mt-2">Connecting to LLM and generating content</p>
                                </div>
                            </div>
                        ) : error ? (
                            <div className="h-full flex items-center justify-center">
                                <div className="text-center max-w-xs">
                                    <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-500" />
                                    <p className="text-sm font-semibold text-red-700">Error</p>
                                    <p className="text-xs text-red-600 mt-1">{error}</p>
                                    <Button size="sm" variant="outline" className="mt-4" onClick={generatePreview}>
                                        Try Again
                                    </Button>
                                </div>
                            </div>
                        ) : previewOutput ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <div
                                    className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground"
                                    dangerouslySetInnerHTML={{
                                        __html: previewOutput
                                            .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2 text-indigo-900 dark:text-indigo-100 border-b pb-1 font-serif">$1</h1>')
                                            .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2 text-indigo-800 dark:text-indigo-200">$1</h2>')
                                            .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1 text-slate-800 dark:text-slate-200">$1</h3>')
                                            .replace(/\*\*(.+?)\*\*/g, '<strong class="font-medium text-slate-900 dark:text-slate-100">$1</strong>')
                                            .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
                                            .replace(/\n/g, '<br>')
                                    }}
                                />
                                <div className="mt-8 pt-4 border-t border-dashed text-[10px] text-muted-foreground flex justify-between">
                                    <span>AI GENERATED CONTENT</span>
                                    <span>{new Date().toLocaleString()}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                <div className="text-center p-6 border-2 border-dashed rounded-lg">
                                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p className="text-sm font-medium">Ready to Generate</p>
                                    <p className="text-xs mt-1">
                                        {allFilled
                                            ? 'Click "Generate Actual Preview" to call the LLM'
                                            : 'Fill the data fields on the left to activate preview'
                                        }
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {previewOutput && (
                        <div className="pt-2 flex justify-end">
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-[10px] h-7"
                                onClick={() => {
                                    navigator.clipboard.writeText(previewOutput);
                                    toast({ title: "Copied to clipboard" });
                                }}
                            >
                                Copy Content
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Internal helper for Badge if not available
function Badge({ children, variant, className }: any) {
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${className}`}>
            {children}
        </span>
    );
}
