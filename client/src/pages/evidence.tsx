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
} from "lucide-react";
import type { Device, EvidenceUpload, EvidenceAtom, PSURCase } from "@shared/schema";

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

const EVIDENCE_TYPES = [
  { value: "sales_volume", label: "Sales Volume", description: "Unit sales and distribution data" },
  { value: "complaint_record", label: "Complaint Records", description: "Customer complaints and investigations" },
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

  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: psurCases = [] } = useQuery<PSURCase[]>({ queryKey: ["/api/psur-cases"] });
  const { data: uploads = [] } = useQuery<EvidenceUpload[]>({ queryKey: ["/api/evidence/uploads"] });
  const { data: evidenceData } = useQuery<EvidenceListResponse>({ queryKey: ["/api/evidence"] });
  const { data: coverage } = useQuery<EvidenceCoverage>({ 
    queryKey: ["/api/evidence/coverage", psurCaseId, periodStart, periodEnd],
    enabled: true,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
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
      if (sourceSystem) formData.append("source_system", sourceSystem);
      if (extractionNotes) formData.append("extraction_notes", extractionNotes);
      if (periodStart) formData.append("period_start", periodStart);
      if (periodEnd) formData.append("period_end", periodEnd);

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

      setSelectedFile(null);
      setEvidenceType("");
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
                  <CardTitle className="text-sm font-medium">Upload Evidence File</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Evidence Type *</Label>
                    <Select value={evidenceType} onValueChange={setEvidenceType}>
                      <SelectTrigger className="h-9" data-testid="select-evidence-type">
                        <SelectValue placeholder="Select evidence type" />
                      </SelectTrigger>
                      <SelectContent>
                        {EVIDENCE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex flex-col">
                              <span>{type.label}</span>
                              <span className="text-[10px] text-muted-foreground">{type.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">File (CSV) *</Label>
                    <div className="border-2 border-dashed rounded-md p-4 text-center">
                      <input
                        type="file"
                        accept=".csv"
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
                            <p className="text-sm text-muted-foreground">Click to select CSV file</p>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
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

                  <Button 
                    className="w-full" 
                    onClick={handleUpload} 
                    disabled={isUploading || !selectedFile || !evidenceType}
                    data-testid="button-upload"
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {isUploading ? "Processing..." : "Upload & Parse"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium">Expected CSV Formats</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
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
                              {atom.normalizedData && (
                                <div>
                                  <p className="text-muted-foreground text-[10px] mb-1">Normalized Data</p>
                                  <pre className="bg-muted/50 rounded p-2 text-[10px] overflow-x-auto">
                                    {JSON.stringify(atom.normalizedData as Record<string, unknown>, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {atom.provenance && (
                                <div>
                                  <p className="text-muted-foreground text-[10px] mb-1">Provenance</p>
                                  <pre className="bg-muted/50 rounded p-2 text-[10px] overflow-x-auto">
                                    {JSON.stringify(atom.provenance as Record<string, unknown>, null, 2)}
                                  </pre>
                                </div>
                              )}
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

                      <div className="space-y-2">
                        <h4 className="text-xs font-medium">Coverage by Type</h4>
                        {Object.entries(coverage.coverageByType).map(([type, data]) => (
                          <div key={type} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                            <div className="flex items-center gap-2">
                              {data.count > 0 ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                              )}
                              <span className="text-xs font-medium">{type}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px]">{data.count} atoms</Badge>
                              {data.inPeriod > 0 && (
                                <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30">{data.inPeriod} in-period</Badge>
                              )}
                            </div>
                          </div>
                        ))}
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
