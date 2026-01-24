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
import { cn } from "@/lib/utils";
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
  ArrowRight,
  Package,
  Building2,
  Hash,
  Globe
} from "lucide-react";

// Device types
interface Device {
  id: number;
  companyId: number;
  deviceName: string;
  deviceCode: string;
  riskClass: string;
  jurisdictions: string[];
  basicUdf?: string;
  gmdnCode?: string;
  imdrfClassification?: string;
  deviceGroup?: string;
  createdAt: string;
}

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

  // Device management
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deviceForm, setDeviceForm] = useState({
    deviceName: "",
    deviceCode: "",
    riskClass: "IIa",
    jurisdictions: ["EU_MDR"] as string[],
    basicUdf: "",
    gmdnCode: "",
    imdrfClassification: "",
    deviceGroup: "",
  });
  const [savingDevice, setSavingDevice] = useState(false);

  useEffect(() => { fetchData(); fetchDevices(); }, []);

  const fetchDevices = async () => {
    try {
      const res = await fetch("/api/devices");
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
      }
    } catch (error) {
      console.error("Failed to fetch devices:", error);
    }
  };

  const openDeviceModal = (device?: Device) => {
    if (device) {
      setEditingDevice(device);
      setDeviceForm({
        deviceName: device.deviceName,
        deviceCode: device.deviceCode,
        riskClass: device.riskClass,
        jurisdictions: device.jurisdictions || ["EU_MDR"],
        basicUdf: device.basicUdf || "",
        gmdnCode: device.gmdnCode || "",
        imdrfClassification: device.imdrfClassification || "",
        deviceGroup: device.deviceGroup || "",
      });
    } else {
      setEditingDevice(null);
      setDeviceForm({
        deviceName: "",
        deviceCode: "",
        riskClass: "IIa",
        jurisdictions: ["EU_MDR"],
        basicUdf: "",
        gmdnCode: "",
        imdrfClassification: "",
        deviceGroup: "",
      });
    }
    setDeviceModalOpen(true);
  };

  const saveDevice = async () => {
    if (!deviceForm.deviceName.trim() || !deviceForm.deviceCode.trim()) {
      toast({ title: "Error", description: "Device name and code are required", variant: "destructive" });
      return;
    }
    setSavingDevice(true);
    try {
      const payload = { ...deviceForm, companyId: 1 }; // Default company
      const url = editingDevice ? `/api/devices/${editingDevice.id}` : "/api/devices";
      const method = editingDevice ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast({ title: "Success", description: editingDevice ? "Device updated" : "Device created" });
        setDeviceModalOpen(false);
        fetchDevices();
      } else {
        const err = await res.json();
        toast({ title: "Error", description: err.error || "Failed to save device", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save device", variant: "destructive" });
    } finally {
      setSavingDevice(false);
    }
  };

  const deleteDevice = async (id: number) => {
    if (!confirm("Delete this device? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Deleted", description: "Device removed" });
        fetchDevices();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete device", variant: "destructive" });
    }
  };

  const toggleJurisdiction = (j: string) => {
    setDeviceForm(prev => ({
      ...prev,
      jurisdictions: prev.jurisdictions.includes(j)
        ? prev.jurisdictions.filter(x => x !== j)
        : [...prev.jurisdictions, j],
    }));
  };

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
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background/30" data-testid="admin-page">
      <div className="flex-1 overflow-y-auto px-6 py-8 scroll-smooth">
        <div className="max-w-[1400px] mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Configuration
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm">
              Manage your device registry, data source mappings, and import settings.
            </p>
          </div>

          <Tabs defaultValue="devices" className="space-y-6">
            <div className="flex justify-center sticky top-0 z-10 py-2 bg-background/50 backdrop-blur-md rounded-xl">
              <TabsList className="bg-muted p-1 rounded-xl border border-border shadow-sm">
                <TabsTrigger value="devices" className="rounded-lg px-8 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm font-semibold text-xs uppercase tracking-wider transition-all">Device Registry</TabsTrigger>
                <TabsTrigger value="sources" className="rounded-lg px-8 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm font-semibold text-xs uppercase tracking-wider transition-all">Sources</TabsTrigger>
                <TabsTrigger value="types" className="rounded-lg px-8 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm font-semibold text-xs uppercase tracking-wider transition-all">Data Types</TabsTrigger>
                <TabsTrigger value="test" className="rounded-lg px-8 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm font-semibold text-xs uppercase tracking-wider transition-all">Test Extraction</TabsTrigger>
              </TabsList>
            </div>

            {/* DEVICES TAB */}
            <TabsContent value="devices" className="mt-0 focus-visible:outline-none">
              <div className="glass-card p-10 space-y-10">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black tracking-tighter text-foreground">Device Registry</h3>
                    <p className="text-muted-foreground font-medium">Manage your medical device portfolio for PSUR reporting.</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={fetchDevices} className="w-12 h-12 rounded-full flex items-center justify-center bg-secondary hover:bg-white hover:text-primary transition-all active:rotate-180">
                      <RefreshCw className="w-5 h-5" />
                    </button>
                    <button onClick={() => openDeviceModal()} className="glossy-button bg-primary text-white px-6 py-3 font-bold flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Add Device
                    </button>
                  </div>
                </div>

                {devices.length === 0 ? (
                  <div className="text-center py-20 space-y-4">
                    <Package className="w-16 h-16 mx-auto text-muted-foreground/30" />
                    <div className="space-y-2">
                      <p className="text-lg font-bold text-foreground">No devices registered</p>
                      <p className="text-muted-foreground">Add your first medical device to get started with PSUR reporting.</p>
                    </div>
                    <button onClick={() => openDeviceModal()} className="glossy-button bg-primary text-white px-6 py-3 font-bold">
                      <Plus className="w-4 h-4 mr-2" /> Register Device
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {devices.map(device => (
                      <div key={device.id} className="glass-card p-6 space-y-4 hover:shadow-lg transition-all group">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                              <Package className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="font-bold text-foreground">{device.deviceName}</h4>
                              <p className="text-xs text-muted-foreground font-mono">{device.deviceCode}</p>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openDeviceModal(device)} className="p-2 rounded-lg hover:bg-secondary">
                              <Edit3 className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button onClick={() => deleteDevice(device.id)} className="p-2 rounded-lg hover:bg-destructive/10">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className={cn(
                            "ios-pill text-[10px] font-black border-none",
                            device.riskClass === "III" ? "bg-red-500/20 text-red-600" :
                              device.riskClass === "IIb" ? "bg-orange-500/20 text-orange-600" :
                                device.riskClass === "IIa" ? "bg-amber-500/20 text-amber-600" :
                                  "bg-emerald-500/20 text-emerald-600"
                          )}>
                            {device.riskClass}
                          </span>
                          {device.jurisdictions?.map(j => (
                            <span key={j} className="ios-pill text-[10px] font-bold bg-secondary text-muted-foreground border-none">
                              {j.replace("_", " ")}
                            </span>
                          ))}
                        </div>

                        {(device.gmdnCode || device.basicUdf) && (
                          <div className="pt-3 border-t border-border/50 space-y-1">
                            {device.gmdnCode && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">GMDN:</span>
                                <span className="font-mono text-foreground">{device.gmdnCode}</span>
                              </div>
                            )}
                            {device.basicUdf && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">UDI:</span>
                                <span className="font-mono text-foreground truncate">{device.basicUdf}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="sources" className="mt-0 focus-visible:outline-none">
              <div className="glass-card p-10 space-y-10">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-bold text-foreground">Data Sources</h3>
                    <p className="text-muted-foreground">Configure how different types of data files are processed.</p>
                  </div>
                  <button onClick={fetchData} className="w-12 h-12 rounded-full flex items-center justify-center bg-secondary hover:bg-white hover:text-primary transition-all active:rotate-180">
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {sourceConfigs.map(config => {
                    const visual = sourceTypeConfig[config.sourceType] || sourceTypeConfig.admin;
                    const Icon = visual.icon;
                    const enabledCount = config.evidenceTypeMappings.filter(m => m.enabled).length;
                    return (
                      <button
                        key={config.id}
                        onClick={() => setSelectedSource(config)}
                        className={cn(
                          "p-8 rounded-[2.5rem] border-2 transition-all duration-500 text-center flex flex-col items-center justify-center gap-6 group hover:scale-105 active:scale-95",
                          visual.bg, visual.border, "shadow-sm hover:shadow-xl"
                        )}
                      >
                        <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm transition-transform duration-500 group-hover:rotate-12 bg-white", visual.color)}>
                          <Icon className="w-8 h-8" />
                        </div>
                        <div className="space-y-2">
                          <span className="text-lg font-black tracking-tight text-foreground">{config.name}</span>
                          <div className="flex gap-1.5 justify-center">
                            {config.acceptedFormats.slice(0, 2).map(fmt => (
                              <span key={fmt} className={cn("ios-pill text-[8px] font-black uppercase border-none px-2 py-0.5", formatColors[fmt] || "bg-muted text-muted-foreground")}>
                                {fmt}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="ios-pill bg-white text-[10px] font-black tracking-widest border-none px-4 py-1 shadow-sm">
                          {enabledCount} / {config.evidenceTypeMappings.length} MAPPED
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="types" className="mt-0 focus-visible:outline-none">
              <div className="glass-card p-10 space-y-10">
                <div className="space-y-2 text-center">
                  <h3 className="text-2xl font-bold text-foreground">Data Categories</h3>
                  <p className="text-muted-foreground">All supported surveillance data types and their required fields.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {categories.map(category => (
                    <div key={category} className="space-y-6">
                      <div className="flex items-center gap-3 px-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{category}</h4>
                      </div>
                      <div className="grid gap-3">
                        {evidenceTypes.filter(t => t.category === category).map(type => (
                          <button
                            key={type.type}
                            onClick={() => setSelectedType(type)}
                            className="flex items-center justify-between p-5 rounded-2xl bg-white border border-border/50 hover:border-primary/30 hover:shadow-lg transition-all group"
                          >
                            <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                              {type.type.replace(/_/g, " ").toUpperCase()}
                            </span>
                            <span className="ios-pill bg-secondary text-muted-foreground text-[10px] font-bold border-none px-2 py-0.5">
                              {type.requiredFields.length} fields
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="test" className="mt-0 focus-visible:outline-none">
              <div className="glass-card p-10 space-y-10 shadow-2xl animate-slide-up">
                <div className="space-y-2 text-center">
                  <h3 className="text-2xl font-bold text-foreground">Test Import</h3>
                  <p className="text-muted-foreground">Test how your data files will be processed before adding them to a report.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                  <div className="lg:col-span-1 space-y-8">
                    <div className="glass-card p-8 bg-white/50 border border-border/50 space-y-8">
                      <div className="space-y-4">
                        <Label className="text-xs font-semibold text-muted-foreground">Data Type</Label>
                        <Select value={testSourceType} onValueChange={setTestSourceType}>
                          <SelectTrigger className="h-14 rounded-2xl bg-white border-border/50 font-bold text-lg shadow-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-none shadow-lg">
                            {Object.keys(sourceTypeConfig).map(type => (
                              <SelectItem key={type} value={type} className="font-bold">{type.toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-xs font-semibold text-muted-foreground">Test File</Label>
                        <div className="relative group">
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv,.docx,.pdf,.json"
                            onChange={(e) => setTestFile(e.target.files?.[0] || null)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <div className="p-8 rounded-2xl border-2 border-dashed border-border/50 group-hover:border-primary/50 transition-all flex flex-col items-center justify-center text-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Upload className="w-6 h-6" /></div>
                            <div className="font-bold text-xs truncate max-w-full px-2">{testFile ? testFile.name : "Select File"}</div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleExtract}
                        disabled={!testFile || extracting}
                        className="w-full glossy-button bg-primary text-white py-5 text-lg font-bold shadow-md disabled:opacity-50"
                      >
                        {extracting ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <Zap className="w-5 h-5 mr-2" />}
                        {extracting ? "Processing..." : "Test Import"}
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-2 glass-card p-8 bg-black/[0.02] border-none shadow-inner flex flex-col min-h-[500px]">
                    <div className="flex items-center justify-between mb-8">
                      <span className="text-sm font-semibold text-foreground flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        Results
                      </span>
                      {extractResult && <div className="ios-pill bg-emerald-500 text-white font-bold border-none px-4 py-1">{extractResult.evidenceCount} records found</div>}
                    </div>

                    {extractResult ? (
                      <ScrollArea className="flex-1">
                        <div className="space-y-4 pr-4">
                          {extractResult.evidence?.map((e: any, i: number) => (
                            <div key={i} className="glass-card p-6 bg-white border border-border/50 hover:border-primary/30 transition-all space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="ios-pill bg-primary/10 text-primary font-bold text-[9px] border-none">{e.evidenceType.replace(/_/g, " ").toUpperCase()}</span>
                                  <span className="text-[10px] font-semibold text-muted-foreground">{e.sourceName}</span>
                                </div>
                                <div className={cn(
                                  "text-sm font-bold",
                                  e.confidence >= 0.8 ? "text-emerald-600" : e.confidence >= 0.5 ? "text-amber-600" : "text-destructive"
                                )}>
                                  {(e.confidence * 100).toFixed(0)}% confidence
                                </div>
                              </div>
                              <div className="p-4 rounded-xl bg-secondary/30 font-mono text-[10px] text-foreground/70 leading-relaxed overflow-x-auto">
                                {JSON.stringify(e.data, null, 2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/30 gap-4">
                        <Database className="w-20 h-20 opacity-10" />
                        <span className="text-sm">Upload a file to test import</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Source Config Modal */}
      <Dialog open={!!selectedSource} onOpenChange={() => setSelectedSource(null)}>
        <DialogContent className="max-w-2xl bg-card border-border">
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
                    <DialogTitle className="text-foreground">{selectedSource.name}</DialogTitle>
                    <p className="text-xs text-muted-foreground">{selectedSource.description}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Config Options */}
                <div className="flex items-center gap-6 p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="flex items-center gap-2">
                    <Switch checked={selectedSource.autoExtract} disabled />
                    <Label className="text-xs text-muted-foreground">Auto-Extract</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={selectedSource.requiresReview} disabled />
                    <Label className="text-xs text-muted-foreground">Requires Review</Label>
                  </div>
                  <div className="flex gap-1.5 ml-auto">
                    {selectedSource.acceptedFormats.map(fmt => (
                      <span key={fmt} className={`text-[10px] px-2 py-1 rounded ${formatColors[fmt] || "bg-muted text-muted-foreground"}`}>
                        {fmt.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Evidence Type Mappings Grid */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Evidence Type Mappings</div>
                  <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-auto pr-2">
                    {selectedSource.evidenceTypeMappings.map(mapping => (
                      <div
                        key={mapping.evidenceType}
                        className={`p-3 rounded-lg border transition-all ${mapping.enabled
                          ? "bg-secondary/50 border-border/50"
                          : "bg-muted/50 border-border/30 opacity-60"
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
                        <div className="text-xs font-medium text-foreground mb-1">{mapping.evidenceType}</div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`${mapping.confidence >= 0.8 ? "text-emerald-400" :
                            mapping.confidence >= 0.6 ? "text-amber-400" : "text-red-400"
                            }`}>
                            {(mapping.confidence * 100).toFixed(0)}% confidence
                          </span>
                          <span className="text-muted-foreground">{mapping.fieldMappings.length} fields</span>
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
        <DialogContent className="max-w-md bg-card border-border">
          {selectedType && (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" />
                  {selectedType.type}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">{selectedType.description}</p>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
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
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>
                    Optional Fields
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedType.optionalFields.slice(0, 10).map(field => (
                      <Badge key={field} variant="outline" className="text-[10px] bg-secondary/50 text-muted-foreground">
                        {field}
                      </Badge>
                    ))}
                    {selectedType.optionalFields.length > 10 && (
                      <Badge variant="outline" className="text-[10px] bg-secondary/50 text-muted-foreground">
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
        <DialogContent className="max-w-xl bg-card border-border">
          {editingMapping && (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground">Edit Field Mappings</DialogTitle>
                <p className="text-xs text-muted-foreground">{editingMapping.mapping.evidenceType}</p>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Confidence</Label>
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
                      className="h-8 text-xs bg-secondary border-border mt-1"
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
                    <Label className="text-xs text-muted-foreground">Enabled</Label>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Field Mappings</Label>
                  <ScrollArea className="h-[200px] mt-2">
                    <div className="space-y-2 pr-2">
                      {editingMapping.mapping.fieldMappings.map((fm, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
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
                            className="h-7 text-xs bg-background border-border flex-1"
                          />
                          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
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
                            className="h-7 text-xs bg-background border-border flex-1"
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
                            <SelectTrigger className="h-7 w-20 text-[10px] bg-background border-border">
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
                  <Button size="sm" onClick={handleSaveMapping} className="bg-primary hover:bg-primary/90">
                    <Save className="w-3 h-3 mr-1" /> Save
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Device Modal */}
      <Dialog open={deviceModalOpen} onOpenChange={setDeviceModalOpen}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              {editingDevice ? "Edit Device" : "Register New Device"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editingDevice ? "Update device information" : "Add a medical device to your registry for PSUR reporting"}
            </p>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Device Name & Code */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Device Name *</Label>
                <Input
                  value={deviceForm.deviceName}
                  onChange={(e) => {
                    setDeviceForm(prev => ({
                      ...prev,
                      deviceName: e.target.value,
                      // Auto-generate code if not manually set
                      deviceCode: prev.deviceCode || e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12)
                    }));
                  }}
                  placeholder="e.g., CardioSync Pacemaker"
                  className="h-11 bg-secondary/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product Code *</Label>
                <Input
                  value={deviceForm.deviceCode}
                  onChange={(e) => setDeviceForm(prev => ({ ...prev, deviceCode: e.target.value.toUpperCase() }))}
                  placeholder="e.g., CS-PM-100"
                  className="h-11 bg-secondary/50 border-border font-mono"
                />
              </div>
            </div>

            {/* Risk Class & Jurisdictions */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk Class *</Label>
                <Select value={deviceForm.riskClass} onValueChange={(v) => setDeviceForm(prev => ({ ...prev, riskClass: v }))}>
                  <SelectTrigger className="h-11 bg-secondary/50 border-border">
                    <SelectValue />
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
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Jurisdictions</Label>
                <div className="flex gap-2">
                  {["EU_MDR", "UK_MDR"].map(j => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => toggleJurisdiction(j)}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-xs font-bold transition-all",
                        deviceForm.jurisdictions.includes(j)
                          ? "bg-primary text-white"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      )}
                    >
                      {j.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Regulatory Identifiers */}
            <div className="space-y-3 pt-2 border-t border-border/50">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Regulatory Identifiers (Optional)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">UDI-DI</span>
                  <Input
                    value={deviceForm.basicUdf}
                    onChange={(e) => setDeviceForm(prev => ({ ...prev, basicUdf: e.target.value }))}
                    placeholder="00850003..."
                    className="h-9 bg-secondary/50 border-border text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">GMDN Code</span>
                  <Input
                    value={deviceForm.gmdnCode}
                    onChange={(e) => setDeviceForm(prev => ({ ...prev, gmdnCode: e.target.value }))}
                    placeholder="35421"
                    className="h-9 bg-secondary/50 border-border text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">IMDRF Classification</span>
                  <Input
                    value={deviceForm.imdrfClassification}
                    onChange={(e) => setDeviceForm(prev => ({ ...prev, imdrfClassification: e.target.value }))}
                    placeholder="e.g., cardiovascular-implant"
                    className="h-9 bg-secondary/50 border-border text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Device Group</span>
                  <Input
                    value={deviceForm.deviceGroup}
                    onChange={(e) => setDeviceForm(prev => ({ ...prev, deviceGroup: e.target.value }))}
                    placeholder="e.g., Cardiac Rhythm Management"
                    className="h-9 bg-secondary/50 border-border text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setDeviceModalOpen(false)}>Cancel</Button>
              <Button onClick={saveDevice} disabled={savingDevice} className="bg-primary hover:bg-primary/90 px-6">
                {savingDevice ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {editingDevice ? "Update Device" : "Register Device"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}
