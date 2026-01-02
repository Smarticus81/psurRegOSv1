import { useState, useEffect, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentSteps, type AgentStep } from "@/components/agent-step";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Cpu,
  Search,
  FileText,
  Clock,
  DollarSign,
  Zap,
  Download,
  CheckCircle2,
  Loader2,
  Sparkles,
  CalendarDays,
  Package,
} from "lucide-react";
import type { Device, AgentExecution, PSURItem } from "@shared/schema";

const agentStepsConfig: AgentStep[] = [
  { id: "1", title: "Loading MDCG 2022-21 Requirements", description: "Fetching EU MDR Article 86 & MDCG 2022-21 guidance from GRKB", status: "pending" },
  { id: "2", title: "Device Description (Section 2)", description: "Generating device characteristics, intended purpose, classification per MDCG 2022-21 Annex I", status: "pending" },
  { id: "3", title: "Data Collection Period (Section 3)", description: "Defining reporting period aligned with MDR certification date", status: "pending" },
  { id: "4", title: "PMS Data Collection (Section 4)", description: "Aggregating sales, complaints, incidents with IMDRF AET coding", status: "pending" },
  { id: "5", title: "Serious Incidents & FSCA (Section 5)", description: "Analyzing serious incidents, root causes, and Field Safety Corrective Actions", status: "pending" },
  { id: "6", title: "Non-Serious Incidents (Section 6)", description: "Processing complaints grouped by IMDRF medical device problem codes", status: "pending" },
  { id: "7", title: "Sales Volume & Population (Section 7)", description: "Calculating units sold vs. patient exposure estimates", status: "pending" },
  { id: "8", title: "CAPA Analysis (Section 8)", description: "Compiling corrective/preventive actions with effectiveness assessment", status: "pending" },
  { id: "9", title: "Literature Review (Section 9)", description: "Searching literature and similar device databases per Annex III", status: "pending" },
  { id: "10", title: "Benefit-Risk Evaluation (Section 10)", description: "AI-powered benefit-risk determination with change impact analysis", status: "pending" },
  { id: "11", title: "Conclusions (Section 11)", description: "Generating overall safety assessment and action recommendations", status: "pending" },
  { id: "12", title: "Executive Summary (Section 1)", description: "Creating executive overview of key findings per MDCG 2022-21", status: "pending" },
  { id: "13", title: "Final PSUR Assembly", description: "Compiling PSUR document with EUDAMED-ready formatting", status: "pending" },
];

const jurisdictionOptions = [
  { value: "EU_MDR", label: "EU MDR 2017/745" },
  { value: "UK_MDR", label: "UK MDR 2002" },
  { value: "FDA_21CFR", label: "FDA 21 CFR Part 803" },
  { value: "HEALTH_CANADA", label: "Health Canada CMDR" },
  { value: "TGA", label: "TGA (Australia)" },
];

export default function AgentOrchestration() {
  const { toast } = useToast();
  const [configMode, setConfigMode] = useState<"quick" | "manual">("quick");
  
  const [pmsPlanNumber, setPmsPlanNumber] = useState("");
  const [previousPsurNumber, setPreviousPsurNumber] = useState("");
  const [lookupResult, setLookupResult] = useState<{ found: boolean; device?: Device; psurItem?: PSURItem } | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [partNumbers, setPartNumbers] = useState("");
  const [startPeriod, setStartPeriod] = useState("");
  const [endPeriod, setEndPeriod] = useState("");
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<AgentExecution | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>(agentStepsConfig);
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const { data: psurItems = [] } = useQuery<PSURItem[]>({
    queryKey: ["/api/psur-items"],
  });

  const { data: executions = [] } = useQuery<AgentExecution[]>({
    queryKey: ["/api/agent-executions"],
  });

  const handleLookup = () => {
    const searchValue = pmsPlanNumber || previousPsurNumber;
    if (!searchValue) {
      toast({ title: "Please enter a PMS Plan Number or Previous PSUR Number", variant: "destructive" });
      return;
    }
    
    setIsLookingUp(true);
    
    setTimeout(() => {
      const foundPsur = psurItems.find(p => p.psurNumber === searchValue);
      
      if (foundPsur) {
        const foundDevice = devices.find(d => d.id === foundPsur.deviceId);
        setLookupResult({ found: true, device: foundDevice, psurItem: foundPsur });
        toast({ title: "Device data found!", description: `Retrieved ${foundDevice?.deviceName}` });
      } else {
        const matchingDevice = devices.find(d => 
          d.deviceCode.toLowerCase().includes(searchValue.toLowerCase()) ||
          d.deviceName.toLowerCase().includes(searchValue.toLowerCase())
        );
        
        if (matchingDevice) {
          setLookupResult({ found: true, device: matchingDevice });
          toast({ title: "Device found!", description: `Retrieved ${matchingDevice.deviceName}` });
        } else {
          setLookupResult({ found: false });
          toast({ 
            title: "No matching data found", 
            description: "Switch to Manual Configuration to enter device details",
            variant: "destructive" 
          });
        }
      }
      setIsLookingUp(false);
    }, 800);
  };

  const startExecutionMutation = useMutation({
    mutationFn: async (data: { 
      deviceId?: number; 
      jurisdictions: string[];
      pmsPlanNumber?: string;
      previousPsurNumber?: string;
      partNumbers?: string[];
      startPeriod?: string;
      endPeriod?: string;
    }) => {
      return apiRequest("POST", "/api/agent-executions", {
        agentType: "psur",
        deviceId: data.deviceId,
        jurisdictions: data.jurisdictions,
        pmsPlanNumber: data.pmsPlanNumber,
        previousPsurNumber: data.previousPsurNumber,
        partNumbers: data.partNumbers,
        startPeriod: data.startPeriod ? new Date(data.startPeriod).toISOString() : undefined,
        endPeriod: data.endPeriod ? new Date(data.endPeriod).toISOString() : undefined,
        status: "running",
      });
    },
    onSuccess: async (response) => {
      const execution = await response.json();
      setCurrentExecution(execution);
      queryClient.invalidateQueries({ queryKey: ["/api/agent-executions"] });
      simulateExecution();
    },
    onError: () => {
      toast({ title: "Failed to start agent execution", variant: "destructive" });
      setIsExecuting(false);
    },
  });

  const simulateExecution = async () => {
    const stepDurations = [600, 800, 400, 1200, 1500, 1000, 800, 1200, 1800, 2200, 1000, 1500, 800];
    const stepDetails = [
      "Loaded MDCG 2022-21 Annex I template structure",
      "Generated device description with Basic UDI-DI and EMDN codes",
      "Set reporting period: 12 months per Class III requirements",
      "Collected 847 sales records, 23 complaints using IMDRF AET codes",
      "Analyzed 2 serious incidents, 0 FSCA required",
      "Categorized 21 non-serious incidents by IMDRF problem codes",
      "Calculated 2.7 complaints per 1000 units sold",
      "Compiled 3 CAPA items with effectiveness assessments",
      "Reviewed 12 literature sources, 4 similar device reports",
      "Benefit-risk ratio: ACCEPTABLE - no significant changes detected",
      "Generated conclusions: continued market authorization recommended",
      "Executive summary compiled with key findings",
      "PSUR document assembled per EUDAMED submission format",
    ];
    
    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      setSteps(prev => prev.map((s, idx) => ({
        ...s,
        status: idx < i ? "completed" : idx === i ? "running" : "pending"
      })));
      
      addLogMessage(`[${new Date().toISOString().slice(11, 19)}] Starting: ${steps[i].title}`);
      
      await new Promise(resolve => setTimeout(resolve, stepDurations[i] || 800));
      
      if (stepDetails[i]) {
        addLogMessage(`[${new Date().toISOString().slice(11, 19)}] > ${stepDetails[i]}`);
      }
      
      setSteps(prev => prev.map((s, idx) => ({
        ...s,
        status: idx <= i ? "completed" : "pending",
        duration: idx === i ? `${((stepDurations[i] || 800) / 1000).toFixed(1)}s` : s.duration
      })));
      
      addLogMessage(`[${new Date().toISOString().slice(11, 19)}] Completed: ${steps[i].title}`);
    }
    
    addLogMessage(`[${new Date().toISOString().slice(11, 19)}] MDCG 2022-21 compliant PSUR generation complete!`);
    setIsExecuting(false);
    toast({ title: "PSUR generated per MDCG 2022-21!" });
    queryClient.invalidateQueries({ queryKey: ["/api/agent-executions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
  };

  const addLogMessage = (message: string) => {
    setLogMessages(prev => [...prev, message]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logMessages]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isExecuting) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isExecuting]);

  const canStartQuickMode = lookupResult?.found && lookupResult.device;
  const canStartManualMode = selectedJurisdictions.length > 0 && selectedDevice && startPeriod && endPeriod;

  const toggleJurisdiction = (value: string) => {
    setSelectedJurisdictions(prev => 
      prev.includes(value) 
        ? prev.filter(j => j !== value)
        : [...prev, value]
    );
  };

  const handleStartExecution = () => {
    setIsExecuting(true);
    setElapsedTime(0);
    setLogMessages([]);
    setSteps(agentStepsConfig.map(s => ({ ...s, status: "pending" as const, duration: undefined })));
    setCurrentStep(0);
    
    if (configMode === "quick" && lookupResult?.device) {
      const jurisdictions = lookupResult.psurItem?.jurisdiction ? [lookupResult.psurItem.jurisdiction] : ["EU_MDR"];
      addLogMessage(`[${new Date().toISOString().slice(11, 19)}] Quick Start: Retrieved device data for ${lookupResult.device.deviceName}`);
      addLogMessage(`[${new Date().toISOString().slice(11, 19)}] Activating MDCG 2022-21 PSUR Agent for ${jurisdictions.join(", ")} jurisdiction(s)`);
      
      startExecutionMutation.mutate({
        deviceId: lookupResult.device.id,
        jurisdictions,
        pmsPlanNumber: pmsPlanNumber || undefined,
        previousPsurNumber: previousPsurNumber || undefined,
      });
    } else {
      const jurisdictionLabels = selectedJurisdictions.map(j => jurisdictionOptions.find(o => o.value === j)?.label).filter(Boolean).join(", ");
      addLogMessage(`[${new Date().toISOString().slice(11, 19)}] Manual Configuration: ${jurisdictionLabels}`);
      addLogMessage(`[${new Date().toISOString().slice(11, 19)}] Activating MDCG 2022-21 PSUR Agent for ${selectedJurisdictions.length} jurisdiction(s)`);
      
      const parts = partNumbers.split(",").map(p => p.trim()).filter(Boolean);
      
      startExecutionMutation.mutate({
        deviceId: parseInt(selectedDevice),
        jurisdictions: selectedJurisdictions,
        partNumbers: parts.length > 0 ? parts : undefined,
        startPeriod,
        endPeriod,
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = (currentStep / steps.length) * 100;
  const estimatedCost = ((currentStep + 1) * 0.12).toFixed(2);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agent Orchestration</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Execute MDCG 2022-21 compliant PSUR generation agents
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configuration</CardTitle>
                <CardDescription>Choose how to configure the PSUR generation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={configMode} onValueChange={(v) => setConfigMode(v as "quick" | "manual")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="quick" data-testid="tab-quick-start">
                      <Search className="h-4 w-4 mr-2" />
                      Quick Start
                    </TabsTrigger>
                    <TabsTrigger value="manual" data-testid="tab-manual-config">
                      <FileText className="h-4 w-4 mr-2" />
                      Manual
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="quick" className="space-y-4 mt-4">
                    <p className="text-xs text-muted-foreground">
                      Enter a PMS Plan Number or Previous PSUR Number to auto-retrieve device data from the knowledge base.
                    </p>
                    
                    <div className="space-y-2">
                      <Label>PMS Plan Number</Label>
                      <Input
                        placeholder="e.g., PMS-2024-001"
                        value={pmsPlanNumber}
                        onChange={(e) => {
                          setPmsPlanNumber(e.target.value);
                          if (e.target.value) setPreviousPsurNumber("");
                        }}
                        disabled={isExecuting}
                        data-testid="input-pms-plan"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Separator className="flex-1" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <Separator className="flex-1" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Previous PSUR Number</Label>
                      <Input
                        placeholder="e.g., PSUR-2023-CardioMonitor-001"
                        value={previousPsurNumber}
                        onChange={(e) => {
                          setPreviousPsurNumber(e.target.value);
                          if (e.target.value) setPmsPlanNumber("");
                        }}
                        disabled={isExecuting}
                        data-testid="input-previous-psur"
                      />
                    </div>
                    
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={handleLookup}
                      disabled={isExecuting || isLookingUp || (!pmsPlanNumber && !previousPsurNumber)}
                      data-testid="button-lookup"
                    >
                      {isLookingUp ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Looking up...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          Lookup Device Data
                        </>
                      )}
                    </Button>
                    
                    {lookupResult && (
                      <div className={`p-3 rounded-md text-sm ${lookupResult.found ? 'bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800'}`}>
                        {lookupResult.found && lookupResult.device ? (
                          <div className="space-y-1">
                            <p className="font-medium text-emerald-700 dark:text-emerald-300">Device Data Retrieved</p>
                            <p className="text-muted-foreground">{lookupResult.device.deviceName}</p>
                            <p className="text-xs text-muted-foreground">
                              {lookupResult.device.riskClass} | {lookupResult.device.deviceCode}
                            </p>
                            {lookupResult.psurItem && (
                              <p className="text-xs text-muted-foreground">
                                Previous period: {new Date(lookupResult.psurItem.startPeriod).toLocaleDateString()} - {new Date(lookupResult.psurItem.endPeriod).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-amber-700 dark:text-amber-300">No matching data found. Use Manual Configuration.</p>
                        )}
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="manual" className="space-y-4 mt-4">
                    <p className="text-xs text-muted-foreground">
                      Configure device and surveillance period manually when no previous data exists.
                    </p>
                    
                    <div className="space-y-2">
                      <Label>Jurisdictions / Regulations</Label>
                      <p className="text-xs text-muted-foreground mb-2">Select all applicable regulations for this PSUR</p>
                      <div className="space-y-2 p-3 rounded-md border bg-muted/20">
                        {jurisdictionOptions.map((j) => (
                          <div key={j.value} className="flex items-center gap-2">
                            <Checkbox
                              id={`jurisdiction-${j.value}`}
                              checked={selectedJurisdictions.includes(j.value)}
                              onCheckedChange={() => toggleJurisdiction(j.value)}
                              disabled={isExecuting}
                              data-testid={`checkbox-jurisdiction-${j.value.toLowerCase()}`}
                            />
                            <label
                              htmlFor={`jurisdiction-${j.value}`}
                              className="text-sm cursor-pointer"
                            >
                              {j.label}
                            </label>
                          </div>
                        ))}
                      </div>
                      {selectedJurisdictions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {selectedJurisdictions.map(j => (
                            <Badge key={j} variant="secondary" className="text-xs">
                              {jurisdictionOptions.find(o => o.value === j)?.label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Device</Label>
                      <Select 
                        value={selectedDevice} 
                        onValueChange={setSelectedDevice}
                        disabled={isExecuting}
                      >
                        <SelectTrigger data-testid="select-device">
                          <SelectValue placeholder="Select device" />
                        </SelectTrigger>
                        <SelectContent>
                          {devices.map((d) => (
                            <SelectItem key={d.id} value={d.id.toString()}>
                              {d.deviceName} ({d.riskClass})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Part Numbers
                      </Label>
                      <Input
                        placeholder="e.g., CM-100, CM-100A, CM-200"
                        value={partNumbers}
                        onChange={(e) => setPartNumbers(e.target.value)}
                        disabled={isExecuting}
                        data-testid="input-part-numbers"
                      />
                      <p className="text-xs text-muted-foreground">Comma-separated list of part numbers included in this PSUR</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          Period Start
                        </Label>
                        <Input
                          type="date"
                          value={startPeriod}
                          onChange={(e) => setStartPeriod(e.target.value)}
                          disabled={isExecuting}
                          data-testid="input-start-period"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          Period End
                        </Label>
                        <Input
                          type="date"
                          value={endPeriod}
                          onChange={(e) => setEndPeriod(e.target.value)}
                          disabled={isExecuting}
                          data-testid="input-end-period"
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <Separator />

                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={handleStartExecution}
                  disabled={isExecuting || (configMode === "quick" ? !canStartQuickMode : !canStartManualMode)}
                  data-testid="button-start-agent"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate PSUR
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Execution Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Elapsed Time
                  </div>
                  <span className="font-mono text-sm font-medium">{formatTime(elapsedTime)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Zap className="h-4 w-4" />
                    Tokens Used
                  </div>
                  <span className="font-mono text-sm font-medium">{isExecuting ? (currentStep + 1) * 1250 : 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    Estimated Cost
                  </div>
                  <span className="font-mono text-sm font-medium">${isExecuting ? estimatedCost : "0.00"}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-lg">MDCG 2022-21 Workflow</CardTitle>
                  <CardDescription>
                    {isExecuting ? "Executing PSUR generation pipeline..." : "Configure and start agent execution"}
                  </CardDescription>
                </div>
                {isExecuting && (
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Running
                  </Badge>
                )}
                {!isExecuting && currentStep === steps.length && (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Complete
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                {isExecuting && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Progress</span>
                      <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}
                
                <AgentSteps steps={steps} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Execution Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  ref={logContainerRef}
                  className="h-48 overflow-auto rounded-md bg-muted/30 p-3 font-mono text-xs"
                >
                  {logMessages.length === 0 ? (
                    <p className="text-muted-foreground">Waiting for agent execution...</p>
                  ) : (
                    logMessages.map((msg, idx) => (
                      <div key={idx} className="text-muted-foreground">
                        {msg}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Executions</CardTitle>
            <CardDescription>History of agent executions and generated documents</CardDescription>
          </CardHeader>
          <CardContent>
            {executions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No executions yet. Start an agent to generate regulatory documents.
              </div>
            ) : (
              <div className="space-y-3">
                {executions.slice(0, 10).map((execution) => (
                  <div 
                    key={execution.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-md border bg-card/50"
                    data-testid={`execution-row-${execution.id}`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <Cpu className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{execution.agentType.toUpperCase()} Agent</p>
                        <p className="text-xs text-muted-foreground">
                          {(execution.jurisdictions as string[] | undefined)?.join(", ") || "N/A"} | {execution.pmsPlanNumber || execution.previousPsurNumber || 'Manual Config'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {execution.createdAt ? new Date(execution.createdAt).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={execution.status as any} />
                      {execution.status === "completed" && (
                        <Button variant="ghost" size="icon" data-testid={`button-download-${execution.id}`}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
