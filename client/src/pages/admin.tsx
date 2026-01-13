import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Settings,
  Database,
  FileText,
  Upload,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Save,
  RefreshCw,
  Check,
  X,
  FileSpreadsheet,
  FileType,
  File,
  AlertCircle,
  Cog,
  LayoutGrid,
  List,
  Eye,
  Edit3,
  Copy,
  Zap
} from "lucide-react";

// Types
interface FieldMapping {
  sourceField: string;
  targetField: string;
  transformation?: string;
  defaultValue?: unknown;
}

interface EvidenceTypeMapping {
  evidenceType: string;
  enabled: boolean;
  confidence: number;
  fieldMappings: FieldMapping[];
  validationRules?: string[];
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
  createdAt?: string;
  updatedAt?: string;
}

interface EvidenceType {
  type: string;
  category: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
}

// Icon mapping for source types
const sourceTypeIcons: Record<string, React.ReactNode> = {
  sales: <FileSpreadsheet className="w-5 h-5 text-emerald-500" />,
  complaints: <AlertCircle className="w-5 h-5 text-amber-500" />,
  fsca: <Zap className="w-5 h-5 text-red-500" />,
  capa: <Cog className="w-5 h-5 text-blue-500" />,
  pmcf: <FileText className="w-5 h-5 text-purple-500" />,
  literature: <File className="w-5 h-5 text-indigo-500" />,
  external_db: <Database className="w-5 h-5 text-cyan-500" />,
  risk: <AlertCircle className="w-5 h-5 text-orange-500" />,
  cer: <FileType className="w-5 h-5 text-pink-500" />,
};

// Format badge colors
const formatBadgeColors: Record<string, string> = {
  excel: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  json: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  docx: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  pdf: "bg-red-500/20 text-red-400 border-red-500/30",
  csv: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export default function AdminPage() {
  const { toast } = useToast();
  const [sourceConfigs, setSourceConfigs] = useState<SourceConfig[]>([]);
  const [evidenceTypes, setEvidenceTypes] = useState<EvidenceType[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConfig, setSelectedConfig] = useState<SourceConfig | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<EvidenceTypeMapping | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

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
      console.error("Failed to fetch data:", error);
      toast({
        title: "Error",
        description: "Failed to load configuration data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetToDefaults = async () => {
    try {
      const res = await fetch("/api/ingest/sources/reset", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSourceConfigs(data.sources);
        toast({
          title: "Reset Complete",
          description: "Source configurations reset to defaults",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reset configurations",
        variant: "destructive",
      });
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
        setSourceConfigs(configs =>
          configs.map(c => (c.id === sourceId ? updatedConfig : c))
        );
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update mapping",
        variant: "destructive",
      });
    }
  };

  const handleToggleAutoExtract = async (sourceId: string, autoExtract: boolean) => {
    const config = sourceConfigs.find(c => c.id === sourceId);
    if (!config) return;

    const updatedConfig = { ...config, autoExtract };

    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig),
      });

      if (res.ok) {
        setSourceConfigs(configs =>
          configs.map(c => (c.id === sourceId ? updatedConfig : c))
        );
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update configuration",
        variant: "destructive",
      });
    }
  };

  const handleToggleRequiresReview = async (sourceId: string, requiresReview: boolean) => {
    const config = sourceConfigs.find(c => c.id === sourceId);
    if (!config) return;

    const updatedConfig = { ...config, requiresReview };

    try {
      const res = await fetch(`/api/ingest/sources/${sourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig),
      });

      if (res.ok) {
        setSourceConfigs(configs =>
          configs.map(c => (c.id === sourceId ? updatedConfig : c))
        );
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update configuration",
        variant: "destructive",
      });
    }
  };

  const toggleSourceExpanded = (sourceId: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  const openEditDialog = (sourceId: string, mapping: EvidenceTypeMapping) => {
    setEditingSourceId(sourceId);
    setEditingMapping({ ...mapping });
    setEditDialogOpen(true);
  };

  const handleSaveMapping = async () => {
    if (!editingSourceId || !editingMapping) return;

    const config = sourceConfigs.find(c => c.id === editingSourceId);
    if (!config) return;

    const updatedMappings = config.evidenceTypeMappings.map(m =>
      m.evidenceType === editingMapping.evidenceType ? editingMapping : m
    );

    const updatedConfig = { ...config, evidenceTypeMappings: updatedMappings };

    try {
      const res = await fetch(`/api/ingest/sources/${editingSourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig),
      });

      if (res.ok) {
        setSourceConfigs(configs =>
          configs.map(c => (c.id === editingSourceId ? updatedConfig : c))
        );
        setEditDialogOpen(false);
        toast({
          title: "Saved",
          description: "Mapping configuration updated",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save mapping",
        variant: "destructive",
      });
    }
  };

  const renderSourceCard = (config: SourceConfig) => {
    const isExpanded = expandedSources.has(config.id);
    const enabledMappings = config.evidenceTypeMappings.filter(m => m.enabled).length;
    const totalMappings = config.evidenceTypeMappings.length;

    return (
      <Card key={config.id} className="bg-slate-900/60 border-slate-700/50 overflow-hidden">
        <Collapsible open={isExpanded} onOpenChange={() => toggleSourceExpanded(config.id)}>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3 cursor-pointer hover:bg-slate-800/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {sourceTypeIcons[config.sourceType] || <File className="w-5 h-5 text-slate-400" />}
                  <div className="text-left">
                    <CardTitle className="text-lg font-semibold text-slate-100">
                      {config.name}
                    </CardTitle>
                    {config.description && (
                      <CardDescription className="text-slate-400 text-sm mt-0.5">
                        {config.description}
                      </CardDescription>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-1.5">
                    {config.acceptedFormats.map(fmt => (
                      <Badge
                        key={fmt}
                        variant="outline"
                        className={`text-xs ${formatBadgeColors[fmt] || "bg-slate-500/20 text-slate-400"}`}
                      >
                        {fmt.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                  <Badge variant="outline" className="bg-slate-800/50 text-slate-300 border-slate-600">
                    {enabledMappings}/{totalMappings} types
                  </Badge>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0">
              <Separator className="mb-4 bg-slate-700/50" />

              {/* Config Options */}
              <div className="flex items-center gap-6 mb-4 p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={config.autoExtract}
                    onCheckedChange={(checked) => handleToggleAutoExtract(config.id, checked)}
                  />
                  <Label className="text-sm text-slate-300">Auto-Extract</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={config.requiresReview}
                    onCheckedChange={(checked) => handleToggleRequiresReview(config.id, checked)}
                  />
                  <Label className="text-sm text-slate-300">Requires Review</Label>
                </div>
              </div>

              {/* Primary Evidence Types */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                  Primary Evidence Types
                </h4>
                <div className="flex flex-wrap gap-2">
                  {config.primaryEvidenceTypes.map(type => (
                    <Badge key={type} className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Secondary Evidence Types */}
              {config.secondaryEvidenceTypes && config.secondaryEvidenceTypes.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-blue-500" />
                    Secondary Evidence Types
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {config.secondaryEvidenceTypes.map(type => (
                      <Badge key={type} variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence Type Mappings */}
              <div className="mt-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  Evidence Type Mappings
                </h4>
                <div className="space-y-2">
                  {config.evidenceTypeMappings.map(mapping => {
                    const typeInfo = evidenceTypes.find(t => t.type === mapping.evidenceType);
                    return (
                      <div
                        key={mapping.evidenceType}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                          mapping.enabled
                            ? "bg-slate-800/50 border-slate-600/50"
                            : "bg-slate-900/50 border-slate-700/30 opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={mapping.enabled}
                            onCheckedChange={(checked) =>
                              handleToggleMapping(config.id, mapping.evidenceType, checked)
                            }
                          />
                          <div>
                            <p className="text-sm font-medium text-slate-200">
                              {mapping.evidenceType}
                            </p>
                            {typeInfo && (
                              <p className="text-xs text-slate-400">{typeInfo.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              mapping.confidence >= 0.8
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                : mapping.confidence >= 0.6
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                : "bg-red-500/20 text-red-400 border-red-500/30"
                            }`}
                          >
                            {(mapping.confidence * 100).toFixed(0)}% confidence
                          </Badge>
                          <Badge variant="outline" className="text-xs bg-slate-700/50 text-slate-400">
                            {mapping.fieldMappings.length} fields
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(config.id, mapping)}
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="text-lg">Loading configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                <Cog className="w-7 h-7 text-blue-500" />
                Evidence Configuration
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Configure evidence source mappings and extraction rules
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  className={viewMode === "grid" ? "bg-slate-700" : ""}
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={viewMode === "list" ? "bg-slate-700" : ""}
                  onClick={() => setViewMode("list")}
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={handleResetToDefaults}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <Tabs defaultValue="sources" className="space-y-6">
          <TabsList className="bg-slate-800/50 border border-slate-700/50">
            <TabsTrigger value="sources" className="data-[state=active]:bg-slate-700">
              <Database className="w-4 h-4 mr-2" />
              Source Mappings
            </TabsTrigger>
            <TabsTrigger value="types" className="data-[state=active]:bg-slate-700">
              <FileText className="w-4 h-4 mr-2" />
              Evidence Types
            </TabsTrigger>
            <TabsTrigger value="test" className="data-[state=active]:bg-slate-700">
              <Upload className="w-4 h-4 mr-2" />
              Test Extraction
            </TabsTrigger>
          </TabsList>

          {/* Source Mappings Tab */}
          <TabsContent value="sources" className="space-y-4">
            <div className="grid gap-4">
              {sourceConfigs.map(config => renderSourceCard(config))}
            </div>
          </TabsContent>

          {/* Evidence Types Tab */}
          <TabsContent value="types">
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-100">Evidence Types Reference</CardTitle>
                <CardDescription className="text-slate-400">
                  All available evidence types that can be extracted from documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {categories.map(category => (
                    <div key={category}>
                      <h3 className="text-lg font-semibold text-slate-200 mb-3">{category}</h3>
                      <div className="grid gap-2">
                        {evidenceTypes
                          .filter(t => t.category === category)
                          .map(type => (
                            <div
                              key={type.type}
                              className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-slate-200">{type.type}</p>
                                  <p className="text-sm text-slate-400 mt-0.5">{type.description}</p>
                                </div>
                                <Badge variant="outline" className="bg-slate-700/50 text-slate-300 text-xs">
                                  {type.requiredFields.length} required
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {type.requiredFields.map(field => (
                                  <Badge
                                    key={field}
                                    className="text-xs bg-red-500/20 text-red-400 border-red-500/30"
                                  >
                                    {field}*
                                  </Badge>
                                ))}
                                {type.optionalFields.slice(0, 5).map(field => (
                                  <Badge
                                    key={field}
                                    variant="outline"
                                    className="text-xs bg-slate-700/30 text-slate-400"
                                  >
                                    {field}
                                  </Badge>
                                ))}
                                {type.optionalFields.length > 5 && (
                                  <Badge variant="outline" className="text-xs bg-slate-700/30 text-slate-400">
                                    +{type.optionalFields.length - 5} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Test Extraction Tab */}
          <TabsContent value="test">
            <TestExtractionPanel />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Mapping Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Edit Field Mappings</DialogTitle>
            <DialogDescription className="text-slate-400">
              Configure how source fields map to evidence type fields
            </DialogDescription>
          </DialogHeader>

          {editingMapping && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-slate-300">Evidence Type</Label>
                  <p className="text-lg font-medium text-slate-100">{editingMapping.evidenceType}</p>
                </div>
                <div>
                  <Label className="text-slate-300">Confidence</Label>
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={editingMapping.confidence}
                    onChange={(e) =>
                      setEditingMapping({
                        ...editingMapping,
                        confidence: parseFloat(e.target.value),
                      })
                    }
                    className="w-24 bg-slate-800 border-slate-700"
                  />
                </div>
              </div>

              <Separator className="bg-slate-700" />

              <div>
                <Label className="text-slate-300 mb-2 block">Field Mappings</Label>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {editingMapping.fieldMappings.map((fm, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg"
                    >
                      <Input
                        value={fm.sourceField}
                        onChange={(e) => {
                          const updated = [...editingMapping.fieldMappings];
                          updated[idx] = { ...updated[idx], sourceField: e.target.value };
                          setEditingMapping({ ...editingMapping, fieldMappings: updated });
                        }}
                        placeholder="Source field"
                        className="flex-1 bg-slate-900 border-slate-700 text-sm"
                      />
                      <span className="text-slate-500">-&gt;</span>
                      <Input
                        value={fm.targetField}
                        onChange={(e) => {
                          const updated = [...editingMapping.fieldMappings];
                          updated[idx] = { ...updated[idx], targetField: e.target.value };
                          setEditingMapping({ ...editingMapping, fieldMappings: updated });
                        }}
                        placeholder="Target field"
                        className="flex-1 bg-slate-900 border-slate-700 text-sm"
                      />
                      <Select
                        value={fm.transformation || "direct"}
                        onValueChange={(value) => {
                          const updated = [...editingMapping.fieldMappings];
                          updated[idx] = { ...updated[idx], transformation: value };
                          setEditingMapping({ ...editingMapping, fieldMappings: updated });
                        }}
                      >
                        <SelectTrigger className="w-28 bg-slate-900 border-slate-700 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value="direct">Direct</SelectItem>
                          <SelectItem value="uppercase">Uppercase</SelectItem>
                          <SelectItem value="lowercase">Lowercase</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = editingMapping.fieldMappings.filter((_, i) => i !== idx);
                          setEditingMapping({ ...editingMapping, fieldMappings: updated });
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setEditingMapping({
                      ...editingMapping,
                      fieldMappings: [
                        ...editingMapping.fieldMappings,
                        { sourceField: "", targetField: "", transformation: "direct" },
                      ],
                    });
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Field Mapping
                </Button>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveMapping}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Test Extraction Panel Component
function TestExtractionPanel() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState("sales");
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleExtract = async () => {
    if (!file) return;

    setExtracting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceType", sourceType);

      const res = await fetch("/api/ingest/extract", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        toast({
          title: "Extraction Complete",
          description: `Extracted ${data.evidenceCount} evidence items`,
        });
      } else {
        const error = await res.json();
        toast({
          title: "Extraction Failed",
          description: error.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to extract evidence",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-slate-100">Test Evidence Extraction</CardTitle>
        <CardDescription className="text-slate-400">
          Upload a document to test evidence extraction with current configuration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-slate-300">Source Type</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="complaints">Complaints</SelectItem>
                <SelectItem value="fsca">FSCA</SelectItem>
                <SelectItem value="capa">CAPA</SelectItem>
                <SelectItem value="pmcf">PMCF</SelectItem>
                <SelectItem value="literature">Literature</SelectItem>
                <SelectItem value="external_db">External DB</SelectItem>
                <SelectItem value="risk">Risk</SelectItem>
                <SelectItem value="cer">CER</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-slate-300">Upload Document</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv,.docx,.pdf,.json"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="bg-slate-800 border-slate-700 mt-1"
            />
          </div>
        </div>

        <Button
          onClick={handleExtract}
          disabled={!file || extracting}
          className="w-full"
        >
          {extracting ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Extracting...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Extract Evidence
            </>
          )}
        </Button>

        {result && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm text-slate-400">Document</p>
                <p className="text-slate-200">{result.filename}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Processing Time</p>
                <p className="text-slate-200">{result.processingTime}ms</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Evidence Found</p>
                <p className="text-2xl font-bold text-emerald-400">{result.evidenceCount}</p>
              </div>
            </div>

            {result.suggestions?.length > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="font-medium text-amber-400 mb-1">Suggestions</p>
                <ul className="text-sm text-amber-300/80 space-y-1">
                  {result.suggestions.map((s: string, i: number) => (
                    <li key={i}>- {s}</li>
                  ))}
                </ul>
              </div>
            )}

            <ScrollArea className="h-96">
              <div className="space-y-2">
                {result.evidence?.map((e: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        {e.evidenceType}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`${
                          e.confidence >= 0.8
                            ? "bg-emerald-500/20 text-emerald-400"
                            : e.confidence >= 0.5
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {(e.confidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">
                      {e.source}: {e.sourceName} | {e.extractionMethod}
                    </p>
                    <pre className="text-xs text-slate-300 bg-slate-900/50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(e.data, null, 2)}
                    </pre>
                    {e.warnings?.length > 0 && (
                      <div className="mt-2 text-xs text-amber-400">
                        {e.warnings.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
