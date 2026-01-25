/**
 * TEMPLATE MANAGEMENT PAGE
 * 
 * State-of-the-art template management interface that:
 * 1. Uploads custom DOCX/JSON templates
 * 2. Accepts optional slot mapping and formatting guides
 * 3. Shows GRKB grounding results with compliance gaps
 * 4. Displays MDCG 2022-21 compliance status
 * 5. Shows agent instruction updates
 * 6. Provides full traceability
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

// Icons
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Loader2,
  FileJson,
  FileCode,
  Globe,
  Shield,
  Brain,
  Layers,
  Link,
  RefreshCw,
  Trash2,
  Eye,
  Download,
  ChevronRight,
  Zap,
  Database,
  Settings,
  Info,
  ArrowRight,
  Check,
  X,
} from "lucide-react";

// Types
interface TemplateListItem {
  templateId: string;
  name: string;
  version: string;
  jurisdictions: string[];
  templateType: "slot-based" | "form-based";
}

interface SlotDefinition {
  slotId: string;
  title: string;
  description: string;
  requiredEvidenceTypes: string[];
  hardRequireEvidence: boolean;
  sortOrder: number;
  obligations?: ObligationLink[];
}

interface ObligationLink {
  obligationId: string;
  mandatory: boolean;
  obligation?: {
    title: string;
    text: string;
    sourceCitation: string;
    jurisdiction: string;
  };
}

interface GroundingResult {
  totalSlots: number;
  groundedSlots: number;
  ungroundedSlots: string[];
  mdcgCompliance: {
    annex1Coverage: number;
    annex2Coverage: number;
    annex3Coverage: number;
    missingMandatorySections: string[];
    passed: boolean;
  };
  complianceGaps?: ComplianceGap[];
}

interface ComplianceGap {
  slotId: string;
  slotName: string;
  missingRequirements: string[];
  severity: "critical" | "high" | "medium" | "low";
  recommendation: string;
}

interface AgentUpdate {
  agentKey: string;
  category: string;
  version: number;
  reason: string;
}

interface ProcessResult {
  success: boolean;
  templateId: string;
  templateType: string;
  savedTo: string;
  slotCount: number;
  grounding: GroundingResult;
  agentUpdates: AgentUpdate[];
  traceId: string;
  errors: string[];
  warnings: string[];
}

interface AnalyzeResult {
  success: boolean;
  type: string;
  templateType?: string;
  filename?: string;
  slots: any[];
  sections?: any[];
  tables?: any[];
  formFields?: any[];
  grounding?: Partial<GroundingResult>;
  warnings?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: Template Management Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function TemplateManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("upload");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Upload state
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [slotMappingFile, setSlotMappingFile] = useState<File | null>(null);
  const [formattingGuideFile, setFormattingGuideFile] = useState<File | null>(null);
  const [jurisdictions, setJurisdictions] = useState<string[]>(["EU_MDR", "UK_MDR"]);
  const [updateAgentInstructions, setUpdateAgentInstructions] = useState(true);

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResult | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);

  // Fetch templates list
  const { data: templatesList, isLoading: templatesLoading, refetch: refetchTemplates } = useQuery<{ templates: TemplateListItem[] }>({
    queryKey: ["/api/templates/list"],
    queryFn: getQueryFn<{ templates: TemplateListItem[] }>({ on401: "throw" }),
  });

  // Fetch selected template details
  const { data: templateDetails, isLoading: detailsLoading } = useQuery<{
    template: any;
    templateType: string;
    slots: SlotDefinition[];
  }>({
    queryKey: ["/api/templates", selectedTemplate],
    queryFn: async () => {
      const res = await fetch(`/api/templates/${selectedTemplate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch template details");
      return res.json();
    },
    enabled: !!selectedTemplate,
  });

  // Fetch template slots
  const { data: templateSlots } = useQuery<{ slots: SlotDefinition[] }>({
    queryKey: ["/api/templates", selectedTemplate, "slots"],
    queryFn: async () => {
      const res = await fetch(`/api/templates/${selectedTemplate}/slots`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch template slots");
      return res.json();
    },
    enabled: !!selectedTemplate,
  });

  // Fetch template grounding
  const { data: templateGrounding } = useQuery<{
    summary: { totalSlots: number; groundedSlots: number; ungroundedSlots: number; groundingRate: number };
    ungroundedSlotIds: string[];
    obligationLinks: any[];
    recentTraces: any[];
  }>({
    queryKey: ["/api/templates", selectedTemplate, "grounding"],
    queryFn: async () => {
      const res = await fetch(`/api/templates/${selectedTemplate}/grounding`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch template grounding");
      return res.json();
    },
    enabled: !!selectedTemplate,
  });

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!templateFile) throw new Error("No template file selected");

      const formData = new FormData();
      formData.append("template", templateFile);
      if (slotMappingFile) {
        formData.append("slotMappingGuide", slotMappingFile);
      }
      formData.append("jurisdictions", JSON.stringify(jurisdictions));

      const response = await fetch("/api/templates/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Analysis failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: "Analysis Complete",
        description: `Found ${data.slots?.length || 0} slots in the template`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Process mutation
  const processMutation = useMutation({
    mutationFn: async () => {
      if (!templateFile) throw new Error("No template file selected");

      const formData = new FormData();
      formData.append("template", templateFile);
      if (slotMappingFile) {
        formData.append("slotMappingGuide", slotMappingFile);
      }
      if (formattingGuideFile) {
        formData.append("formattingGuide", formattingGuideFile);
      }
      formData.append("jurisdictions", JSON.stringify(jurisdictions));
      formData.append("updateAgentInstructions", String(updateAgentInstructions));

      const response = await fetch("/api/templates/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Processing failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setProcessResult(data);
      refetchTemplates();
      
      // Invalidate system instructions cache so Prompts page reflects updates
      if (data.agentUpdates?.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/system-instructions"] });
      }
      
      toast({
        title: data.success ? "Template Processed Successfully" : "Processing Completed with Issues",
        description: `${data.slotCount} slots, ${data.grounding.groundedSlots} grounded to GRKB`,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reground mutation
  const regroundMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(`/api/templates/${templateId}/reground`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jurisdictions }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Reground failed");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates", selectedTemplate, "grounding"] });
      toast({
        title: "Regrounding Complete",
        description: "GRKB grounding has been recalculated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reground Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Delete failed");
      }

      return response.json();
    },
    onSuccess: () => {
      setSelectedTemplate(null);
      refetchTemplates();
      toast({
        title: "Template Deleted",
        description: "Template and associated data have been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // File drop handler
  const handleFileDrop = useCallback((
    e: React.DragEvent<HTMLDivElement>,
    setFile: (file: File | null) => void
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      setFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (file: File | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setFile(file);
    }
  }, []);

  // Reset upload form
  const resetUploadForm = useCallback(() => {
    setTemplateFile(null);
    setSlotMappingFile(null);
    setFormattingGuideFile(null);
    setAnalysisResult(null);
    setProcessResult(null);
  }, []);

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <ScrollArea className="h-full">
        <div className="max-w-[1800px] mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Template Management
              </h1>
              <p className="text-muted-foreground mt-1">
                Upload, ground, and manage PSUR templates with GRKB compliance validation
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Database className="w-3 h-3" />
                {templatesList?.templates?.length || 0} Templates
              </Badge>
              <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400">
                <Shield className="w-3 h-3" />
                MDCG 2022-21 Compliant
              </Badge>
            </div>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-12 gap-6">
            {/* Left Sidebar - Template List */}
            <div className="col-span-3">
              <Card className="h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Templates
                  </CardTitle>
                  <CardDescription>
                    Select a template to view details
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {templatesLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : templatesList?.templates?.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p>No templates found</p>
                          <p className="text-sm">Upload a template to get started</p>
                        </div>
                      ) : (
                        templatesList?.templates?.map((template) => (
                          <button
                            key={template.templateId}
                            onClick={() => setSelectedTemplate(template.templateId)}
                            className={cn(
                              "w-full p-3 rounded-lg text-left transition-all",
                              "hover:bg-accent/50",
                              selectedTemplate === template.templateId
                                ? "bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800"
                                : "bg-card border border-transparent"
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{template.name}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {template.templateId}
                                </div>
                              </div>
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-xs ml-2 shrink-0",
                                  template.templateType === "form-based"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                )}
                              >
                                {template.templateType === "form-based" ? "Form" : "Slot"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 mt-2">
                              {template.jurisdictions.map((j) => (
                                <Badge key={j} variant="secondary" className="text-xs">
                                  {j}
                                </Badge>
                              ))}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Main Content Area */}
            <div className="col-span-9">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 mb-4">
                  <TabsTrigger value="upload" className="gap-2">
                    <Upload className="w-4 h-4" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="details" className="gap-2" disabled={!selectedTemplate}>
                    <Eye className="w-4 h-4" />
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="grounding" className="gap-2" disabled={!selectedTemplate}>
                    <Link className="w-4 h-4" />
                    GRKB Grounding
                  </TabsTrigger>
                  <TabsTrigger value="agents" className="gap-2" disabled={!selectedTemplate}>
                    <Brain className="w-4 h-4" />
                    Agent Config
                  </TabsTrigger>
                </TabsList>

                {/* Upload Tab */}
                <TabsContent value="upload" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Template Upload */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="w-5 h-5 text-blue-500" />
                          Template File
                          <Badge variant="destructive" className="text-xs">Required</Badge>
                        </CardTitle>
                        <CardDescription>
                          Upload a DOCX or JSON template file
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div
                          onDrop={(e) => handleFileDrop(e, setTemplateFile)}
                          onDragOver={(e) => e.preventDefault()}
                          className={cn(
                            "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                            templateFile
                              ? "border-green-300 bg-green-50 dark:bg-green-950"
                              : "border-muted-foreground/25 hover:border-blue-400 hover:bg-blue-50/50"
                          )}
                          onClick={() => document.getElementById("template-input")?.click()}
                        >
                          <input
                            id="template-input"
                            type="file"
                            accept=".docx,.json"
                            className="hidden"
                            onChange={(e) => handleFileSelect(e, setTemplateFile)}
                          />
                          {templateFile ? (
                            <div className="flex items-center justify-center gap-2">
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                              <span className="font-medium">{templateFile.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTemplateFile(null);
                                }}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground">
                                Drop DOCX or JSON file here, or click to browse
                              </p>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Slot Mapping Guide */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileJson className="w-5 h-5 text-purple-500" />
                          Slot Mapping Guide
                          <Badge variant="secondary" className="text-xs">Optional</Badge>
                        </CardTitle>
                        <CardDescription>
                          Ultra-granular slot definitions (JSON)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div
                          onDrop={(e) => handleFileDrop(e, setSlotMappingFile)}
                          onDragOver={(e) => e.preventDefault()}
                          className={cn(
                            "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                            slotMappingFile
                              ? "border-green-300 bg-green-50 dark:bg-green-950"
                              : "border-muted-foreground/25 hover:border-purple-400 hover:bg-purple-50/50"
                          )}
                          onClick={() => document.getElementById("slot-mapping-input")?.click()}
                        >
                          <input
                            id="slot-mapping-input"
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={(e) => handleFileSelect(e, setSlotMappingFile)}
                          />
                          {slotMappingFile ? (
                            <div className="flex items-center justify-center gap-2">
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                              <span className="font-medium">{slotMappingFile.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSlotMappingFile(null);
                                }}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <FileJson className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground">
                                Drop slot mapping JSON, or click to browse
                              </p>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Formatting Guide */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileCode className="w-5 h-5 text-orange-500" />
                          Formatting Guide
                          <Badge variant="secondary" className="text-xs">Optional</Badge>
                        </CardTitle>
                        <CardDescription>
                          Visual hierarchy preservation rules (JSON)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div
                          onDrop={(e) => handleFileDrop(e, setFormattingGuideFile)}
                          onDragOver={(e) => e.preventDefault()}
                          className={cn(
                            "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                            formattingGuideFile
                              ? "border-green-300 bg-green-50 dark:bg-green-950"
                              : "border-muted-foreground/25 hover:border-orange-400 hover:bg-orange-50/50"
                          )}
                          onClick={() => document.getElementById("formatting-input")?.click()}
                        >
                          <input
                            id="formatting-input"
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={(e) => handleFileSelect(e, setFormattingGuideFile)}
                          />
                          {formattingGuideFile ? (
                            <div className="flex items-center justify-center gap-2">
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                              <span className="font-medium">{formattingGuideFile.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFormattingGuideFile(null);
                                }}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <FileCode className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground">
                                Drop formatting guide JSON, or click to browse
                              </p>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Options */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Settings className="w-5 h-5 text-slate-500" />
                          Processing Options
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Jurisdictions</Label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={jurisdictions.includes("EU_MDR")}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setJurisdictions([...jurisdictions, "EU_MDR"]);
                                  } else {
                                    setJurisdictions(jurisdictions.filter(j => j !== "EU_MDR"));
                                  }
                                }}
                                className="rounded"
                              />
                              <span>EU MDR</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={jurisdictions.includes("UK_MDR")}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setJurisdictions([...jurisdictions, "UK_MDR"]);
                                  } else {
                                    setJurisdictions(jurisdictions.filter(j => j !== "UK_MDR"));
                                  }
                                }}
                                className="rounded"
                              />
                              <span>UK MDR</span>
                            </label>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>Update Agent Instructions</Label>
                            <p className="text-xs text-muted-foreground">
                              Automatically update system prompts for agents
                            </p>
                          </div>
                          <Switch
                            checked={updateAgentInstructions}
                            onCheckedChange={setUpdateAgentInstructions}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-4">
                    <Button
                      onClick={() => analyzeMutation.mutate()}
                      disabled={!templateFile || analyzeMutation.isPending}
                      variant="outline"
                      className="gap-2"
                    >
                      {analyzeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                      Analyze Template
                    </Button>

                    <Button
                      onClick={() => processMutation.mutate()}
                      disabled={!templateFile || processMutation.isPending}
                      className="gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                      {processMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                      Process & Ground Template
                    </Button>

                    <Button
                      onClick={resetUploadForm}
                      variant="ghost"
                      className="gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Reset
                    </Button>
                  </div>

                  {/* Analysis Results */}
                  {analysisResult && (
                    <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Eye className="w-5 h-5 text-purple-500" />
                          Analysis Results
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">
                              {analysisResult.slots?.length || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">Slots Detected</div>
                          </div>
                          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">
                              {analysisResult.tables?.length || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">Tables Found</div>
                          </div>
                          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                            <div className="text-2xl font-bold text-orange-600">
                              {analysisResult.formFields?.length || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">Form Fields</div>
                          </div>
                        </div>

                        {analysisResult.grounding && (
                          <div className="mt-4 p-3 bg-white dark:bg-slate-900 rounded-lg">
                            <div className="text-sm font-medium mb-2">GRKB Grounding Preview</div>
                            <Progress
                              value={
                                analysisResult.grounding.totalSlots
                                  ? (analysisResult.grounding.groundedSlots || 0) / analysisResult.grounding.totalSlots * 100
                                  : 0
                              }
                              className="h-2"
                            />
                            <div className="text-xs text-muted-foreground mt-1">
                              {analysisResult.grounding.groundedSlots || 0} / {analysisResult.grounding.totalSlots || 0} slots can be grounded
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Process Results */}
                  {processResult && (
                    <Card className={cn(
                      "border-2",
                      processResult.success
                        ? "border-green-200 bg-green-50/50 dark:bg-green-950/20"
                        : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"
                    )}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          {processResult.success ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                          )}
                          Processing Results
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Summary Stats */}
                        <div className="grid grid-cols-4 gap-4">
                          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                              {processResult.slotCount}
                            </div>
                            <div className="text-sm text-muted-foreground">Total Slots</div>
                          </div>
                          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">
                              {processResult.grounding.groundedSlots}
                            </div>
                            <div className="text-sm text-muted-foreground">Grounded</div>
                          </div>
                          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">
                              {processResult.agentUpdates.length}
                            </div>
                            <div className="text-sm text-muted-foreground">Agent Updates</div>
                          </div>
                          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                            <div className="text-2xl font-bold">
                              {processResult.grounding.mdcgCompliance.passed ? (
                                <CheckCircle2 className="w-8 h-8 text-green-500" />
                              ) : (
                                <AlertTriangle className="w-8 h-8 text-amber-500" />
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">MDCG Compliance</div>
                          </div>
                        </div>

                        {/* MDCG Coverage */}
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-lg">
                          <div className="text-sm font-medium mb-3">MDCG 2022-21 Annex Coverage</div>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs">Annex I</span>
                                <span className="text-xs font-medium">
                                  {processResult.grounding.mdcgCompliance.annex1Coverage.toFixed(0)}%
                                </span>
                              </div>
                              <Progress value={processResult.grounding.mdcgCompliance.annex1Coverage} className="h-1.5" />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs">Annex II</span>
                                <span className="text-xs font-medium">
                                  {processResult.grounding.mdcgCompliance.annex2Coverage.toFixed(0)}%
                                </span>
                              </div>
                              <Progress value={processResult.grounding.mdcgCompliance.annex2Coverage} className="h-1.5" />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs">Annex III</span>
                                <span className="text-xs font-medium">
                                  {processResult.grounding.mdcgCompliance.annex3Coverage.toFixed(0)}%
                                </span>
                              </div>
                              <Progress value={processResult.grounding.mdcgCompliance.annex3Coverage} className="h-1.5" />
                            </div>
                          </div>
                        </div>

                        {/* Warnings & Errors */}
                        {(processResult.warnings.length > 0 || processResult.errors.length > 0) && (
                          <div className="space-y-2">
                            {processResult.errors.map((err, i) => (
                              <Alert key={i} variant="destructive">
                                <XCircle className="w-4 h-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{err}</AlertDescription>
                              </Alert>
                            ))}
                            {processResult.warnings.map((warn, i) => (
                              <Alert key={i}>
                                <AlertTriangle className="w-4 h-4" />
                                <AlertTitle>Warning</AlertTitle>
                                <AlertDescription>{warn}</AlertDescription>
                              </Alert>
                            ))}
                          </div>
                        )}

                        {/* Agent Updates */}
                        {processResult.agentUpdates.length > 0 && (
                          <Accordion type="single" collapsible>
                            <AccordionItem value="agent-updates">
                              <AccordionTrigger>
                                <span className="flex items-center gap-2">
                                  <Brain className="w-4 h-4" />
                                  Agent Instruction Updates ({processResult.agentUpdates.length})
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-2">
                                  {processResult.agentUpdates.map((update, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded">
                                      <div>
                                        <div className="font-medium text-sm">{update.agentKey}</div>
                                        <div className="text-xs text-muted-foreground">{update.category}</div>
                                      </div>
                                      <Badge variant="secondary">v{update.version}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        )}

                        {/* Trace ID */}
                        <div className="text-xs text-muted-foreground">
                          Trace ID: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{processResult.traceId}</code>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Details Tab */}
                <TabsContent value="details">
                  {selectedTemplate && templateDetails ? (
                    <div className="space-y-4">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                          <div>
                            <CardTitle>{templateDetails.template?.name || templateDetails.template?.form?.form_title || selectedTemplate}</CardTitle>
                            <CardDescription>
                              {templateDetails.templateType} template • {templateDetails.slots?.length || 0} slots
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => regroundMutation.mutate(selectedTemplate)}
                              disabled={regroundMutation.isPending}
                            >
                              {regroundMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                              Reground
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="gap-2">
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Delete Template?</DialogTitle>
                                  <DialogDescription>
                                    This will permanently delete the template and all associated slot definitions and obligation mappings.
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                  <Button variant="outline">Cancel</Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => deleteMutation.mutate(selectedTemplate)}
                                  >
                                    Delete
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                              <div className="text-sm text-muted-foreground">Template ID</div>
                              <div className="font-mono text-sm">{selectedTemplate}</div>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                              <div className="text-sm text-muted-foreground">Type</div>
                              <Badge>{templateDetails.templateType}</Badge>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                              <div className="text-sm text-muted-foreground">Jurisdictions</div>
                              <div className="flex gap-1 mt-1">
                                {(templateDetails.template?.jurisdiction_scope || ["EU_MDR"]).map((j: string) => (
                                  <Badge key={j} variant="outline">{j}</Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Slots Table */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Slot Definitions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Slot ID</TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead>Evidence Types</TableHead>
                                <TableHead>Required</TableHead>
                                <TableHead>GRKB Links</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {templateSlots?.slots?.map((slot: SlotDefinition) => (
                                <TableRow key={slot.slotId}>
                                  <TableCell className="font-mono text-xs">{slot.slotId}</TableCell>
                                  <TableCell>{slot.title}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {(slot.requiredEvidenceTypes as string[])?.slice(0, 2).map((t) => (
                                        <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                                      ))}
                                      {(slot.requiredEvidenceTypes as string[])?.length > 2 && (
                                        <Badge variant="secondary" className="text-xs">
                                          +{(slot.requiredEvidenceTypes as string[]).length - 2}
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {slot.hardRequireEvidence ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {slot.obligations?.length || 0} obligations
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Info className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">Select a template from the list to view details</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Grounding Tab */}
                <TabsContent value="grounding">
                  {selectedTemplate && templateGrounding ? (
                    <div className="space-y-4">
                      {/* Summary Card */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Link className="w-5 h-5" />
                            GRKB Grounding Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-4 gap-4">
                            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
                              <div className="text-3xl font-bold text-blue-600">
                                {templateGrounding.summary?.totalSlots || 0}
                              </div>
                              <div className="text-sm text-muted-foreground">Total Slots</div>
                            </div>
                            <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                              <div className="text-3xl font-bold text-green-600">
                                {templateGrounding.summary?.groundedSlots || 0}
                              </div>
                              <div className="text-sm text-muted-foreground">Grounded</div>
                            </div>
                            <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg text-center">
                              <div className="text-3xl font-bold text-amber-600">
                                {templateGrounding.summary?.ungroundedSlots || 0}
                              </div>
                              <div className="text-sm text-muted-foreground">Ungrounded</div>
                            </div>
                            <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg text-center">
                              <div className="text-3xl font-bold text-purple-600">
                                {templateGrounding.summary?.groundingRate || 0}%
                              </div>
                              <div className="text-sm text-muted-foreground">Coverage</div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <Progress 
                              value={templateGrounding.summary?.groundingRate || 0} 
                              className="h-3"
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Ungrounded Slots */}
                      {templateGrounding.ungroundedSlotIds?.length > 0 && (
                        <Alert variant="destructive">
                          <AlertTriangle className="w-4 h-4" />
                          <AlertTitle>Ungrounded Slots</AlertTitle>
                          <AlertDescription>
                            <p className="mb-2">
                              The following slots have no GRKB obligation mappings:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {templateGrounding.ungroundedSlotIds.map((slotId: string) => (
                                <Badge key={slotId} variant="outline">{slotId}</Badge>
                              ))}
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Obligation Links */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Obligation Mappings</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Slot ID</TableHead>
                                <TableHead>Obligation ID</TableHead>
                                <TableHead>Mandatory</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {templateGrounding.obligationLinks?.slice(0, 20).map((link: any, i: number) => (
                                <TableRow key={i}>
                                  <TableCell className="font-mono text-xs">{link.slotId}</TableCell>
                                  <TableCell className="font-mono text-xs">{link.obligationId}</TableCell>
                                  <TableCell>
                                    {link.mandatory ? (
                                      <Badge variant="destructive">Required</Badge>
                                    ) : (
                                      <Badge variant="secondary">Optional</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {templateGrounding.obligationLinks?.length > 20 && (
                            <p className="text-sm text-muted-foreground mt-2">
                              Showing 20 of {templateGrounding.obligationLinks.length} mappings
                            </p>
                          )}
                        </CardContent>
                      </Card>

                      {/* Recent Traces */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Recent Grounding Traces</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[200px]">
                            <div className="space-y-2">
                              {templateGrounding.recentTraces?.map((trace: any) => (
                                <div 
                                  key={trace.id} 
                                  className="p-2 bg-slate-50 dark:bg-slate-900 rounded text-sm"
                                >
                                  <div className="flex items-center justify-between">
                                    <Badge variant="outline">{trace.eventType}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(trace.eventTimestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  {trace.humanSummary && (
                                    <p className="text-xs mt-1 text-muted-foreground">
                                      {trace.humanSummary}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Link className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">Select a template to view GRKB grounding</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Agents Tab */}
                <TabsContent value="agents">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5" />
                        Agent Configuration
                      </CardTitle>
                      <CardDescription>
                        System instructions that were generated for this template
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Alert>
                        <Info className="w-4 h-4" />
                        <AlertTitle>Agent Instructions</AlertTitle>
                        <AlertDescription>
                          When you process a template, the system automatically generates and updates agent instructions
                          including template field definitions, formatting rules, and narrative generation guidelines.
                          View and edit these instructions in the <strong>Prompts</strong> page.
                        </AlertDescription>
                      </Alert>

                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <Card className="border-blue-200">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">TEMPLATE_FIELD_INSTRUCTIONS</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-xs text-muted-foreground">
                              Slot definitions and evidence requirements for this template
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border-purple-200">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">DOCUMENT_FORMATTING</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-xs text-muted-foreground">
                              Visual formatting rules for document generation
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border-green-200">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">NARRATIVE_GENERATION</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-xs text-muted-foreground">
                              Instructions for generating narrative content in slots
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border-orange-200">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">TABLE_GENERATION</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-xs text-muted-foreground">
                              Column specifications for table slots
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
