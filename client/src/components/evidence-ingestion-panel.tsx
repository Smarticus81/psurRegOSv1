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
import { cn } from "@/lib/utils";
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
  Check,
  Loader2
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
        description: "Please select at least one evidence item to import",
        variant: "destructive",
      });
      return;
    }
    
    setCreatingAtoms(true);
    
    try {
      // Create evidence records
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
          title: "Records Imported",
          description: `Successfully imported ${data.created} evidence records`,
        });
        
        // Clear state
        setFiles([]);
        setResults([]);
        setSelectedEvidence(new Map());
        
        onEvidenceCreated?.();
      } else {
        const error = await res.json();
        throw new Error(error.error || "Failed to import records");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to import evidence records",
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
    <div className="space-y-12 animate-slide-up">
      {/* Source Type Selection */}
      <div className="glass-card p-10 space-y-8 shadow-2xl">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
              <Database className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-black tracking-tighter text-foreground">Document Ingestion</h2>
          </div>
          <p className="text-lg text-muted-foreground font-medium">
            Deploy neural extraction models across your regulatory dossiers.
          </p>
        </div>

        <div className="space-y-8">
          {/* Source Type Selector */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sourceConfigs.map(config => (
              <button
                key={config.id}
                onClick={() => setSelectedSourceType(config.sourceType)}
                className={cn(
                  "p-6 rounded-[2rem] border-2 transition-all duration-500 text-left group hover:scale-105 active:scale-95",
                  selectedSourceType === config.sourceType
                    ? "border-primary bg-primary/5 shadow-xl shadow-primary/10"
                    : "border-border/50 bg-white/50 hover:bg-white"
                )}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-all duration-500",
                    selectedSourceType === config.sourceType ? "bg-primary text-white scale-110" : "bg-secondary text-muted-foreground"
                  )}>
                    {sourceTypeIcons[config.sourceType] || <File className="w-5 h-5" />}
                  </div>
                  <span className={cn(
                    "font-black text-sm uppercase tracking-wider transition-colors",
                    selectedSourceType === config.sourceType ? "text-primary" : "text-muted-foreground"
                  )}>{config.name}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {config.acceptedFormats.slice(0, 3).map(fmt => (
                    <span key={fmt} className="ios-pill text-[9px] font-black uppercase border-none bg-muted/50 text-muted-foreground">
                      {fmt}
                    </span>
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
            className={cn(
              "relative border-2 border-dashed rounded-[3rem] p-16 text-center transition-all duration-700 group cursor-pointer overflow-hidden",
              dragActive 
                ? "border-primary bg-primary/5 shadow-inner scale-[0.99]" 
                : "border-border hover:border-primary/30 bg-secondary/20 hover:bg-white/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <div className="relative space-y-6">
              <div className="w-24 h-24 rounded-[2rem] bg-white flex items-center justify-center mx-auto shadow-2xl group-hover:scale-110 group-hover:-rotate-6 transition-all duration-700 border border-border/50">
                <FolderUp className={cn("w-12 h-12 transition-colors duration-500", dragActive ? "text-primary" : "text-muted-foreground/50")} />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black tracking-tighter text-foreground">
                  Deploy Intelligence Files
                </p>
                <p className="text-muted-foreground font-medium">
                  Drag and drop artifacts here, or{" "}
                  <label className="text-primary hover:text-primary/80 cursor-pointer underline decoration-2 underline-offset-4 transition-colors">
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
              </div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                SUPPORTED ARCHITECTURES: EXCEL, CSV, DOCX, PDF, JSON
              </p>
            </div>
          </div>
          
          {/* Selected Files */}
          {files.length > 0 && (
            <div className="space-y-6 animate-slide-up">
              <div className="flex items-center justify-between px-2">
                <span className="text-sm font-black uppercase tracking-widest text-muted-foreground">{files.length} BUNDLES STAGED</span>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs font-black text-destructive hover:scale-105 transition-all uppercase tracking-widest"
                >
                  ABORT ALL
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-5 glass-card border-border/50 hover:border-primary/30 transition-all bg-white/40"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground shadow-sm">
                        {formatIcons[file.name.split('.').pop() || ""] || <File className="w-5 h-5" />}
                      </div>
                      <div className="space-y-0.5">
                        <div className="font-bold text-sm text-foreground truncate max-w-[200px]">{file.name}</div>
                        <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(i)}
                      className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all active:scale-90"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Process Button */}
          {files.length > 0 && (
            <button
              onClick={processFiles}
              disabled={processing}
              className="w-full glossy-button bg-primary text-primary-foreground py-6 text-xl font-black shadow-2xl hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all duration-500"
            >
              {processing ? (
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <div className="absolute inset-0 w-6 h-6 rounded-full border-2 border-white/20" />
                  </div>
                  <span>EXTRACTING INTELLIGENCE... {Math.round(progress)}%</span>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Zap className="w-6 h-6" />
                  <span>INITIALIZE NEURAL EXTRACTION</span>
                </div>
              )}
            </button>
          )}
          
          {processing && (
            <div className="relative h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_12px_rgba(var(--primary),0.5)]" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Results */}
      {results.length > 0 && (
        <div className="glass-card p-10 space-y-10 shadow-2xl animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-2xl font-black tracking-tighter text-foreground flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                Extraction Payloads
              </h3>
              <p className="text-muted-foreground font-medium italic">Verify and confirm extracted data records.</p>
            </div>
            {totalSelected > 0 && (
              <div className="ios-pill bg-emerald-500 text-white font-black border-none py-3 px-6 shadow-lg shadow-emerald-500/20">
                {totalSelected} RECORDS SELECTED
              </div>
            )}
          </div>

          <div className="space-y-6">
            {results.map((result, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-8 rounded-[2.5rem] border transition-all duration-500",
                  result.success
                    ? "bg-white/40 border-border/50 hover:border-primary/30"
                    : "bg-destructive/5 border-destructive/20"
                )}
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-500 hover:rotate-6",
                      result.success ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
                    )}>
                      {result.success ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className="font-black text-lg text-foreground tracking-tight">{result.filename}</div>
                      {result.documentInfo && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            {result.documentInfo.type} • {result.documentInfo.tables} TABLES IDENTIFIED
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="ios-pill bg-secondary/50 text-foreground font-black border-none">
                      {result.evidenceCount} ITEMS EXTRACTED
                    </div>
                    {result.success && result.evidence.length > 0 && (
                      <button
                        onClick={() => {
                          setReviewResult(result);
                          setReviewOpen(true);
                        }}
                        className="w-12 h-12 rounded-full flex items-center justify-center bg-white hover:bg-primary hover:text-white transition-all shadow-sm group active:scale-90"
                      >
                        <Eye className="w-6 h-6 transition-transform group-hover:scale-110" />
                      </button>
                    )}
                  </div>
                </div>
                
                {result.error && (
                  <div className="ios-pill bg-destructive/10 text-destructive border-destructive/20 py-4 px-6 font-bold text-center">
                    EXTRACTION FAILURE: {result.error.toUpperCase()}
                  </div>
                )}
                
                {result.success && result.evidence.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.evidence.slice(0, 4).map((ev, evIdx) => {
                      const selected = isEvidenceSelected(result.filename, ev);
                      const level = getConfidenceLevel(ev.confidence);
                      return (
                        <div
                          key={evIdx}
                          onClick={() => toggleEvidenceSelection(result.filename, ev)}
                          className={cn(
                            "flex items-center justify-between p-5 rounded-2xl cursor-pointer transition-all duration-300 group hover:-translate-y-1",
                            selected
                              ? "bg-primary/5 border-2 border-primary shadow-lg scale-[1.02]"
                              : "bg-white/50 border-2 border-transparent hover:border-border shadow-sm hover:shadow-md"
                          )}
                        >
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                              selected ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                            )}>
                              {selected && <Check className="w-4 h-4 text-white" />}
                            </div>
                            <div className="space-y-1">
                              <div className="font-black text-xs uppercase tracking-widest text-foreground">{ev.evidenceType.replace(/_/g, ' ')}</div>
                              <div className="text-[10px] font-medium text-muted-foreground truncate max-w-[150px]">
                                FROM {ev.sourceName.toUpperCase()}
                              </div>
                            </div>
                          </div>
                          <div className={cn(
                            "ios-pill text-[10px] font-black border-none",
                            confidenceColors[level]
                          )}>
                            {(ev.confidence * 100).toFixed(0)}% TRUST
                          </div>
                        </div>
                      );
                    })}
                    {result.evidence.length > 4 && (
                      <button
                        onClick={() => {
                          setReviewResult(result);
                          setReviewOpen(true);
                        }}
                        className="flex items-center justify-center gap-3 p-5 rounded-2xl border-2 border-dashed border-border/50 hover:border-primary/50 hover:text-primary transition-all font-black text-xs uppercase tracking-widest bg-white/20"
                      >
                        <span>VIEW ALL {result.evidence.length} ITEMS</span>
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                )}
                
                {result.suggestions && result.suggestions.length > 0 && (
                  <div className="mt-8 p-6 bg-amber-500/[0.03] rounded-3xl border border-amber-500/20 space-y-3">
                    <div className="flex items-center gap-2 text-amber-600 font-black text-[10px] uppercase tracking-widest">
                      <Zap className="w-4 h-4" />
                      Intelligence Suggestions
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {result.suggestions.map((s, i) => (
                        <div key={i} className="text-xs text-amber-700/80 font-medium flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-amber-400" />
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Import Records Button */}
          {totalSelected > 0 && (
            <div className="pt-10 border-t border-border/50">
              <button
                onClick={createAtomsFromEvidence}
                disabled={creatingAtoms}
                className="w-full glossy-button bg-emerald-600 text-white py-8 text-2xl font-black shadow-2xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all duration-500"
              >
                {creatingAtoms ? (
                  <div className="flex items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span>IMPORTING RECORDS...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <CheckCircle2 className="w-8 h-8" />
                    <span>IMPORT {totalSelected} RECORDS</span>
                  </div>
                )}
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="glass-card max-w-5xl max-h-[90vh] overflow-hidden p-0 border-none shadow-2xl">
          <div className="flex flex-col h-full bg-white/80 backdrop-blur-3xl">
            <div className="px-10 py-8 border-b border-border/10 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-3xl font-black tracking-tighter text-foreground italic">
                  Payload Review
                </h3>
                <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px]">
                  {reviewResult?.filename} — EXTRACTION ARCHIVE
                </p>
              </div>
              <button onClick={() => setReviewOpen(false)} className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-black/5 transition-all active:scale-90">
                <XCircle className="w-6 h-6 text-muted-foreground" />
              </button>
            </div>
            
            <ScrollArea className="flex-1 px-10 py-8">
              <div className="space-y-6 pb-10">
                {reviewResult?.evidence.map((ev, idx) => {
                  const selected = isEvidenceSelected(reviewResult.filename, ev);
                  const level = getConfidenceLevel(ev.confidence);
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "p-8 rounded-[2rem] border-2 transition-all duration-500",
                        selected
                          ? "bg-primary/[0.02] border-primary shadow-xl scale-[1.01]"
                          : "bg-white/50 border-border/50 hover:border-primary/20"
                      )}
                    >
                      <div className="flex items-start justify-between mb-8">
                        <div className="flex items-center gap-6">
                          <button 
                            onClick={() => toggleEvidenceSelection(reviewResult.filename, ev)}
                            className={cn(
                              "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500",
                              selected ? "bg-primary border-primary shadow-lg" : "border-border hover:border-primary/50"
                            )}
                          >
                            {selected && <Check className="w-5 h-5 text-white" />}
                          </button>
                          <div className="space-y-1">
                            <div className="font-black text-xl tracking-tighter text-foreground">{ev.evidenceType.replace(/_/g, ' ').toUpperCase()}</div>
                            <div className="text-[10px] font-black text-primary uppercase tracking-widest">
                              TRUST SCORE: {(ev.confidence * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                        <div className="ios-pill bg-secondary text-muted-foreground border-none font-black text-[10px] tracking-widest">
                          {ev.source.toUpperCase()} SOURCE
                        </div>
                      </div>
                      
                      <div className="glass-card bg-black/5 border-none p-8 rounded-3xl overflow-hidden group relative">
                        <div className="absolute top-4 right-6 text-[10px] font-black text-muted-foreground/30 uppercase tracking-widest italic group-hover:text-primary/30 transition-colors">Neural_JSON_Snapshot</div>
                        <pre className="text-xs font-mono text-foreground/80 leading-relaxed max-h-60 overflow-y-auto custom-scrollbar">
                          {JSON.stringify(ev.data, null, 2)}
                        </pre>
                      </div>
                      
                      {ev.warnings && ev.warnings.length > 0 && (
                        <div className="mt-6 flex items-center gap-3 text-[10px] font-black text-amber-600 uppercase tracking-widest">
                          <AlertCircle className="w-4 h-4" />
                          <span>AI WARNINGS: {ev.warnings.join(" | ")}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            <div className="px-10 py-8 bg-secondary/30 border-t border-border/10 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Selected Payload</span>
                <span className="text-2xl font-black text-foreground tracking-tighter">
                  {(selectedEvidence.get(reviewResult?.filename || '') || []).length} / {reviewResult?.evidenceCount} ITEMS
                </span>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setReviewOpen(false)}
                  className="ios-pill px-8 py-4 font-black tracking-widest hover:bg-white transition-all active:scale-95"
                >
                  CLOSE
                </button>
                <button
                  onClick={() => {
                    if (reviewResult) {
                      const highConf = reviewResult.evidence.filter(e => e.confidence >= 0.6);
                      setSelectedEvidence(prev => new Map(prev.set(reviewResult.filename, highConf)));
                    }
                    setReviewOpen(false);
                  }}
                  className="glossy-button bg-primary text-white py-4 px-10 shadow-xl hover:scale-105 active:scale-95"
                >
                  CERTIFY ALL HIGH-TRUST
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
