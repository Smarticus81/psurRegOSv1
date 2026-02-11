import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Search, 
  Shield, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Link2,
  Unlink,
  RefreshCw,
  Settings2,
  Zap,
  Target,
  FileText,
  ChevronRight,
  Brain,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  templateId: string;
  name: string;
  version: string;
  templateType: string;
}

interface ObligationMatch {
  obligationId: string;
  obligationTitle: string;
  jurisdiction: string;
  confidence: number;
  matchMethod: string;
  reasoning: string;
}

interface SlotMapping {
  slotId: string;
  obligations: {
    obligationId: string;
    confidence: number;
    matchMethod: string;
    reasoning: string;
    isManualOverride: boolean;
  }[];
}

interface GroundingStatus {
  templateId: string;
  totalMappings: number;
  mappingsByMethod: Record<string, number>;
  slotCoverage: { slotId: string; obligationCount: number; methods: string[] }[];
}

interface UncoveredObligation {
  obligationId: string;
  title: string;
  jurisdiction: string;
  mandatory: boolean;
  sourceCitation: string | null;
  reason: string;
}

interface ValidationResult {
  valid: boolean;
  status: "PASS" | "BLOCKED" | "WARNING";
  coveredObligations: string[];
  uncoveredObligations: UncoveredObligation[];
  complianceScore: number;
  report: string;
}

interface GrkbObligation {
  id: number;
  obligationId: string;
  jurisdiction: string;
  title: string;
  text: string;
  sourceCitation: string;
  mandatory: boolean;
  requiredEvidenceTypes: string[];
}

const METHOD_COLORS: Record<string, string> = {
  semantic: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  evidence_type: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  regulatory_ref: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  llm_analysis: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  manual: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
  semantic: <Brain className="w-3 h-3" />,
  evidence_type: <FileText className="w-3 h-3" />,
  regulatory_ref: <Shield className="w-3 h-3" />,
  llm_analysis: <Sparkles className="w-3 h-3" />,
  manual: <Settings2 className="w-3 h-3" />,
};

export default function GrkbMappingPage() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [manualMappingOpen, setManualMappingOpen] = useState(false);
  const [selectedObligations, setSelectedObligations] = useState<string[]>([]);
  const [mappingReason, setMappingReason] = useState("");

  // Fetch templates
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates/list");
      const data = await res.json();
      return data.templates as Template[];
    },
  });

  // Fetch grounding status
  const { data: groundingStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["grounding-status", selectedTemplate],
    queryFn: async () => {
      if (!selectedTemplate) return null;
      const res = await fetch(`/api/grkb/grounding/${selectedTemplate}/status`);
      return res.json() as Promise<GroundingStatus>;
    },
    enabled: !!selectedTemplate,
  });

  // Fetch mappings
  const { data: mappings, isLoading: mappingsLoading, refetch: refetchMappings } = useQuery({
    queryKey: ["grounding-mappings", selectedTemplate],
    queryFn: async () => {
      if (!selectedTemplate) return null;
      const res = await fetch(`/api/grkb/grounding/${selectedTemplate}/mappings`);
      return res.json();
    },
    enabled: !!selectedTemplate,
  });

  // Fetch validation result
  const { data: validation, isLoading: validationLoading, refetch: refetchValidation } = useQuery({
    queryKey: ["grounding-validation", selectedTemplate],
    queryFn: async () => {
      if (!selectedTemplate) return null;
      const res = await fetch(`/api/grkb/grounding/${selectedTemplate}/validate`);
      return res.json() as Promise<ValidationResult>;
    },
    enabled: !!selectedTemplate,
  });

  // Fetch all obligations for manual mapping
  const { data: allObligations } = useQuery({
    queryKey: ["all-obligations"],
    queryFn: async () => {
      const res = await fetch("/api/psur-grkb/obligations");
      return res.json() as Promise<GrkbObligation[]>;
    },
  });

  // Manual mapping mutation
  const applyManualMapping = useMutation({
    mutationFn: async ({ slotId, obligationIds, reason }: { slotId: string; obligationIds: string[]; reason: string }) => {
      const res = await fetch(`/api/grkb/grounding/${selectedTemplate}/mappings/${slotId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obligationIds, reason, updatedBy: "user" }),
      });
      if (!res.ok) throw new Error("Failed to apply mapping");
      return res.json();
    },
    onSuccess: () => {
      refetchMappings();
      refetchStatus();
      refetchValidation();
      setManualMappingOpen(false);
      setSelectedObligations([]);
      setMappingReason("");
    },
  });

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-emerald-400";
    if (confidence >= 60) return "text-amber-400";
    return "text-red-400";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "PASS": return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case "BLOCKED": return <XCircle className="w-5 h-5 text-red-400" />;
      case "WARNING": return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              GRKB Obligation Mapping
            </h1>
            <p className="text-slate-400 mt-1">
              Review and adjust template-to-obligation mappings with SOTA semantic grounding
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="w-[300px] bg-slate-800/50 border-slate-700">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.templateId} value={t.templateId}>
                    <div className="flex items-center gap-2">
                      <span>{t.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {t.templateType}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedTemplate && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  refetchStatus();
                  refetchMappings();
                  refetchValidation();
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            )}
          </div>
        </div>

        {!selectedTemplate ? (
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Target className="w-16 h-16 text-slate-600 mb-4" />
              <p className="text-slate-400 text-lg">Select a template to view its GRKB mappings</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Validation Status Card */}
            {validation && (
              <Card className={cn(
                "border",
                validation.status === "PASS" ? "bg-emerald-950/20 border-emerald-500/30" :
                validation.status === "BLOCKED" ? "bg-red-950/20 border-red-500/30" :
                "bg-amber-950/20 border-amber-500/30"
              )}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {getStatusIcon(validation.status)}
                      <div>
                        <h3 className="font-semibold text-lg text-white">
                          {validation.status === "PASS" ? "Full Coverage Achieved" :
                           validation.status === "BLOCKED" ? "Coverage Issues Detected" :
                           "Partial Coverage"}
                        </h3>
                        <p className="text-slate-400 text-sm">
                          {validation.coveredObligations.length} of {validation.coveredObligations.length + validation.uncoveredObligations.length} mandatory obligations covered
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className={cn(
                          "text-3xl font-bold",
                          validation.complianceScore >= 80 ? "text-emerald-400" :
                          validation.complianceScore >= 60 ? "text-amber-400" :
                          "text-red-400"
                        )}>
                          {validation.complianceScore}%
                        </div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Coverage</div>
                      </div>
                      
                      <Progress 
                        value={validation.complianceScore} 
                        className="w-32 h-2"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Main Content */}
            <div className="grid grid-cols-12 gap-6">
              {/* Slot Mappings */}
              <div className="col-span-7">
                <Card className="bg-slate-800/30 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link2 className="w-5 h-5 text-cyan-400" />
                      Slot Mappings
                    </CardTitle>
                    <CardDescription>
                      {mappings?.totalMappings || 0} total mappings across {mappings?.slotCount || 0} slots
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-3">
                        {mappings?.mappingsBySlot && Object.entries(mappings.mappingsBySlot).map(([slotId, obligations]: [string, any[]]) => (
                          <div 
                            key={slotId}
                            className={cn(
                              "p-4 rounded-lg border transition-all cursor-pointer",
                              selectedSlot === slotId 
                                ? "bg-cyan-950/30 border-cyan-500/50" 
                                : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600"
                            )}
                            onClick={() => setSelectedSlot(slotId)}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{slotId}</span>
                                <Badge variant="outline" className="text-xs">
                                  {obligations.length} obligations
                                </Badge>
                              </div>
                              <ChevronRight className={cn(
                                "w-4 h-4 text-slate-500 transition-transform",
                                selectedSlot === slotId && "rotate-90"
                              )} />
                            </div>
                            
                            <div className="flex flex-wrap gap-1.5">
                              {obligations.slice(0, 5).map((obl: any) => (
                                <Badge 
                                  key={obl.obligationId}
                                  className={cn(
                                    "text-xs border",
                                    METHOD_COLORS[obl.matchMethod] || "bg-slate-500/20"
                                  )}
                                >
                                  <span className="mr-1">{METHOD_ICONS[obl.matchMethod]}</span>
                                  {obl.obligationId.split('.').pop()}
                                  <span className={cn("ml-1", getConfidenceColor(obl.confidence))}>
                                    {obl.confidence}%
                                  </span>
                                </Badge>
                              ))}
                              {obligations.length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{obligations.length - 5} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {(!mappings?.mappingsBySlot || Object.keys(mappings.mappingsBySlot).length === 0) && (
                          <div className="text-center py-8 text-slate-500">
                            No mappings found. Run grounding to generate mappings.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="col-span-5 space-y-6">
                {/* Matching Methods Distribution */}
                <Card className="bg-slate-800/30 border-slate-700/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Matching Methods
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {groundingStatus?.mappingsByMethod && Object.entries(groundingStatus.mappingsByMethod).map(([method, count]) => (
                        <div key={method} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn("p-1 rounded", METHOD_COLORS[method])}>
                              {METHOD_ICONS[method]}
                            </span>
                            <span className="text-sm text-slate-300 capitalize">{method.replace("_", " ")}</span>
                          </div>
                          <Badge variant="outline">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Uncovered Obligations */}
                {validation && validation.uncoveredObligations.length > 0 && (
                  <Card className="bg-red-950/20 border-red-500/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                        <Unlink className="w-4 h-4" />
                        Uncovered Obligations ({validation.uncoveredObligations.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {validation.uncoveredObligations.map((obl) => (
                            <div 
                              key={obl.obligationId}
                              className="p-2 rounded bg-slate-800/50 border border-slate-700/50"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-red-300">{obl.obligationId}</span>
                                <Badge variant="outline" className="text-xs">
                                  {obl.jurisdiction}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{obl.title}</p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Manual Mapping Actions */}
                {selectedSlot && (
                  <Card className="bg-slate-800/30 border-slate-700/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Selected: {selectedSlot}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Dialog open={manualMappingOpen} onOpenChange={setManualMappingOpen}>
                        <DialogTrigger asChild>
                          <Button className="w-full" variant="outline">
                            <Settings2 className="w-4 h-4 mr-2" />
                            Edit Mappings Manually
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                          <DialogHeader>
                            <DialogTitle>Manual Mapping Override</DialogTitle>
                            <DialogDescription>
                              Select obligations to map to slot: {selectedSlot}
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="flex-1 overflow-y-auto py-4">
                            <div className="space-y-2">
                              {allObligations?.map((obl) => (
                                <div 
                                  key={obl.obligationId}
                                  className={cn(
                                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                    selectedObligations.includes(obl.obligationId)
                                      ? "bg-cyan-950/30 border-cyan-500/50"
                                      : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600"
                                  )}
                                  onClick={() => {
                                    setSelectedObligations(prev => 
                                      prev.includes(obl.obligationId)
                                        ? prev.filter(id => id !== obl.obligationId)
                                        : [...prev, obl.obligationId]
                                    );
                                  }}
                                >
                                  <Checkbox 
                                    checked={selectedObligations.includes(obl.obligationId)}
                                    className="mt-1"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs text-cyan-400">{obl.obligationId}</span>
                                      <Badge variant="outline" className="text-xs">{obl.jurisdiction}</Badge>
                                    </div>
                                    <p className="text-sm text-white mt-1">{obl.title}</p>
                                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{obl.text}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          <div className="pt-4 border-t border-slate-700">
                            <Textarea
                              placeholder="Reason for manual override..."
                              value={mappingReason}
                              onChange={(e) => setMappingReason(e.target.value)}
                              className="mb-4"
                            />
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setManualMappingOpen(false)}>
                                Cancel
                              </Button>
                              <Button 
                                onClick={() => applyManualMapping.mutate({
                                  slotId: selectedSlot,
                                  obligationIds: selectedObligations,
                                  reason: mappingReason,
                                })}
                                disabled={selectedObligations.length === 0 || applyManualMapping.isPending}
                              >
                                {applyManualMapping.isPending ? "Applying..." : "Apply Mapping"}
                              </Button>
                            </DialogFooter>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
