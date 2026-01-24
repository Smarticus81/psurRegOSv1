import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, RefreshCw, Copy, Check, Wand2 } from "lucide-react";

interface TemplatePreviewProps {
    template: string;
    variables: string[];
}

// Sample data for common variable types to make simulation useful
const SAMPLE_DATA: Record<string, string> = {
    deviceName: "CardioMonitor Pro X3000",
    deviceCode: "CMN-PRO-X3K",
    manufacturerName: "MedTech Innovations Inc.",
    reportingPeriod: "January 1, 2024 - December 31, 2024",
    incidentCount: "47",
    complaintCount: "156",
    salesVolume: "12,450 units",
    jurisdiction: "EU MDR",
    riskClass: "Class IIb",
    content: "[Generated narrative content will appear here]",
    evidenceSummary: "Based on 203 evidence records across 5 data sources",
    totalRecords: "1,247",
    period: "2024",
    sectionTitle: "Executive Summary",
    obligationText: "The manufacturer shall perform post-market surveillance activities...",
    atomCount: "203",
    recordCount: "1,247",
    confidenceScore: "0.87",
};

export function TemplatePreview({ template, variables: providedVariables }: TemplatePreviewProps) {
    const [inputs, setInputs] = useState<Record<string, string>>({});
    const [output, setOutput] = useState("");
    const [copied, setCopied] = useState(false);

    // Auto-detect variables from template content
    const detectedVariables = useMemo(() => {
        const matches = template.match(/\{([a-zA-Z0-9_]+)\}/g);
        if (!matches) return [];
        return Array.from(new Set(matches.map(m => m.slice(1, -1))));
    }, [template]);

    // Use provided variables or fall back to detected ones
    const variables = providedVariables.length > 0 ? providedVariables : detectedVariables;

    const handleInputChange = (key: string, value: string) => {
        setInputs(prev => ({ ...prev, [key]: value }));
    };

    // Fill with sample data
    const fillSampleData = () => {
        const newInputs: Record<string, string> = {};
        variables.forEach(v => {
            newInputs[v] = SAMPLE_DATA[v] || `[Sample ${v}]`;
        });
        setInputs(newInputs);
    };

    // Clear all inputs
    const clearInputs = () => {
        setInputs({});
    };

    // Copy output to clipboard
    const copyOutput = async () => {
        await navigator.clipboard.writeText(output);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        let res = template;
        variables.forEach(v => {
            const val = inputs[v] !== undefined && inputs[v] !== ""
                ? inputs[v]
                : `{${v}}`;
            res = res.replace(new RegExp(`\\{${v}\\}`, 'g'), val);
        });
        setOutput(res);
    }, [template, inputs, variables]);

    // Calculate "filled" percentage
    const filledCount = variables.filter(v => inputs[v] && inputs[v].trim() !== "").length;
    const fillPercent = variables.length > 0 ? Math.round((filledCount / variables.length) * 100) : 100;

    return (
        <div className="flex flex-col gap-6 h-full">
            {/* Header Stats */}
            <div className="flex items-center justify-between pb-4 border-b">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                            {variables.length} Variables
                        </Badge>
                        <Badge variant={fillPercent === 100 ? "default" : "secondary"} className="text-xs">
                            {filledCount}/{variables.length} Filled
                        </Badge>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fillSampleData}
                        className="text-xs h-8"
                    >
                        <Wand2 className="w-3 h-3 mr-1.5" />
                        Fill Sample Data
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearInputs}
                        className="text-xs h-8"
                    >
                        <RefreshCw className="w-3 h-3 mr-1.5" />
                        Clear
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
                {/* Inputs Column */}
                <div className="flex flex-col gap-4 overflow-hidden">
                    <div className="flex items-center gap-2 pb-2 border-b">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <h4 className="text-sm font-semibold uppercase tracking-wider">Variables</h4>
                        <span className="text-xs text-muted-foreground ml-auto">
                            Enter values to simulate the prompt
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                        {variables.length === 0 && (
                            <div className="text-sm text-muted-foreground p-4 bg-muted/20 rounded-md border border-dashed text-center">
                                No variables detected in this template.
                                <p className="text-xs mt-2 opacity-70">
                                    Variables should be in the format {"{variableName}"}
                                </p>
                            </div>
                        )}
                        {variables.map(v => (
                            <div key={v} className="space-y-1.5">
                                <Label htmlFor={`var-${v}`} className="text-xs font-mono text-primary flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                        {`{${v}}`}
                                        {inputs[v] && inputs[v].trim() !== "" && (
                                            <Check className="w-3 h-3 text-green-500" />
                                        )}
                                    </span>
                                    {SAMPLE_DATA[v] && (
                                        <button
                                            onClick={() => handleInputChange(v, SAMPLE_DATA[v])}
                                            className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                                        >
                                            Use sample
                                        </button>
                                    )}
                                </Label>
                                <Textarea
                                    id={`var-${v}`}
                                    placeholder={SAMPLE_DATA[v] || `Enter value for {${v}}...`}
                                    className="text-sm min-h-[60px] resize-y bg-background"
                                    value={inputs[v] || ""}
                                    onChange={(e) => handleInputChange(v, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Output Column */}
                <div className="flex flex-col gap-4 overflow-hidden">
                    <div className="flex items-center gap-2 pb-2 border-b">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <h4 className="text-sm font-semibold uppercase tracking-wider">Preview Output</h4>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={copyOutput}
                            className="ml-auto h-6 text-xs"
                        >
                            {copied ? (
                                <><Check className="w-3 h-3 mr-1" /> Copied</>
                            ) : (
                                <><Copy className="w-3 h-3 mr-1" /> Copy</>
                            )}
                        </Button>
                    </div>

                    <Card className="flex-1 overflow-auto p-6 bg-muted/10 border-muted font-mono text-sm whitespace-pre-wrap leading-relaxed shadow-inner">
                        {output.split(/(\{[a-zA-Z0-9_]+\})/).map((part, i) => {
                            if (/^\{[a-zA-Z0-9_]+\}$/.test(part)) {
                                return (
                                    <span key={i} className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded text-amber-700 dark:text-amber-300">
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
