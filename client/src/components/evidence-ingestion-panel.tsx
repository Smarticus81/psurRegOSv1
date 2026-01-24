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

interface DetectedEvidenceType {
  evidenceType: string;
  confidence: number;
  category: string;
  reasoning: string[];
  sourceLocations: { type: string; name: string; relevance: number }[];
  estimatedRecordCount: number;
  extractionRecommendation: "high_priority" | "recommended" | "optional" | "low_confidence";
}

interface DocumentAnalysisResult {
  filename: string;
  success: boolean;
  documentClassification?: {
    primaryType: string;
    secondaryTypes: string[];
    confidence: number;
    reasoning: string;
  };
  detectedEvidenceTypes: DetectedEvidenceType[];
  multiEvidenceDocument: boolean;
  structureAnalysis?: {
    tableCount: number;
    sectionCount: number;
    estimatedComplexity: string;
    dataRichAreas: string[];
  };
  recommendations?: {
    primaryExtraction: string[];
    secondaryExtraction: string[];
    manualReviewNeeded: string[];
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
  
  // Auto-detection mode
  const [autoDetectMode, setAutoDetectMode] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<DocumentAnalysisResult[]>([]);
  const [selectedTypesForExtraction, setSelectedTypesForExtraction] = useState<Map<string, Set<string>>>(new Map());
  
  // Results state
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<Map<string, ExtractedEvidence[]>>(new Map());
  
  // Review dialog
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewResult, setReviewResult] = useState<ExtractionResult | null>(null);
  const [analysisReviewOpen, setAnalysisReviewOpen] = useState(false);
  const [reviewAnalysis, setReviewAnalysis] = useState<DocumentAnalysisResult | null>(null);
  
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

  // Analyze files for automatic evidence type detection
  const analyzeFiles = async () => {
    if (files.length === 0) return;
    
    setAnalyzing(true);
    setProgress(0);
    setAnalysisResults([]);
    setSelectedTypesForExtraction(new Map());
    
    const newAnalysisResults: DocumentAnalysisResult[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(((i) / files.length) * 100);
      
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("psurCaseId", String(psurCaseId));
        formData.append("deviceCode", deviceCode);
        formData.append("periodStart", periodStart);
        formData.append("periodEnd", periodEnd);
        
        const res = await fetch("/api/ingest/analyze", {
          method: "POST",
          body: formData,
        });
        
        if (res.ok) {
          const data = await res.json();
          console.log(`[Analyze] Response for ${file.name}:`, data);
          
          // Check if the response indicates success
          if (data.success === false || data.error) {
            newAnalysisResults.push({
              filename: file.name,
              success: false,
              detectedEvidenceTypes: [],
              multiEvidenceDocument: false,
              error: data.error || data.details || "Analysis returned error",
            });
          } else {
            const result: DocumentAnalysisResult = {
              filename: file.name,
              success: true,
              documentClassification: data.documentClassification,
              detectedEvidenceTypes: data.detectedEvidenceTypes || [],
              multiEvidenceDocument: data.multiEvidenceDocument || false,
              structureAnalysis: data.structureAnalysis,
              recommendations: data.recommendations,
            };
            newAnalysisResults.push(result);
            
            console.log(`[Analyze] Detected ${result.detectedEvidenceTypes.length} evidence types for ${file.name}`);
            
            // Auto-select high-priority and recommended types
            const autoSelected = new Set(
              result.detectedEvidenceTypes
                .filter(d => d.extractionRecommendation === "high_priority" || d.extractionRecommendation === "recommended")
                .map(d => d.evidenceType)
            );
            if (autoSelected.size > 0) {
              setSelectedTypesForExtraction(prev => new Map(prev.set(file.name, autoSelected)));
            }
          }
        } else {
          const errorText = await res.text();
          console.error(`[Analyze] Error response for ${file.name}:`, errorText);
          let error;
          try {
            error = JSON.parse(errorText);
          } catch {
            error = { error: errorText || `HTTP ${res.status}` };
          }
          newAnalysisResults.push({
            filename: file.name,
            success: false,
            detectedEvidenceTypes: [],
            multiEvidenceDocument: false,
            error: error.error || error.details || `Analysis failed (${res.status})`,
          });
        }
      } catch (error: any) {
        newAnalysisResults.push({
          filename: file.name,
          success: false,
          detectedEvidenceTypes: [],
          multiEvidenceDocument: false,
          error: error?.message || "Network error",
        });
      }
    }
    
    setAnalysisResults(newAnalysisResults);
    setProgress(100);
    setAnalyzing(false);
    
    const successCount = newAnalysisResults.filter(r => r.success).length;
    const failCount = newAnalysisResults.filter(r => !r.success).length;
    const totalTypes = newAnalysisResults.reduce((sum, r) => sum + r.detectedEvidenceTypes.length, 0);
    
    if (failCount > 0) {
      const errorMessages = newAnalysisResults
        .filter(r => !r.success && r.error)
        .map(r => `${r.filename}: ${r.error}`)
        .join("; ");
      
      toast({
        title: "Analysis Completed with Errors",
        description: `${successCount}/${files.length} files analyzed successfully. Errors: ${errorMessages}`,
        variant: "destructive",
      });
    } else if (totalTypes === 0) {
      toast({
        title: "No Evidence Types Detected",
        description: `Files analyzed but no evidence types were automatically detected. Try manual mode or upload different files.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Analysis Complete",
        description: `${successCount}/${files.length} files analyzed, ${totalTypes} evidence types detected`,
      });
    }
  };

  // Extract evidence from analyzed files using selected types
  // OPTIMIZED: Single extraction per file, then filter by selected types
  const extractFromAnalysis = async () => {
    if (analysisResults.length === 0) return;
    
    setProcessing(true);
    setProgress(0);
    setResults([]);
    setSelectedEvidence(new Map());
    
    const newResults: ExtractionResult[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const analysis = analysisResults.find(a => a.filename === file.name);
      const selectedTypes = selectedTypesForExtraction.get(file.name) || new Set();
      
      if (!analysis || selectedTypes.size === 0) continue;
      
      setProgress(((i) / files.length) * 100);
      
      try {
        // OPTIMIZED: Single extraction call using the document classification type
        // CER documents extract all evidence types in one pass
        const sourceType = analysis.documentClassification?.primaryType?.toLowerCase() || "auto";
        
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sourceType", sourceType);
        
        console.log(`[Extract] Single extraction for ${file.name} with sourceType: ${sourceType}`);
        
        const res = await fetch("/api/ingest/extract", {
          method: "POST",
          body: formData,
        });
        
        if (res.ok) {
          const data = await res.json();
          
          // Filter extracted evidence to only include selected types
          const typesArray = Array.from(selectedTypes);
          const filteredEvidence = data.evidence
            .filter((e: ExtractedEvidence) => typesArray.includes(e.evidenceType))
            .map((e: ExtractedEvidence) => ({ 
              ...e, 
              selected: e.confidence >= 0.6 
            }));
          
          console.log(`[Extract] Got ${data.evidence.length} total, filtered to ${filteredEvidence.length} for selected types`);
          
          const result: ExtractionResult = {
            filename: file.name,
            success: true,
            evidenceCount: filteredEvidence.length,
            evidence: filteredEvidence,
            suggestions: data.suggestions || [],
            documentInfo: {
              type: analysis.documentClassification?.primaryType || "unknown",
              sections: analysis.structureAnalysis?.sectionCount || 0,
              tables: analysis.structureAnalysis?.tableCount || 0,
            },
          };
          newResults.push(result);
          
          // Auto-select high confidence evidence
          const selected = result.evidence.filter((e: ExtractedEvidence) => e.confidence >= 0.6);
          if (selected.length > 0) {
            setSelectedEvidence(prev => new Map(prev.set(file.name, selected)));
          }
        } else {
          const error = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          newResults.push({
            filename: file.name,
            success: false,
            evidenceCount: 0,
            evidence: [],
            suggestions: [],
            error: error.error || "Extraction failed",
          });
        }
      } catch (error: any) {
        newResults.push({
          filename: file.name,
          success: false,
          evidenceCount: 0,
          evidence: [],
          suggestions: [],
          error: error?.message || "Extraction failed",
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
      description: `${successCount} files processed, ${totalEvidence} records extracted`,
    });
  };

  // Toggle evidence type selection for a file
  const toggleTypeSelection = (filename: string, evidenceType: string) => {
    setSelectedTypesForExtraction(prev => {
      const current = prev.get(filename) || new Set();
      const newSet = new Set(current);
      if (newSet.has(evidenceType)) {
        newSet.delete(evidenceType);
      } else {
        newSet.add(evidenceType);
      }
      return new Map(prev.set(filename, newSet));
    });
  };

  // Check if an evidence type is selected for extraction
  const isTypeSelected = (filename: string, evidenceType: string): boolean => {
    return selectedTypesForExtraction.get(filename)?.has(evidenceType) || false;
  };

  // Process files (manual mode)
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
      description: `${successCount}/${files.length} files processed, ${totalEvidence} records extracted`,
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
      <div className="glass-card p-10 space-y-8">
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
          {/* Mode Toggle */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                autoDetectMode ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
              )}>
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-foreground">AI Auto-Detection</h4>
                <p className="text-xs text-muted-foreground">
                  {autoDetectMode 
                    ? "Automatically detect all data categories in your documents" 
                    : "Manually select data category before processing"}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setAutoDetectMode(!autoDetectMode);
                setAnalysisResults([]);
                setResults([]);
              }}
              className={cn(
                "relative w-14 h-8 rounded-full transition-all duration-300",
                autoDetectMode ? "bg-primary" : "bg-secondary"
              )}
            >
              <div className={cn(
                "absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-all duration-300",
                autoDetectMode ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          {/* Source Type Selector (Manual Mode) */}
          {!autoDetectMode && (
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
          )}

          {/* Auto-Detection Info Box */}
          {autoDetectMode && (
            <div className="p-6 rounded-2xl bg-primary/5 border border-primary/20 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground">Smart Document Analysis</h4>
                  <p className="text-sm text-muted-foreground">
                    Automatically analyzes your documents and identifies all relevant PMS data categories
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-primary/10">
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">12+</div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Data Types</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">CER</div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Supported</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">Auto</div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mapping</div>
                </div>
              </div>
            </div>
          )}
          
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
              <div className="w-24 h-24 rounded-[2rem] bg-white flex items-center justify-center mx-auto shadow-lg group-hover:scale-110 group-hover:-rotate-6 transition-all duration-700 border border-border/50">
                <FolderUp className={cn("w-12 h-12 transition-colors duration-500", dragActive ? "text-primary" : "text-muted-foreground/50")} />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-bold text-foreground">
                  Upload Your Data Files
                </p>
                <p className="text-muted-foreground">
                  Drag and drop files here, or{" "}
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
              <p className="text-xs text-muted-foreground/60">
                Supported formats: Excel, CSV, Word, PDF, JSON
              </p>
            </div>
          </div>
          
          {/* Selected Files */}
          {files.length > 0 && (
            <div className="space-y-6 animate-slide-up">
              <div className="flex items-center justify-between px-2">
                <span className="text-sm font-semibold text-muted-foreground">{files.length} {files.length === 1 ? "file" : "files"} selected</span>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs font-semibold text-destructive hover:scale-105 transition-all"
                >
                  Clear all
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
          
          {/* Process/Analyze Button */}
          {files.length > 0 && !analysisResults.length && (
            <button
              onClick={autoDetectMode ? analyzeFiles : processFiles}
              disabled={processing || analyzing}
              className="w-full glossy-button bg-primary text-primary-foreground py-6 text-xl font-black shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all duration-500"
            >
              {(processing || analyzing) ? (
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <div className="absolute inset-0 w-6 h-6 rounded-full border-2 border-white/20" />
                  </div>
                  <span>{analyzing ? "Analyzing documents..." : "Processing files..."} {Math.round(progress)}%</span>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Zap className="w-6 h-6" />
                  <span>{autoDetectMode ? "Analyze Documents" : "Process Files"}</span>
                </div>
              )}
            </button>
          )}
          
          {(processing || analyzing) && (
            <div className="relative h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_12px_rgba(var(--primary),0.5)]" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Analysis Results - Auto-Detect Mode */}
      {autoDetectMode && analysisResults.length > 0 && results.length === 0 && (
        <div className="glass-card p-10 space-y-10 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-2xl font-black tracking-tighter text-foreground flex items-center gap-3">
                <Zap className="w-8 h-8 text-primary" />
                Detected Evidence Types
              </h3>
              <p className="text-muted-foreground font-medium italic">
                AI has identified the following evidence types. Select which to extract.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="ios-pill bg-primary/10 text-primary font-black border-primary/20 py-2 px-4">
                {analysisResults.reduce((sum, r) => sum + r.detectedEvidenceTypes.length, 0)} TYPES DETECTED
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {analysisResults.map((analysis, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-8 rounded-[2.5rem] border transition-all duration-500",
                  analysis.success
                    ? "bg-white/40 border-border/50"
                    : "bg-destructive/5 border-destructive/20"
                )}
              >
                {/* File Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center",
                      analysis.success ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                    )}>
                      {analysis.success ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className="font-black text-lg text-foreground tracking-tight">{analysis.filename}</div>
                      {analysis.documentClassification && (
                        <div className="text-sm text-muted-foreground">
                          {analysis.documentClassification.primaryType} 
                          <span className="text-xs ml-2">
                            ({(analysis.documentClassification.confidence * 100).toFixed(0)}% confidence)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {analysis.multiEvidenceDocument && (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                      Multi-Evidence Document
                    </Badge>
                  )}
                </div>

                {analysis.error ? (
                  <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm">
                    {analysis.error}
                  </div>
                ) : analysis.detectedEvidenceTypes.length === 0 ? (
                  <div className="p-6 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                    <p className="font-bold text-amber-700">No Evidence Types Detected</p>
                    <p className="text-sm text-amber-600 mt-1">
                      The document was parsed but no evidence types could be automatically identified. 
                      Try using manual mode to specify the evidence type, or ensure the document contains recognizable data patterns.
                    </p>
                    {analysis.structureAnalysis && (
                      <div className="mt-4 text-xs text-muted-foreground">
                        Found: {analysis.structureAnalysis.tableCount} tables, {analysis.structureAnalysis.sectionCount} sections
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Detected Evidence Types Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {analysis.detectedEvidenceTypes.map((detected, i) => {
                        const isSelected = isTypeSelected(analysis.filename, detected.evidenceType);
                        return (
                          <button
                            key={i}
                            onClick={() => toggleTypeSelection(analysis.filename, detected.evidenceType)}
                            className={cn(
                              "p-4 rounded-xl border-2 text-left transition-all duration-300",
                              isSelected
                                ? "bg-primary/5 border-primary shadow-lg scale-[1.02]"
                                : "bg-white/50 border-transparent hover:border-border shadow-sm hover:shadow-md"
                            )}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-sm text-foreground">{detected.evidenceType.replace(/_/g, " ")}</span>
                              <div className={cn(
                                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                                isSelected ? "bg-primary border-primary" : "border-border hover:border-primary/50"
                              )}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge 
                                variant="secondary" 
                                className={cn(
                                  "text-[10px]",
                                  detected.confidence >= 0.8 ? "bg-emerald-500/10 text-emerald-600" :
                                  detected.confidence >= 0.5 ? "bg-amber-500/10 text-amber-600" :
                                  "bg-red-500/10 text-red-600"
                                )}
                              >
                                {(detected.confidence * 100).toFixed(0)}%
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                {detected.category}
                              </Badge>
                              {detected.estimatedRecordCount > 0 && (
                                <Badge variant="outline" className="text-[10px]">
                                  ~{detected.estimatedRecordCount} records
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground line-clamp-2">
                              {detected.reasoning[0]}
                            </div>
                            <div className="mt-2 pt-2 border-t border-border/30">
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-wider",
                                detected.extractionRecommendation === "high_priority" ? "text-emerald-600" :
                                detected.extractionRecommendation === "recommended" ? "text-primary" :
                                detected.extractionRecommendation === "optional" ? "text-amber-600" :
                                "text-muted-foreground"
                              )}>
                                {detected.extractionRecommendation.replace(/_/g, " ")}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Recommendations */}
                    {analysis.recommendations && (
                      <div className="mt-6 pt-6 border-t border-border/30 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {analysis.recommendations.primaryExtraction.length > 0 && (
                          <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2">High Priority</div>
                            <div className="text-xs text-muted-foreground">
                              {analysis.recommendations.primaryExtraction.slice(0, 2).map((r, i) => (
                                <div key={i} className="truncate">{r}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {analysis.recommendations.secondaryExtraction.length > 0 && (
                          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                            <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">Recommended</div>
                            <div className="text-xs text-muted-foreground">
                              {analysis.recommendations.secondaryExtraction.slice(0, 2).map((r, i) => (
                                <div key={i} className="truncate">{r}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {analysis.recommendations.manualReviewNeeded.length > 0 && (
                          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">Manual Review</div>
                            <div className="text-xs text-muted-foreground">
                              {analysis.recommendations.manualReviewNeeded.slice(0, 2).map((r, i) => (
                                <div key={i} className="truncate">{r}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Extract Button */}
          <button
            onClick={extractFromAnalysis}
            disabled={processing || Array.from(selectedTypesForExtraction.values()).every(s => s.size === 0)}
            className="w-full glossy-button bg-emerald-600 text-white py-8 text-2xl font-black shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all duration-500"
          >
            {processing ? (
              <div className="flex items-center gap-4 justify-center">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span>EXTRACTING... {Math.round(progress)}%</span>
              </div>
            ) : (
              <div className="flex items-center gap-4 justify-center">
                <ArrowRight className="w-8 h-8" />
                <span>EXTRACT SELECTED EVIDENCE TYPES</span>
              </div>
            )}
          </button>
        </div>
      )}
      
      {/* Results */}
      {results.length > 0 && (
        <div className="glass-card p-10 space-y-10 animate-slide-up">
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
                className="w-full glossy-button bg-emerald-600 text-white py-8 text-2xl font-black shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all duration-500"
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
        <DialogContent className="glass-card max-w-5xl max-h-[90vh] overflow-hidden p-0 border-none">
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
                  className="glossy-button bg-primary text-white py-4 px-10 shadow-md hover:scale-105 active:scale-95"
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
