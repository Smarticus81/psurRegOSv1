import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TemplateEditor } from "@/components/system-prompts/TemplateEditor";
import { TemplatePreview } from "@/components/system-prompts/TemplatePreview";
import { VersionHistory } from "@/components/system-prompts/VersionHistory";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Brain,
    Save,
    RotateCcw,
    RefreshCw,
    Search,
    Code,
    History,
    AlertTriangle,
    Loader2,
    Table,
    BarChart,
    Database,
    Cpu,
    FileText,
    ChevronDown,
    ChevronRight,
    User,
    Cog
} from "lucide-react";

// Types
interface SystemInstruction {
    key: string;
    category: string;
    description: string;
    template: string;
    defaultTemplate: string;
    version: number;
    variables: string[];
    lastUpdated: string;
    updatedBy: string;
    versions?: any[];
}

// Hierarchical agent group structure
interface AgentPrompt {
    key: string;
    label: string;
    type: "SYSTEM" | "TASK" | "PERSONA";
}

interface AgentGroup {
    name: string;
    prompts: AgentPrompt[];
}

interface CategoryDefinition {
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    agents: AgentGroup[];
    standalone?: string[]; // Keys that don't belong to a specific agent group
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT HIERARCHY DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
    {
        name: "NARRATIVE AGENTS",
        icon: FileText,
        standalone: ["NARRATIVE_GENERATION", "BENEFIT_RISK_CONCLUSION", "GAP_JUSTIFICATION"],
        agents: [
            {
                name: "Base Narrative",
                prompts: [
                    { key: "BaseNarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Executive Summary (Section A)",
                prompts: [
                    { key: "EXEC_SUMMARY_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "ExecSummaryNarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Device Scope (Section B)",
                prompts: [
                    { key: "DEVICE_SCOPE_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "DeviceScopeNarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "PMS Activity (Section C)",
                prompts: [
                    { key: "PMS_ACTIVITY_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "PMSActivityNarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Safety (Sections D, E, F)",
                prompts: [
                    { key: "SAFETY_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "SafetyNarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Trend Analysis (Section G)",
                prompts: [
                    { key: "TREND_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "TrendNarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "FSCA / Recalls (Section H)",
                prompts: [
                    { key: "FSCA_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "FSCANarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "CAPA (Section I)",
                prompts: [
                    { key: "CAPA_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "CAPANarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Clinical (Sections J, K, L)",
                prompts: [
                    { key: "CLINICAL_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "ClinicalNarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Benefit-Risk (Section M)",
                prompts: [
                    { key: "BENEFIT_RISK_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "BenefitRiskNarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Conclusions (Section M)",
                prompts: [
                    { key: "CONCLUSION_SYSTEM", label: "System Prompt", type: "SYSTEM" },
                    { key: "ConclusionNarrativeAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
        ]
    },
    {
        name: "TABLE AGENTS (ANNEXES)",
        icon: Table,
        standalone: ["TABLE_FORMATTING"],
        agents: [
            {
                name: "Base Table",
                prompts: [
                    { key: "BaseTableAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Serious Incidents (Tables 2-4)",
                prompts: [
                    { key: "SeriousIncidentsTableAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Complaints (Table 8)",
                prompts: [
                    { key: "ComplaintsTableAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "CAPA (Table I.1)",
                prompts: [
                    { key: "CAPATableAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Sales & Exposure (Table 1)",
                prompts: [
                    { key: "SalesExposureTableAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "FSCA (Table H.1)",
                prompts: [
                    { key: "FSCATableAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Literature Review",
                prompts: [
                    { key: "LiteratureTableAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "PMCF (Table 11)",
                prompts: [
                    { key: "PMCFTableAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Trend Analysis (Table G.4)",
                prompts: [
                    { key: "TrendAnalysisTableAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
        ]
    },
    {
        name: "CHART AGENTS",
        icon: BarChart,
        standalone: [],
        agents: [
            {
                name: "Base Chart",
                prompts: [
                    { key: "BaseChartAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Complaint Bar Chart",
                prompts: [
                    { key: "COMPLAINT_BAR_CHART_TASK", label: "Task Template", type: "TASK" },
                    { key: "ComplaintBarChartAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Distribution Pie Chart",
                prompts: [
                    { key: "DISTRIBUTION_PIE_CHART_TASK", label: "Task Template", type: "TASK" },
                    { key: "DistributionPieChartAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Geographic Heat Map",
                prompts: [
                    { key: "GEOGRAPHIC_HEATMAP_TASK", label: "Task Template", type: "TASK" },
                    { key: "GeographicHeatMapAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Time Series Chart",
                prompts: [
                    { key: "TIME_SERIES_CHART_TASK", label: "Task Template", type: "TASK" },
                    { key: "TimeSeriesChartAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Trend Line Chart",
                prompts: [
                    { key: "TREND_LINE_CHART_TASK", label: "Task Template", type: "TASK" },
                    { key: "TrendLineChartAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
        ]
    },
    {
        name: "INGESTION & MAPPING",
        icon: Database,
        standalone: ["SEVERITY_CLASSIFICATION"],
        agents: [
            {
                name: "Document Analysis",
                prompts: [
                    { key: "DOCUMENT_ANALYSIS", label: "System Prompt", type: "SYSTEM" },
                    { key: "DocumentAnalyzerAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Evidence Extraction",
                prompts: [
                    { key: "EVIDENCE_EXTRACTION", label: "System Prompt", type: "SYSTEM" },
                    { key: "EvidenceExtractionAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Field Mapping",
                prompts: [
                    { key: "FIELD_MAPPING_RESOLUTION", label: "Resolution Prompt", type: "SYSTEM" },
                    { key: "FIELD_MAPPING_REFINEMENT", label: "Refinement Prompt", type: "SYSTEM" },
                    { key: "BATCH_FIELD_MAPPING", label: "Batch Mapping", type: "TASK" },
                    { key: "FieldMappingAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
        ]
    },
    {
        name: "RUNTIME AGENTS",
        icon: Cpu,
        standalone: ["COMPLIANCE_CHECK"],
        agents: [
            {
                name: "Narrative Writer",
                prompts: [
                    { key: "NarrativeWriterAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
            {
                name: "Document Formatter",
                prompts: [
                    { key: "DocumentFormatterAgent", label: "Agent Persona", type: "PERSONA" },
                ]
            },
        ]
    }
];


export default function SystemInstructionsPage() {
    const { toast } = useToast();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("editor");
    const [searchQuery, setSearchQuery] = useState("");
    const [editedTemplate, setEditedTemplate] = useState<string>("");
    const [isDirty, setIsDirty] = useState(false);
    const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
    const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});

    const toggleCat = (cat: string) => {
        setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    const toggleAgent = (agentName: string) => {
        setExpandedAgents(prev => ({ ...prev, [agentName]: !prev[agentName] }));
    };

    // Fetch all instructions
    const { data: instructions = [], isLoading, refetch } = useQuery<SystemInstruction[]>({
        queryKey: ["/api/system-instructions"],
    });

    // Fetch specific details (including history) when selected
    const { data: selectedInstruction, isLoading: detailsLoading } = useQuery<SystemInstruction>({
        queryKey: ["/api/system-instructions", selectedKey],
        enabled: !!selectedKey,
    });

    // Update local state when selection changes
    useMemo(() => {
        if (selectedInstruction) {
            setEditedTemplate(selectedInstruction.template);
            setIsDirty(false);
        }
    }, [selectedInstruction]);

    // Save Mutation
    const saveMutation = useMutation({
        mutationFn: async ({ key, template }: { key: string; template: string }) => {
            await apiRequest("PUT", `/api/system-instructions/${key}`, {
                template,
                updatedBy: "user",
                changeReason: "User manual update"
            });
        },
        onSuccess: () => {
            toast({ title: "Saved", description: "System instruction updated successfully." });
            setIsDirty(false);
            queryClient.invalidateQueries({ queryKey: ["/api/system-instructions"] });
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    });

    // Reset Mutation
    const resetMutation = useMutation({
        mutationFn: async (key: string) => {
            await apiRequest("POST", `/api/system-instructions/${key}/reset`);
        },
        onSuccess: () => {
            toast({ title: "Reset", description: "Restored default template." });
            queryClient.invalidateQueries({ queryKey: ["/api/system-instructions"] });
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    });

    // Rollback Mutation
    const rollbackMutation = useMutation({
        mutationFn: async ({ key, version }: { key: string; version: number }) => {
            await apiRequest("POST", `/api/system-instructions/${key}/rollback/${version}`);
        },
        onSuccess: () => {
            toast({ title: "Rolled back", description: "Restored previous version." });
            queryClient.invalidateQueries({ queryKey: ["/api/system-instructions"] });
            setActiveTab("editor");
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    });

    // Build a lookup for instruction existence
    const instructionMap = useMemo(() => {
        const map: Record<string, SystemInstruction> = {};
        for (const inst of instructions) {
            map[inst.key] = inst;
        }
        return map;
    }, [instructions]);

    // Filter logic
    const matchesSearch = (key: string) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const inst = instructionMap[key];
        return key.toLowerCase().includes(q) || inst?.description?.toLowerCase().includes(q);
    };

    const handleSave = () => {
        if (!selectedKey) return;
        if (confirm("Are you sure you want to update this system instruction? This will affect agent behavior immediately.")) {
            saveMutation.mutate({ key: selectedKey, template: editedTemplate });
        }
    };

    const handleReset = () => {
        if (!selectedKey) return;
        if (confirm("Reset to default? This cannot be undone.")) {
            resetMutation.mutate(selectedKey);
        }
    };

    // Get icon for prompt type
    const getPromptIcon = (type: "SYSTEM" | "TASK" | "PERSONA") => {
        switch (type) {
            case "SYSTEM": return <Cog className="w-3 h-3" />;
            case "TASK": return <Code className="w-3 h-3" />;
            case "PERSONA": return <User className="w-3 h-3" />;
        }
    };

    const getPromptTypeColor = (type: "SYSTEM" | "TASK" | "PERSONA") => {
        switch (type) {
            case "SYSTEM": return "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20";
            case "TASK": return "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20";
            case "PERSONA": return "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20";
        }
    };

    return (
        <div className="flex h-[calc(100vh-3.5rem)] gap-0 bg-background overflow-hidden border-t">
            {/* Sidebar - Enterprise Style */}
            <div className="w-80 flex flex-col h-full border-r border-border/60 bg-white dark:bg-card">
                <div className="p-4 border-b border-border/60">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                            <Brain className="w-5 h-5" />
                        </div>
                        <h2 className="font-bold text-foreground text-sm tracking-tight">System Controls</h2>
                    </div>
                    <div className="relative group">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        <Input
                            placeholder="Filter prompts..."
                            className="pl-9 h-9 bg-secondary/50 border-input font-medium text-xs focus-visible:ring-1 focus-visible:ring-primary transition-all rounded-md"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    <div className="p-3 space-y-4">
                        {CATEGORY_DEFINITIONS.map(category => {
                            const Icon = category.icon;
                            const isCollapsed = collapsedCats[category.name];

                            // Count visible items
                            const standaloneCount = (category.standalone || []).filter(k => instructionMap[k] && matchesSearch(k)).length;
                            const agentCount = category.agents.filter(ag =>
                                ag.prompts.some(p => instructionMap[p.key] && matchesSearch(p.key))
                            ).length;
                            const totalCount = standaloneCount + agentCount;

                            return (
                                <div key={category.name} className="space-y-1">
                                    {/* Category Header */}
                                    <button
                                        onClick={() => toggleCat(category.name)}
                                        className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold text-muted-foreground uppercase tracking-widest hover:bg-secondary/50 rounded-md transition-colors group"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Icon className="w-3.5 h-3.5 group-hover:text-primary transition-colors" />
                                            <span className={cn(totalCount === 0 && "opacity-50")}>
                                                {category.name}
                                                <span className="text-[9px] text-muted-foreground ml-1 opacity-70">({totalCount})</span>
                                            </span>
                                        </div>
                                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 opacity-50" /> : <ChevronDown className="w-3.5 h-3.5 opacity-50" />}
                                    </button>

                                    {!isCollapsed && (
                                        <div className="space-y-1 animate-in slide-in-from-top-1 fade-in duration-200 pl-2">
                                            {/* Standalone prompts */}
                                            {(category.standalone || []).map(key => {
                                                const inst = instructionMap[key];
                                                if (!inst || !matchesSearch(key)) return null;
                                                return (
                                                    <button
                                                        key={key}
                                                        onClick={() => { setSelectedKey(key); setEditedTemplate(inst.template); }}
                                                        className={cn(
                                                            "w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-all duration-200 border-l-2 ml-1",
                                                            selectedKey === key
                                                                ? "bg-primary/5 text-primary border-primary shadow-sm"
                                                                : "border-transparent text-foreground/80 hover:bg-secondary/50 hover:text-foreground"
                                                        )}
                                                    >
                                                        <div className="line-clamp-1">{key.replace(/_/g, " ")}</div>
                                                    </button>
                                                );
                                            })}

                                            {/* Agent Groups */}
                                            {category.agents.map(agent => {
                                                const visiblePrompts = agent.prompts.filter(p => instructionMap[p.key] && matchesSearch(p.key));
                                                if (visiblePrompts.length === 0) return null;

                                                const isAgentExpanded = expandedAgents[agent.name] ?? false;
                                                const hasSelectedChild = agent.prompts.some(p => p.key === selectedKey);

                                                return (
                                                    <div key={agent.name} className="ml-1">
                                                        {/* Agent Group Header */}
                                                        <button
                                                            onClick={() => toggleAgent(agent.name)}
                                                            className={cn(
                                                                "w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all duration-200 border-l-2",
                                                                hasSelectedChild
                                                                    ? "border-primary/50 bg-primary/5 text-primary"
                                                                    : "border-transparent text-foreground/90 hover:bg-secondary/50"
                                                            )}
                                                        >
                                                            <span>{agent.name}</span>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[9px] text-muted-foreground">{visiblePrompts.length}</span>
                                                                {isAgentExpanded ? <ChevronDown className="w-3 h-3 opacity-50" /> : <ChevronRight className="w-3 h-3 opacity-50" />}
                                                            </div>
                                                        </button>

                                                        {/* Nested Prompts */}
                                                        {isAgentExpanded && (
                                                            <div className="ml-3 mt-1 space-y-0.5 animate-in slide-in-from-top-1 fade-in duration-150">
                                                                {visiblePrompts.map(prompt => {
                                                                    const inst = instructionMap[prompt.key];
                                                                    return (
                                                                        <button
                                                                            key={prompt.key}
                                                                            onClick={() => { setSelectedKey(prompt.key); setEditedTemplate(inst.template); }}
                                                                            className={cn(
                                                                                "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 border-l-2",
                                                                                selectedKey === prompt.key
                                                                                    ? "bg-primary/10 text-primary border-primary"
                                                                                    : "border-transparent text-foreground/70 hover:bg-secondary/50 hover:text-foreground"
                                                                            )}
                                                                        >
                                                                            <span className={cn("p-1 rounded", getPromptTypeColor(prompt.type))}>
                                                                                {getPromptIcon(prompt.type)}
                                                                            </span>
                                                                            <span>{prompt.label}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>

                <div className="p-3 border-t bg-zinc-50 dark:bg-zinc-900/50">
                    <div className="flex items-center justify-between px-2 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                        <span>{instructions.length} Definitions</span>
                        <div
                            className={cn("p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors", isLoading && "animate-spin text-primary")}
                            onClick={() => refetch()}
                        >
                            <RefreshCw className="w-3 h-3" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
                {selectedKey && selectedInstruction ? (
                    <>
                        <div className="h-16 border-b border-border bg-white dark:bg-card px-6 flex justify-between items-center shrink-0 shadow-sm z-10">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                    <Code className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-bold tracking-tight truncate text-foreground">{selectedInstruction.key}</h2>
                                        <Badge variant="secondary" className="px-2 py-0.5 text-[10px] font-mono h-5 bg-secondary text-secondary-foreground border border-border">v{selectedInstruction.version}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate leading-none mt-1">
                                        {selectedInstruction.description}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                {isDirty && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold uppercase tracking-wide">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        Unsaved Changes
                                    </div>
                                )}
                                <div className="h-8 w-px bg-border mx-2" />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleReset}
                                    disabled={resetMutation.isPending}
                                    className="h-9 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                                >
                                    <RotateCcw className={cn("w-3.5 h-3.5 mr-2", resetMutation.isPending && "animate-spin")} />
                                    Discard Changes
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    disabled={!isDirty || saveMutation.isPending}
                                    size="sm"
                                    className="h-9 px-5 text-xs font-bold shadow-sm"
                                >
                                    {saveMutation.isPending ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                                    ) : (
                                        <Save className="w-3.5 h-3.5 mr-2" />
                                    )}
                                    Commit Version
                                </Button>
                            </div>
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                            <div className="px-6 bg-muted/5 border-b shrink-0">
                                <TabsList className="bg-transparent p-0 gap-8 h-10">
                                    <TabsTrigger
                                        value="editor"
                                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full text-xs font-semibold"
                                    >
                                        Template Logic
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="preview"
                                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full text-xs font-semibold"
                                    >
                                        Test Preview
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="history"
                                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full text-xs font-semibold"
                                    >
                                        Revision History
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <div className="flex-1 overflow-hidden">
                                <TabsContent value="editor" className="h-full m-0 p-0 outline-none">
                                    <TemplateEditor
                                        value={editedTemplate}
                                        onChange={(val) => {
                                            if (val !== undefined) {
                                                setEditedTemplate(val);
                                                setIsDirty(val !== selectedInstruction.template);
                                            }
                                        }}
                                        variables={selectedInstruction.variables}
                                    />
                                </TabsContent>

                                <TabsContent value="preview" className="h-full m-0 p-0 outline-none bg-muted/5 overflow-y-auto">
                                    <div className="max-w-5xl mx-auto p-8">
                                        <TemplatePreview
                                            instructionKey={selectedKey}
                                            template={editedTemplate}
                                            variables={selectedInstruction.variables}
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="history" className="h-full m-0 p-0 outline-none overflow-y-auto">
                                    <div className="max-w-4xl mx-auto p-8">
                                        <VersionHistory
                                            currentVersion={selectedInstruction.version}
                                            versions={selectedInstruction.versions || []}
                                            onRollback={(ver) => {
                                                if (confirm(`Rollback to version ${ver}?`)) {
                                                    rollbackMutation.mutate({ key: selectedKey, version: ver });
                                                }
                                            }}
                                        />
                                    </div>
                                </TabsContent>
                            </div>
                        </Tabs>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-12 text-center bg-muted/5">
                        <div className="w-20 h-20 rounded-full bg-background flex items-center justify-center mb-6 shadow-xl shadow-primary/5 border">
                            <Brain className="w-10 h-10 text-primary opacity-20" />
                        </div>
                        <h3 className="text-2xl font-bold text-foreground mb-3">Intelligence Control Center</h3>
                        <p className="max-w-md text-sm leading-relaxed text-muted-foreground mb-8">
                            Select a system prompt from the inventory to adjust the operational logic of your AI agents.
                            Changes are deployed instantly to the production runtime.
                        </p>
                        <div className="flex items-center gap-4">
                            <div className="px-4 py-2 rounded-full border border-dashed text-xs border-muted-foreground/30 flex items-center gap-2">
                                <Code className="w-3.5 h-3.5" />
                                Custom Variables
                            </div>
                            <div className="px-4 py-2 rounded-full border border-dashed text-xs border-muted-foreground/30 flex items-center gap-2">
                                <History className="w-3.5 h-3.5" />
                                Atomic Rollbacks
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
