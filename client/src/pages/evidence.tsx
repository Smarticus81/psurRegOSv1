import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { queryClient } from "@/lib/queryClient";
import {
  Upload,
  FileSpreadsheet,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Settings2,
  Save,
  Columns,
} from "lucide-react";
import type { Device, EvidenceUpload, EvidenceAtom, PSURCase } from "@shared/schema";
import { EVIDENCE_DEFINITIONS, type EvidenceDefinition } from "@shared/schema";

interface ColumnAnalysis {
  sourceColumns: string[];
  suggestedMappings: Record<string, string>;
  requiredFields: string[];
  sampleRows: Record<string, unknown>[];
  fileFormat: string;
  totalRows: number;
  sheetNames: string[];
  selectedSheet: string;
  missingRequiredColumns: string[];
  recommendedMapping: Record<string, string>;
}

interface MappingProfile {
  id: number;
  name: string;
  evidenceType: string;
  columnMappings: Record<string, string>;
  usageCount: number;
}

interface EvidenceCoverage {
  psurCaseId?: number;
  reportingPeriod: { start: string; end: string } | null;
  coverageByType: Record<string, {
    count: number;
    inPeriod: number;
    outOfPeriod: number;
    periodCoverage: { start: string | null; end: string | null };
  }>;
  missingMandatoryTypes: string[];
  totalAtoms: number;
  deviceMatchRate: number;
  ready: boolean;
}

interface EvidenceListResponse {
  atoms: EvidenceAtom[];
  totalCount: number;
  coverageByType: Record<string, { count: number; periodStart: string | null; periodEnd: string | null }>;
}

// Derive evidence types from shared registry for UI display
const EVIDENCE_TYPES = EVIDENCE_DEFINITIONS.map(def => ({
  value: def.type,
  label: def.label,
  description: def.description,
  section: def.sections.join("/"),
  tier: def.tier,
  isAggregated: def.isAggregated,
}));

const PSUR_SECTIONS = [
  { id: "A", name: "Administrative & Cover" },
  { id: "B", name: "Executive Summary" },
  { id: "C", name: "Sales & Population" },
  { id: "D", name: "Serious Incidents" },
  { id: "E", name: "Non-Serious Incidents" },
  { id: "F", name: "Complaints Analysis" },
  { id: "G", name: "Trend Analysis" },
  { id: "H", name: "FSCA Summary" },
  { id: "I", name: "CAPA Status" },
  { id: "J", name: "Literature Review" },
  { id: "K", name: "Database Queries" },
  { id: "L", name: "PMCF Results" },
  { id: "M", name: "Conclusions" },
];

export default function EvidencePage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [evidenceType, setEvidenceType] = useState("");
  const [deviceScopeId, setDeviceScopeId] = useState("__all__");
  const [psurCaseId, setPsurCaseId] = useState("__none__");
  const [sourceSystem, setSourceSystem] = useState("");
  const [extractionNotes, setExtractionNotes] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [expandedAtoms, setExpandedAtoms] = useState<Set<number>>(new Set());
  
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [columnAnalysis, setColumnAnalysis] = useState<ColumnAnalysis | null>(null);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [newProfileName, setNewProfileName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [fileBuffer, setFileBuffer] = useState<File | null>(null);
  const [jurisdiction, setJurisdiction] = useState<string>("EU");

  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: psurCases = [] } = useQuery<PSURCase[]>({ queryKey: ["/api/psur-cases"] });
  const { data: uploads = [] } = useQuery<EvidenceUpload[]>({ queryKey: ["/api/evidence/uploads"] });
  const { data: evidenceData } = useQuery<EvidenceListResponse>({ queryKey: ["/api/evidence"] });
  const { data: coverage } = useQuery<EvidenceCoverage>({ 
    queryKey: ["/api/evidence/coverage", psurCaseId, periodStart, periodEnd],
    enabled: true,
  });
  const { data: mappingProfiles = [] } = useQuery<MappingProfile[]>({ 
    queryKey: ["/api/column-mapping-profiles", evidenceType],
    enabled: !!evidenceType,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setColumnAnalysis(null);
      setColumnMappings({});
      setWizardStep(1);
    }
  };

  const resetWizard = () => {
    setSelectedFile(null);
    setEvidenceType("");
    setWizardStep(1);
    setColumnAnalysis(null);
    setColumnMappings({});
    setNewProfileName("");
    setSelectedProfileId(null);
    setSelectedSheet("");
    setFileBuffer(null);
  };

  const handleAnalyzeFile = async (sheetOverride?: string) => {
    const fileToAnalyze = selectedFile || fileBuffer;
    if (!fileToAnalyze || !evidenceType) {
      toast({ title: "Missing required fields", description: "Please select a file and evidence type", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", fileToAnalyze);
      formData.append("evidence_type", evidenceType);
      if (sheetOverride || selectedSheet) {
        formData.append("selected_sheet", sheetOverride || selectedSheet);
      }

      const response = await fetch("/api/evidence/analyze", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      const analysis: ColumnAnalysis = {
        sourceColumns: result.sourceColumns || [],
        suggestedMappings: result.suggestedMappings || result.recommendedMapping || {},
        requiredFields: result.requiredFields || [],
        sampleRows: result.sampleRows || [],
        fileFormat: result.fileFormat || "unknown",
        totalRows: result.totalRows || 0,
        sheetNames: result.sheetNames || [],
        selectedSheet: result.selectedSheet || "",
        missingRequiredColumns: result.missingRequiredColumns || [],
        recommendedMapping: result.recommendedMapping || {},
      };

      if (!response.ok) {
        toast({ title: "Analysis failed", description: result.error || "Failed to analyze file", variant: "destructive" });
        return;
      }

      if (analysis.sourceColumns.length === 0) {
        toast({ title: "No columns found", description: "The file appears to be empty or has no valid headers", variant: "destructive" });
        return;
      }

      setFileBuffer(fileToAnalyze);
      setColumnAnalysis(analysis);
      setColumnMappings(analysis.suggestedMappings);
      setSelectedSheet(analysis.selectedSheet);
      setWizardStep(2);
    } catch (error) {
      toast({ title: "Analysis failed", description: "An error occurred during file analysis", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSheetChange = async (newSheet: string) => {
    const fileToAnalyze = selectedFile || fileBuffer;
    if (!fileToAnalyze || !evidenceType) {
      toast({ title: "Missing required fields", description: "Please select a file and evidence type", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", fileToAnalyze);
      formData.append("evidence_type", evidenceType);
      formData.append("selected_sheet", newSheet);

      const response = await fetch("/api/evidence/analyze", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        toast({ title: "Sheet analysis failed", description: result.error || "Failed to analyze sheet", variant: "destructive" });
        return;
      }

      const analysis: ColumnAnalysis = {
        sourceColumns: result.sourceColumns || [],
        suggestedMappings: result.suggestedMappings || result.recommendedMapping || {},
        requiredFields: result.requiredFields || [],
        sampleRows: result.sampleRows || [],
        fileFormat: result.fileFormat || "unknown",
        totalRows: result.totalRows || 0,
        sheetNames: result.sheetNames || [],
        selectedSheet: result.selectedSheet || "",
        missingRequiredColumns: result.missingRequiredColumns || [],
        recommendedMapping: result.recommendedMapping || {},
      };

      if (analysis.sourceColumns.length === 0) {
        toast({ title: "No columns found", description: `Sheet "${newSheet}" appears to be empty or has no valid headers`, variant: "destructive" });
        return;
      }

      setSelectedSheet(newSheet);
      setColumnAnalysis(analysis);
      setColumnMappings(analysis.suggestedMappings);
    } catch (error) {
      toast({ title: "Sheet analysis failed", description: "An error occurred during sheet analysis", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyProfile = (profile: MappingProfile) => {
    setColumnMappings(profile.columnMappings);
    setSelectedProfileId(profile.id);
    toast({ title: "Profile applied", description: `Applied "${profile.name}" mappings` });
  };

  const saveAsProfile = async () => {
    if (!newProfileName.trim() || !evidenceType || Object.keys(columnMappings).length === 0) {
      toast({ title: "Cannot save profile", description: "Please enter a name and configure mappings", variant: "destructive" });
      return;
    }

    try {
      const response = await fetch("/api/column-mapping-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProfileName.trim(),
          evidenceType,
          columnMappings,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        toast({ title: "Save failed", description: result.error || "Failed to save profile", variant: "destructive" });
        return;
      }

      toast({ title: "Profile saved", description: `Profile "${newProfileName}" saved for future use` });
      setNewProfileName("");
      queryClient.invalidateQueries({ queryKey: ["/api/column-mapping-profiles", evidenceType] });
    } catch (error) {
      toast({ title: "Save failed", description: "An error occurred while saving the profile", variant: "destructive" });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !evidenceType) {
      toast({ title: "Missing required fields", description: "Please select a file and evidence type", variant: "destructive" });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("evidence_type", evidenceType);
      if (deviceScopeId && deviceScopeId !== "__all__") formData.append("device_scope_id", deviceScopeId);
      if (psurCaseId && psurCaseId !== "__none__") formData.append("psur_case_id", psurCaseId);
      if (jurisdiction) formData.append("jurisdiction", jurisdiction);
      if (sourceSystem) formData.append("source_system", sourceSystem);
      if (extractionNotes) formData.append("extraction_notes", extractionNotes);
      if (periodStart) formData.append("period_start", periodStart);
      if (periodEnd) formData.append("period_end", periodEnd);
      if (Object.keys(columnMappings).length > 0) {
        formData.append("column_mappings", JSON.stringify(columnMappings));
      }
      if (selectedProfileId) {
        formData.append("mapping_profile_id", selectedProfileId.toString());
      }

      const response = await fetch("/api/evidence/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        toast({ 
          title: "Upload failed", 
          description: result.error || "Failed to process file", 
          variant: "destructive" 
        });
        return;
      }

      toast({ 
        title: "Upload successful", 
        description: `Created ${result.summary.atomsCreated} evidence atoms from ${result.summary.totalRecords} records` 
      });

      resetWizard();
      setSourceSystem("");
      setExtractionNotes("");
      
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] });
      
      setActiveTab("atoms");
    } catch (error) {
      toast({ title: "Upload failed", description: "An error occurred during upload", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const toggleAtomExpand = (id: number) => {
    setExpandedAtoms(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case "processing":
        return <Badge variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"><Clock className="h-3 w-3 mr-1" />Processing</Badge>;
      case "failed":
        return <Badge variant="outline" className="text-[10px] bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4">
        <div className="mb-4">
          <h1 className="text-lg font-semibold">Evidence Management</h1>
          <p className="text-sm text-muted-foreground">Upload and manage compliance evidence for PSUR generation</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="h-9 w-fit">
            <TabsTrigger value="upload" className="text-xs h-7" data-testid="tab-upload">
              <Upload className="h-3 w-3 mr-1" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="atoms" className="text-xs h-7" data-testid="tab-atoms">
              <Database className="h-3 w-3 mr-1" />
              Evidence Atoms
            </TabsTrigger>
            <TabsTrigger value="coverage" className="text-xs h-7" data-testid="tab-coverage">
              <FileSpreadsheet className="h-3 w-3 mr-1" />
              Coverage
            </TabsTrigger>
            <TabsTrigger value="uploads" className="text-xs h-7" data-testid="tab-uploads">
              <FileText className="h-3 w-3 mr-1" />
              Upload History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="flex-1 m-0 mt-4 overflow-auto">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Upload Evidence File</CardTitle>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={`w-2 h-2 rounded-full ${
                            wizardStep === step
                              ? "bg-primary"
                              : wizardStep > step
                              ? "bg-primary/40"
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  {wizardStep === 1 && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs">Evidence Type *</Label>
                        <Select value={evidenceType} onValueChange={setEvidenceType}>
                          <SelectTrigger className="h-9" data-testid="select-evidence-type">
                            <SelectValue placeholder="Select evidence type" />
                          </SelectTrigger>
                          <SelectContent>
                            {EVIDENCE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 w-8 justify-center">{type.section}</Badge>
                                  <div className="flex flex-col">
                                    <span className="text-sm">{type.label}</span>
                                    <span className="text-[10px] text-muted-foreground">{type.description}</span>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">File (CSV or XLSX) *</Label>
                        <div className="border-2 border-dashed rounded-md p-4 text-center">
                          <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileChange}
                            className="hidden"
                            id="file-upload"
                            data-testid="input-file-upload"
                          />
                          <label htmlFor="file-upload" className="cursor-pointer">
                            {selectedFile ? (
                              <div className="flex items-center justify-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-primary" />
                                <span className="text-sm">{selectedFile.name}</span>
                                <Badge variant="secondary" className="text-[10px]">{(selectedFile.size / 1024).toFixed(1)} KB</Badge>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Click to select CSV or Excel file</p>
                              </div>
                            )}
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Jurisdiction</Label>
                          <Select value={jurisdiction} onValueChange={setJurisdiction}>
                            <SelectTrigger className="h-9" data-testid="select-jurisdiction">
                              <SelectValue placeholder="Select jurisdiction" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EU">EU MDR</SelectItem>
                              <SelectItem value="UK">UK MDR</SelectItem>
                              <SelectItem value="US">FDA (US)</SelectItem>
                              <SelectItem value="Canada">Health Canada</SelectItem>
                              <SelectItem value="Australia">TGA (Australia)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Device Scope</Label>
                          <Select value={deviceScopeId} onValueChange={setDeviceScopeId}>
                            <SelectTrigger className="h-9" data-testid="select-device-scope">
                              <SelectValue placeholder="All devices" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">All devices</SelectItem>
                              {devices.map((d) => (
                                <SelectItem key={d.id} value={d.id.toString()}>{d.deviceName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Link to PSUR Case</Label>
                          <Select value={psurCaseId} onValueChange={setPsurCaseId}>
                            <SelectTrigger className="h-9" data-testid="select-psur-case">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {psurCases.map((c) => (
                                <SelectItem key={c.id} value={c.id.toString()}>{c.psurReference}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Period Start</Label>
                          <Input 
                            type="date" 
                            value={periodStart} 
                            onChange={(e) => setPeriodStart(e.target.value)} 
                            className="h-9"
                            data-testid="input-period-start"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Period End</Label>
                          <Input 
                            type="date" 
                            value={periodEnd} 
                            onChange={(e) => setPeriodEnd(e.target.value)} 
                            className="h-9"
                            data-testid="input-period-end"
                          />
                        </div>
                      </div>

                      <Button 
                        className="w-full" 
                        onClick={() => handleAnalyzeFile()}
                        disabled={isAnalyzing || !selectedFile || !evidenceType}
                        data-testid="button-analyze"
                      >
                        {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Columns className="h-4 w-4 mr-2" />}
                        {isAnalyzing ? "Analyzing..." : "Analyze Columns"}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </>
                  )}

                  {wizardStep === 2 && columnAnalysis && (columnAnalysis.sourceColumns.length > 0) && (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">Column Mapping</p>
                          <p className="text-[10px] text-muted-foreground">
                            {columnAnalysis.totalRows} rows, {columnAnalysis.sourceColumns.length} columns detected
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{columnAnalysis.fileFormat}</Badge>
                      </div>

                      {columnAnalysis.sheetNames.length > 1 && (
                        <div className="space-y-2">
                          <Label className="text-xs">Sheet</Label>
                          <Select 
                            value={selectedSheet} 
                            onValueChange={handleSheetChange}
                            disabled={isAnalyzing}
                          >
                            <SelectTrigger className="h-8" data-testid="select-sheet">
                              <SelectValue placeholder="Select sheet" />
                            </SelectTrigger>
                            <SelectContent>
                              {columnAnalysis.sheetNames.map((sheet) => (
                                <SelectItem key={sheet} value={sheet}>{sheet}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {mappingProfiles.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs flex items-center gap-1">
                            <Settings2 className="h-3 w-3" />
                            Saved Profiles
                          </Label>
                          <div className="flex flex-wrap gap-1">
                            {mappingProfiles.map((profile) => (
                              <Badge
                                key={profile.id}
                                variant={selectedProfileId === profile.id ? "default" : "outline"}
                                className="text-[10px] cursor-pointer hover-elevate"
                                onClick={() => applyProfile(profile)}
                              >
                                {profile.name}
                                <span className="ml-1 text-muted-foreground">({profile.usageCount})</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <ScrollArea className="h-[200px] border rounded-md p-2">
                        <div className="space-y-2">
                          {columnAnalysis.requiredFields.map((targetField) => (
                            <div key={targetField} className="flex items-center gap-2">
                              <div className="w-1/3">
                                <Badge variant="outline" className="text-[9px] w-full justify-center">
                                  {targetField}
                                </Badge>
                              </div>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <Select
                                value={columnMappings[targetField] || "__unmapped__"}
                                onValueChange={(v) => {
                                  setColumnMappings(prev => ({
                                    ...prev,
                                    [targetField]: v === "__unmapped__" ? "" : v,
                                  }));
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs flex-1">
                                  <SelectValue placeholder="Select column" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__unmapped__">
                                    <span className="text-muted-foreground">Not mapped</span>
                                  </SelectItem>
                                  {columnAnalysis.sourceColumns.map((col) => (
                                    <SelectItem key={col} value={col}>{col}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {columnMappings[targetField] ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                              ) : (
                                <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>

                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Save as profile name..."
                          value={newProfileName}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          className="h-8 text-xs flex-1"
                          data-testid="input-profile-name"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={saveAsProfile}
                          disabled={!newProfileName.trim()}
                          data-testid="button-save-profile"
                        >
                          <Save className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          variant="outline"
                          onClick={() => setWizardStep(1)}
                          data-testid="button-back"
                        >
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Back
                        </Button>
                        <Button 
                          className="flex-1"
                          onClick={() => setWizardStep(3)}
                          data-testid="button-next"
                        >
                          Review & Upload
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </>
                  )}

                  {wizardStep === 3 && (
                    <>
                      <div className="space-y-3">
                        <div className="bg-muted/30 rounded-md p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">File</span>
                            <span className="text-xs font-medium">{selectedFile?.name}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Evidence Type</span>
                            <Badge variant="secondary" className="text-[10px]">{evidenceType}</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Jurisdiction</span>
                            <Badge variant="outline" className="text-[10px]">{jurisdiction}</Badge>
                          </div>
                          {(columnAnalysis?.totalRows ?? 0) > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Rows</span>
                              <span className="text-xs font-medium">{columnAnalysis?.totalRows ?? 0}</span>
                            </div>
                          )}
                          {periodStart && periodEnd && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Period</span>
                              <span className="text-xs font-medium">{periodStart} to {periodEnd}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Source System</Label>
                          <Input 
                            value={sourceSystem}
                            onChange={(e) => setSourceSystem(e.target.value)}
                            placeholder="e.g., SAP, Salesforce, Manual Extract"
                            className="h-9"
                            data-testid="input-source-system"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Extraction Notes</Label>
                          <Textarea 
                            value={extractionNotes}
                            onChange={(e) => setExtractionNotes(e.target.value)}
                            placeholder="Query filters, date range, exclusions applied..."
                            className="min-h-[60px] text-sm"
                            data-testid="input-extraction-notes"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          variant="outline"
                          onClick={() => setWizardStep(2)}
                          disabled={isUploading}
                          data-testid="button-back-review"
                        >
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Back
                        </Button>
                        <Button 
                          className="flex-1"
                          onClick={handleUpload}
                          disabled={isUploading}
                          data-testid="button-upload"
                        >
                          {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                          {isUploading ? "Processing..." : "Upload & Parse"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium">
                    {wizardStep === 2 && columnAnalysis ? "Data Preview" : "Expected Formats"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  {wizardStep === 2 && (columnAnalysis?.sampleRows ?? []).length > 0 ? (
                    <ScrollArea className="h-[320px]">
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground">Sample rows from your file:</p>
                        {(columnAnalysis?.sampleRows ?? []).slice(0, 5).map((row, idx) => (
                          <div key={idx} className="bg-muted/30 rounded p-2 space-y-1">
                            {Object.entries(row).slice(0, 6).map(([key, value]) => (
                              <div key={key} className="flex items-start gap-2 text-[10px]">
                                <span className="text-muted-foreground font-mono w-24 shrink-0 truncate">{key}:</span>
                                <span className="font-mono truncate">{String(value)}</span>
                              </div>
                            ))}
                            {Object.keys(row).length > 6 && (
                              <p className="text-[10px] text-muted-foreground">+ {Object.keys(row).length - 6} more fields</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium">Sales Volume</h4>
                        <div className="bg-muted/50 rounded-md p-3 font-mono text-[10px] overflow-x-auto">
                          <p>device_code, product_name, quantity, region, country, period_start, period_end</p>
                          <p className="text-muted-foreground mt-1">JS3000X, Janice Scalpel, 150, EMEA, Germany, 2025-01-01, 2025-03-31</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Required: device_code, quantity, period_start, period_end</p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-xs font-medium">Complaint Records</h4>
                        <div className="bg-muted/50 rounded-md p-3 font-mono text-[10px] overflow-x-auto">
                          <p>complaint_id, device_code, complaint_date, description, severity, device_related</p>
                          <p className="text-muted-foreground mt-1">C-2025-001, JS3000X, 2025-02-15, Handle loosening, medium, yes</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Required: complaint_id, device_code, complaint_date, description</p>
                      </div>

                      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <div className="text-xs">
                            <p className="font-medium text-amber-800 dark:text-amber-200">Data Integrity</p>
                            <p className="text-amber-700 dark:text-amber-300 mt-1">
                              Each uploaded record becomes an immutable EvidenceAtom with SHA-256 hash and full provenance tracking.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="atoms" className="flex-1 m-0 mt-4 overflow-auto">
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium">Evidence Atoms ({evidenceData?.totalCount || 0})</CardTitle>
                  {evidenceData?.coverageByType && (
                    <div className="flex gap-2">
                      {Object.entries(evidenceData.coverageByType).map(([type, data]) => (
                        <Badge key={type} variant="outline" className="text-[10px]">
                          {type}: {data.count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="p-4 space-y-2">
                    {evidenceData?.atoms.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No evidence atoms yet</p>
                        <p className="text-xs">Upload files to create evidence atoms</p>
                      </div>
                    )}
                    {evidenceData?.atoms.map((atom) => {
                      const isExpanded = expandedAtoms.has(atom.id);
                      return (
                        <div 
                          key={atom.id} 
                          className="border rounded-md"
                          data-testid={`atom-${atom.id}`}
                        >
                          <div 
                            className="flex items-center gap-2 p-2 cursor-pointer hover-elevate"
                            onClick={() => toggleAtomExpand(atom.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            )}
                            <Badge variant="secondary" className="text-[10px]">{atom.evidenceType}</Badge>
                            <span className="text-xs font-mono text-muted-foreground">#{atom.id}</span>
                            <span className="text-xs flex-1 truncate">{atom.sourceSystem}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(atom.periodStart)} - {formatDate(atom.periodEnd)}
                            </span>
                          </div>
                          
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-1 border-t space-y-2 bg-muted/20">
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="text-muted-foreground text-[10px]">Content Hash</p>
                                  <p className="font-mono text-[10px] truncate">{atom.contentHash}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-[10px]">Extract Date</p>
                                  <p>{formatDate(atom.extractDate)}</p>
                                </div>
                              </div>
                              {atom.normalizedData ? (
                                <div>
                                  <p className="text-muted-foreground text-[10px] mb-1">Normalized Data</p>
                                  <pre className="bg-muted/50 rounded p-2 text-[10px] overflow-x-auto">
                                    {JSON.stringify(atom.normalizedData, null, 2)}
                                  </pre>
                                </div>
                              ) : null}
                              {atom.provenance ? (
                                <div>
                                  <p className="text-muted-foreground text-[10px] mb-1">Provenance</p>
                                  <pre className="bg-muted/50 rounded p-2 text-[10px] overflow-x-auto">
                                    {JSON.stringify(atom.provenance, null, 2)}
                                  </pre>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="coverage" className="flex-1 m-0 mt-4 overflow-auto">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium">Evidence Coverage Report</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  {coverage ? (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        {coverage.ready ? (
                          <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Ready for PSUR
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Missing Evidence
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{coverage.totalAtoms} total atoms</span>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-medium">Coverage by PSUR Section</h4>
                        {PSUR_SECTIONS.map(section => {
                          const sectionTypes = EVIDENCE_TYPES.filter(t => t.section === section.id || t.section.includes(section.id));
                          const coveredTypes = sectionTypes.filter(t => coverage.coverageByType[t.value]?.count > 0);
                          const sectionReady = sectionTypes.length > 0 && coveredTypes.length === sectionTypes.length;
                          const hasPartial = coveredTypes.length > 0 && coveredTypes.length < sectionTypes.length;
                          
                          return (
                            <div key={section.id} className="border rounded-md p-2">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 w-6 justify-center">{section.id}</Badge>
                                  <span className="text-xs font-medium">{section.name}</span>
                                </div>
                                {sectionReady ? (
                                  <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-[9px]">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Ready
                                  </Badge>
                                ) : hasPartial ? (
                                  <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-800 dark:text-amber-200 text-[9px]">Partial</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground text-[9px]">No data</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {sectionTypes.map(t => {
                                  const data = coverage.coverageByType[t.value];
                                  const hasCoverage = data?.count > 0;
                                  return (
                                    <Badge 
                                      key={t.value} 
                                      variant={hasCoverage ? "default" : "outline"} 
                                      className={`text-[9px] ${hasCoverage ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200' : 'text-muted-foreground'}`}
                                    >
                                      {t.label.replace(' Records', '').replace(' Data', '')}
                                      {hasCoverage && ` (${data.count})`}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {coverage.missingMandatoryTypes.length > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">Missing Mandatory Evidence</p>
                          <div className="flex flex-wrap gap-1">
                            {coverage.missingMandatoryTypes.map(type => (
                              <Badge key={type} variant="outline" className="text-[10px] border-amber-300">{type}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Device Match Rate</span>
                          <span className="font-medium">{(coverage.deviceMatchRate * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                      <p className="text-sm">Loading coverage data...</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium">Period Filter</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Period Start</Label>
                      <Input 
                        type="date" 
                        value={periodStart} 
                        onChange={(e) => setPeriodStart(e.target.value)} 
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Period End</Label>
                      <Input 
                        type="date" 
                        value={periodEnd} 
                        onChange={(e) => setPeriodEnd(e.target.value)} 
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Filter by PSUR Case</Label>
                    <Select value={psurCaseId} onValueChange={setPsurCaseId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="All cases" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All cases</SelectItem>
                        {psurCases.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.psurReference}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/evidence/coverage"] })}
                  >
                    Refresh Coverage
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="uploads" className="flex-1 m-0 mt-4 overflow-auto">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Upload History ({uploads.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="p-4 space-y-2">
                    {uploads.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No uploads yet</p>
                      </div>
                    )}
                    {uploads.map((upload) => (
                      <div key={upload.id} className="border rounded-md p-3" data-testid={`upload-${upload.id}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{upload.originalFilename}</span>
                          </div>
                          {getStatusBadge(upload.status)}
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                          <div>
                            <span className="block text-foreground font-medium">{upload.evidenceType}</span>
                            Type
                          </div>
                          <div>
                            <span className="block text-foreground font-medium">{upload.atomsCreated || 0}</span>
                            Atoms Created
                          </div>
                          <div>
                            <span className="block text-foreground font-medium">{upload.recordsRejected || 0}</span>
                            Rejected
                          </div>
                          <div>
                            <span className="block text-foreground font-medium">{formatDate(upload.createdAt)}</span>
                            Uploaded
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t">
                          <p className="text-[10px] font-mono text-muted-foreground truncate">
                            SHA256: {upload.sha256Hash}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
