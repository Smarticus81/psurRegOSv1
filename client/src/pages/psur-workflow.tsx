import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  FileText,
  Download,
  CheckCircle2,
  Loader2,
  Play,
  Circle,
  FileCheck,
  Database,
  Shield,
  BookOpen,
  Layers,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Upload,
  XCircle,
  Lock,
  AlertTriangle,
} from "lucide-react";
import type { 
  Device, 
  PSURCase, 
  OrchestratorWorkflowResult, 
  WorkflowStep,
  EvidenceIngestReport,
  AdjudicationReport,
  CoverageReportData,
  ExportBundleReport,
} from "@shared/schema";

const STEP_ICONS: Record<number, any> = {
  1: FileCheck,
  2: FileText,
  3: Database,
  4: BookOpen,
  5: Shield,
  6: CheckCircle2,
  7: FileText,
  8: Layers,
};

const TEMPLATE_OPTIONS = [
  { 
    value: "FormQAR-054_C", 
    label: "FormQAR-054_C", 
    description: "Company template (112 slots, 14 sections)",
  },
  { 
    value: "MDCG_2022_21_ANNEX_I", 
    label: "MDCG 2022-21 Annex I", 
    description: "Regulatory-native (42 slots, 11 sections)",
  },
];

const JURISDICTION_OPTIONS = [
  { value: "EU_MDR", label: "EU MDR" },
  { value: "UK_MDR", label: "UK MDR" },
];

function getStatusColor(status: string): string {
  switch (status) {
    case "COMPLETED": return "text-green-600 dark:text-green-400";
    case "RUNNING": return "text-blue-600 dark:text-blue-400";
    case "FAILED": return "text-red-600 dark:text-red-400";
    case "BLOCKED": return "text-amber-600 dark:text-amber-400";
    default: return "text-muted-foreground";
  }
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED": return "default";
    case "RUNNING": return "secondary";
    case "FAILED": return "destructive";
    case "BLOCKED": return "outline";
    default: return "outline";
  }
}

function StepIcon({ status, stepNum }: { status: string; stepNum: number }) {
  const Icon = STEP_ICONS[stepNum] || Circle;
  
  if (status === "RUNNING") {
    return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
  }
  if (status === "COMPLETED") {
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  }
  if (status === "FAILED") {
    return <XCircle className="h-4 w-4 text-red-600" />;
  }
  if (status === "BLOCKED") {
    return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  }
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

export default function PSURWorkflow() {
  const { toast } = useToast();
  
  const [templateId, setTemplateId] = useState<"FormQAR-054_C" | "MDCG_2022_21_ANNEX_I">("FormQAR-054_C");
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<("EU_MDR" | "UK_MDR")[]>(["EU_MDR"]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [periodStart, setPeriodStart] = useState("2025-01-01");
  const [periodEnd, setPeriodEnd] = useState("2025-12-31");
  
  const [activeCaseId, setActiveCaseId] = useState<number | null>(null);
  const [scopeLocked, setScopeLocked] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [workflowResult, setWorkflowResult] = useState<OrchestratorWorkflowResult | null>(null);
  
  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: psurCases = [] } = useQuery<PSURCase[]>({ queryKey: ["/api/psur-cases"] });
  const { data: kernelStatus } = useQuery<{ 
    initialized: boolean; 
    euObligations: number; 
    ukObligations: number; 
    constraints: number;
  }>({ queryKey: ["/api/orchestrator/status"] });

  const { data: caseWorkflowResult, refetch: refetchCaseWorkflow } = useQuery<OrchestratorWorkflowResult>({
    queryKey: ["/api/orchestrator/cases", activeCaseId],
    enabled: !!activeCaseId && !workflowResult,
  });

  const runWorkflowMutation = useMutation({
    mutationFn: async (params: {
      templateId: "FormQAR-054_C" | "MDCG_2022_21_ANNEX_I";
      jurisdictions: ("EU_MDR" | "UK_MDR")[];
      deviceCode: string;
      deviceId: number;
      periodStart: string;
      periodEnd: string;
      psurCaseId?: number;
      runSteps?: number[];
    }) => {
      const res = await apiRequest("POST", "/api/orchestrator/run", params);
      return res.json();
    },
    onSuccess: (result: OrchestratorWorkflowResult) => {
      setWorkflowResult(result);
      setActiveCaseId(result.case.psurCaseId);
      setScopeLocked(true);
      queryClient.invalidateQueries({ queryKey: ["/api/psur-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      toast({ title: "Workflow completed", description: `Case ${result.case.psurRef} processed` });
    },
    onError: (error: any) => {
      toast({ 
        title: "Workflow failed", 
        description: error.message || "An error occurred", 
        variant: "destructive" 
      });
    },
  });

  const selectedDevice = devices.find(d => d.id.toString() === selectedDeviceId);

  const handleCreateCase = () => {
    if (!selectedDevice) {
      toast({ title: "Select a device", variant: "destructive" });
      return;
    }
    
    runWorkflowMutation.mutate({
      templateId,
      jurisdictions: selectedJurisdictions,
      deviceCode: selectedDevice.deviceCode,
      deviceId: selectedDevice.id,
      periodStart,
      periodEnd,
      runSteps: [1, 2],
    });
  };

  const handleRunFullWorkflow = () => {
    if (!selectedDevice || !activeCaseId) {
      toast({ title: "Create a case first", variant: "destructive" });
      return;
    }
    
    runWorkflowMutation.mutate({
      templateId,
      jurisdictions: selectedJurisdictions,
      deviceCode: selectedDevice.deviceCode,
      deviceId: selectedDevice.id,
      periodStart,
      periodEnd,
      psurCaseId: activeCaseId,
    });
  };

  const toggleJurisdiction = (jur: "EU_MDR" | "UK_MDR") => {
    if (scopeLocked) return;
    setSelectedJurisdictions(prev => 
      prev.includes(jur) 
        ? prev.filter(j => j !== jur) 
        : [...prev, jur]
    );
  };

  const toggleStepExpanded = (step: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

  const currentResult = workflowResult || caseWorkflowResult;

  const evidenceReport = currentResult?.steps.find(s => s.step === 3)?.report as EvidenceIngestReport | undefined;
  const adjudicationReport = currentResult?.steps.find(s => s.step === 5)?.report as AdjudicationReport | undefined;
  const coverageReport = currentResult?.steps.find(s => s.step === 6)?.report as CoverageReportData | undefined;
  const bundleReport = currentResult?.steps.find(s => s.step === 8)?.report as ExportBundleReport | undefined;

  const hasEvidenceWarning = evidenceReport && evidenceReport.linkedToCaseAtoms === 0;

  return (
    <div className="h-full flex" data-testid="psur-workflow-page">
      <div className="w-72 border-r bg-background flex flex-col" data-testid="scope-panel">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Scope</h2>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select 
                value={templateId} 
                onValueChange={(v) => !scopeLocked && setTemplateId(v as any)}
                disabled={scopeLocked}
              >
                <SelectTrigger data-testid="select-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Jurisdictions</Label>
              <div className="flex flex-col gap-2">
                {JURISDICTION_OPTIONS.map(j => (
                  <label key={j.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox 
                      checked={selectedJurisdictions.includes(j.value as any)}
                      onCheckedChange={() => toggleJurisdiction(j.value as any)}
                      disabled={scopeLocked}
                      data-testid={`checkbox-jurisdiction-${j.value}`}
                    />
                    <span className="text-sm">{j.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Device</Label>
              <Select 
                value={selectedDeviceId} 
                onValueChange={v => !scopeLocked && setSelectedDeviceId(v)}
                disabled={scopeLocked}
              >
                <SelectTrigger data-testid="select-device">
                  <SelectValue placeholder="Select device" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map(d => (
                    <SelectItem key={d.id} value={d.id.toString()}>
                      <div>
                        <div className="font-medium">{d.deviceCode}</div>
                        <div className="text-xs text-muted-foreground">{d.deviceName}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input 
                  type="date" 
                  value={periodStart}
                  onChange={e => !scopeLocked && setPeriodStart(e.target.value)}
                  disabled={scopeLocked}
                  data-testid="input-period-start"
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input 
                  type="date" 
                  value={periodEnd}
                  onChange={e => !scopeLocked && setPeriodEnd(e.target.value)}
                  disabled={scopeLocked}
                  data-testid="input-period-end"
                />
              </div>
            </div>

            {!scopeLocked && (
              <Button 
                className="w-full"
                onClick={handleCreateCase}
                disabled={!selectedDeviceId || selectedJurisdictions.length === 0 || runWorkflowMutation.isPending}
                data-testid="button-create-case"
              >
                {runWorkflowMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  "Create Case"
                )}
              </Button>
            )}

            {scopeLocked && currentResult && (
              <Card className="bg-muted/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Case Locked</span>
                  </div>
                  <div className="text-xs space-y-1 font-mono">
                    <div>ID: {currentResult.case.psurCaseId}</div>
                    <div>Ref: {currentResult.case.psurRef}</div>
                    <div>v{currentResult.case.version}</div>
                  </div>
                </CardContent>
              </Card>
            )}

            {kernelStatus && (
              <Card className="bg-muted/30">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs">Kernel Status</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                    <div>EU Obs:</div><div>{kernelStatus.euObligations}</div>
                    <div>UK Obs:</div><div>{kernelStatus.ukObligations}</div>
                    <div>Constraints:</div><div>{kernelStatus.constraints}</div>
                    <div>Slots:</div><div>{currentResult?.kernelStatus?.templateSlots || 0}</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col" data-testid="workflow-panel">
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Workflow</h2>
          {scopeLocked && (
            <Button 
              onClick={handleRunFullWorkflow}
              disabled={runWorkflowMutation.isPending}
              data-testid="button-run-workflow"
            >
              {runWorkflowMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" /> Run Workflow</>
              )}
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-2" data-testid="workflow-steps">
            {(currentResult?.steps || []).map((step) => (
              <Card 
                key={step.step} 
                className={`transition-colors ${step.status === "BLOCKED" ? "border-amber-300 dark:border-amber-700" : ""}`}
                data-testid={`step-${step.step}`}
              >
                <CardHeader 
                  className="p-3 cursor-pointer hover-elevate"
                  onClick={() => toggleStepExpanded(step.step)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <StepIcon status={step.status} stepNum={step.step} />
                      <div>
                        <div className="font-medium text-sm">
                          Step {step.step}: {step.name}
                        </div>
                        {step.summary && Object.keys(step.summary).length > 0 && (
                          <div className="text-xs text-muted-foreground font-mono">
                            {Object.entries(step.summary).slice(0, 2).map(([k, v]) => (
                              <span key={k} className="mr-2">{k}: {String(v)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(step.status)} className="text-xs">
                        {step.status}
                      </Badge>
                      {expandedSteps.has(step.step) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>
                {expandedSteps.has(step.step) && (
                  <CardContent className="p-3 pt-0 border-t">
                    {step.error && (
                      <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-sm text-destructive mb-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{step.error}</span>
                      </div>
                    )}
                    {step.report && (
                      <pre className="text-xs font-mono bg-muted p-2 rounded overflow-auto max-h-48">
                        {JSON.stringify(step.report, null, 2)}
                      </pre>
                    )}
                    {!step.report && !step.error && (
                      <div className="text-sm text-muted-foreground">No report data available</div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}

            {!currentResult && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <div className="text-lg font-medium">No Active Workflow</div>
                <div className="text-sm">Create a case to begin the 8-step workflow</div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="w-80 border-l bg-background flex flex-col" data-testid="evidence-panel">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Evidence + Coverage</h2>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Evidence Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {evidenceReport ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Uploaded Atoms:</span>
                      <span className="font-mono">{evidenceReport.uploadedAtoms}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Linked to Case:</span>
                      <span className={`font-mono ${hasEvidenceWarning ? "text-red-600 font-bold" : ""}`}>
                        {evidenceReport.linkedToCaseAtoms}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Rejected Rows:</span>
                      <span className="font-mono">{evidenceReport.rejectedRows}</span>
                    </div>
                    
                    {hasEvidenceWarning && (
                      <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded text-xs">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span className="text-amber-800 dark:text-amber-200">
                          Evidence not attached to case. Upload evidence on the Evidence page with this case selected.
                        </span>
                      </div>
                    )}

                    {Object.keys(evidenceReport.byType || {}).length > 0 && (
                      <div className="pt-2 border-t">
                        <div className="text-xs font-medium mb-1">By Type:</div>
                        <div className="space-y-1">
                          {Object.entries(evidenceReport.byType).map(([type, count]) => (
                            <div key={type} className="flex justify-between text-xs">
                              <span className="font-mono">{type}</span>
                              <Badge variant="secondary" className="text-xs h-5">{count}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {evidenceReport.sampleErrors.length > 0 && (
                      <div className="pt-2 border-t">
                        <div className="text-xs font-medium mb-1 text-red-600">Sample Errors:</div>
                        <ul className="text-xs space-y-1 text-red-600">
                          {evidenceReport.sampleErrors.slice(0, 3).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Run workflow to see evidence status
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Coverage Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {coverageReport ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Obligations:</span>
                      <span className="font-mono">
                        {coverageReport.obligationsSatisfied}/{coverageReport.obligationsTotal}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Slots Filled:</span>
                      <span className="font-mono">
                        {coverageReport.slotsFilled}/{coverageReport.slotsTotal}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Coverage:</span>
                      <Badge variant={coverageReport.passed ? "default" : "destructive"}>
                        {coverageReport.coveragePercent}%
                      </Badge>
                    </div>
                    
                    {coverageReport.missingEvidenceTypes.length > 0 && (
                      <div className="pt-2 border-t">
                        <div className="text-xs font-medium mb-1 text-amber-600">Missing Evidence Types:</div>
                        <div className="flex flex-wrap gap-1">
                          {coverageReport.missingEvidenceTypes.map(t => (
                            <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Run workflow to see coverage
                  </div>
                )}
              </CardContent>
            </Card>

            {adjudicationReport && (
              <Card>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Adjudication
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Accepted:</span>
                      <Badge variant="default">{adjudicationReport.acceptedCount}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Rejected:</span>
                      <Badge variant="destructive">{adjudicationReport.rejectedCount}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {bundleReport && (
              <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-300">
                    <Download className="h-4 w-4" />
                    Audit Bundle Ready
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground mb-2">
                      {bundleReport.bundleFiles.length} files ready for download
                    </div>
                    <ul className="text-xs font-mono space-y-1">
                      {bundleReport.bundleFiles.map(f => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <Button 
                      className="w-full mt-2" 
                      size="sm"
                      data-testid="button-download-bundle"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Bundle
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
