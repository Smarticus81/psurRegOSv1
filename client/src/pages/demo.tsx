import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Upload,
  CheckCircle2,
  Settings,
  Download,
  ChevronRight,
  ArrowLeft,
  Database,
  Shield,
  Clock,
  BarChart3,
  AlertCircle,
  Check,
  Sparkles,
  Play,
  Pause,
  Eye,
  FileSearch,
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
  Activity,
  Users,
  Building2,
  Calendar,
  Hash,
  Scale,
  ChevronDown,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// PSUR Section progress for Document Progress
const psurSections = [
  { id: 1, name: "Executive Summary", status: "complete" },
  { id: 2, name: "Device Description", status: "complete" },
  { id: 3, name: "Sales Volume & Distribution", status: "complete" },
  { id: 4, name: "Customer Feedback Analysis", status: "running" },
  { id: 5, name: "Vigilance & Incident Reports", status: "pending" },
  { id: 6, name: "Literature Review Findings", status: "pending" },
  { id: 7, name: "PMCF Data Summary", status: "pending" },
  { id: 8, name: "Trend Analysis", status: "pending" },
  { id: 9, name: "Benefit-Risk Determination", status: "pending" },
  { id: 10, name: "Conclusions & Actions", status: "pending" },
];

// Data sources for the Data Collection step
const dataSources = [
  { 
    name: "Sales & Distribution Records", 
    records: 12847, 
    status: "complete",
    description: "Units sold, geographic distribution, market segments",
    lastUpdated: "Jan 15, 2025"
  },
  { 
    name: "Customer Complaints", 
    records: 156, 
    status: "complete",
    description: "Product feedback, usability issues, performance concerns",
    lastUpdated: "Jan 20, 2025"
  },
  { 
    name: "Field Safety Corrective Actions", 
    records: 0, 
    status: "none",
    description: "FSCAs, field corrections, recalls",
    lastUpdated: "-"
  },
  { 
    name: "Vigilance Reports (MDR/MIR)", 
    records: 8, 
    status: "complete",
    description: "Serious incidents, deaths, injuries reported",
    lastUpdated: "Jan 18, 2025"
  },
  { 
    name: "Literature Review Articles", 
    records: 47, 
    status: "complete",
    description: "Published studies, case reports, clinical data",
    lastUpdated: "Jan 22, 2025"
  },
  { 
    name: "PMCF Study Results", 
    records: 2340, 
    status: "partial",
    description: "Post-market clinical follow-up data",
    lastUpdated: "Jan 10, 2025"
  },
  { 
    name: "Trend Analysis Reports", 
    records: 0, 
    status: "pending",
    description: "Statistical trends, signal detection results",
    lastUpdated: "-"
  },
];

// Review items for validation step
const reviewItems = [
  {
    section: "Device Identification",
    items: [
      { label: "UDI-DI verified against EUDAMED", status: "pass" },
      { label: "Risk classification matches technical file", status: "pass" },
      { label: "Manufacturer information complete", status: "pass" },
    ]
  },
  {
    section: "Data Completeness",
    items: [
      { label: "Sales data covers full reporting period", status: "pass" },
      { label: "All vigilance reports accounted for", status: "pass" },
      { label: "PMCF data includes required endpoints", status: "warning", note: "Missing 3-month follow-up data" },
      { label: "Literature search strategy documented", status: "pass" },
    ]
  },
  {
    section: "Regulatory Alignment",
    items: [
      { label: "MDCG 2022-21 structure compliance", status: "pass" },
      { label: "Benefit-risk ratio methodology documented", status: "pass" },
      { label: "Corrective action tracking complete", status: "pass" },
    ]
  },
];

export default function Demo() {
  const [activeStep, setActiveStep] = useState(0);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationProgress, setCompilationProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState(0);
  
  // Form state for Step 1
  const [deviceName, setDeviceName] = useState("CardioFlow Monitor 3000");
  const [manufacturer, setManufacturer] = useState("MedTech Innovations GmbH");
  const [riskClass, setRiskClass] = useState("IIb");
  const [udiDi, setUdiDi] = useState("(01)09876543210123");
  const [periodStart, setPeriodStart] = useState("2024-01-01");
  const [periodEnd, setPeriodEnd] = useState("2024-12-31");
  
  const steps = ["Device Setup", "Data Collection", "Review & Validate", "Compile PSUR", "Export"];
  const stepIcons = [Settings, Database, ClipboardCheck, FileText, Download];

  // Simulate compilation progress
  useEffect(() => {
    if (isCompiling && compilationProgress < 100) {
      const timer = setTimeout(() => {
        setCompilationProgress(prev => {
          const next = prev + Math.random() * 8 + 2;
          if (next >= 100) {
            setIsCompiling(false);
            return 100;
          }
          setCurrentSection(Math.floor(next / 10));
          return next;
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isCompiling, compilationProgress]);

  const completedSources = dataSources.filter(e => e.status === "complete").length;
  const totalRequiredSources = dataSources.filter(e => e.status !== "none").length;
  const coveragePercent = Math.round((completedSources / totalRequiredSources) * 100);

  const startCompilation = () => {
    setIsCompiling(true);
    setCompilationProgress(0);
    setCurrentSection(0);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Home
                </Button>
              </Link>
              <div className="w-px h-6 bg-border" />
              <div>
                <h1 className="text-xl font-bold text-foreground">PSUR Compilation Demo</h1>
                <p className="text-sm text-muted-foreground">Experience the complete workflow</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              <Sparkles className="w-3 h-3 mr-1" />
              Interactive Demo
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stepper */}
        <div className="flex items-center justify-center mb-8">
          <div className="inline-flex items-center gap-2 p-2 rounded-full bg-card border border-border shadow-lg">
            {steps.map((step, idx) => {
              const Icon = stepIcons[idx];
              const isActive = activeStep === idx;
              const isComplete = idx < activeStep;
              
              return (
                <div key={step} className="flex items-center">
                  <button
                    onClick={() => setActiveStep(idx)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : isComplete
                          ? "bg-transparent text-primary hover:bg-primary/10"
                          : "bg-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-full transition-all",
                      isActive
                        ? "bg-primary-foreground/20"
                        : isComplete
                          ? "bg-primary/20"
                          : "bg-muted"
                    )}>
                      {isComplete ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap hidden sm:inline">{step}</span>
                  </button>
                  {idx < steps.length - 1 && (
                    <ChevronRight className={cn(
                      "w-4 h-4 mx-1 transition-colors",
                      idx < activeStep ? "text-primary" : "text-muted-foreground/50"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Device Setup */}
            {activeStep === 0 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Device Information</h2>
                      <p className="text-sm text-muted-foreground">Enter your medical device details</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="deviceName">Device Name</Label>
                      <Input
                        id="deviceName"
                        value={deviceName}
                        onChange={(e) => setDeviceName(e.target.value)}
                        placeholder="Enter device name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manufacturer">Manufacturer</Label>
                      <Input
                        id="manufacturer"
                        value={manufacturer}
                        onChange={(e) => setManufacturer(e.target.value)}
                        placeholder="Legal manufacturer name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="riskClass">Risk Classification</Label>
                      <Select value={riskClass} onValueChange={setRiskClass}>
                        <SelectTrigger id="riskClass">
                          <SelectValue placeholder="Select risk class" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="I">Class I</SelectItem>
                          <SelectItem value="IIa">Class IIa</SelectItem>
                          <SelectItem value="IIb">Class IIb</SelectItem>
                          <SelectItem value="III">Class III</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="udiDi">UDI-DI</Label>
                      <Input
                        id="udiDi"
                        value={udiDi}
                        onChange={(e) => setUdiDi(e.target.value)}
                        placeholder="(01)XXXXXXXXXXXXX"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Reporting Period</h2>
                      <p className="text-sm text-muted-foreground">Define the surveillance period for this PSUR</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="periodStart">Period Start</Label>
                      <Input
                        id="periodStart"
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="periodEnd">Period End</Label>
                      <Input
                        id="periodEnd"
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-start gap-3">
                      <Scale className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Reporting Frequency</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Based on Class {riskClass} classification, PSUR submission is required annually.
                          For Class III devices, consider more frequent internal reviews.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Button className="w-full" size="lg" onClick={() => setActiveStep(1)}>
                  Continue to Data Collection
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}

            {/* Step 2: Data Collection */}
            {activeStep === 1 && (
              <div className="bg-card rounded-xl border border-border p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Database className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Data Sources</h2>
                      <p className="text-sm text-muted-foreground">Connect and verify your PMS data</p>
                    </div>
                  </div>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Data Source
                  </Button>
                </div>

                <div className="space-y-3">
                  {dataSources.map((source, idx) => (
                    <div
                      key={source.name}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border transition-colors",
                        source.status === "complete" 
                          ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
                          : source.status === "partial"
                            ? "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
                            : source.status === "none"
                              ? "bg-secondary/30 border-border/50"
                              : "bg-secondary/50 border-border hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          source.status === "complete" 
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                            : source.status === "partial"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : source.status === "none"
                                ? "bg-muted text-muted-foreground/50"
                                : "bg-muted text-muted-foreground"
                        )}>
                          {source.status === "complete" ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : source.status === "partial" ? (
                            <AlertTriangle className="w-5 h-5" />
                          ) : source.status === "none" ? (
                            <X className="w-5 h-5" />
                          ) : (
                            <AlertCircle className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{source.name}</p>
                          <p className="text-xs text-muted-foreground">{source.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          {source.records > 0 ? (
                            <>
                              <p className="text-sm font-semibold text-foreground">{source.records.toLocaleString()} records</p>
                              <p className="text-xs text-muted-foreground">Updated {source.lastUpdated}</p>
                            </>
                          ) : source.status === "none" ? (
                            <p className="text-xs text-muted-foreground">Not applicable</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">No data yet</p>
                          )}
                        </div>
                        {source.status !== "none" && (
                          <Button 
                            variant={source.status === "complete" ? "outline" : "default"} 
                            size="sm"
                            className="min-w-[80px]"
                          >
                            {source.status === "complete" ? "Update" : source.status === "partial" ? "Complete" : "Upload"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => setActiveStep(0)}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button onClick={() => setActiveStep(2)}>
                    Continue to Review
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Review & Validate */}
            {activeStep === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ClipboardCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Pre-Compilation Validation</h2>
                      <p className="text-sm text-muted-foreground">Verify data completeness and regulatory alignment</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {reviewItems.map((section, sectionIdx) => (
                      <div key={section.section}>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          {section.section}
                        </h3>
                        <div className="space-y-2">
                          {section.items.map((item, itemIdx) => (
                            <div 
                              key={itemIdx}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-lg border",
                                item.status === "pass" 
                                  ? "bg-emerald-500/5 border-emerald-500/20"
                                  : "bg-amber-500/5 border-amber-500/20"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                {item.status === "pass" ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                )}
                                <div>
                                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                                  {item.note && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400">{item.note}</p>
                                  )}
                                </div>
                              </div>
                              <Badge variant={item.status === "pass" ? "outline" : "secondary"} className={cn(
                                item.status === "pass" 
                                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              )}>
                                {item.status === "pass" ? "Verified" : "Review Required"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setActiveStep(1)}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button onClick={() => setActiveStep(3)}>
                    Proceed to Compilation
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Compile PSUR */}
            {activeStep === 3 && (
              <div className="bg-card rounded-xl border border-border p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Document Progress</h2>
                    <p className="text-sm text-muted-foreground">PSUR sections being compiled</p>
                  </div>
                </div>

                {/* Overall Progress */}
                <div className="mb-6 p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">Overall Completion</span>
                    <span className="text-sm font-bold text-primary">{Math.round(compilationProgress)}%</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-300" 
                      style={{ width: `${compilationProgress}%` }} 
                    />
                  </div>
                </div>

                {/* Section Progress */}
                <div className="space-y-2 mb-6">
                  {psurSections.map((section, idx) => {
                    const sectionStatus = idx < currentSection 
                      ? "complete" 
                      : idx === currentSection && isCompiling 
                        ? "running" 
                        : compilationProgress === 100 
                          ? "complete"
                          : "pending";
                    
                    return (
                      <div 
                        key={section.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition-all",
                          sectionStatus === "complete"
                            ? "bg-emerald-500/5 border-emerald-500/20"
                            : sectionStatus === "running"
                              ? "bg-primary/5 border-primary/30"
                              : "bg-secondary/30 border-border/50"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold",
                          sectionStatus === "complete"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : sectionStatus === "running"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                        )}>
                          {sectionStatus === "complete" ? (
                            <Check className="w-4 h-4" />
                          ) : sectionStatus === "running" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            section.id
                          )}
                        </div>
                        <div className="flex-1">
                          <p className={cn(
                            "text-sm font-medium",
                            sectionStatus === "pending" ? "text-muted-foreground" : "text-foreground"
                          )}>
                            {section.name}
                          </p>
                        </div>
                        {sectionStatus === "running" && (
                          <span className="text-xs text-primary animate-pulse">Compiling...</span>
                        )}
                        {sectionStatus === "complete" && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Complete</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {compilationProgress === 100 ? (
                  <Button className="w-full" size="lg" onClick={() => setActiveStep(4)}>
                    View Compiled Document
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button 
                    className="w-full gap-2" 
                    size="lg"
                    onClick={isCompiling ? () => setIsCompiling(false) : startCompilation}
                  >
                    {isCompiling ? (
                      <>
                        <Pause className="w-4 h-4" />
                        Pause Compilation
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Start Compilation
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Step 5: Export */}
            {activeStep === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                {/* Success Banner */}
                <div className="flex items-center gap-4 p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">PSUR Compilation Complete</h3>
                    <p className="text-sm text-muted-foreground">
                      All 10 sections compiled with full decision traceability
                    </p>
                  </div>
                </div>

                {/* Document Preview */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">Document Preview</h3>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1">
                        <Eye className="w-4 h-4" />
                        Preview
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-secondary/30 rounded-lg p-6 border border-border space-y-4">
                    <div className="flex items-center gap-3 pb-4 border-b border-border">
                      <FileText className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-semibold text-foreground">Periodic Safety Update Report</p>
                        <p className="text-sm text-muted-foreground">{deviceName}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-3 bg-muted rounded w-2/3" />
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-3 bg-muted rounded w-4/5" />
                      <div className="h-4 bg-muted rounded w-1/2 mt-4" />
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-3 bg-muted rounded w-5/6" />
                      <div className="h-3 bg-muted rounded w-full" />
                    </div>
                  </div>
                </div>

                {/* Export Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button className="h-16 gap-3" variant="outline" size="lg">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold">Download PSUR</p>
                      <p className="text-xs text-muted-foreground">Word document (.docx)</p>
                    </div>
                  </Button>
                  <Button className="h-16 gap-3" variant="outline" size="lg">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold">Download Audit Trail</p>
                      <p className="text-xs text-muted-foreground">Full decision tracing bundle</p>
                    </div>
                  </Button>
                </div>

                <Button variant="outline" onClick={() => {
                  setActiveStep(0);
                  setCompilationProgress(0);
                  setCurrentSection(0);
                }}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Start New PSUR
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Device Info Card */}
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Device Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Device</span>
                  <span className="text-sm font-medium text-foreground text-right max-w-[150px] truncate">{deviceName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Manufacturer</span>
                  <span className="text-sm font-medium text-foreground text-right max-w-[150px] truncate">{manufacturer}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Risk Class</span>
                  <Badge variant="outline">{riskClass}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Period</span>
                  <span className="text-sm font-medium text-foreground">Jan - Dec 2024</span>
                </div>
              </div>
            </div>

            {/* Data Coverage Card */}
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Data Coverage</h3>
              <div className="flex flex-col items-center">
                <div className="relative w-28 h-28 mb-4">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="12"
                      className="text-secondary"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${coveragePercent * 3.14} 314`}
                      className="text-primary transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{coveragePercent}%</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Complete</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {completedSources} of {totalRequiredSources} data sources verified
                </p>
              </div>
            </div>

            {/* Compilation Stats (only show in step 4/5) */}
            {(activeStep === 3 || activeStep === 4) && (
              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Compilation Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Sections</span>
                    <span className="text-sm font-medium text-foreground">{psurSections.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Data Points Traced</span>
                    <span className="text-sm font-medium text-foreground">15,391</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Source References</span>
                    <span className="text-sm font-medium text-foreground">847</span>
                  </div>
                  {compilationProgress === 100 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Processing Time</span>
                      <span className="text-sm font-medium text-foreground">4m 12s</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
