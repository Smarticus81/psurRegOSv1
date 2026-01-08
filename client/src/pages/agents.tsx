import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  FileText,
  Download,
  CheckCircle2,
  Loader2,
  Play,
  Eye,
  ChevronRight,
  Search,
  GitBranch,
  MessageSquare,
  Send,
  AlertCircle,
} from "lucide-react";
import type { Device, PSURItem } from "@shared/schema";

interface GeneratedPSUR {
  title: string;
  deviceName: string;
  deviceCode: string;
  jurisdiction: string;
  reportingPeriod: string;
  generatedAt: string;
  sections: { name: string; content: string }[];
}

interface DecisionTrace {
  id: string;
  step: string;
  decision: string;
  rationale: string;
  sources: string[];
  timestamp: string;
}

const jurisdictionOptions = [
  { value: "EU_MDR", label: "EU MDR" },
  { value: "UK_MDR", label: "UK MDR" },
  { value: "FDA_21CFR", label: "FDA" },
];

const stepLabels = ["Requirements", "Device", "Period", "PMS Data", "Incidents", "Sales", "CAPA", "Risk", "Conclusions", "Assembly"];

export default function PSURGenerator() {
  const { toast } = useToast();
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>(["EU_MDR"]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [startPeriod, setStartPeriod] = useState("2025-01-01");
  const [endPeriod, setEndPeriod] = useState("2025-12-31");
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [generatedPSUR, setGeneratedPSUR] = useState<GeneratedPSUR | null>(null);
  const [decisionTraces, setDecisionTraces] = useState<DecisionTrace[]>([]);
  const [hitlMessage, setHitlMessage] = useState("");
  const [hitlHistory, setHitlHistory] = useState<{ role: string; message: string }[]>([]);
  const [activeTab, setActiveTab] = useState("runtime");
  
  const logContainerRef = useRef<HTMLDivElement>(null);

  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });

  const startExecutionMutation = useMutation({
    mutationFn: async (data: { deviceId?: number; jurisdictions: string[]; startPeriod?: string; endPeriod?: string }) => {
      return apiRequest("POST", "/api/agent-executions", {
        agentType: "psur",
        deviceId: data.deviceId,
        jurisdictions: data.jurisdictions,
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
    const stepDetails = [
      "Loaded MDCG 2022-21 template",
      "Device description generated",
      "Reporting period set",
      "847 sales, 23 complaints collected",
      "2 serious incidents analyzed",
      "Rate: 2.7 per 1000 units",
      "3 CAPA items compiled",
      "Benefit-risk: ACCEPTABLE",
      "Authorization recommended",
      "PSUR assembled",
    ];
    
    const traces: DecisionTrace[] = [];
    
    for (let i = 0; i < 10; i++) {
      setCurrentStep(i);
      addLogMessage(`[${stepLabels[i]}] ${stepDetails[i]}`);
      
      if (i === 4 || i === 7) {
        traces.push({
          id: `trace-${i}`,
          step: stepLabels[i],
          decision: i === 4 ? "No FSCA required" : "Acceptable risk profile",
          rationale: i === 4 ? "Root cause analysis indicates user error, not device defect" : "Clinical benefits outweigh residual risks per MDCG 2020-1",
          sources: i === 4 ? ["MDR Art. 83", "Incident Report #IR-2024-012"] : ["CER v2.3", "Risk Management File"],
          timestamp: new Date().toISOString(),
        });
        setDecisionTraces([...traces]);
      }
      
      await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 300));
      setCompletedSteps(prev => [...prev, i]);
    }
    
    const device = devices.find(d => d.id === parseInt(selectedDevice));
    const deviceName = device?.deviceName || "Medical Device";
    const deviceCode = device?.deviceCode || "DEV-001";
    
    setGeneratedPSUR({
      title: `PSUR - ${deviceName}`,
      deviceName,
      deviceCode,
      jurisdiction: selectedJurisdictions.join(", "),
      reportingPeriod: `${startPeriod} to ${endPeriod}`,
      generatedAt: new Date().toISOString(),
      sections: [
        { name: "1. Executive Summary", content: `This PSUR covers post-market surveillance data for ${deviceName}. The device maintains an acceptable benefit-risk profile.` },
        { name: "2. Device Description", content: `${deviceName} is classified according to MDR 2017/745.` },
        { name: "3. PMS Data Collection", content: `847 units distributed. 23 complaints received (2.7% rate).` },
        { name: "4. Incident Analysis", content: `Two serious incidents reported. Root cause: user error. No FSCA required.` },
        { name: "5. Benefit-Risk", content: `Determination: ACCEPTABLE. Clinical benefits outweigh residual risks.` },
        { name: "6. Conclusions", content: `Device maintains acceptable safety profile. Continued authorization recommended.` },
      ],
    });
    
    setCurrentStep(-1);
    setIsExecuting(false);
    setActiveTab("output");
    addLogMessage("PSUR generation complete");
    toast({ title: "PSUR Ready" });
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

  const handleStart = () => {
    if (!selectedDevice || selectedJurisdictions.length === 0) return;
    setIsExecuting(true);
    setLogMessages([]);
    setCompletedSteps([]);
    setCurrentStep(0);
    setGeneratedPSUR(null);
    setDecisionTraces([]);
    setActiveTab("runtime");
    addLogMessage("Starting PSUR generation...");
    
    startExecutionMutation.mutate({
      deviceId: parseInt(selectedDevice),
      jurisdictions: selectedJurisdictions,
      startPeriod,
      endPeriod,
    });
  };

  const handleHitlSend = () => {
    if (!hitlMessage.trim()) return;
    setHitlHistory(prev => [...prev, { role: "user", message: hitlMessage }]);
    setTimeout(() => {
      setHitlHistory(prev => [...prev, { 
        role: "system", 
        message: "Decision recorded. Proceeding with your input." 
      }]);
    }, 500);
    setHitlMessage("");
  };

  const toggleJurisdiction = (value: string) => {
    setSelectedJurisdictions(prev => 
      prev.includes(value) ? prev.filter(j => j !== value) : [...prev, value]
    );
  };

  const downloadPSUR = () => {
    if (!generatedPSUR) return;
    const content = generatedPSUR.sections.map(s => `${s.name}\n${s.content}`).join('\n\n');
    const doc = `PERIODIC SAFETY UPDATE REPORT\n\nDevice: ${generatedPSUR.deviceName}\nPeriod: ${generatedPSUR.reportingPeriod}\n\n${content}`;
    const blob = new Blob([doc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PSUR_${generatedPSUR.deviceCode}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const canStart = selectedJurisdictions.length > 0 && selectedDevice;

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 border-r bg-muted/20 p-3 space-y-3 overflow-auto">
        <div className="space-y-2">
          <Label className="text-xs">Device</Label>
          <Select value={selectedDevice} onValueChange={setSelectedDevice} disabled={isExecuting}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-device">
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent>
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id.toString()}>{d.deviceName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Jurisdictions</Label>
          <div className="flex flex-wrap gap-1">
            {jurisdictionOptions.map((j) => (
              <Badge
                key={j.value}
                variant={selectedJurisdictions.includes(j.value) ? "default" : "outline"}
                className="text-[10px] cursor-pointer"
                onClick={() => !isExecuting && toggleJurisdiction(j.value)}
                data-testid={`badge-jurisdiction-${j.value.toLowerCase()}`}
              >
                {j.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Period</Label>
          <div className="space-y-1">
            <Input type="date" value={startPeriod} onChange={(e) => setStartPeriod(e.target.value)} className="h-8 text-xs" disabled={isExecuting} data-testid="input-start-period" />
            <Input type="date" value={endPeriod} onChange={(e) => setEndPeriod(e.target.value)} className="h-8 text-xs" disabled={isExecuting} data-testid="input-end-period" />
          </div>
        </div>

        <Button className="w-full" size="sm" onClick={handleStart} disabled={isExecuting || !canStart} data-testid="button-start-generation">
          {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {isExecuting ? "Generating..." : "Generate PSUR"}
        </Button>

        {(isExecuting || completedSteps.length > 0) && (
          <div className="space-y-1 pt-2 border-t">
            {stepLabels.map((label, idx) => {
              const isCompleted = completedSteps.includes(idx);
              const isActive = currentStep === idx;
              return (
                <div key={idx} className={`flex items-center gap-2 text-[10px] py-1 ${isActive ? 'text-primary font-medium' : isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  {isActive ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <div className="h-3 w-3 rounded-full border" />
                  )}
                  {label}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b px-3 py-2 flex items-center justify-between gap-2">
            <TabsList className="h-8">
              <TabsTrigger value="runtime" className="text-xs h-7">
                <Eye className="h-3 w-3 mr-1" />
                Runtime
              </TabsTrigger>
              <TabsTrigger value="output" className="text-xs h-7">
                <FileText className="h-3 w-3 mr-1" />
                Output
              </TabsTrigger>
              <TabsTrigger value="traces" className="text-xs h-7">
                <GitBranch className="h-3 w-3 mr-1" />
                Traces
              </TabsTrigger>
              <TabsTrigger value="hitl" className="text-xs h-7">
                <MessageSquare className="h-3 w-3 mr-1" />
                Review
              </TabsTrigger>
            </TabsList>

            {generatedPSUR && (
              <Button size="sm" variant="outline" onClick={downloadPSUR} data-testid="button-download-psur">
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}
          </div>

          <TabsContent value="runtime" className="flex-1 m-0 p-3 overflow-hidden">
            <Card className="h-full flex flex-col">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium">Execution Log</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div ref={logContainerRef} className="p-3 space-y-1 font-mono text-[11px]">
                    {logMessages.length === 0 ? (
                      <p className="text-muted-foreground">Configure and start generation to see logs...</p>
                    ) : (
                      logMessages.map((msg, i) => (
                        <div key={i} className="text-muted-foreground">{msg}</div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="output" className="flex-1 m-0 p-3 overflow-auto">
            {generatedPSUR ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">{generatedPSUR.title}</h2>
                    <p className="text-xs text-muted-foreground">{generatedPSUR.reportingPeriod}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{generatedPSUR.jurisdiction}</Badge>
                </div>
                {generatedPSUR.sections.map((section, i) => (
                  <Card key={i}>
                    <CardContent className="p-3">
                      <h3 className="text-xs font-medium mb-1">{section.name}</h3>
                      <p className="text-xs text-muted-foreground">{section.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No PSUR generated yet</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="traces" className="flex-1 m-0 p-3 overflow-auto">
            {decisionTraces.length > 0 ? (
              <div className="space-y-2">
                {decisionTraces.map((trace) => (
                  <Card key={trace.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <GitBranch className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px]">{trace.step}</Badge>
                            <span className="text-xs font-medium">{trace.decision}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{trace.rationale}</p>
                          <div className="flex items-center gap-1 flex-wrap">
                            {trace.sources.map((s, i) => (
                              <Badge key={i} variant="secondary" className="text-[9px]">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <GitBranch className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Decision traces appear during generation</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="hitl" className="flex-1 m-0 flex flex-col overflow-hidden">
            <div className="flex-1 p-3 overflow-auto">
              {hitlHistory.length > 0 ? (
                <div className="space-y-2">
                  {hitlHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] p-2 rounded-lg text-xs ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {msg.message}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Request clarification or provide guidance</p>
                  <p className="text-xs text-muted-foreground mt-1">during PSUR generation</p>
                </div>
              )}
            </div>
            <div className="border-t p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={hitlMessage}
                  onChange={(e) => setHitlMessage(e.target.value)}
                  placeholder="Type your input..."
                  className="h-8 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && handleHitlSend()}
                  data-testid="input-hitl-message"
                />
                <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleHitlSend} data-testid="button-hitl-send">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
