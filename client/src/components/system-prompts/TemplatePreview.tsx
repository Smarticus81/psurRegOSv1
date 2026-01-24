import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, Sparkles, RotateCcw, Loader2, FileText } from "lucide-react";

interface TemplatePreviewProps {
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

// Sample AI outputs for different prompt types
const SAMPLE_OUTPUTS: Record<string, string> = {
    default: `## Executive Summary

During the reporting period (January 1, 2024 – December 31, 2024), the CardioMonitor Pro X3000 demonstrated consistent performance with an overall favorable benefit-risk profile.

### Key Findings

**Incident Summary:**
- Total complaints received: 156
- Serious incidents reported: 12
- Field Safety Corrective Actions: 0

**Trend Analysis:**
The complaint rate decreased by 15% compared to the previous reporting period, indicating improved device reliability following the firmware update deployed in Q2 2024.

**Benefit-Risk Conclusion:**
Based on the analysis of 203 evidence records across all post-market data sources, the benefits of the CardioMonitor Pro X3000 continue to outweigh the identified risks. No new safety signals were detected that would alter the established benefit-risk profile.

### Recommendations
1. Continue routine post-market surveillance activities
2. Monitor complaint trends in upcoming quarters
3. Complete ongoing PMCF study by Q4 2025`,

    safety: `## Safety Analysis

### Serious Incidents (n=12)

During the reporting period, 12 serious incidents were reported to competent authorities:

| Category | Count | Trend |
|----------|-------|-------|
| Device malfunction | 5 | ↓ Decreasing |
| Sensor failure | 4 | → Stable |
| Software error | 3 | ↓ Decreasing |

### Root Cause Analysis
All incidents were investigated per ISO 13485 requirements. Primary root causes identified:
- Environmental factors (humidity): 42%
- User error: 33%
- Manufacturing variance: 25%

### Corrective Actions
No Field Safety Corrective Actions (FSCA) were required during this period. All issues were addressed through routine device replacements and user training updates.

### Safety Conclusion
The safety profile remains acceptable. The incident rate of 0.096% (12/12,450 units) is below the industry benchmark of 0.15%.`,

    trend: `## Trend Analysis Report

### Complaint Trend Summary

**Overall Trend: DECREASING (-15%)**

| Quarter | Complaints | Rate per 1000 |
|---------|------------|---------------|
| Q1 2024 | 48 | 3.9 |
| Q2 2024 | 42 | 3.4 |
| Q3 2024 | 35 | 2.8 |
| Q4 2024 | 31 | 2.5 |

### Contributing Factors
The 15% decrease in complaints correlates with:
1. Firmware update v2.3.1 (deployed March 2024)
2. Enhanced user training materials
3. Improved packaging to reduce transit damage

### Forecast
Based on current trends, complaint rates are projected to stabilize at approximately 2.2 per 1,000 units by Q2 2025.`,
};

export function TemplatePreview({ template, variables: providedVariables }: TemplatePreviewProps) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [showOutput, setShowOutput] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

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
    };

    // Clear all
    const clearAll = () => {
        setValues({});
        setShowOutput(false);
    };

    // Simulate generation
    const generatePreview = () => {
        setIsGenerating(true);
        setShowOutput(false);

        // Simulate AI generation delay
        setTimeout(() => {
            setIsGenerating(false);
            setShowOutput(true);
        }, 1500);
    };

    // Determine which sample output to show based on template content
    const getSampleOutput = () => {
        const templateLower = template.toLowerCase();
        if (templateLower.includes("safety") || templateLower.includes("incident")) {
            return SAMPLE_OUTPUTS.safety;
        }
        if (templateLower.includes("trend") || templateLower.includes("analysis")) {
            return SAMPLE_OUTPUTS.trend;
        }
        return SAMPLE_OUTPUTS.default;
    };

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Explanation */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                    <Eye className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                        <h3 className="font-semibold text-blue-900 dark:text-blue-100">Preview AI Output</h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                            Fill in the data below to see what the AI would generate. This helps you test how different inputs affect the final report.
                        </p>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={fillWithSamples} variant="outline" size="sm" className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Use Sample Data
                </Button>
                <Button onClick={clearAll} variant="ghost" size="sm" className="gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Clear
                </Button>

                <div className="flex-1" />

                <span className="text-sm text-muted-foreground">
                    {filledCount}/{variables.length} fields filled
                </span>

                <Button
                    onClick={generatePreview}
                    disabled={!allFilled || isGenerating}
                    size="sm"
                    className="gap-2"
                >
                    {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                    ) : (
                        <><FileText className="w-4 h-4" /> Preview Output</>
                    )}
                </Button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: Input fields */}
                <div className="flex flex-col gap-3 overflow-hidden border rounded-lg p-4 bg-card">
                    <h4 className="font-semibold text-sm border-b pb-2">Input Data</h4>

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
                                            <span className="text-[10px] text-green-600 font-normal">✓</span>
                                        )}
                                    </Label>
                                    <Input
                                        placeholder={SAMPLE_VALUES[v] || SAMPLE_VALUES[v.toLowerCase()] || `Enter ${v}`}
                                        value={values[v] || ""}
                                        onChange={(e) => setValues(prev => ({ ...prev, [v]: e.target.value }))}
                                        className="h-9 text-sm"
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Output preview */}
                <div className="flex flex-col gap-3 overflow-hidden border rounded-lg p-4 bg-card">
                    <h4 className="font-semibold text-sm border-b pb-2">
                        {showOutput ? "Generated Output" : "Output Preview"}
                    </h4>

                    <div className="flex-1 overflow-auto">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                                    <p className="text-sm">Generating preview...</p>
                                </div>
                            </div>
                        ) : showOutput ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <div
                                    className="text-sm leading-relaxed whitespace-pre-wrap"
                                    dangerouslySetInnerHTML={{
                                        __html: getSampleOutput()
                                            .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
                                            .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
                                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                                            .replace(/\n/g, '<br>')
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                <div className="text-center p-6">
                                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm font-medium">No preview yet</p>
                                    <p className="text-xs mt-1">
                                        {allFilled
                                            ? 'Click "Preview Output" to see what the AI would generate'
                                            : 'Fill in all fields first, then click "Preview Output"'
                                        }
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
