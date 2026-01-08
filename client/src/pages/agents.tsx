import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Search,
  FileText,
  Download,
  CheckCircle2,
  Loader2,
  Play,
  Eye,
  Copy,
  ChevronRight,
  ChevronLeft,
  Settings2,
  X,
  ClipboardList,
  Stethoscope,
  Calendar,
  Database,
  AlertTriangle,
  ShieldQuestion,
  BarChart3,
  Wrench,
  BookOpenCheck,
  ActivitySquare,
  ScrollText,
  ClipboardCheck,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { Device, AgentExecution, PSURItem } from "@shared/schema";

interface GeneratedPSUR {
  title: string;
  deviceName: string;
  deviceCode: string;
  jurisdiction: string;
  reportingPeriod: string;
  generatedAt: string;
  sections: { name: string; content: string }[];
}

const stepLabels = [
  "Requirements", "Device", "Period", "PMS Data", "Incidents", 
  "Non-Serious", "Sales", "CAPA", "Literature", "Risk", 
  "Conclusions", "Summary", "Assembly"
];

const stepIcons = [
  ClipboardList,
  Stethoscope,
  Calendar,
  Database,
  AlertTriangle,
  ShieldQuestion,
  BarChart3,
  Wrench,
  BookOpenCheck,
  ActivitySquare,
  ScrollText,
  ClipboardCheck,
  Layers,
];

const jurisdictionOptions = [
  { value: "EU_MDR", label: "EU MDR" },
  { value: "UK_MDR", label: "UK MDR" },
  { value: "FDA_21CFR", label: "FDA" },
  { value: "HEALTH_CANADA", label: "Canada" },
  { value: "TGA", label: "TGA" },
];

export default function AgentOrchestration() {
  const { toast } = useToast();
  const [configMode, setConfigMode] = useState<"quick" | "manual">("manual");
  const [configOpen, setConfigOpen] = useState(true);
  
  const [pmsPlanNumber, setPmsPlanNumber] = useState("");
  const [previousPsurNumber, setPreviousPsurNumber] = useState("");
  const [lookupResult, setLookupResult] = useState<{ found: boolean; device?: Device; psurItem?: PSURItem } | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>(["EU_MDR"]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [startPeriod, setStartPeriod] = useState("2025-01-01");
  const [endPeriod, setEndPeriod] = useState("2025-12-31");
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [generatedPSUR, setGeneratedPSUR] = useState<GeneratedPSUR | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewSection, setPreviewSection] = useState<number>(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: psurItems = [] } = useQuery<PSURItem[]>({ queryKey: ["/api/psur-items"] });

  const handleLookup = () => {
    const searchValue = pmsPlanNumber || previousPsurNumber;
    if (!searchValue) return;
    
    setIsLookingUp(true);
    setTimeout(() => {
      const foundPsur = psurItems.find(p => p.psurNumber === searchValue);
      if (foundPsur) {
        const foundDevice = devices.find(d => d.id === foundPsur.deviceId);
        setLookupResult({ found: true, device: foundDevice, psurItem: foundPsur });
        toast({ title: "Device found" });
      } else {
        const matchingDevice = devices.find(d => 
          d.deviceCode.toLowerCase().includes(searchValue.toLowerCase()) ||
          d.deviceName.toLowerCase().includes(searchValue.toLowerCase())
        );
        if (matchingDevice) {
          setLookupResult({ found: true, device: matchingDevice });
          toast({ title: "Device found" });
        } else {
          setLookupResult({ found: false });
          toast({ title: "No match found", variant: "destructive" });
        }
      }
      setIsLookingUp(false);
    }, 500);
  };

  const startExecutionMutation = useMutation({
    mutationFn: async (data: { 
      deviceId?: number; 
      jurisdictions: string[];
      pmsPlanNumber?: string;
      previousPsurNumber?: string;
      startPeriod?: string;
      endPeriod?: string;
    }) => {
      return apiRequest("POST", "/api/agent-executions", {
        agentType: "psur",
        deviceId: data.deviceId,
        jurisdictions: data.jurisdictions,
        pmsPlanNumber: data.pmsPlanNumber,
        previousPsurNumber: data.previousPsurNumber,
        startPeriod: data.startPeriod ? new Date(data.startPeriod).toISOString() : undefined,
        endPeriod: data.endPeriod ? new Date(data.endPeriod).toISOString() : undefined,
        status: "running",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-executions"] });
      simulateExecution();
    },
    onError: () => {
      toast({ title: "Failed to start", variant: "destructive" });
      setIsExecuting(false);
    },
  });

  const simulateExecution = async () => {
    const stepDurations = [400, 500, 300, 800, 1000, 700, 500, 800, 1200, 1500, 700, 1000, 500];
    const stepDetails = [
      "Loaded MDCG 2022-21 template",
      "Generated device description",
      "Set 12-month reporting period",
      "Collected 847 sales, 23 complaints",
      "Analyzed 2 serious incidents",
      "Categorized 21 non-serious",
      "Calculated 2.7 per 1000 rate",
      "Compiled 3 CAPA items",
      "Reviewed 12 literature sources",
      "Benefit-risk: ACCEPTABLE",
      "Authorization recommended",
      "Executive summary complete",
      "PSUR assembled",
    ];
    
    for (let i = 0; i < 13; i++) {
      setCurrentStep(i);
      addLogMessage(`${stepLabels[i]}: ${stepDetails[i]}`);
      await new Promise(resolve => setTimeout(resolve, stepDurations[i]));
      setCompletedSteps(prev => [...prev, i]);
    }
    
    const deviceName = configMode === "quick" && lookupResult?.device 
      ? lookupResult.device.deviceName 
      : devices.find(d => d.id === parseInt(selectedDevice))?.deviceName || "Medical Device";
    const deviceCode = configMode === "quick" && lookupResult?.device 
      ? lookupResult.device.deviceCode 
      : devices.find(d => d.id === parseInt(selectedDevice))?.deviceCode || "DEV-001";
    
    setGeneratedPSUR({
      title: `PSUR - ${deviceName}`,
      deviceName,
      deviceCode,
      jurisdiction: selectedJurisdictions.map(j => jurisdictionOptions.find(o => o.value === j)?.label || j).join(", "),
      reportingPeriod: `${new Date(startPeriod).toLocaleDateString()} - ${new Date(endPeriod).toLocaleDateString()}`,
      generatedAt: new Date().toISOString(),
      sections: [
        { name: "1. Executive Summary", content: `This PSUR covers post-market surveillance data for ${deviceName} (${deviceCode}). The device maintains an acceptable benefit-risk profile with no new safety signals identified.` },
        { name: "2. Device Description", content: `${deviceName} is a Class III medical device classified according to Annex VIII of MDR 2017/745.` },
        { name: "3. Reporting Period", content: `This PSUR covers ${startPeriod} to ${endPeriod}, aligned with MDR Article 86 requirements.` },
        { name: "4. PMS Data Collection", content: `847 units distributed. 23 complaints received (2.7% rate) classified using IMDRF AET codes.` },
        { name: "5. Serious Incidents", content: `Two serious incidents reported. Root cause: user error. No FSCA required.` },
        { name: "6. Non-Serious Incidents", content: `21 non-serious incidents: malfunction (9), use errors (7), other (5).` },
        { name: "7. Sales & Exposure", content: `Units sold: 847. Patient exposure: 2,541 procedures. Rate: 2.7 per 1000.` },
        { name: "8. CAPA Analysis", content: `3 CAPAs initiated. 2 completed (labeling), 1 ongoing (packaging).` },
        { name: "9. Literature Review", content: `12 publications reviewed per MDCG 2020-13. No new safety signals.` },
        { name: "10. Benefit-Risk", content: `Determination: ACCEPTABLE. Clinical benefits outweigh residual risks.` },
        { name: "11. Conclusions", content: `Device maintains acceptable safety profile. Continued authorization recommended.` },
        { name: "12. Actions Planned", content: `Continue PMS activities. Complete packaging CAPA Q2 2026.` },
        { name: "13. Appendices", content: `A: Complaint Trends\nB: Incident Summary\nC: Literature Strategy\nD: CAPA Register` },
      ],
    });
    
    setCurrentStep(-1);
    setIsExecuting(false);
    addLogMessage("PSUR generation complete");
    toast({ title: "PSUR Ready" });
    queryClient.invalidateQueries({ queryKey: ["/api/agent-executions"] });
  };

  const addLogMessage = (message: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogMessages(prev => [...prev, `${time} ${message}`]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logMessages]);

  const canStart = configMode === "quick" 
    ? lookupResult?.found && lookupResult.device
    : selectedJurisdictions.length > 0 && selectedDevice;

  const handleStart = () => {
    setIsExecuting(true);
    setLogMessages([]);
    setCompletedSteps([]);
    setCurrentStep(0);
    setGeneratedPSUR(null);
    setConfigOpen(false);
    
    addLogMessage("Initializing PSUR Agent...");
    
    if (configMode === "quick" && lookupResult?.device) {
      startExecutionMutation.mutate({
        deviceId: lookupResult.device.id,
        jurisdictions: selectedJurisdictions,
        pmsPlanNumber: pmsPlanNumber || undefined,
        previousPsurNumber: previousPsurNumber || undefined,
        startPeriod,
        endPeriod,
      });
    } else {
      startExecutionMutation.mutate({
        deviceId: parseInt(selectedDevice),
        jurisdictions: selectedJurisdictions,
        startPeriod,
        endPeriod,
      });
    }
  };

  const toggleJurisdiction = (value: string) => {
    setSelectedJurisdictions(prev => 
      prev.includes(value) ? prev.filter(j => j !== value) : [...prev, value]
    );
  };

  const downloadPSUR = () => {
    if (!generatedPSUR) return;
    const content = generatedPSUR.sections.map(s => `${s.name}\n${s.content}`).join('\n\n');
    const doc = `PERIODIC SAFETY UPDATE REPORT\n\nDevice: ${generatedPSUR.deviceName}\nCode: ${generatedPSUR.deviceCode}\nPeriod: ${generatedPSUR.reportingPeriod}\n\n${content}`;
    const blob = new Blob([doc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PSUR_${generatedPSUR.deviceCode}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded" });
  };

  return (
    <div className="flex h-full">
      {/* Left Config Panel */}
      <div className={`shrink-0 border-r bg-muted/20 transition-all duration-300 ease-out ${configOpen ? 'w-80' : 'w-12'}`}>
        <div className="h-full flex flex-col">
          <div className="p-3 border-b flex items-center justify-between gap-2">
            {configOpen && <span className="text-sm font-medium">Configure</span>}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setConfigOpen(!configOpen)}
              className="shrink-0"
            >
              {configOpen ? <ChevronLeft className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
            </Button>
          </div>
          
          {configOpen && (
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-6">
                {/* Mode Toggle */}
                <div className="flex rounded-lg bg-muted p-1">
                  <button
                    onClick={() => setConfigMode("quick")}
                    className={`flex-1 text-xs py-2 px-3 rounded-md transition-all ${configMode === "quick" ? 'bg-background shadow-sm' : ''}`}
                    data-testid="tab-quick-start"
                  >
                    Quick Start
                  </button>
                  <button
                    onClick={() => setConfigMode("manual")}
                    className={`flex-1 text-xs py-2 px-3 rounded-md transition-all ${configMode === "manual" ? 'bg-background shadow-sm' : ''}`}
                    data-testid="tab-manual-config"
                  >
                    Manual
                  </button>
                </div>

                {configMode === "quick" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">PMS Plan Number</Label>
                      <Input
                        placeholder="e.g., PMS-2024-001"
                        value={pmsPlanNumber}
                        onChange={(e) => {
                          setPmsPlanNumber(e.target.value);
                          if (e.target.value) setPreviousPsurNumber("");
                        }}
                        className="text-sm"
                        disabled={isExecuting}
                        data-testid="input-pms-plan"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Separator className="flex-1" />
                      <span className="text-[10px] text-muted-foreground">or</span>
                      <Separator className="flex-1" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Previous PSUR Number</Label>
                      <Input
                        placeholder="e.g., PSUR-2023-001"
                        value={previousPsurNumber}
                        onChange={(e) => {
                          setPreviousPsurNumber(e.target.value);
                          if (e.target.value) setPmsPlanNumber("");
                        }}
                        className="text-sm"
                        disabled={isExecuting}
                        data-testid="input-previous-psur"
                      />
                    </div>
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="w-full"
                      onClick={handleLookup}
                      disabled={isExecuting || isLookingUp || (!pmsPlanNumber && !previousPsurNumber)}
                      data-testid="button-lookup"
                    >
                      {isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Lookup
                    </Button>
                    
                    {lookupResult?.found && lookupResult.device && (
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-sm" data-testid="lookup-result">
                        <p className="font-medium">{lookupResult.device.deviceName}</p>
                        <p className="text-xs text-muted-foreground">{lookupResult.device.deviceCode}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Device</Label>
                      <Select value={selectedDevice} onValueChange={setSelectedDevice} disabled={isExecuting}>
                        <SelectTrigger className="text-sm" data-testid="select-device">
                          <SelectValue placeholder="Select device" />
                        </SelectTrigger>
                        <SelectContent>
                          {devices.map((d) => (
                            <SelectItem key={d.id} value={d.id.toString()}>{d.deviceName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Jurisdictions</Label>
                  <div className="flex flex-wrap gap-2">
                    {jurisdictionOptions.map((j) => (
                      <button
                        key={j.value}
                        onClick={() => !isExecuting && toggleJurisdiction(j.value)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                          selectedJurisdictions.includes(j.value) 
                            ? 'bg-primary text-primary-foreground border-primary' 
                            : 'hover-elevate'
                        }`}
                        disabled={isExecuting}
                        data-testid={`checkbox-jurisdiction-${j.value.toLowerCase()}`}
                      >
                        {j.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Reporting Period</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={startPeriod}
                      onChange={(e) => setStartPeriod(e.target.value)}
                      className="text-sm"
                      data-testid="input-start-period"
                      disabled={isExecuting}
                    />
                    <Input
                      type="date"
                      value={endPeriod}
                      onChange={(e) => setEndPeriod(e.target.value)}
                      className="text-sm"
                      disabled={isExecuting}
                      data-testid="input-end-period"
                    />
                  </div>
                </div>

                <Separator />

                <Button 
                  className="w-full" 
                  onClick={handleStart}
                  disabled={isExecuting || !canStart}
                  data-testid="button-start-agent"
                >
                  {isExecuting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Generate PSUR
                    </>
                  )}
                </Button>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Horizontal Step Timeline */}
        <div className="shrink-0 border-b bg-background/80 backdrop-blur-sm">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-lg font-semibold">PSUR Generation</h1>
              {isExecuting && (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Processing
                </Badge>
              )}
              {!isExecuting && completedSteps.length === 13 && (
                <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Complete
                </Badge>
              )}
            </div>
            
            {/* Horizontal Steps - Zen Serpentine Flow */}
            <div className="space-y-4">
              {/* Row 1: Steps 1-7 (left to right) */}
              <div className="flex items-center">
                {stepLabels.slice(0, 7).map((label, idx) => {
                  const isCompleted = completedSteps.includes(idx);
                  const isActive = currentStep === idx;
                  const Icon = stepIcons[idx];
                  return (
                    <div key={idx} className="flex items-center flex-1">
                      <div 
                        className="zen-step-node flex-1"
                        data-testid={`step-${idx + 1}`}
                      >
                        <div 
                          className={`zen-step-icon ${isActive ? 'active animate-zen-pulse-glow' : isCompleted ? 'completed' : 'pending'}`}
                          aria-label={label}
                        >
                          {isActive ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : isCompleted ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <Icon className="h-5 w-5" />
                          )}
                        </div>
                        <p className={`text-[10px] text-center mt-2 font-medium transition-colors ${
                          isActive ? 'text-primary' : isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/70'
                        }`}>
                          {label}
                        </p>
                      </div>
                      {idx < 6 && (
                        <div className="flex items-center justify-center w-6 -mt-5">
                          <svg width="24" height="16" viewBox="0 0 24 16" className="overflow-visible">
                            <path 
                              d="M0 8 L20 8" 
                              className={`zen-connector ${isCompleted ? 'completed' : currentStep > idx ? 'active' : ''}`}
                              strokeLinecap="round"
                            />
                            <path 
                              d="M16 4 L22 8 L16 12" 
                              className={`zen-connector ${isCompleted ? 'completed' : currentStep > idx ? 'active' : ''}`}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Serpentine Turn Connector */}
              <div className="flex justify-end pr-8">
                <svg width="40" height="32" viewBox="0 0 40 32" className="overflow-visible">
                  <path 
                    d="M20 0 C20 16, 20 16, 20 32" 
                    className={`zen-connector ${completedSteps.includes(6) ? 'completed' : currentStep === 6 ? 'active' : ''}`}
                    strokeLinecap="round"
                  />
                  <path 
                    d="M16 26 L20 32 L24 26" 
                    className={`zen-connector ${completedSteps.includes(6) ? 'completed' : currentStep === 6 ? 'active' : ''}`}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </div>
              
              {/* Row 2: Steps 8-13 (right to left) */}
              <div className="flex items-center flex-row-reverse">
                {stepLabels.slice(7).map((label, i) => {
                  const idx = i + 7;
                  const isCompleted = completedSteps.includes(idx);
                  const isActive = currentStep === idx;
                  const Icon = stepIcons[idx];
                  return (
                    <div key={idx} className="flex items-center flex-1 flex-row-reverse">
                      <div 
                        className="zen-step-node flex-1"
                        data-testid={`step-${idx + 1}`}
                      >
                        <div 
                          className={`zen-step-icon ${isActive ? 'active animate-zen-pulse-glow' : isCompleted ? 'completed' : 'pending'}`}
                          aria-label={label}
                        >
                          {isActive ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : isCompleted ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <Icon className="h-5 w-5" />
                          )}
                        </div>
                        <p className={`text-[10px] text-center mt-2 font-medium transition-colors ${
                          isActive ? 'text-primary' : isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/70'
                        }`}>
                          {label}
                        </p>
                      </div>
                      {i < 5 && (
                        <div className="flex items-center justify-center w-6 -mt-5">
                          <svg width="24" height="16" viewBox="0 0 24 16" className="overflow-visible rotate-180">
                            <path 
                              d="M0 8 L20 8" 
                              className={`zen-connector ${completedSteps.includes(idx) ? 'completed' : currentStep > idx ? 'active' : ''}`}
                              strokeLinecap="round"
                            />
                            <path 
                              d="M16 4 L22 8 L16 12" 
                              className={`zen-connector ${completedSteps.includes(idx) ? 'completed' : currentStep > idx ? 'active' : ''}`}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Log & Output Split View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Execution Log */}
          <div className="flex-1 flex flex-col border-r min-w-0">
            <div className="p-3 border-b">
              <span className="text-xs font-medium text-muted-foreground">Execution Log</span>
            </div>
            <ScrollArea className="flex-1">
              <div ref={logContainerRef} className="p-3 font-mono text-xs space-y-1">
                {logMessages.length === 0 ? (
                  <p className="text-muted-foreground/50">Waiting for execution...</p>
                ) : (
                  logMessages.map((msg, idx) => (
                    <div key={idx} className="text-muted-foreground leading-relaxed">
                      <span className="text-muted-foreground/50">{msg.slice(0, 8)}</span>
                      <span className="ml-2">{msg.slice(9)}</span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Generated Output */}
          <div className="w-80 shrink-0 flex flex-col bg-muted/10">
            <div className="p-3 border-b">
              <span className="text-xs font-medium text-muted-foreground">Output</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3">
                {!generatedPSUR && !isExecuting && (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-xs text-muted-foreground/50 text-center">
                      Generated PSUR will appear here
                    </p>
                  </div>
                )}
                
                {isExecuting && !generatedPSUR && (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-20 bg-muted rounded" />
                  </div>
                )}

                {generatedPSUR && (
                  <div className="space-y-4">
                    <div>
                      <p className="font-medium text-sm">{generatedPSUR.deviceName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{generatedPSUR.deviceCode}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground/70">Jurisdiction</p>
                        <p>{generatedPSUR.jurisdiction}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground/70">Period</p>
                        <p>{generatedPSUR.reportingPeriod}</p>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground/70">Sections</p>
                      <div className="grid grid-cols-2 gap-1">
                        {generatedPSUR.sections.map((section, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setPreviewSection(idx);
                              setIsPreviewOpen(true);
                            }}
                            className="text-[10px] px-2 py-1.5 rounded-md bg-muted/50 hover-elevate text-left truncate"
                            data-testid={`button-section-${idx}`}
                          >
                            {section.name.split('. ')[1] || section.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => {
                          setPreviewSection(0);
                          setIsPreviewOpen(true);
                        }}
                        data-testid="button-preview-psur"
                      >
                        <Eye className="h-3 w-3" />
                        Preview
                      </Button>
                      <Button 
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={downloadPSUR}
                        data-testid="button-download-psur"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              {generatedPSUR?.title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {generatedPSUR?.jurisdiction} | {generatedPSUR?.reportingPeriod}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-4 h-[55vh]">
            <div className="w-40 shrink-0 border-r pr-3">
              <ScrollArea className="h-full">
                <div className="space-y-0.5">
                  {generatedPSUR?.sections.map((section, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPreviewSection(idx)}
                      className={`w-full text-left text-[11px] px-2 py-1.5 rounded-md transition-all ${
                        previewSection === idx 
                          ? 'bg-primary text-primary-foreground' 
                          : 'hover-elevate text-muted-foreground'
                      }`}
                    >
                      {section.name.split('. ')[1] || section.name}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="pr-4">
                  <h3 className="font-medium mb-3">
                    {generatedPSUR?.sections[previewSection]?.name}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {generatedPSUR?.sections[previewSection]?.content}
                  </p>
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="flex justify-between pt-3 border-t">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={previewSection === 0} onClick={() => setPreviewSection(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled={previewSection === 12} onClick={() => setPreviewSection(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(generatedPSUR?.sections[previewSection]?.content || '');
                  toast({ title: "Copied" });
                }}
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
              <Button size="sm" onClick={downloadPSUR}>
                <Download className="h-3 w-3" />
                Download
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
