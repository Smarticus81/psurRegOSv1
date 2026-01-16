import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  File,
  FileType,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Zap,
  ChevronRight,
  Eye,
  Plus,
  Trash2,
  FolderUp,
  FileCheck,
  Database,
  ArrowRight,
  Check
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ExtractedEvidence {
  evidenceType: string;
  confidence: number;
  source: string;
  sourceName: string;
  data: Record<string, unknown>;
  extractionMethod: string;
  warnings: string[];
  selected?: boolean;
}

interface ExtractionResult {
  filename: string;
  success: boolean;
  evidenceCount: number;
  evidence: ExtractedEvidence[];
  suggestions: string[];
  documentInfo?: {
    type: string;
    sections: number;
    tables: number;
  };
  error?: string;
}

interface SourceConfig {
  id: string;
  name: string;
  sourceType: string;
  acceptedFormats: string[];
  primaryEvidenceTypes: string[];
}

interface Props {
  psurCaseId: number;
  deviceCode: string;
  periodStart: string;
  periodEnd: string;
  onEvidenceCreated?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

const sourceTypeIcons: Record<string, React.ReactNode> = {
  cer: <FileType className="w-5 h-5 text-pink-500" />,
  sales: <FileSpreadsheet className="w-5 h-5 text-emerald-500" />,
  complaints: <AlertCircle className="w-5 h-5 text-amber-500" />,
  fsca: <Zap className="w-5 h-5 text-red-500" />,
  pmcf: <FileText className="w-5 h-5 text-purple-500" />,
  risk: <AlertCircle className="w-5 h-5 text-orange-500" />,
  capa: <FileCheck className="w-5 h-5 text-blue-500" />,
  admin: <Database className="w-5 h-5 text-cyan-500" />,
};

const formatIcons: Record<string, React.ReactNode> = {
  excel: <FileSpreadsheet className="w-4 h-4" />,
  json: <FileType className="w-4 h-4" />,
  docx: <FileText className="w-4 h-4" />,
  pdf: <File className="w-4 h-4" />,
  csv: <FileSpreadsheet className="w-4 h-4" />,
};

const confidenceColors: Record<string, string> = {
  high: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-red-500/20 text-red-400 border-red-500/30",
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function EvidenceIngestionPanel({ 
  psurCaseId, 
  deviceCode, 
  periodStart, 
  periodEnd,
  onEvidenceCreated 
}: Props) {
  const { toast } = useToast();
  
  // Source configs
  const [sourceConfigs, setSourceConfigs] = useState<SourceConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  
  // Upload state
  const [selectedSourceType, setSelectedSourceType] = useState<string>("sales");
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Results state
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<Map<string, ExtractedEvidence[]>>(new Map());
  
  // Review dialog
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewResult, setReviewResult] = useState<ExtractionResult | null>(null);
  
  // Creating atoms
  const [creatingAtoms, setCreatingAtoms] = useState(false);
  
  // Load source configs
  useState(() => {
    fetch("/api/ingest/sources")
      .then(res => res.json())
      .then(data => {
        setSourceConfigs(data.sources || []);
        setConfigsLoading(false);
      })
      .catch(() => setConfigsLoading(false));
  });

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Process files
  const processFiles = async () => {
    if (files.length === 0) return;
    
    setProcessing(true);
    setProgress(0);
    setResults([]);
    setSelectedEvidence(new Map());
    
    const newResults: ExtractionResult[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(((i) / files.length) * 100);
      
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sourceType", selectedSourceType);
        
        const res = await fetch("/api/ingest/extract", {
          method: "POST",
          body: formData,
        });
        
        if (res.ok) {
          const data = await res.json();
          const result: ExtractionResult = {
            filename: file.name,
            success: true,
            evidenceCount: data.evidenceCount,
            evidence: data.evidence.map((e: ExtractedEvidence) => ({ ...e, selected: e.confidence >= 0.6 })),
            suggestions: data.suggestions,
            documentInfo: data.documentInfo,
          };
          newResults.push(result);
          
          // Auto-select high confidence evidence
          const selected = result.evidence.filter(e => e.confidence >= 0.6);
          if (selected.length > 0) {
            setSelectedEvidence(prev => new Map(prev.set(file.name, selected)));
          }
        } else {
          const error = await res.json();
          newResults.push({
            filename: file.name,
            success: false,
            evidenceCount: 0,
            evidence: [],
            suggestions: [],
            error: error.error || "Processing failed",
          });
        }
      } catch (error: any) {
        newResults.push({
          filename: file.name,
          success: false,
          evidenceCount: 0,
          evidence: [],
          suggestions: [],
          error: error?.message || "Network error",
        });
      }
    }
    
    setResults(newResults);
    setProgress(100);
    setProcessing(false);
    
    const successCount = newResults.filter(r => r.success).length;
    const totalEvidence = newResults.reduce((sum, r) => sum + r.evidenceCount, 0);
    
    toast({
      title: "Processing Complete",
      description: `${successCount}/${files.length} files processed, ${totalEvidence} evidence items extracted`,
    });
  };

  // Toggle evidence selection
  const toggleEvidenceSelection = (filename: string, evidence: ExtractedEvidence) => {
    setSelectedEvidence(prev => {
      const current = prev.get(filename) || [];
      const exists = current.find(e => 
        e.evidenceType === evidence.evidenceType && 
        JSON.stringify(e.data) === JSON.stringify(evidence.data)
      );
      
      if (exists) {
        return new Map(prev.set(filename, current.filter(e => 
          !(e.evidenceType === evidence.evidenceType && 
            JSON.stringify(e.data) === JSON.stringify(evidence.data))
        )));
      } else {
        return new Map(prev.set(filename, [...current, evidence]));
      }
    });
  };

  // Check if evidence is selected
  const isEvidenceSelected = (filename: string, evidence: ExtractedEvidence): boolean => {
    const current = selectedEvidence.get(filename) || [];
    return !!current.find(e => 
      e.evidenceType === evidence.evidenceType && 
      JSON.stringify(e.data) === JSON.stringify(evidence.data)
    );
  };

  // Create atoms from selected evidence
  const createAtomsFromEvidence = async () => {
    const allSelected: { filename: string; evidence: ExtractedEvidence }[] = [];
    
    selectedEvidence.forEach((evidenceList, filename) => {
      evidenceList.forEach(evidence => {
        allSelected.push({ filename, evidence });
      });
    });
    
    if (allSelected.length === 0) {
      toast({
        title: "No Evidence Selected",
        description: "Please select at least one evidence item to create atoms",
        variant: "destructive",
      });
      return;
    }
    
    setCreatingAtoms(true);
    
    try {
      // Create evidence atoms
      const atoms = allSelected.map(({ filename, evidence }) => ({
        psur_case_id: psurCaseId,
        evidence_type: evidence.evidenceType,
        device_code: deviceCode,
        period_start: periodStart,
        period_end: periodEnd,
        normalized_data: evidence.data,
        provenance: {
          source_file: filename,
          extraction_method: evidence.extractionMethod,
          confidence: evidence.confidence,
          extracted_at: new Date().toISOString(),
        },
      }));
      
      const res = await fetch("/api/evidence/atoms/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atoms }),
      });
      
      if (res.ok) {
        const data = await res.json();
        toast({
          title: "Evidence Created",
          description: `Successfully created ${data.created} evidence atoms`,
        });
        
        // Clear state
        setFiles([]);
        setResults([]);
        setSelectedEvidence(new Map());
        
        onEvidenceCreated?.();
      } else {
        const error = await res.json();
        throw new Error(error.error || "Failed to create atoms");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create evidence atoms",
        variant: "destructive",
      });
    } finally {
      setCreatingAtoms(false);
    }
  };

  // Get confidence level
  const getConfidenceLevel = (confidence: number): string => {
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.5) return "medium";
    return "low";
  };

  // Count total selected
  const totalSelected = Array.from(selectedEvidence.values()).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="space-y-6">
      {/* Source Type Selection */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            Document Ingestion
          </CardTitle>
          <CardDescription className="text-slate-400">
            Upload documents to automatically extract evidence. The AI will identify evidence types based on content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Source Type Selector */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {sourceConfigs.map(config => (
              <button
                key={config.id}
                onClick={() => setSelectedSourceType(config.sourceType)}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  selectedSourceType === config.sourceType
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-700 hover:border-slate-600 bg-slate-800/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {sourceTypeIcons[config.sourceType] || <File className="w-4 h-4" />}
                  <span className="font-medium text-sm text-slate-200">{config.name}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {config.acceptedFormats.slice(0, 3).map(fmt => (
                    <Badge key={fmt} variant="outline" className="text-[10px] px-1 py-0">
                      {fmt}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
          
          {/* Drag and Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center transition-all
              ${dragActive 
                ? "border-blue-500 bg-blue-500/10" 
                : "border-slate-600 hover:border-slate-500 bg-slate-800/30"
              }
            `}
          >
            <FolderUp className={`w-12 h-12 mx-auto mb-4 ${dragActive ? "text-blue-400" : "text-slate-500"}`} />
            <p className="text-slate-300 mb-2">
              Drag and drop files here, or{" "}
              <label className="text-blue-400 hover:text-blue-300 cursor-pointer underline">
                browse
                <input
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv,.docx,.pdf,.json"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </p>
            <p className="text-xs text-slate-500">
              Supported: Excel, CSV, Word, PDF, JSON
            </p>
          </div>
          
          {/* Selected Files */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">{files.length} file(s) selected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiles([])}
                  className="text-slate-400 hover:text-slate-200"
                >
                  Clear All
                </Button>
              </div>
              <div className="grid gap-2 max-h-40 overflow-y-auto">
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50"
                  >
                    <div className="flex items-center gap-2">
                      {formatIcons[file.name.split('.').pop() || ""] || <File className="w-4 h-4" />}
                      <span className="text-sm text-slate-300 truncate max-w-xs">{file.name}</span>
                      <span className="text-xs text-slate-500">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(i)}
                      className="text-slate-400 hover:text-red-400"
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Process Button */}
          {files.length > 0 && (
            <Button
              onClick={processFiles}
              disabled={processing}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {processing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing... {Math.round(progress)}%
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Extract Evidence from {files.length} File(s)
                </>
              )}
            </Button>
          )}
          
          {processing && <Progress value={progress} className="h-2" />}
        </CardContent>
      </Card>
      
      {/* Results */}
      {results.length > 0 && (
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Extraction Results
              </CardTitle>
              {totalSelected > 0 && (
                <Badge className="bg-emerald-500/20 text-emerald-400">
                  {totalSelected} selected
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-4">
                {results.map((result, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${
                      result.success
                        ? "bg-slate-800/30 border-slate-700/50"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {result.success ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        <span className="font-medium text-slate-200">{result.filename}</span>
                        {result.documentInfo && (
                          <Badge variant="outline" className="text-xs">
                            {result.documentInfo.type} | {result.documentInfo.tables} tables
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={result.success ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}>
                          {result.evidenceCount} items
                        </Badge>
                        {result.success && result.evidence.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReviewResult(result);
                              setReviewOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Review
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {result.error && (
                      <p className="text-sm text-red-400">{result.error}</p>
                    )}
                    
                    {result.success && result.evidence.length > 0 && (
                      <div className="grid gap-2">
                        {result.evidence.slice(0, 5).map((ev, evIdx) => {
                          const selected = isEvidenceSelected(result.filename, ev);
                          const level = getConfidenceLevel(ev.confidence);
                          return (
                            <div
                              key={evIdx}
                              onClick={() => toggleEvidenceSelection(result.filename, ev)}
                              className={`
                                flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all
                                ${selected
                                  ? "bg-blue-500/10 border border-blue-500/30"
                                  : "bg-slate-900/50 border border-transparent hover:border-slate-600"
                                }
                              `}
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox checked={selected} />
                                <Badge variant="outline" className="text-xs">
                                  {ev.evidenceType}
                                </Badge>
                                <span className="text-xs text-slate-400">
                                  from {ev.source}: {ev.sourceName}
                                </span>
                              </div>
                              <Badge variant="outline" className={`text-xs ${confidenceColors[level]}`}>
                                {(ev.confidence * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          );
                        })}
                        {result.evidence.length > 5 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReviewResult(result);
                              setReviewOpen(true);
                            }}
                            className="w-full text-slate-400"
                          >
                            +{result.evidence.length - 5} more items
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    )}
                    
                    {result.suggestions && result.suggestions.length > 0 && (
                      <div className="mt-2 p-2 bg-amber-500/10 rounded border border-amber-500/20">
                        <p className="text-xs text-amber-400 font-medium mb-1">Suggestions:</p>
                        {result.suggestions.map((s, i) => (
                          <p key={i} className="text-xs text-amber-300/80">- {s}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            {/* Create Atoms Button */}
            {totalSelected > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <Button
                  onClick={createAtomsFromEvidence}
                  disabled={creatingAtoms}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {creatingAtoms ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Creating Atoms...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Create {totalSelected} Evidence Atoms
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-3xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              Review Extracted Evidence
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {reviewResult?.filename} - {reviewResult?.evidenceCount} items extracted
            </DialogDescription>
          </DialogHeader>
          
          {reviewResult && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3 pr-4">
                {reviewResult.evidence.map((ev, idx) => {
                  const selected = isEvidenceSelected(reviewResult.filename, ev);
                  const level = getConfidenceLevel(ev.confidence);
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border transition-all ${
                        selected
                          ? "bg-blue-500/10 border-blue-500/30"
                          : "bg-slate-800/30 border-slate-700/50"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleEvidenceSelection(reviewResult.filename, ev)}
                          />
                          <Badge className="bg-blue-500/20 text-blue-400">
                            {ev.evidenceType}
                          </Badge>
                          <Badge variant="outline" className={`${confidenceColors[level]}`}>
                            {(ev.confidence * 100).toFixed(0)}% confidence
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-400">
                          {ev.source}: {ev.sourceName}
                        </span>
                      </div>
                      
                      <p className="text-xs text-slate-500 mb-2">{ev.extractionMethod}</p>
                      
                      <pre className="text-xs text-slate-300 bg-slate-900/50 p-3 rounded overflow-x-auto max-h-32">
                        {JSON.stringify(ev.data, null, 2)}
                      </pre>
                      
                      {ev.warnings && ev.warnings.length > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-amber-400">
                          <AlertCircle className="w-3 h-3" />
                          {ev.warnings.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-700/50">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                // Select all high confidence
                if (reviewResult) {
                  const highConf = reviewResult.evidence.filter(e => e.confidence >= 0.6);
                  setSelectedEvidence(prev => new Map(prev.set(reviewResult.filename, highConf)));
                }
                setReviewOpen(false);
              }}
              className="bg-blue-600"
            >
              Select High Confidence
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
