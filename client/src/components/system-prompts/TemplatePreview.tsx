import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Eye, Sparkles, RotateCcw, Copy, Check } from "lucide-react";

interface TemplatePreviewProps {
    template: string;
    variables: string[];
}

// Realistic example values that match actual PSUR data
const EXAMPLE_VALUES: Record<string, string> = {
    // Device info
    deviceName: "CardioMonitor Pro X3000",
    deviceCode: "CMN-PRO-X3K",
    device_name: "CardioMonitor Pro X3000",
    device_code: "CMN-PRO-X3K",
    manufacturer: "MedTech Innovations Inc.",
    manufacturerName: "MedTech Innovations Inc.",

    // Periods
    period: "2024",
    reportingPeriod: "January 1, 2024 – December 31, 2024",
    reporting_period: "January 1, 2024 – December 31, 2024",
    startDate: "January 1, 2024",
    endDate: "December 31, 2024",

    // Numbers
    incidentCount: "47",
    incident_count: "47",
    complaintCount: "156",
    complaint_count: "156",
    totalRecords: "1,247",
    total_records: "1,247",
    salesVolume: "12,450 units",
    sales_volume: "12,450 units",
    atomCount: "203",
    atom_count: "203",

    // Regulatory
    jurisdiction: "EU MDR",
    riskClass: "Class IIb",
    risk_class: "Class IIb",

    // Content placeholders
    content: "The surveillance data for the reporting period indicates stable device performance with no unexpected safety signals...",
    evidenceSummary: "Based on 203 evidence records across 5 data sources",
    evidence_summary: "Based on 203 evidence records across 5 data sources",
    sectionTitle: "Executive Summary",
    section_title: "Executive Summary",

    // Generic
    text: "Sample text content here",
    data: "Sample data values",
    value: "100",
    name: "Sample Name",
    description: "Sample description text",
};

export function TemplatePreview({ template, variables: providedVariables }: TemplatePreviewProps) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [copied, setCopied] = useState(false);

    // Find all {variable} placeholders in the template
    const detectedVars = useMemo(() => {
        const matches = template.match(/\{([a-zA-Z0-9_]+)\}/g);
        if (!matches) return [];
        return Array.from(new Set(matches.map(m => m.slice(1, -1))));
    }, [template]);

    const variables = providedVariables.length > 0 ? providedVariables : detectedVars;

    // Generate the preview with values filled in
    const preview = useMemo(() => {
        let result = template;
        variables.forEach(v => {
            const val = values[v] || `{${v}}`;
            result = result.replace(new RegExp(`\\{${v}\\}`, 'g'), val);
        });
        return result;
    }, [template, values, variables]);

    // Count how many are filled
    const filledCount = variables.filter(v => values[v]?.trim()).length;

    // Fill all with example data
    const fillWithExamples = () => {
        const newValues: Record<string, string> = {};
        variables.forEach(v => {
            // Try exact match, then lowercase, then provide generic
            newValues[v] = EXAMPLE_VALUES[v] || EXAMPLE_VALUES[v.toLowerCase()] || `Example ${v.replace(/_/g, ' ')}`;
        });
        setValues(newValues);
    };

    // Clear all
    const clearAll = () => setValues({});

    // Copy preview
    const copyPreview = async () => {
        await navigator.clipboard.writeText(preview);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="h-full flex flex-col gap-6">
            {/* Simple explanation header */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                    <Eye className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-blue-900 dark:text-blue-100">What is this?</h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                            This shows how your AI prompt will look with real data. Fill in the blanks below to see the final prompt that gets sent to the AI.
                        </p>
                    </div>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
                <Button onClick={fillWithExamples} variant="default" size="sm" className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Fill with Example Data
                </Button>
                <Button onClick={clearAll} variant="outline" size="sm" className="gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Clear All
                </Button>
                <div className="ml-auto text-sm text-muted-foreground">
                    {filledCount} of {variables.length} filled
                </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Input fields */}
                <div className="flex flex-col gap-4 overflow-hidden">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">1</span>
                        Fill in the Blanks
                    </h4>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        {variables.length === 0 ? (
                            <div className="p-6 rounded-lg border-2 border-dashed text-center text-muted-foreground">
                                <p className="font-medium">No blanks to fill</p>
                                <p className="text-sm mt-1">This prompt doesn't have any variable placeholders.</p>
                            </div>
                        ) : (
                            variables.map(v => (
                                <div key={v} className="space-y-1.5">
                                    <Label className="text-sm font-medium flex items-center justify-between">
                                        <span>{v.replace(/_/g, ' ')}</span>
                                        {values[v]?.trim() && (
                                            <span className="text-xs text-green-600">✓ Filled</span>
                                        )}
                                    </Label>
                                    <Textarea
                                        placeholder={EXAMPLE_VALUES[v] || `Enter ${v.replace(/_/g, ' ')}...`}
                                        value={values[v] || ""}
                                        onChange={(e) => setValues(prev => ({ ...prev, [v]: e.target.value }))}
                                        className="min-h-[70px] resize-none"
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Live preview */}
                <div className="flex flex-col gap-4 overflow-hidden">
                    <h4 className="font-semibold text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center">2</span>
                            See the Result
                        </span>
                        <Button variant="ghost" size="sm" onClick={copyPreview} className="h-7 text-xs gap-1">
                            {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                        </Button>
                    </h4>

                    <Card className="flex-1 overflow-auto p-4 bg-slate-50 dark:bg-slate-900 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                        {preview.split(/(\{[a-zA-Z0-9_]+\})/).map((part, i) => {
                            // Highlight unfilled placeholders
                            if (/^\{[a-zA-Z0-9_]+\}$/.test(part)) {
                                return (
                                    <span key={i} className="bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 px-1 rounded font-semibold">
                                        {part}
                                    </span>
                                );
                            }
                            return <span key={i}>{part}</span>;
                        })}
                    </Card>
                </div>
            </div>
        </div>
    );
}
