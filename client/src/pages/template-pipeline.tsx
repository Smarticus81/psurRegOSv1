/**
 * Template Management - PSUR Report Structure Configuration
 * 
 * Manages PSUR templates that define report structure:
 * - Upload custom JSON templates with section definitions
 * - AI-powered alignment with MDCG 2022-21 standard structure
 * - Validate regulatory coverage (EU MDR / UK MDR)
 * - Map sections to evidence requirements
 * 
 * Regulatory Context:
 *   EU MDR / UK MDR (Regulations) → MDCG 2022-21 (Standard) → Custom Templates
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Upload,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileJson,
  Link2,
  Settings2,
  Database,
  Sparkles,
  Brain,
  FileText,
  Shield,
  ChevronRight,
  Zap,
  GitBranch,
  Layers,
  ArrowRight,
  Target,
  Trash2,
  List,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface SlotDefinition {
  slot_id: string;
  slot_name: string;
  description?: string;
  evidence_requirements?: string[];
  regulatory_reference?: string;
  required: boolean;
  data_type: string;
}

interface SlotTemplate {
  template_id: string;
  name: string;
  version: string;
  jurisdiction_scope: string[];
  slots: SlotDefinition[];
  mapping?: Record<string, string[]>;
}

interface SlotAlignment {
  customSlotId: string;
  customSlotName: string;
  mdcgSlotId: string | null;
  mdcgSlotTitle: string | null;
  confidence: number;
  method: string;
  reasoning: string;
  grkbObligationsCovered: string[];
}

interface HierarchicalResult {
  success: boolean;
  customTemplateId: string;
  referenceStandard: string;
  alignmentStats: {
    totalMdcgSlots: number;
    coveredMdcgSlots: number;
    alignmentPercent: number;
    totalCustomSlots: number;
    unmatchedCustomSlots: number;
  };
  grkbStats: {
    totalGrkbObligations: number;
    coveredGrkbObligations: number;
    grkbCoveragePercent: number;
  };
  slotAlignments: SlotAlignment[];
  uncoveredMdcgSlots: Array<{ slotId: string; title: string; reason: string }>;
  orphanedCustomSlots: Array<{ slotId: string; name: string }>;
  status: "ALIGNED" | "PARTIAL" | "MISALIGNED";
  warnings: string[];
  errors: string[];
}

interface MdcgSlot {
  slot_id: string;
  title: string;
  section_path?: string;
  slot_kind?: string;
  required: boolean;
}

interface TemplateListItem {
  templateId: string;
  name: string;
  version: string;
  jurisdictions: string[];
  templateType: string;
  updatedAt?: string;
  isCustom?: boolean;
}

const METHOD_COLORS: Record<string, string> = {
  llm: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  name_match: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  evidence_overlap: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  semantic: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  manual: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  no_match: "bg-red-500/20 text-red-300 border-red-500/30",
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
  llm: <Brain className="w-3 h-3" />,
  name_match: <Target className="w-3 h-3" />,
  evidence_overlap: <FileText className="w-3 h-3" />,
  semantic: <Sparkles className="w-3 h-3" />,
  manual: <Settings2 className="w-3 h-3" />,
  no_match: <XCircle className="w-3 h-3" />,
};

// Sample template for reference
const SAMPLE_TEMPLATE: SlotTemplate = {
  template_id: "CUSTOM_PSUR_EXAMPLE",
  name: "Custom PSUR Template",
  version: "1.0",
  jurisdiction_scope: ["EU_MDR"],
  slots: [
    { slot_id: "cover", slot_name: "Cover Page", required: true, data_type: "narrative", evidence_requirements: ["device_registry_record"] },
    { slot_id: "exec_summary", slot_name: "Executive Summary", required: true, data_type: "narrative", evidence_requirements: ["sales_summary", "complaint_summary"] },
    { slot_id: "device_description", slot_name: "Device Description and Intended Use", required: true, data_type: "narrative", evidence_requirements: ["device_registry_record"] },
    { slot_id: "sales_data", slot_name: "Sales Volume and Market Data", required: true, data_type: "table", evidence_requirements: ["sales_volume", "sales_summary"] },
    { slot_id: "incidents", slot_name: "Serious Incidents Summary", required: true, data_type: "table", evidence_requirements: ["serious_incident_record"] },
    { slot_id: "fsca", slot_name: "Field Safety Corrective Actions", required: true, data_type: "table", evidence_requirements: ["fsca_record"] },
    { slot_id: "complaints", slot_name: "Complaints Analysis", required: true, data_type: "table", evidence_requirements: ["complaint_record"] },
    { slot_id: "pmcf", slot_name: "PMCF Summary", required: true, data_type: "narrative", evidence_requirements: ["pmcf_summary"] },
    { slot_id: "conclusions", slot_name: "Conclusions and Actions", required: true, data_type: "narrative" },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TemplatePipelinePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  // Active tab
  const [activeTab, setActiveTab] = useState<"pipeline" | "templates">("pipeline");
  
  // State
  const [step, setStep] = useState<"upload" | "review" | "complete">("upload");
  const [templateJson, setTemplateJson] = useState("");
  const [parsedTemplate, setParsedTemplate] = useState<SlotTemplate | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<HierarchicalResult | null>(null);
  
  // Options
  const [useLLM, setUseLLM] = useState(true);
  const [syncToNeo4j, setSyncToNeo4j] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(60);
  
  // Manual alignment state
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [manualAlignOpen, setManualAlignOpen] = useState(false);
  const [selectedMdcgSlot, setSelectedMdcgSlot] = useState<string | null>(null);
  
  // Template deletion state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<TemplateListItem | null>(null);

  // Fetch MDCG slots for manual alignment
  const { data: mdcgSlots } = useQuery<MdcgSlot[]>({
    queryKey: ["mdcg-slots"],
    queryFn: async () => {
      const res = await fetch("/api/templates/MDCG_2022_21_ANNEX_I");
      if (!res.ok) return [];
      const template = await res.json();
      return template.slots || [];
    },
  });

  // Neo4j health check
  const { data: neo4jHealth } = useQuery({
    queryKey: ["neo4j-health"],
    queryFn: async () => {
      const res = await fetch("/api/neo4j/health");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Template list
  const { data: templatesData, isLoading: templatesLoading, refetch: refetchTemplates } = useQuery({
    queryKey: ["templates-list"],
    queryFn: async () => {
      const res = await fetch("/api/templates/all");
      if (!res.ok) throw new Error("Failed to load templates");
      return res.json();
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete template");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Template Deleted",
        description: `Template "${templateToDelete?.name}" has been deleted.`,
      });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      refetchTemplates();
      // Invalidate all template-related queries
      queryClient.invalidateQueries({ queryKey: ["templates-list"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Parse template JSON
  const handleParseTemplate = useCallback(() => {
    try {
      const parsed = JSON.parse(templateJson);
      if (!parsed.template_id || !parsed.slots) {
        throw new Error("Missing required fields: template_id, slots");
      }
      setParsedTemplate(parsed);
      setParseError(null);
    } catch (e: any) {
      setParseError(e.message);
      setParsedTemplate(null);
    }
  }, [templateJson]);

  // Process through hierarchical pipeline
  const processMutation = useMutation({
    mutationFn: async () => {
      if (!parsedTemplate) throw new Error("No template parsed");
      
      const res = await fetch("/api/pipeline/hierarchical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: parsedTemplate,
          referenceStandard: "MDCG_2022_21_ANNEX_I",
          useLLM,
          syncToNeo4j,
          confidenceThreshold,
        }),
      });
      
      const data = await res.json();
      if (!res.ok && res.status !== 422) {
        throw new Error(data.error || "Pipeline failed");
      }
      return data as HierarchicalResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("review");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      
      toast({
        title: data.status === "ALIGNED" ? "Fully Aligned" : data.status === "PARTIAL" ? "Partially Aligned" : "Alignment Issues",
        description: `${data.alignmentStats.alignmentPercent}% aligned with MDCG 2022-21`,
        variant: data.status === "MISALIGNED" ? "destructive" : "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Pipeline Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Manual alignment mutation
  const manualAlignMutation = useMutation({
    mutationFn: async ({ customSlotId, mdcgSlotId }: { customSlotId: string; mdcgSlotId: string }) => {
      const res = await fetch(`/api/pipeline/hierarchical/${parsedTemplate?.template_id}/align/${customSlotId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mdcgSlotId, reason: "Manual alignment" }),
      });
      if (!res.ok) throw new Error("Failed to apply alignment");
      return res.json();
    },
    onSuccess: () => {
      setManualAlignOpen(false);
      setSelectedMdcgSlot(null);
      toast({ title: "Manual Alignment Applied" });
      // Re-run pipeline to update stats
      processMutation.mutate();
    },
  });

  // Load sample template
  const loadSampleTemplate = () => {
    setTemplateJson(JSON.stringify(SAMPLE_TEMPLATE, null, 2));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ALIGNED": return "text-emerald-400";
      case "PARTIAL": return "text-amber-400";
      case "MISALIGNED": return "text-red-400";
      default: return "text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ALIGNED": return <CheckCircle2 className="w-6 h-6 text-emerald-400" />;
      case "PARTIAL": return <AlertTriangle className="w-6 h-6 text-amber-400" />;
      case "MISALIGNED": return <XCircle className="w-6 h-6 text-red-400" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Template Pipeline
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage and align templates with MDCG 2022-21 standard
            </p>
          </div>
          
          {/* Neo4j Status */}
          <div className="flex items-center gap-2">
            <GitBranch className={cn("w-4 h-4", neo4jHealth?.healthy ? "text-emerald-400" : "text-muted-foreground/70")} />
            <span className="text-sm text-muted-foreground">
              Neo4j: {neo4jHealth?.healthy ? "Connected" : "Offline"}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pipeline" | "templates")}>
          <TabsList className="bg-secondary border border-border">
            <TabsTrigger value="pipeline" className="data-[state=active]:bg-cyan-600">
              <Zap className="w-4 h-4 mr-2" />
              Mapping Pipeline
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-cyan-600">
              <List className="w-4 h-4 mr-2" />
              Manage Templates
            </TabsTrigger>
          </TabsList>

          {/* Template Management Tab */}
          <TabsContent value="templates" className="space-y-6 mt-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileJson className="w-5 h-5 text-cyan-400" />
                  Saved Templates
                </CardTitle>
                <CardDescription>
                  View, manage, and delete your custom templates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading templates...</span>
                  </div>
                ) : templatesData?.templates?.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileJson className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No templates found</p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setActiveTab("pipeline")}
                    >
                      Create New Template
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {templatesData?.templates?.map((template: TemplateListItem) => (
                      <div 
                        key={template.templateId}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border hover:border-primary/30 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-white">{template.name}</span>
                            <Badge variant="outline" className="text-xs font-mono">
                              {template.templateId}
                            </Badge>
                            {!template.isCustom && (
                              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                                Base Template
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>v{template.version}</span>
                            <span>{template.templateType}</span>
                            {template.jurisdictions?.length > 0 && (
                              <span>{template.jurisdictions.join(", ")}</span>
                            )}
                            {template.updatedAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(template.updatedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation("/psur")}
                          >
                            Use in Wizard
                          </Button>
                          {template.isCustom && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                              onClick={() => {
                                setTemplateToDelete(template);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pipeline Tab */}
          <TabsContent value="pipeline" className="space-y-6 mt-6">
            {/* Architecture Diagram */}
            <Card className="bg-card border-border">
              <CardContent className="py-4">
                <div className="flex items-center justify-center gap-4 text-sm">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-950/50 border border-blue-500/30">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <span className="text-blue-300">EU MDR / UK MDR</span>
                    <span className="text-xs text-muted-foreground">(Regulations)</span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground/70" />
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-950/50 border border-purple-500/30">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-purple-300">MDCG 2022-21</span>
                    <span className="text-xs text-muted-foreground">(Standard)</span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground/70" />
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-950/50 border border-cyan-500/30">
                    <FileJson className="w-4 h-4 text-cyan-400" />
                    <span className="text-cyan-300">Custom Template</span>
                    <span className="text-xs text-muted-foreground">(Your Input)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Progress Steps */}
            <div className="flex items-center gap-4">
              {["upload", "review", "complete"].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-medium",
                    step === s ? "bg-cyan-500 text-white" :
                    ["upload", "review", "complete"].indexOf(step) > i ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50" :
                    "bg-muted text-muted-foreground border border-border"
                  )}>
                    {i + 1}
                  </div>
                  <span className={cn("text-sm font-medium capitalize", step === s ? "text-white" : "text-muted-foreground")}>
                    {s}
                  </span>
                  {i < 2 && <ChevronRight className="w-4 h-4 text-muted-foreground/70 mx-2" />}
                </div>
              ))}
            </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="grid grid-cols-12 gap-6">
            {/* Editor */}
            <div className="col-span-8">
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileJson className="w-5 h-5 text-cyan-400" />
                        Custom Template JSON
                      </CardTitle>
                      <CardDescription>Paste your template - it will be aligned with MDCG 2022-21</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadSampleTemplate}>
                      Load Sample
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={templateJson}
                    onChange={(e) => setTemplateJson(e.target.value)}
                    placeholder='{\n  "template_id": "MY_TEMPLATE",\n  "name": "My PSUR Template",\n  "version": "1.0",\n  "jurisdiction_scope": ["EU_MDR"],\n  "slots": [...]\n}'
                    className="font-mono text-sm h-[400px] bg-muted border-border"
                  />
                  
                  {parseError && (
                    <div className="mt-3 p-3 rounded bg-red-950/30 border border-red-500/30 text-red-400 text-sm">
                      Parse Error: {parseError}
                    </div>
                  )}
                  
                  {parsedTemplate && (
                    <div className="mt-3 p-3 rounded bg-emerald-950/30 border border-emerald-500/30">
                      <div className="flex items-center gap-2 text-emerald-400 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        Valid: {parsedTemplate.name} ({parsedTemplate.slots.length} slots)
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 flex gap-3">
                    <Button onClick={handleParseTemplate} variant="outline">
                      Validate JSON
                    </Button>
                    <Button 
                      onClick={() => processMutation.mutate()}
                      disabled={!parsedTemplate || processMutation.isPending}
                      className="bg-cyan-600 hover:bg-cyan-500"
                    >
                      {processMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Aligning with MDCG...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Run Hierarchical Mapping
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Options */}
            <div className="col-span-4 space-y-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-muted-foreground" />
                    Pipeline Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="llm" className="text-sm">LLM Analysis</Label>
                    <Switch id="llm" checked={useLLM} onCheckedChange={setUseLLM} />
                  </div>
                  <p className="text-xs text-muted-foreground">Use GPT-4o-mini for semantic slot matching</p>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="neo4j" className="text-sm">Sync to Neo4j</Label>
                    <Switch 
                      id="neo4j" 
                      checked={syncToNeo4j} 
                      onCheckedChange={setSyncToNeo4j}
                      disabled={!neo4jHealth?.healthy}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Replicate hierarchy to graph database</p>
                  
                  <div className="space-y-2">
                    <Label className="text-sm">Confidence Threshold</Label>
                    <Select value={String(confidenceThreshold)} onValueChange={(v) => setConfidenceThreshold(Number(v))}>
                      <SelectTrigger className="bg-muted">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50% (Lenient)</SelectItem>
                        <SelectItem value="60">60% (Standard)</SelectItem>
                        <SelectItem value="70">70% (Strict)</SelectItem>
                        <SelectItem value="80">80% (Very Strict)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card className="bg-purple-950/20 border-purple-500/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-purple-300 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Reference Standard
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2">
                  <p>Your custom template will be aligned against:</p>
                  <div className="p-2 bg-secondary rounded font-mono text-purple-300">
                    MDCG_2022_21_ANNEX_I
                  </div>
                  <p>This is the official EU template for PSURs and provides 100% coverage of MDR Article 86 requirements.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === "review" && result && (
          <div className="space-y-6">
            {/* Status Card */}
            <Card className={cn(
              "border",
              result.status === "ALIGNED" ? "bg-emerald-950/20 border-emerald-500/30" :
              result.status === "MISALIGNED" ? "bg-red-950/20 border-red-500/30" :
              "bg-amber-950/20 border-amber-500/30"
            )}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {getStatusIcon(result.status)}
                    <div>
                      <h3 className={cn("font-semibold text-xl", getStatusColor(result.status))}>
                        {result.status === "ALIGNED" ? "Fully Aligned with MDCG 2022-21" :
                         result.status === "MISALIGNED" ? "Alignment Issues Detected" :
                         "Partially Aligned"}
                      </h3>
                      <p className="text-muted-foreground">
                        Template: {result.customTemplateId} | Reference: {result.referenceStandard}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-white">{result.alignmentStats.alignmentPercent}%</div>
                      <div className="text-xs text-muted-foreground uppercase">MDCG Alignment</div>
                    </div>
                    <Progress value={result.alignmentStats.alignmentPercent} className="w-40 h-3" />
                  </div>
                </div>
                
                {/* Stats Row */}
                <div className="grid grid-cols-5 gap-4 mt-6 pt-6 border-t border-border">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-cyan-400">{result.alignmentStats.totalCustomSlots}</div>
                    <div className="text-xs text-muted-foreground">Custom Slots</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">{result.alignmentStats.totalMdcgSlots}</div>
                    <div className="text-xs text-muted-foreground">MDCG Slots</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">{result.alignmentStats.coveredMdcgSlots}</div>
                    <div className="text-xs text-muted-foreground">Aligned</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-400">{result.uncoveredMdcgSlots.length}</div>
                    <div className="text-xs text-muted-foreground">Missing MDCG</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">{result.grkbStats.grkbCoveragePercent}%</div>
                    <div className="text-xs text-muted-foreground">GRKB via MDCG</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-12 gap-6">
              {/* Slot Alignments */}
              <div className="col-span-7">
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link2 className="w-5 h-5 text-cyan-400" />
                      Slot Alignments
                    </CardTitle>
                    <CardDescription>
                      Your custom slots mapped to MDCG 2022-21 standard slots
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[450px] pr-4">
                      <div className="space-y-3">
                        {result.slotAlignments.map(alignment => (
                          <div 
                            key={alignment.customSlotId}
                            className={cn(
                              "p-4 rounded-lg border cursor-pointer transition-all",
                              selectedSlot === alignment.customSlotId
                                ? "bg-cyan-950/30 border-cyan-500/50"
                                : alignment.mdcgSlotId 
                                  ? "bg-secondary border-border hover:border-primary/30"
                                  : "bg-red-950/20 border-red-500/30"
                            )}
                            onClick={() => setSelectedSlot(alignment.customSlotId)}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-white">{alignment.customSlotName}</span>
                                  <Badge variant="outline" className="text-xs font-mono">
                                    {alignment.customSlotId}
                                  </Badge>
                                </div>
                                
                                {alignment.mdcgSlotId ? (
                                  <div className="flex items-center gap-2 mt-2">
                                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                    <div className="flex items-center gap-2">
                                      <Badge className={cn("text-xs border", METHOD_COLORS[alignment.method])}>
                                        {METHOD_ICONS[alignment.method]}
                                        <span className="ml-1">{alignment.method.replace("_", " ")}</span>
                                      </Badge>
                                      <span className="text-sm text-purple-300">{alignment.mdcgSlotTitle}</span>
                                      <span className={cn(
                                        "text-xs font-medium",
                                        alignment.confidence >= 80 ? "text-emerald-400" :
                                        alignment.confidence >= 60 ? "text-amber-400" :
                                        "text-red-400"
                                      )}>
                                        {alignment.confidence}%
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 mt-2 text-red-400 text-sm">
                                    <XCircle className="w-4 h-4" />
                                    No MDCG slot match found
                                  </div>
                                )}

                                {alignment.grkbObligationsCovered.length > 0 && (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    GRKB: {alignment.grkbObligationsCovered.slice(0, 3).join(", ")}
                                    {alignment.grkbObligationsCovered.length > 3 && ` +${alignment.grkbObligationsCovered.length - 3} more`}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {alignment.reasoning && alignment.mdcgSlotId && (
                              <p className="mt-2 text-xs text-muted-foreground italic">
                                {alignment.reasoning}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="col-span-5 space-y-4">
                {/* Method Legend */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Matching Methods
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(METHOD_COLORS).filter(([m]) => m !== "no_match").map(([method, color]) => (
                        <div key={method} className="flex items-center gap-2">
                          <span className={cn("p-1 rounded", color)}>
                            {METHOD_ICONS[method]}
                          </span>
                          <span className="text-xs text-foreground/80 capitalize">{method.replace("_", " ")}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Uncovered MDCG Slots */}
                {result.uncoveredMdcgSlots.length > 0 && (
                  <Card className="bg-amber-950/20 border-amber-500/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Uncovered MDCG Slots ({result.uncoveredMdcgSlots.length})
                      </CardTitle>
                      <CardDescription className="text-xs">
                        These MDCG standard sections are not covered by your template
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[150px]">
                        <div className="space-y-2">
                          {result.uncoveredMdcgSlots.map(slot => (
                            <div key={slot.slotId} className="text-xs p-2 bg-secondary rounded">
                              <div className="font-mono text-amber-300">{slot.slotId}</div>
                              <div className="text-muted-foreground mt-1">{slot.title}</div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Orphaned Custom Slots */}
                {result.orphanedCustomSlots.length > 0 && (
                  <Card className="bg-red-950/20 border-red-500/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-red-400 flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Unaligned Custom Slots ({result.orphanedCustomSlots.length})
                      </CardTitle>
                      <CardDescription className="text-xs">
                        These slots don't match any MDCG standard section
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[100px]">
                        <div className="space-y-1">
                          {result.orphanedCustomSlots.map(slot => (
                            <div key={slot.slotId} className="text-xs p-2 bg-secondary rounded flex justify-between">
                              <span className="font-mono text-red-300">{slot.slotId}</span>
                              <span className="text-muted-foreground">{slot.name}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Actions */}
                {selectedSlot && (
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Selected: {selectedSlot}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={() => {
                          const current = result.slotAlignments.find(a => a.customSlotId === selectedSlot);
                          setSelectedMdcgSlot(current?.mdcgSlotId || null);
                          setManualAlignOpen(true);
                        }}
                      >
                        <Settings2 className="w-4 h-4 mr-2" />
                        Manual Align to MDCG Slot
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Complete Button */}
                <Button 
                  className="w-full bg-emerald-600 hover:bg-emerald-500"
                  onClick={() => setStep("complete")}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Accept & Continue
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === "complete" && result && (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Template Aligned & Saved</h2>
              <p className="text-muted-foreground mb-6">
                Template <code className="text-cyan-400">{result.customTemplateId}</code> is now aligned with MDCG 2022-21
              </p>
              
              <div className="flex items-center justify-center gap-3 mb-8">
                <Badge className="bg-emerald-500/20 text-emerald-300">
                  <Database className="w-3 h-3 mr-1" />
                  PostgreSQL
                </Badge>
                <Badge className="bg-purple-500/20 text-purple-300">
                  <Layers className="w-3 h-3 mr-1" />
                  MDCG Aligned
                </Badge>
                <Badge className="bg-blue-500/20 text-blue-300">
                  <GitBranch className="w-3 h-3 mr-1" />
                  Neo4j
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8">
                <div className="p-3 bg-secondary rounded-lg">
                  <div className="text-2xl font-bold text-cyan-400">{result.alignmentStats.alignmentPercent}%</div>
                  <div className="text-xs text-muted-foreground">MDCG Alignment</div>
                </div>
                <div className="p-3 bg-secondary rounded-lg">
                  <div className="text-2xl font-bold text-purple-400">{result.alignmentStats.coveredMdcgSlots}/{result.alignmentStats.totalMdcgSlots}</div>
                  <div className="text-xs text-muted-foreground">MDCG Slots</div>
                </div>
                <div className="p-3 bg-secondary rounded-lg">
                  <div className="text-2xl font-bold text-blue-400">{result.grkbStats.grkbCoveragePercent}%</div>
                  <div className="text-xs text-muted-foreground">GRKB Coverage</div>
                </div>
              </div>
              
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => {
                  setStep("upload");
                  setTemplateJson("");
                  setParsedTemplate(null);
                  setResult(null);
                }}>
                  Process Another
                </Button>
                <Button onClick={() => setLocation("/psur")}>
                  Use in PSUR Wizard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

          </TabsContent>
        </Tabs>

        {/* Manual Alignment Dialog */}
        <Dialog open={manualAlignOpen} onOpenChange={setManualAlignOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Manual Alignment to MDCG 2022-21</DialogTitle>
              <DialogDescription>
                Select the MDCG standard slot that best matches: <strong>{selectedSlot}</strong>
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-1 py-4">
              <div className="space-y-2">
                {mdcgSlots?.map((slot) => (
                  <div 
                    key={slot.slot_id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      selectedMdcgSlot === slot.slot_id
                        ? "bg-purple-950/30 border-purple-500/50"
                        : "bg-secondary border-border hover:border-primary/30"
                    )}
                    onClick={() => setSelectedMdcgSlot(slot.slot_id)}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0",
                      selectedMdcgSlot === slot.slot_id 
                        ? "border-purple-400 bg-purple-400" 
                        : "border-border"
                    )} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-purple-400">{slot.slot_id}</span>
                        {slot.required && <Badge variant="outline" className="text-xs">Required</Badge>}
                      </div>
                      <p className="text-sm text-white mt-1">{slot.title}</p>
                      {slot.section_path && (
                        <p className="text-xs text-muted-foreground mt-1">{slot.section_path}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setManualAlignOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => selectedSlot && selectedMdcgSlot && manualAlignMutation.mutate({ 
                  customSlotId: selectedSlot, 
                  mdcgSlotId: selectedMdcgSlot 
                })}
                disabled={!selectedMdcgSlot || manualAlignMutation.isPending}
                className="bg-purple-600 hover:bg-purple-500"
              >
                {manualAlignMutation.isPending ? "Applying..." : "Apply Alignment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-400">Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong className="text-white">{templateToDelete?.name}</strong>?
                <br /><br />
                <span className="text-red-400/80">
                  This action cannot be undone. The template and all its slot definitions will be permanently removed.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-secondary border-border hover:bg-muted">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-500"
                onClick={() => templateToDelete && deleteMutation.mutate(templateToDelete.templateId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Template
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
