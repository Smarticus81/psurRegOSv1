import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { AgentSteps, type AgentStep } from "@/components/agent-step";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Cpu,
  Play,
  Square,
  RefreshCw,
  FileText,
  Clock,
  DollarSign,
  Zap,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { Company, Device, AgentExecution } from "@shared/schema";

const agentStepsConfig: AgentStep[] = [
  { id: "1", title: "Querying Regulatory Requirements", description: "Fetching EU MDR Article 86 requirements from GRKB", status: "pending" },
  { id: "2", title: "Collecting Sales Data", description: "Aggregating distribution records by region", status: "pending" },
  { id: "3", title: "Collecting Complaint Data", description: "Processing complaint records and categorization", status: "pending" },
  { id: "4", title: "Calculating Complaint Rates", description: "Statistical analysis per 100 units distributed", status: "pending" },
  { id: "5", title: "Performing Trend Analysis", description: "SPC control limits and trend detection", status: "pending" },
  { id: "6", title: "Generating Analysis Narrative", description: "AI-powered regulatory analysis and conclusions", status: "pending" },
  { id: "7", title: "Generating PSUR Document", description: "Creating DOCX with all required sections", status: "pending" },
  { id: "8", title: "Creating Review Package", description: "Audit trail and review checklist", status: "pending" },
];

export default function AgentOrchestration() {
  const { toast } = useToast();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>("EU");
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<AgentExecution | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>(agentStepsConfig);
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const { data: executions = [] } = useQuery<AgentExecution[]>({
    queryKey: ["/api/agent-executions"],
  });

  const companyDevices = devices.filter(d => d.companyId === parseInt(selectedCompany));

  const startExecutionMutation = useMutation({
    mutationFn: async (data: { deviceId: number; jurisdiction: string }) => {
      return apiRequest("POST", "/api/agent-executions", {
        agentType: "psur",
        deviceId: data.deviceId,
        jurisdiction: data.jurisdiction,
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
    const stepDurations = [800, 1200, 1000, 600, 1500, 2000, 1800, 500];
    
    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      setSteps(prev => prev.map((s, idx) => ({
        ...s,
        status: idx < i ? "completed" : idx === i ? "running" : "pending"
      })));
      
      addLogMessage(`[${new Date().toISOString().slice(11, 19)}] Starting: ${steps[i].title}`);
      
      await new Promise(resolve => setTimeout(resolve, stepDurations[i]));
      
      setSteps(prev => prev.map((s, idx) => ({
        ...s,
        status: idx <= i ? "completed" : "pending",
        duration: idx === i ? `${(stepDurations[i] / 1000).toFixed(1)}s` : s.duration
      })));
      
      addLogMessage(`[${new Date().toISOString().slice(11, 19)}] Completed: ${steps[i].title}`);
    }
    
    addLogMessage(`[${new Date().toISOString().slice(11, 19)}] PSUR generation complete!`);
    setIsExecuting(false);
    toast({ title: "PSUR generated successfully!" });
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

  const handleStartExecution = () => {
    if (!selectedDevice) {
      toast({ title: "Please select a device", variant: "destructive" });
      return;
    }
    
    setIsExecuting(true);
    setElapsedTime(0);
    setLogMessages([]);
    setSteps(agentStepsConfig.map(s => ({ ...s, status: "pending" as const, duration: undefined })));
    setCurrentStep(0);
    
    addLogMessage(`[${new Date().toISOString().slice(11, 19)}] Activating PSUR Agent for ${selectedJurisdiction}`);
    
    startExecutionMutation.mutate({
      deviceId: parseInt(selectedDevice),
      jurisdiction: selectedJurisdiction,
    });
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
              Execute AI agents for regulatory document generation
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configuration</CardTitle>
                <CardDescription>Select device and jurisdiction for PSUR generation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Select 
                    value={selectedCompany} 
                    onValueChange={(v) => {
                      setSelectedCompany(v);
                      setSelectedDevice("");
                    }}
                    disabled={isExecuting}
                  >
                    <SelectTrigger data-testid="select-company">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Device</Label>
                  <Select 
                    value={selectedDevice} 
                    onValueChange={setSelectedDevice}
                    disabled={!selectedCompany || isExecuting}
                  >
                    <SelectTrigger data-testid="select-device">
                      <SelectValue placeholder="Select device" />
                    </SelectTrigger>
                    <SelectContent>
                      {companyDevices.map((d) => (
                        <SelectItem key={d.id} value={d.id.toString()}>
                          {d.deviceName} ({d.riskClass})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Jurisdiction</Label>
                  <Select 
                    value={selectedJurisdiction} 
                    onValueChange={setSelectedJurisdiction}
                    disabled={isExecuting}
                  >
                    <SelectTrigger data-testid="select-jurisdiction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EU">EU MDR</SelectItem>
                      <SelectItem value="UK">UK MDR</SelectItem>
                      <SelectItem value="US">FDA</SelectItem>
                      <SelectItem value="Canada">Health Canada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={handleStartExecution}
                  disabled={isExecuting || !selectedDevice}
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
                  <CardTitle className="text-lg">Agent Workflow</CardTitle>
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
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <Cpu className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{execution.agentType.toUpperCase()} Agent</p>
                        <p className="text-xs text-muted-foreground">
                          {execution.jurisdiction} • {execution.createdAt ? new Date(execution.createdAt).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={execution.status as any} />
                      {execution.status === "completed" && (
                        <Button variant="ghost" size="icon">
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
