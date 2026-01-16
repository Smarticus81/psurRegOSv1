import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Settings,
  Database,
  FileText,
  Upload,
  Trash2,
  Plus,
  Save,
  RefreshCw,
  Check,
  FileSpreadsheet,
  FileType,
  AlertCircle,
  Cog,
  Zap,
  Edit3,
  Layers,
  Shield,
  ArrowRight
} from "lucide-react";

// Types
interface FieldMapping {
  sourceField: string;
  targetField: string;
  transformation?: string;
}

interface EvidenceTypeMapping {
  evidenceType: string;
  enabled: boolean;
  confidence: number;
  fieldMappings: FieldMapping[];
}

interface SourceConfig {
  id: string;
  name: string;
  description?: string;
  sourceType: string;
  acceptedFormats: string[];
  primaryEvidenceTypes: string[];
  secondaryEvidenceTypes?: string[];
  evidenceTypeMappings: EvidenceTypeMapping[];
  autoExtract: boolean;
  requiresReview: boolean;
}

interface EvidenceType {
  type: string;
  category: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
}

// Source type visual configs
const sourceTypeConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
  cer: { icon: FileType, color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/30" },
  sales: { icon: FileSpreadsheet, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  complaints: { icon: AlertCircle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  fsca: { icon: Zap, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
  pmcf: { icon: FileText, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  risk: { icon: Shield, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  capa: { icon: Cog, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  admin: { icon: Database, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30" },
};

const formatColors: Record<string, string> = {
  excel: "bg-emerald-500/20 text-emerald-300",
  csv: "bg-purple-500/20 text-purple-300",
  json: "bg-amber-500/20 text-amber-300",
  docx: "bg-blue-500/20 text-blue-300",
  pdf: "bg-red-500/20 text-red-300",
};

export default function AdminPage() {
  const { toast } = useToast();
  const [sourceConfigs, setSourceConfigs] = useState<SourceConfig[]>([]);
  const [evidenceTypes, setEvidenceTypes] = useState<EvidenceType[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [selectedSource, setSelectedSource] = useState<SourceConfig | null>(null);
  const [selectedType, setSelectedType] = useState<EvidenceType | null>(null);
  const [editingMapping, setEditingMapping] = useState<{ source: SourceConfig; mapping: EvidenceTypeMapping } | null>(null);
  
  // Test extraction
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testSourceType, setTestSourceType] = useState("sales");
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<any>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sourcesRes, typesRes] = await Promise.all([
        fetch("/api/ingest/sources"),
        fetch("/api/ingest/evidence-types"),
      ]);
      if (sourcesRes.ok) {
        const data = await sourcesRes.json();
        setSourceConfigs(data.sources);
      }
      if (typesRes.ok) {
        const data = await typesRes.json();
        setEvidenceTypes(data.evidenceTypes);
        setCategories(data.categories);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load configuration", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMapping = async (sourceId: string, evidenceType: string, enabled: boolean) => {
    const config = sourceConfigs.find(c => c.id === sourceId);
    if (!config) return;
    const updatedMappings = config.evidenceTypeMappings.map(m =>
      m.evidenceType === evidenceType ? { ...m, enabled } : m
    );
    const updatedConfig = { ...config, evidenceTypeMappings: updatedMappings };
    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig),
      });
      if (res.ok) {
        setSourceConfigs(configs => configs.map(c => c.id === sourceId ? updatedConfig : c));
        if (selectedSource?.id === sourceId) setSelectedSource(updatedConfig);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  };

  const handleSaveMapping = async () => {
    if (!editingMapping) return;
    const { source, mapping } = editingMapping;
    const updatedMappings = source.evidenceTypeMappings.map(m =>
      m.evidenceType === mapping.evidenceType ? mapping : m
    );
    const updatedConfig = { ...source, evidenceTypeMappings: updatedMappings };
    try {
      const res = await fetch(`/api/ingest/sources/${source.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig),
      });
      if (res.ok) {
        setSourceConfigs(configs => configs.map(c => c.id === source.id ? updatedConfig : c));
        if (selectedSource?.id === source.id) setSelectedSource(updatedConfig);
        setEditingMapping(null);
        toast({ title: "Saved", description: "Mapping updated" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  };

  const handleExtract = async () => {
    if (!testFile) return;
    setExtracting(true);
    setExtractResult(null);
    try {
      const formData = new FormData();
      formData.append("file", testFile);
      formData.append("sourceType", testSourceType);
      const res = await fetch("/api/ingest/extract", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setExtractResult(data);
        toast({ title: "Extraction Complete", description: `Found ${data.evidenceCount} evidence items` });
      } else {
        const error = await res.json();
        toast({ title: "Failed", description: error.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Extraction failed", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <RefreshCw className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
            <Settings className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Evidence Configuration</h1>
            <p className="text-xs text-slate-500">Configure source mappings and extraction rules</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="sources" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="bg-slate-900/50 border border-slate-800/50 w-fit mb-4">
          <TabsTrigger value="sources" className="text-xs data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">
            <Layers className="w-3 h-3 mr-2" /> Source Mappings
          </TabsTrigger>
          <TabsTrigger value="types" className="text-xs data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
            <Database className="w-3 h-3 mr-2" /> Evidence Types
          </TabsTrigger>
          <TabsTrigger value="test" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300">
            <Zap className="w-3 h-3 mr-2" /> Test Extraction
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden relative rounded-xl border border-slate-800/50 bg-slate-900/30 p-1">
          {/* Source Mappings Tab */}
          <TabsContent value="sources" className="h-full m-0 overflow-auto p-3">
            <div className="grid grid-cols-4 lg:grid-cols-5 gap-3">
              {sourceConfigs.map(config => {
                const visual = sourceTypeConfig[config.sourceType] || sourceTypeConfig.admin;
                const Icon = visual.icon;
                const enabledCount = config.evidenceTypeMappings.filter(m => m.enabled).length;
                return (
                  <button
                    key={config.id}
                    onClick={() => setSelectedSource(config)}
                    className={`aspect-square rounded-xl border-2 ${visual.border} ${visual.bg} p-3 flex flex-col items-center justify-center gap-2 hover:scale-[1.02] transition-all hover:shadow-lg hover:shadow-${visual.color.split("-")[1]}-500/10`}
                  >
                    <div className={`p-2.5 rounded-lg bg-slate-900/50 ${visual.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium text-slate-200">{config.name}</span>
                    <div className="flex gap-1">
                      {config.acceptedFormats.slice(0, 2).map(fmt => (
                        <span key={fmt} className={`text-[9px] px-1.5 py-0.5 rounded ${formatColors[fmt] || "bg-slate-700 text-slate-400"}`}>
                          {fmt}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Check className="w-3 h-3 text-emerald-400" />
                      {enabledCount}/{config.evidenceTypeMappings.length}
                    </div>
                  </button>
                );
              })}
            </div>
          </TabsContent>

          {/* Evidence Types Tab */}
          <TabsContent value="types" className="h-full m-0 overflow-auto p-3">
            <div className="grid grid-cols-3 gap-6">
              {categories.map(category => (
                <div key={category} className="space-y-2">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider px-1 border-b border-slate-800 pb-1">{category}</div>
                  <div className="grid gap-2">
                    {evidenceTypes.filter(t => t.category === category).map(type => (
                      <button
                        key={type.type}
                        onClick={() => setSelectedType(type)}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                      >
                        <span className="text-xs font-medium text-slate-300 group-hover:text-purple-300">
                          {type.type.replace(/_/g, " ")}
                        </span>
                        <Badge variant="outline" className="text-[9px] bg-slate-900/50 text-slate-500 border-slate-700 group-hover:border-purple-500/30">
                          {type.requiredFields.length}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Test Extraction Tab */}
          <TabsContent value="test" className="h-full m-0 p-3 flex gap-4">
            <div className="w-1/3 flex flex-col gap-4">
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 space-y-4">
                <div>
                  <Label className="text-xs text-slate-400">Source Type</Label>
                  <Select value={testSourceType} onValueChange={setTestSourceType}>
                    <SelectTrigger className="h-9 text-xs bg-slate-900 border-slate-700 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(sourceTypeConfig).map(type => (
                        <SelectItem key={type} value={type} className="text-xs">{type.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-xs text-slate-400">File</Label>
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv,.docx,.pdf,.json"
                    onChange={(e) => setTestFile(e.target.files?.[0] || null)}
                    className="h-9 text-xs bg-slate-900 border-slate-700 mt-1"
                  />
                </div>
                
                <Button
                  onClick={handleExtract}
                  disabled={!testFile || extracting}
                  className="w-full text-xs bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  {extracting ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                  {extracting ? "Extracting..." : "Extract"}
                </Button>
              </div>
            </div>

            <div className="flex-1 bg-slate-900/50 rounded-lg border border-slate-800 p-4 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <span className="text-sm font-medium text-slate-300">Extraction Results</span>
                {extractResult && <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">{extractResult.evidenceCount} items</Badge>}
              </div>
              
              {extractResult ? (
                <ScrollArea className="flex-1">
                  <div className="space-y-2 pr-2">
                    {extractResult.evidence?.map((e: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] bg-slate-900/50">{e.evidenceType}</Badge>
                            <span className="text-[10px] text-slate-500">{e.sourceName}</span>
                          </div>
                          <span className={`text-[10px] font-bold ${e.confidence >= 0.8 ? "text-emerald-400" : e.confidence >= 0.5 ? "text-amber-400" : "text-red-400"}`}>
                            {(e.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono bg-slate-950/30 p-2 rounded">
                          {JSON.stringify(e.data).slice(0, 150)}...
                        </div>
                        <div className="text-[9px] text-slate-600 mt-1">{e.extractionMethod}</div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-xs">
                  Run extraction to see results
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Source Config Modal */}
      <Dialog open={!!selectedSource} onOpenChange={() => setSelectedSource(null)}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          {selectedSource && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {(() => {
                    const visual = sourceTypeConfig[selectedSource.sourceType] || sourceTypeConfig.admin;
                    const Icon = visual.icon;
                    return (
                      <div className={`p-2 rounded-lg ${visual.bg} ${visual.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                    );
                  })()}
                  <div>
                    <DialogTitle className="text-slate-100">{selectedSource.name}</DialogTitle>
                    <p className="text-xs text-slate-500">{selectedSource.description}</p>
                  </div>
                </div>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                {/* Config Options */}
                <div className="flex items-center gap-6 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                  <div className="flex items-center gap-2">
                    <Switch checked={selectedSource.autoExtract} disabled />
                    <Label className="text-xs text-slate-400">Auto-Extract</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={selectedSource.requiresReview} disabled />
                    <Label className="text-xs text-slate-400">Requires Review</Label>
                  </div>
                  <div className="flex gap-1.5 ml-auto">
                    {selectedSource.acceptedFormats.map(fmt => (
                      <span key={fmt} className={`text-[10px] px-2 py-1 rounded ${formatColors[fmt] || "bg-slate-700 text-slate-400"}`}>
                        {fmt.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Evidence Type Mappings Grid */}
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-2">Evidence Type Mappings</div>
                  <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-auto pr-2">
                    {selectedSource.evidenceTypeMappings.map(mapping => (
                      <div
                        key={mapping.evidenceType}
                        className={`p-3 rounded-lg border transition-all ${
                          mapping.enabled 
                            ? "bg-slate-800/50 border-slate-600/50" 
                            : "bg-slate-900/50 border-slate-800/30 opacity-60"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Switch
                            checked={mapping.enabled}
                            onCheckedChange={(checked) => handleToggleMapping(selectedSource.id, mapping.evidenceType, checked)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => setEditingMapping({ source: selectedSource, mapping: { ...mapping } })}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="text-xs font-medium text-slate-200 mb-1">{mapping.evidenceType}</div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`${
                            mapping.confidence >= 0.8 ? "text-emerald-400" : 
                            mapping.confidence >= 0.6 ? "text-amber-400" : "text-red-400"
                          }`}>
                            {(mapping.confidence * 100).toFixed(0)}% confidence
                          </span>
                          <span className="text-slate-500">{mapping.fieldMappings.length} fields</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Evidence Type Modal */}
      <Dialog open={!!selectedType} onOpenChange={() => setSelectedType(null)}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-700">
          {selectedType && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-100 flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" />
                  {selectedType.type}
                </DialogTitle>
                <p className="text-xs text-slate-500">{selectedType.description}</p>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    Required Fields
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedType.requiredFields.map(field => (
                      <Badge key={field} className="text-[10px] bg-red-500/20 text-red-300 border-red-500/30">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                    Optional Fields
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedType.optionalFields.slice(0, 10).map(field => (
                      <Badge key={field} variant="outline" className="text-[10px] bg-slate-800/50 text-slate-400">
                        {field}
                      </Badge>
                    ))}
                    {selectedType.optionalFields.length > 10 && (
                      <Badge variant="outline" className="text-[10px] bg-slate-800/50 text-slate-500">
                        +{selectedType.optionalFields.length - 10} more
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Field Mapping Edit Modal (Sub-modal) */}
      <Dialog open={!!editingMapping} onOpenChange={() => setEditingMapping(null)}>
        <DialogContent className="max-w-xl bg-slate-900 border-slate-700">
          {editingMapping && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-100">Edit Field Mappings</DialogTitle>
                <p className="text-xs text-slate-500">{editingMapping.mapping.evidenceType}</p>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label className="text-xs text-slate-400">Confidence</Label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={editingMapping.mapping.confidence}
                      onChange={(e) => setEditingMapping({
                        ...editingMapping,
                        mapping: { ...editingMapping.mapping, confidence: parseFloat(e.target.value) }
                      })}
                      className="h-8 text-xs bg-slate-800 border-slate-700 mt-1"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch
                      checked={editingMapping.mapping.enabled}
                      onCheckedChange={(checked) => setEditingMapping({
                        ...editingMapping,
                        mapping: { ...editingMapping.mapping, enabled: checked }
                      })}
                    />
                    <Label className="text-xs text-slate-400">Enabled</Label>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-slate-400">Field Mappings</Label>
                  <ScrollArea className="h-[200px] mt-2">
                    <div className="space-y-2 pr-2">
                      {editingMapping.mapping.fieldMappings.map((fm, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50">
                          <Input
                            value={fm.sourceField}
                            onChange={(e) => {
                              const updated = [...editingMapping.mapping.fieldMappings];
                              updated[idx] = { ...updated[idx], sourceField: e.target.value };
                              setEditingMapping({
                                ...editingMapping,
                                mapping: { ...editingMapping.mapping, fieldMappings: updated }
                              });
                            }}
                            placeholder="Source"
                            className="h-7 text-xs bg-slate-900 border-slate-700 flex-1"
                          />
                          <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                          <Input
                            value={fm.targetField}
                            onChange={(e) => {
                              const updated = [...editingMapping.mapping.fieldMappings];
                              updated[idx] = { ...updated[idx], targetField: e.target.value };
                              setEditingMapping({
                                ...editingMapping,
                                mapping: { ...editingMapping.mapping, fieldMappings: updated }
                              });
                            }}
                            placeholder="Target"
                            className="h-7 text-xs bg-slate-900 border-slate-700 flex-1"
                          />
                          <Select
                            value={fm.transformation || "direct"}
                            onValueChange={(value) => {
                              const updated = [...editingMapping.mapping.fieldMappings];
                              updated[idx] = { ...updated[idx], transformation: value };
                              setEditingMapping({
                                ...editingMapping,
                                mapping: { ...editingMapping.mapping, fieldMappings: updated }
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 w-20 text-[10px] bg-slate-900 border-slate-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="direct">Direct</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              const updated = editingMapping.mapping.fieldMappings.filter((_, i) => i !== idx);
                              setEditingMapping({
                                ...editingMapping,
                                mapping: { ...editingMapping.mapping, fieldMappings: updated }
                              });
                            }}
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => setEditingMapping({
                      ...editingMapping,
                      mapping: {
                        ...editingMapping.mapping,
                        fieldMappings: [...editingMapping.mapping.fieldMappings, { sourceField: "", targetField: "", transformation: "direct" }]
                      }
                    })}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Field
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingMapping(null)}>Cancel</Button>
                  <Button size="sm" onClick={handleSaveMapping} className="bg-blue-600 hover:bg-blue-700">
                    <Save className="w-3 h-3 mr-1" /> Save
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
