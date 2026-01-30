import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileBox,
  Plus,
  Save,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  Building,
  Stethoscope,
  Shield,
  FileText,
  History,
  TrendingUp,
  ChevronRight,
  Edit,
  Loader2,
  Upload,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Types
interface DeviceDossier {
  id: number;
  deviceCode: string;
  deviceId?: number;
  basicUdiDi?: string;
  tradeName: string;
  manufacturerName?: string;
  classification?: {
    class: "I" | "IIa" | "IIb" | "III";
    rule: string;
    rationale: string;
  };
  variants?: Array<{
    variantId: string;
    name: string;
    udiDi?: string;
    description?: string;
  }>;
  accessories?: string[];
  software?: {
    version: string;
    significantChanges: string[];
    isSaMD: boolean;
  };
  marketEntryDate?: string;
  cumulativeExposure?: {
    patientYears?: number;
    unitsDistributed?: number;
    asOfDate: string;
  };
  completenessScore: number;
  lastValidatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface FullDossier {
  core: DeviceDossier;
  clinicalContext: any;
  riskContext: any;
  clinicalEvidence: any;
  regulatoryHistory: any;
  priorPsurs: any[];
  baselines: any[];
}

export default function DeviceDossiersPage() {
  const queryClient = useQueryClient();
  const [selectedDeviceCode, setSelectedDeviceCode] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("identity");
  const validatedOnceRef = useRef<Set<string>>(new Set());

  // Fetch all dossiers
  const { data: dossiers, isLoading: dossiersLoading } = useQuery<DeviceDossier[]>({
    queryKey: ["/api/device-dossiers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/device-dossiers");
      return res.json();
    },
  });

  // Fetch selected dossier details
  const { data: fullDossier, isLoading: dossierLoading } = useQuery<FullDossier>({
    queryKey: ["/api/device-dossiers", selectedDeviceCode],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/device-dossiers/${selectedDeviceCode}`);
      return res.json();
    },
    enabled: !!selectedDeviceCode,
  });

  // Create dossier mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<DeviceDossier>) => {
      const res = await apiRequest("POST", "/api/device-dossiers", data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers"] });
      setIsCreateDialogOpen(false);
      // Auto-calc completeness immediately after creation so the list is correct
      const dc = (variables as any)?.deviceCode;
      if (dc) {
        updateCompletenessMutation.mutate(dc);
      }
    },
  });

  // Update dossier mutation
  const updateMutation = useMutation({
    mutationFn: async ({ deviceCode, data }: { deviceCode: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/device-dossiers/${deviceCode}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers", selectedDeviceCode] });
      // Always refresh completeness after a manual save
      updateCompletenessMutation.mutate((variables as any).deviceCode);
    },
  });

  // Update clinical context mutation
  const updateClinicalMutation = useMutation({
    mutationFn: async ({ deviceCode, data }: { deviceCode: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/device-dossiers/${deviceCode}/clinical-context`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers", selectedDeviceCode] });
      updateCompletenessMutation.mutate((variables as any).deviceCode);
    },
  });

  // Update risk context mutation
  const updateRiskMutation = useMutation({
    mutationFn: async ({ deviceCode, data }: { deviceCode: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/device-dossiers/${deviceCode}/risk-context`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers", selectedDeviceCode] });
      updateCompletenessMutation.mutate((variables as any).deviceCode);
    },
  });

  // Update clinical evidence mutation
  const updateClinicalEvidenceMutation = useMutation({
    mutationFn: async ({ deviceCode, data }: { deviceCode: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/device-dossiers/${deviceCode}/clinical-evidence`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers", selectedDeviceCode] });
      updateCompletenessMutation.mutate((variables as any).deviceCode);
    },
  });

  // Update regulatory history mutation
  const updateRegulatoryHistoryMutation = useMutation({
    mutationFn: async ({ deviceCode, data }: { deviceCode: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/device-dossiers/${deviceCode}/regulatory-history`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers", selectedDeviceCode] });
      updateCompletenessMutation.mutate((variables as any).deviceCode);
    },
  });

  // Update completeness score
  const updateCompletenessMutation = useMutation({
    mutationFn: async (deviceCode: string) => {
      const res = await apiRequest("POST", `/api/device-dossiers/${deviceCode}/completeness`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers", selectedDeviceCode] });
    },
  });

  // Auto-initialize completeness once per dossier selection (covers dossiers created before this change)
  useEffect(() => {
    if (!fullDossier?.core?.deviceCode) return;
    const dc = fullDossier.core.deviceCode;
    if (validatedOnceRef.current.has(dc)) return;

    // If never validated, compute once automatically
    if (!fullDossier.core.lastValidatedAt) {
      validatedOnceRef.current.add(dc);
      updateCompletenessMutation.mutate(dc);
    }
  }, [fullDossier?.core?.deviceCode, fullDossier?.core?.lastValidatedAt]);

  const getCompletenessColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-100";
    if (score >= 50) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Device Dossiers</h1>
          <p className="text-muted-foreground mt-1">
            Manage device-specific context for generating non-generic PSUR content
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Dossier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Device Dossier</DialogTitle>
              <DialogDescription>
                Enter the basic device information to create a new dossier.
              </DialogDescription>
            </DialogHeader>
            <CreateDossierForm
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Dossier List Sidebar */}
        <div className="col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Devices</CardTitle>
              <CardDescription>
                {dossiers?.length || 0} dossiers configured
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {dossiersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : dossiers?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileBox className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No dossiers yet</p>
                    <p className="text-sm">Create one to get started</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {dossiers?.map((dossier) => (
                      <button
                        key={dossier.deviceCode}
                        onClick={() => setSelectedDeviceCode(dossier.deviceCode)}
                        className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                          selectedDeviceCode === dossier.deviceCode ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{dossier.tradeName}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {dossier.deviceCode}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={getCompletenessColor(dossier.completenessScore)}
                            >
                              {dossier.completenessScore}%
                            </Badge>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Dossier Details */}
        <div className="col-span-9">
          {!selectedDeviceCode ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FileBox className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">Select a Device</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Choose a device from the list to view and edit its dossier context, 
                  or create a new dossier to get started.
                </p>
              </CardContent>
            </Card>
          ) : dossierLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : fullDossier ? (
            <DossierEditor
              dossier={fullDossier}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onUpdateCore={(data) =>
                updateMutation.mutate({ deviceCode: fullDossier.core.deviceCode, data })
              }
              onUpdateClinical={(data) =>
                updateClinicalMutation.mutate({ deviceCode: fullDossier.core.deviceCode, data })
              }
              onUpdateRisk={(data) =>
                updateRiskMutation.mutate({ deviceCode: fullDossier.core.deviceCode, data })
              }
              onUpdateClinicalEvidence={(data) =>
                updateClinicalEvidenceMutation.mutate({ deviceCode: fullDossier.core.deviceCode, data })
              }
              onUpdateRegulatoryHistory={(data) =>
                updateRegulatoryHistoryMutation.mutate({ deviceCode: fullDossier.core.deviceCode, data })
              }
              onRefreshCompleteness={() =>
                updateCompletenessMutation.mutate(fullDossier.core.deviceCode)
              }
              isUpdating={
                updateMutation.isPending ||
                updateClinicalMutation.isPending ||
                updateRiskMutation.isPending ||
                updateClinicalEvidenceMutation.isPending ||
                updateRegulatoryHistoryMutation.isPending ||
                updateCompletenessMutation.isPending
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Create Dossier Form
function CreateDossierForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    deviceCode: "",
    tradeName: "",
    manufacturerName: "",
    basicUdiDi: "",
    classification: {
      class: "IIa" as "I" | "IIa" | "IIb" | "III",
      rule: "",
      rationale: "",
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="deviceCode">Device Code *</Label>
          <Input
            id="deviceCode"
            value={formData.deviceCode}
            onChange={(e) => setFormData({ ...formData, deviceCode: e.target.value })}
            placeholder="e.g., CM-PRO-001"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tradeName">Trade Name *</Label>
          <Input
            id="tradeName"
            value={formData.tradeName}
            onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
            placeholder="e.g., CardioMonitor Pro"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="manufacturerName">Manufacturer</Label>
          <Input
            id="manufacturerName"
            value={formData.manufacturerName}
            onChange={(e) => setFormData({ ...formData, manufacturerName: e.target.value })}
            placeholder="e.g., MedTech Inc."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="basicUdiDi">Basic UDI-DI</Label>
          <Input
            id="basicUdiDi"
            value={formData.basicUdiDi}
            onChange={(e) => setFormData({ ...formData, basicUdiDi: e.target.value })}
            placeholder="e.g., 123456789012345"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Classification Class</Label>
          <Select
            value={formData.classification.class}
            onValueChange={(v) =>
              setFormData({
                ...formData,
                classification: { ...formData.classification, class: v as any },
              })
            }
          >
            <SelectTrigger>
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
          <Label htmlFor="rule">Classification Rule</Label>
          <Input
            id="rule"
            value={formData.classification.rule}
            onChange={(e) =>
              setFormData({
                ...formData,
                classification: { ...formData.classification, rule: e.target.value },
              })
            }
            placeholder="e.g., Rule 11"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Create Dossier
        </Button>
      </DialogFooter>
    </form>
  );
}

// Dossier Editor Component
function DossierEditor({
  dossier,
  activeTab,
  onTabChange,
  onUpdateCore,
  onUpdateClinical,
  onUpdateRisk,
  onUpdateClinicalEvidence,
  onUpdateRegulatoryHistory,
  onRefreshCompleteness,
  isUpdating,
}: {
  dossier: FullDossier;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onUpdateCore: (data: any) => void;
  onUpdateClinical: (data: any) => void;
  onUpdateRisk: (data: any) => void;
  onUpdateClinicalEvidence: (data: any) => void;
  onUpdateRegulatoryHistory: (data: any) => void;
  onRefreshCompleteness: () => void;
  isUpdating: boolean;
}) {
  const queryClient = useQueryClient();
  const [autoFiles, setAutoFiles] = useState<File[]>([]);
  const [autoOverwrite, setAutoOverwrite] = useState(false);
  const [autoResultOpen, setAutoResultOpen] = useState(false);
  const [autoResult, setAutoResult] = useState<any>(null);
  const autoFileInputRef = useRef<HTMLInputElement | null>(null);

  const autoPopulateMutation = useMutation({
    mutationFn: async ({ files, overwrite }: { files: File[]; overwrite: boolean }) => {
      const formData = new FormData();
      for (const f of files) formData.append("files", f);
      formData.append("overwrite", overwrite ? "true" : "false");

      const res = await fetch(`/api/device-dossiers/${dossier.core.deviceCode}/auto-populate`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to auto-populate dossier");
      }
      return json;
    },
    onSuccess: (data) => {
      setAutoResult(data);
      setAutoResultOpen(true);
      setAutoFiles([]);
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/device-dossiers", dossier.core.deviceCode] });
    },
  });

  const getCompletenessColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">{dossier.core.tradeName}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <span>{dossier.core.deviceCode}</span>
              {dossier.core.classification && (
                <>
                  <span>-</span>
                  <Badge variant="outline">Class {dossier.core.classification.class}</Badge>
                </>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Completeness</p>
              <p className={`text-2xl font-bold ${getCompletenessColor(dossier.core.completenessScore)}`}>
                {dossier.core.completenessScore}%
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshCompleteness}
              disabled={isUpdating}
            >
              <RefreshCw className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Auto-populate from documents */}
        <div className="mt-6 p-4 rounded-lg border bg-muted/20">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Auto-populate dossier from documents
              </p>
              <p className="text-sm text-muted-foreground">
                Upload CER / IFU / RMF / certificates and auto-fill dossier fields. Anything missing can be completed manually.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="overwrite"
                  checked={autoOverwrite}
                  onCheckedChange={(v) => setAutoOverwrite(v === true)}
                  disabled={autoPopulateMutation.isPending || isUpdating}
                />
                <Label htmlFor="overwrite" className="text-sm">
                  Overwrite existing
                </Label>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => autoPopulateMutation.mutate({ files: autoFiles, overwrite: autoOverwrite })}
                disabled={autoFiles.length === 0 || autoPopulateMutation.isPending || isUpdating}
              >
                {autoPopulateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Extract & Populate
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={autoFileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xls,.csv,.json"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                if (files.length) setAutoFiles((prev) => [...prev, ...files]);
                e.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={autoPopulateMutation.isPending || isUpdating}
              onClick={() => autoFileInputRef.current?.click()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add documents
            </Button>

            {autoFiles.length > 0 && (
              <>
                <div className="text-sm text-muted-foreground">
                  {autoFiles.length} file{autoFiles.length === 1 ? "" : "s"} selected
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAutoFiles([])}
                  disabled={autoPopulateMutation.isPending || isUpdating}
                >
                  Clear
                </Button>
              </>
            )}
          </div>

          {autoFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              {autoFiles.slice(0, 6).map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="flex items-center justify-between gap-3">
                  <div className="text-sm truncate">{f.name}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAutoFiles((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={autoPopulateMutation.isPending || isUpdating}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {autoFiles.length > 6 && (
                <div className="text-xs text-muted-foreground">+{autoFiles.length - 6} more</div>
              )}
            </div>
          )}

          {autoPopulateMutation.isError && (
            <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm">
              {String((autoPopulateMutation.error as any)?.message || "Auto-populate failed")}
            </div>
          )}
        </div>

        <Dialog open={autoResultOpen} onOpenChange={setAutoResultOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Auto-populate results</DialogTitle>
              <DialogDescription>
                Extraction output applied to dossier. Review what was filled and any missing items.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {autoResult?.files?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Processed files</p>
                  <div className="space-y-1">
                    {autoResult.files.map((f: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{f.filename}</span>
                        {f.success ? (
                          <Badge variant="secondary">{f.evidenceCount} items</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {autoResult?.applyResult && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Applied updates</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>Core</span>
                      <Badge variant={autoResult.applyResult.applied?.core ? "default" : "secondary"}>
                        {autoResult.applyResult.applied?.core ? "Updated" : "No change"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Clinical Context</span>
                      <Badge variant={autoResult.applyResult.applied?.clinicalContext ? "default" : "secondary"}>
                        {autoResult.applyResult.applied?.clinicalContext ? "Updated" : "No change"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Risk Context</span>
                      <Badge variant={autoResult.applyResult.applied?.riskContext ? "default" : "secondary"}>
                        {autoResult.applyResult.applied?.riskContext ? "Updated" : "No change"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Clinical Evidence</span>
                      <Badge variant={autoResult.applyResult.applied?.clinicalEvidence ? "default" : "secondary"}>
                        {autoResult.applyResult.applied?.clinicalEvidence ? "Updated" : "No change"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Regulatory History</span>
                      <Badge variant={autoResult.applyResult.applied?.regulatoryHistory ? "default" : "secondary"}>
                        {autoResult.applyResult.applied?.regulatoryHistory ? "Updated" : "No change"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Prior PSURs</span>
                      <Badge variant="secondary">
                        +{autoResult.applyResult.applied?.priorPsursAdded || 0} / ~{autoResult.applyResult.applied?.priorPsursUpdated || 0}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              {autoResult?.applyResult?.filledFields?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Fields filled</p>
                  <div className="flex flex-wrap gap-2">
                    {autoResult.applyResult.filledFields.slice(0, 24).map((f: string, i: number) => (
                      <Badge key={i} variant="outline">
                        {f}
                      </Badge>
                    ))}
                    {autoResult.applyResult.filledFields.length > 24 && (
                      <Badge variant="secondary">+{autoResult.applyResult.filledFields.length - 24} more</Badge>
                    )}
                  </div>
                </div>
              )}

              {autoResult?.applyResult?.warnings?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Missing / needs manual completion
                  </p>
                  <div className="space-y-1">
                    {autoResult.applyResult.warnings.map((w: string, i: number) => (
                      <div key={i} className="text-sm text-muted-foreground">
                        - {w}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setAutoResultOpen(false);
                  onRefreshCompleteness();
                }}
              >
                Refresh completeness
              </Button>
              <Button onClick={() => setAutoResultOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="identity"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Building className="w-4 h-4 mr-2" />
              Identity
            </TabsTrigger>
            <TabsTrigger
              value="clinical"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Stethoscope className="w-4 h-4 mr-2" />
              Clinical
            </TabsTrigger>
            <TabsTrigger
              value="risk"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Shield className="w-4 h-4 mr-2" />
              Risk
            </TabsTrigger>
            <TabsTrigger
              value="evidence"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <FileText className="w-4 h-4 mr-2" />
              Evidence
            </TabsTrigger>
            <TabsTrigger
              value="regulatory"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <History className="w-4 h-4 mr-2" />
              Regulatory
            </TabsTrigger>
            <TabsTrigger
              value="baselines"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Baselines
            </TabsTrigger>
          </TabsList>

          <div className="p-6">
            <TabsContent value="identity" className="mt-0">
              <IdentityTab
                dossier={dossier.core}
                onUpdate={onUpdateCore}
                isUpdating={isUpdating}
              />
            </TabsContent>

            <TabsContent value="clinical" className="mt-0">
              <ClinicalTab
                clinicalContext={dossier.clinicalContext}
                deviceCode={dossier.core.deviceCode}
                onUpdate={onUpdateClinical}
                isUpdating={isUpdating}
              />
            </TabsContent>

            <TabsContent value="risk" className="mt-0">
              <RiskTab
                riskContext={dossier.riskContext}
                deviceCode={dossier.core.deviceCode}
                onUpdate={onUpdateRisk}
                isUpdating={isUpdating}
              />
            </TabsContent>

            <TabsContent value="evidence" className="mt-0">
              <EvidenceTab
                clinicalEvidence={dossier.clinicalEvidence}
                deviceCode={dossier.core.deviceCode}
                onUpdate={onUpdateClinicalEvidence}
                isUpdating={isUpdating}
              />
            </TabsContent>

            <TabsContent value="regulatory" className="mt-0">
              <RegulatoryTab
                regulatoryHistory={dossier.regulatoryHistory}
                priorPsurs={dossier.priorPsurs}
                deviceCode={dossier.core.deviceCode}
                onUpdate={onUpdateRegulatoryHistory}
                isUpdating={isUpdating}
              />
            </TabsContent>

            <TabsContent value="baselines" className="mt-0">
              <BaselinesTab baselines={dossier.baselines} />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Identity Tab
function IdentityTab({
  dossier,
  onUpdate,
  isUpdating,
}: {
  dossier: DeviceDossier;
  onUpdate: (data: any) => void;
  isUpdating: boolean;
}) {
  const [formData, setFormData] = useState({
    tradeName: dossier.tradeName || "",
    manufacturerName: dossier.manufacturerName || "",
    basicUdiDi: dossier.basicUdiDi || "",
    classification: dossier.classification || { class: "IIa", rule: "", rationale: "" },
  });

  const handleSave = () => {
    onUpdate(formData);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Trade Name</Label>
          <Input
            value={formData.tradeName}
            onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Manufacturer Name</Label>
          <Input
            value={formData.manufacturerName}
            onChange={(e) => setFormData({ ...formData, manufacturerName: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Basic UDI-DI</Label>
          <Input
            value={formData.basicUdiDi}
            onChange={(e) => setFormData({ ...formData, basicUdiDi: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Classification Class</Label>
          <Select
            value={formData.classification.class}
            onValueChange={(v) =>
              setFormData({
                ...formData,
                classification: { ...formData.classification, class: v as any },
              })
            }
          >
            <SelectTrigger>
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
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Classification Rule</Label>
          <Input
            value={formData.classification.rule}
            onChange={(e) =>
              setFormData({
                ...formData,
                classification: { ...formData.classification, rule: e.target.value },
              })
            }
            placeholder="e.g., Rule 11"
          />
        </div>
        <div className="space-y-2">
          <Label>Classification Rationale</Label>
          <Textarea
            value={formData.classification.rationale}
            onChange={(e) =>
              setFormData({
                ...formData,
                classification: { ...formData.classification, rationale: e.target.value },
              })
            }
            placeholder="Explain why this classification rule applies..."
            rows={2}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// Clinical Tab
function ClinicalTab({
  clinicalContext,
  deviceCode,
  onUpdate,
  isUpdating,
}: {
  clinicalContext: any;
  deviceCode: string;
  onUpdate: (data: any) => void;
  isUpdating: boolean;
}) {
  const [formData, setFormData] = useState({
    intendedPurpose: clinicalContext?.intendedPurpose || "",
    indications: clinicalContext?.indications || [],
    contraindications: clinicalContext?.contraindications || [],
    targetPopulation: clinicalContext?.targetPopulation || {
      description: "",
      conditions: [],
      excludedPopulations: [],
    },
    clinicalBenefits: clinicalContext?.clinicalBenefits || [],
    alternativeTreatments: clinicalContext?.alternativeTreatments || [],
  });

  const [newIndication, setNewIndication] = useState("");
  const [newContraindication, setNewContraindication] = useState("");

  const handleSave = () => {
    onUpdate(formData);
  };

  const addIndication = () => {
    if (newIndication.trim()) {
      setFormData({
        ...formData,
        indications: [...formData.indications, newIndication.trim()],
      });
      setNewIndication("");
    }
  };

  const removeIndication = (index: number) => {
    setFormData({
      ...formData,
      indications: formData.indications.filter((_: any, i: number) => i !== index),
    });
  };

  const addContraindication = () => {
    if (newContraindication.trim()) {
      setFormData({
        ...formData,
        contraindications: [...formData.contraindications, newContraindication.trim()],
      });
      setNewContraindication("");
    }
  };

  const removeContraindication = (index: number) => {
    setFormData({
      ...formData,
      contraindications: formData.contraindications.filter((_: any, i: number) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Intended Purpose (Verbatim from IFU)</Label>
        <Textarea
          value={formData.intendedPurpose}
          onChange={(e) => setFormData({ ...formData, intendedPurpose: e.target.value })}
          placeholder="Enter the exact intended purpose statement from the IFU..."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          This should be the exact wording from your Instructions for Use document.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Indications</Label>
          <div className="flex gap-2">
            <Input
              value={newIndication}
              onChange={(e) => setNewIndication(e.target.value)}
              placeholder="Add an indication..."
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIndication())}
            />
            <Button type="button" variant="secondary" onClick={addIndication}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.indications.map((ind: string, i: number) => (
              <Badge key={i} variant="secondary" className="py-1">
                {ind}
                <button
                  type="button"
                  onClick={() => removeIndication(i)}
                  className="ml-2 hover:text-destructive"
                >
                  x
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Contraindications</Label>
          <div className="flex gap-2">
            <Input
              value={newContraindication}
              onChange={(e) => setNewContraindication(e.target.value)}
              placeholder="Add a contraindication..."
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addContraindication())}
            />
            <Button type="button" variant="secondary" onClick={addContraindication}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.contraindications.map((contra: string, i: number) => (
              <Badge key={i} variant="secondary" className="py-1">
                {contra}
                <button
                  type="button"
                  onClick={() => removeContraindication(i)}
                  className="ml-2 hover:text-destructive"
                >
                  x
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Target Population Description</Label>
        <Textarea
          value={formData.targetPopulation.description}
          onChange={(e) =>
            setFormData({
              ...formData,
              targetPopulation: { ...formData.targetPopulation, description: e.target.value },
            })
          }
          placeholder="Describe the intended patient/user population..."
          rows={3}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// Risk Tab
function RiskTab({
  riskContext,
  deviceCode,
  onUpdate,
  isUpdating,
}: {
  riskContext: any;
  deviceCode: string;
  onUpdate: (data: any) => void;
  isUpdating: boolean;
}) {
  const [formData, setFormData] = useState({
    principalRisks: riskContext?.principalRisks || [],
    residualRiskAcceptability: riskContext?.residualRiskAcceptability || {
      criteria: "",
      afapAnalysisSummary: "",
    },
    riskThresholds: riskContext?.riskThresholds || {
      complaintRateThreshold: 0,
      seriousIncidentThreshold: 0,
      signalDetectionMethod: "",
    },
    hazardCategories: riskContext?.hazardCategories || [],
  });

  const handleSave = () => {
    onUpdate(formData);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Signal Detection Thresholds</CardTitle>
          <CardDescription>
            Define the thresholds that trigger safety signal investigation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Complaint Rate Threshold (per 1,000 units)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.riskThresholds.complaintRateThreshold}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    riskThresholds: {
                      ...formData.riskThresholds,
                      complaintRateThreshold: parseFloat(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Serious Incident Threshold (count)</Label>
              <Input
                type="number"
                value={formData.riskThresholds.seriousIncidentThreshold}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    riskThresholds: {
                      ...formData.riskThresholds,
                      seriousIncidentThreshold: parseInt(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Signal Detection Method</Label>
              <Input
                value={formData.riskThresholds.signalDetectionMethod}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    riskThresholds: {
                      ...formData.riskThresholds,
                      signalDetectionMethod: e.target.value,
                    },
                  })
                }
                placeholder="e.g., 2x baseline rate"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Risk Acceptability</CardTitle>
          <CardDescription>
            Document the criteria for determining if residual risks are acceptable
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Acceptability Criteria</Label>
            <Textarea
              value={formData.residualRiskAcceptability.criteria}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  residualRiskAcceptability: {
                    ...formData.residualRiskAcceptability,
                    criteria: e.target.value,
                  },
                })
              }
              placeholder="Describe the criteria used to determine risk acceptability..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>AFAP Analysis Summary</Label>
            <Textarea
              value={formData.residualRiskAcceptability.afapAnalysisSummary}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  residualRiskAcceptability: {
                    ...formData.residualRiskAcceptability,
                    afapAnalysisSummary: e.target.value,
                  },
                })
              }
              placeholder="Summarize the 'As Far As Possible' risk reduction analysis..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// Evidence Tab - CER conclusions, PMCF plan, literature search protocol
function EvidenceTab({
  clinicalEvidence,
  deviceCode,
  onUpdate,
  isUpdating,
}: {
  clinicalEvidence: any;
  deviceCode: string;
  onUpdate: (data: any) => void;
  isUpdating: boolean;
}) {
  const [formData, setFormData] = useState({
    cerConclusions: clinicalEvidence?.cerConclusions || {
      lastUpdateDate: "",
      benefitRiskConclusion: "",
      keyFindings: [],
      dataGapsIdentified: [],
    },
    pmcfPlan: clinicalEvidence?.pmcfPlan || {
      objectives: [],
      endpoints: [],
      targetEnrollment: 0,
      currentStatus: "",
      studyIds: [],
    },
    literatureSearchProtocol: clinicalEvidence?.literatureSearchProtocol || {
      databases: [],
      searchStrings: [],
      inclusionCriteria: [],
      exclusionCriteria: [],
      lastSearchDate: "",
    },
    externalDbSearchProtocol: clinicalEvidence?.externalDbSearchProtocol || {
      databases: [],
      queryTerms: [],
      dateRange: "",
      lastSearchDate: "",
      relevanceCriteria: [],
    },
  });

  const [newObjective, setNewObjective] = useState("");
  const [newDatabase, setNewDatabase] = useState("");
  const [newKeyFinding, setNewKeyFinding] = useState("");
  const [newSearchString, setNewSearchString] = useState("");
  const [newInclusion, setNewInclusion] = useState("");
  const [newExclusion, setNewExclusion] = useState("");
  const [newExtDb, setNewExtDb] = useState("");
  const [newQueryTerm, setNewQueryTerm] = useState("");
  const [newRelevanceCriterion, setNewRelevanceCriterion] = useState("");

  useEffect(() => {
    setFormData({
      cerConclusions: clinicalEvidence?.cerConclusions || {
        lastUpdateDate: "",
        benefitRiskConclusion: "",
        keyFindings: [],
        dataGapsIdentified: [],
      },
      pmcfPlan: clinicalEvidence?.pmcfPlan || {
        objectives: [],
        endpoints: [],
        targetEnrollment: 0,
        currentStatus: "",
        studyIds: [],
      },
      literatureSearchProtocol: clinicalEvidence?.literatureSearchProtocol || {
        databases: [],
        searchStrings: [],
        inclusionCriteria: [],
        exclusionCriteria: [],
        lastSearchDate: "",
      },
      externalDbSearchProtocol: clinicalEvidence?.externalDbSearchProtocol || {
        databases: [],
        queryTerms: [],
        dateRange: "",
        lastSearchDate: "",
        relevanceCriteria: [],
      },
    });
  }, [clinicalEvidence, deviceCode]);

  const addObjective = () => {
    if (newObjective.trim()) {
      setFormData({
        ...formData,
        pmcfPlan: {
          ...formData.pmcfPlan,
          objectives: [...formData.pmcfPlan.objectives, newObjective.trim()],
        },
      });
      setNewObjective("");
    }
  };

  const removeObjective = (index: number) => {
    setFormData({
      ...formData,
      pmcfPlan: {
        ...formData.pmcfPlan,
        objectives: formData.pmcfPlan.objectives.filter((_: any, i: number) => i !== index),
      },
    });
  };

  const addDatabase = () => {
    if (newDatabase.trim()) {
      setFormData({
        ...formData,
        literatureSearchProtocol: {
          ...formData.literatureSearchProtocol,
          databases: [...formData.literatureSearchProtocol.databases, newDatabase.trim()],
        },
      });
      setNewDatabase("");
    }
  };

  const removeDatabase = (index: number) => {
    setFormData({
      ...formData,
      literatureSearchProtocol: {
        ...formData.literatureSearchProtocol,
        databases: formData.literatureSearchProtocol.databases.filter((_: any, i: number) => i !== index),
      },
    });
  };

  const addKeyFinding = () => {
    if (newKeyFinding.trim()) {
      setFormData({
        ...formData,
        cerConclusions: {
          ...formData.cerConclusions,
          keyFindings: [...formData.cerConclusions.keyFindings, newKeyFinding.trim()],
        },
      });
      setNewKeyFinding("");
    }
  };

  const removeKeyFinding = (index: number) => {
    setFormData({
      ...formData,
      cerConclusions: {
        ...formData.cerConclusions,
        keyFindings: formData.cerConclusions.keyFindings.filter((_: any, i: number) => i !== index),
      },
    });
  };

  const addSearchString = () => {
    if (newSearchString.trim()) {
      setFormData({
        ...formData,
        literatureSearchProtocol: {
          ...formData.literatureSearchProtocol,
          searchStrings: [...(formData.literatureSearchProtocol.searchStrings || []), newSearchString.trim()],
        },
      });
      setNewSearchString("");
    }
  };

  const removeSearchString = (index: number) => {
    setFormData({
      ...formData,
      literatureSearchProtocol: {
        ...formData.literatureSearchProtocol,
        searchStrings: (formData.literatureSearchProtocol.searchStrings || []).filter((_: any, i: number) => i !== index),
      },
    });
  };

  const addInclusion = () => {
    if (newInclusion.trim()) {
      setFormData({
        ...formData,
        literatureSearchProtocol: {
          ...formData.literatureSearchProtocol,
          inclusionCriteria: [...(formData.literatureSearchProtocol.inclusionCriteria || []), newInclusion.trim()],
        },
      });
      setNewInclusion("");
    }
  };

  const removeInclusion = (index: number) => {
    setFormData({
      ...formData,
      literatureSearchProtocol: {
        ...formData.literatureSearchProtocol,
        inclusionCriteria: (formData.literatureSearchProtocol.inclusionCriteria || []).filter((_: any, i: number) => i !== index),
      },
    });
  };

  const addExclusion = () => {
    if (newExclusion.trim()) {
      setFormData({
        ...formData,
        literatureSearchProtocol: {
          ...formData.literatureSearchProtocol,
          exclusionCriteria: [...(formData.literatureSearchProtocol.exclusionCriteria || []), newExclusion.trim()],
        },
      });
      setNewExclusion("");
    }
  };

  const removeExclusion = (index: number) => {
    setFormData({
      ...formData,
      literatureSearchProtocol: {
        ...formData.literatureSearchProtocol,
        exclusionCriteria: (formData.literatureSearchProtocol.exclusionCriteria || []).filter((_: any, i: number) => i !== index),
      },
    });
  };

  const addExtDb = () => {
    if (newExtDb.trim()) {
      setFormData({
        ...formData,
        externalDbSearchProtocol: {
          ...formData.externalDbSearchProtocol,
          databases: [...(formData.externalDbSearchProtocol?.databases || []), newExtDb.trim()],
        },
      });
      setNewExtDb("");
    }
  };
  const removeExtDb = (index: number) => {
    setFormData({
      ...formData,
      externalDbSearchProtocol: {
        ...formData.externalDbSearchProtocol,
        databases: (formData.externalDbSearchProtocol?.databases || []).filter((_: any, i: number) => i !== index),
      },
    });
  };
  const addQueryTerm = () => {
    if (newQueryTerm.trim()) {
      setFormData({
        ...formData,
        externalDbSearchProtocol: {
          ...formData.externalDbSearchProtocol,
          queryTerms: [...(formData.externalDbSearchProtocol?.queryTerms || []), newQueryTerm.trim()],
        },
      });
      setNewQueryTerm("");
    }
  };
  const removeQueryTerm = (index: number) => {
    setFormData({
      ...formData,
      externalDbSearchProtocol: {
        ...formData.externalDbSearchProtocol,
        queryTerms: (formData.externalDbSearchProtocol?.queryTerms || []).filter((_: any, i: number) => i !== index),
      },
    });
  };
  const addRelevanceCriterion = () => {
    if (newRelevanceCriterion.trim()) {
      setFormData({
        ...formData,
        externalDbSearchProtocol: {
          ...formData.externalDbSearchProtocol,
          relevanceCriteria: [...(formData.externalDbSearchProtocol?.relevanceCriteria || []), newRelevanceCriterion.trim()],
        },
      });
      setNewRelevanceCriterion("");
    }
  };
  const removeRelevanceCriterion = (index: number) => {
    setFormData({
      ...formData,
      externalDbSearchProtocol: {
        ...formData.externalDbSearchProtocol,
        relevanceCriteria: (formData.externalDbSearchProtocol?.relevanceCriteria || []).filter((_: any, i: number) => i !== index),
      },
    });
  };

  const handleSave = () => {
    onUpdate(formData);
  };

  return (
    <div className="space-y-6">
      {/* CER Conclusions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">CER Conclusions</CardTitle>
          <CardDescription>
            Key conclusions from the Clinical Evaluation Report
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Last CER Update Date</Label>
              <Input
                type="date"
                value={formData.cerConclusions.lastUpdateDate}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cerConclusions: { ...formData.cerConclusions, lastUpdateDate: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>B/R Conclusion</Label>
              <Input
                value={formData.cerConclusions.benefitRiskConclusion}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cerConclusions: { ...formData.cerConclusions, benefitRiskConclusion: e.target.value },
                  })
                }
                placeholder="e.g., Favorable"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Key Findings</Label>
            <div className="flex gap-2">
              <Input
                value={newKeyFinding}
                onChange={(e) => setNewKeyFinding(e.target.value)}
                placeholder="Add a key finding..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyFinding())}
              />
              <Button type="button" variant="secondary" onClick={addKeyFinding}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.cerConclusions.keyFindings.map((finding: string, i: number) => (
                <Badge key={i} variant="secondary" className="py-1 max-w-full">
                  <span className="truncate">{finding}</span>
                  <button
                    type="button"
                    onClick={() => removeKeyFinding(i)}
                    className="ml-2 hover:text-destructive"
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PMCF Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">PMCF Plan</CardTitle>
          <CardDescription>
            Post-Market Clinical Follow-up plan objectives and status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Current Status</Label>
              <Input
                value={formData.pmcfPlan.currentStatus}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    pmcfPlan: { ...formData.pmcfPlan, currentStatus: e.target.value },
                  })
                }
                placeholder="e.g., Active - Enrollment ongoing"
              />
            </div>
            <div className="space-y-2">
              <Label>Target Enrollment</Label>
              <Input
                type="number"
                value={formData.pmcfPlan.targetEnrollment || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    pmcfPlan: { ...formData.pmcfPlan, targetEnrollment: parseInt(e.target.value) || 0 },
                  })
                }
                placeholder="e.g., 500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>PMCF Objectives</Label>
            <div className="flex gap-2">
              <Input
                value={newObjective}
                onChange={(e) => setNewObjective(e.target.value)}
                placeholder="Add an objective..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addObjective())}
              />
              <Button type="button" variant="secondary" onClick={addObjective}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2 mt-2">
              {formData.pmcfPlan.objectives.map((obj: string, i: number) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-secondary/50 rounded">
                  <span className="flex-1 text-sm">{obj}</span>
                  <button
                    type="button"
                    onClick={() => removeObjective(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Literature Search Protocol */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Literature Search Protocol</CardTitle>
          <CardDescription>
            Databases and criteria for systematic literature review
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Last Search Date</Label>
            <Input
              type="date"
              value={formData.literatureSearchProtocol.lastSearchDate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  literatureSearchProtocol: { ...formData.literatureSearchProtocol, lastSearchDate: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Databases Searched</Label>
            <div className="flex gap-2">
              <Input
                value={newDatabase}
                onChange={(e) => setNewDatabase(e.target.value)}
                placeholder="e.g., PubMed, EMBASE, Cochrane..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDatabase())}
              />
              <Button type="button" variant="secondary" onClick={addDatabase}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.literatureSearchProtocol.databases.map((db: string, i: number) => (
                <Badge key={i} variant="outline" className="py-1">
                  {db}
                  <button
                    type="button"
                    onClick={() => removeDatabase(i)}
                    className="ml-2 hover:text-destructive"
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Search Strings</Label>
            <div className="flex gap-2">
              <Input
                value={newSearchString}
                onChange={(e) => setNewSearchString(e.target.value)}
                placeholder="Add a search string..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSearchString())}
              />
              <Button type="button" variant="secondary" onClick={addSearchString}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(formData.literatureSearchProtocol.searchStrings || []).map((s: string, i: number) => (
                <Badge key={i} variant="secondary" className="py-1">
                  <span className="truncate">{s}</span>
                  <button
                    type="button"
                    onClick={() => removeSearchString(i)}
                    className="ml-2 hover:text-destructive"
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Inclusion Criteria</Label>
              <div className="flex gap-2">
                <Input
                  value={newInclusion}
                  onChange={(e) => setNewInclusion(e.target.value)}
                  placeholder="Add inclusion criterion..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInclusion())}
                />
                <Button type="button" variant="secondary" onClick={addInclusion}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-2 mt-2">
                {(formData.literatureSearchProtocol.inclusionCriteria || []).map((c: string, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 bg-secondary/50 rounded">
                    <span className="text-sm flex-1">{c}</span>
                    <button
                      type="button"
                      onClick={() => removeInclusion(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Exclusion Criteria</Label>
              <div className="flex gap-2">
                <Input
                  value={newExclusion}
                  onChange={(e) => setNewExclusion(e.target.value)}
                  placeholder="Add exclusion criterion..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExclusion())}
                />
                <Button type="button" variant="secondary" onClick={addExclusion}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-2 mt-2">
                {(formData.literatureSearchProtocol.exclusionCriteria || []).map((c: string, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 bg-secondary/50 rounded">
                    <span className="text-sm flex-1">{c}</span>
                    <button
                      type="button"
                      onClick={() => removeExclusion(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* External Database Search Protocol (MDCG 2022-21 Section 10) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">External Database Search Protocol</CardTitle>
          <CardDescription>
            MAUDE, MHRA, TGA and other external databases (MDCG 2022-21 Section 10)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Last Search Date</Label>
            <Input
              type="date"
              value={formData.externalDbSearchProtocol?.lastSearchDate || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  externalDbSearchProtocol: { ...formData.externalDbSearchProtocol!, lastSearchDate: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Date Range (optional)</Label>
            <Input
              value={formData.externalDbSearchProtocol?.dateRange || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  externalDbSearchProtocol: { ...formData.externalDbSearchProtocol!, dateRange: e.target.value },
                })
              }
              placeholder="e.g., 2020-01-01 to 2024-12-31"
            />
          </div>
          <div className="space-y-2">
            <Label>Databases</Label>
            <div className="flex gap-2">
              <Input
                value={newExtDb}
                onChange={(e) => setNewExtDb(e.target.value)}
                placeholder="e.g., MAUDE, MHRA, TGA, EUDAMED..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExtDb())}
              />
              <Button type="button" variant="secondary" onClick={addExtDb}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(formData.externalDbSearchProtocol?.databases || []).map((db: string, i: number) => (
                <Badge key={i} variant="outline" className="py-1">
                  {db}
                  <button type="button" onClick={() => removeExtDb(i)} className="ml-2 hover:text-destructive">x</button>
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Query Terms</Label>
            <div className="flex gap-2">
              <Input
                value={newQueryTerm}
                onChange={(e) => setNewQueryTerm(e.target.value)}
                placeholder="Add query term..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addQueryTerm())}
              />
              <Button type="button" variant="secondary" onClick={addQueryTerm}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(formData.externalDbSearchProtocol?.queryTerms || []).map((s: string, i: number) => (
                <Badge key={i} variant="secondary" className="py-1">
                  <span className="truncate">{s}</span>
                  <button type="button" onClick={() => removeQueryTerm(i)} className="ml-2 hover:text-destructive">x</button>
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Relevance Criteria</Label>
            <div className="flex gap-2">
              <Input
                value={newRelevanceCriterion}
                onChange={(e) => setNewRelevanceCriterion(e.target.value)}
                placeholder="Add relevance criterion..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRelevanceCriterion())}
              />
              <Button type="button" variant="secondary" onClick={addRelevanceCriterion}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2 mt-2">
              {(formData.externalDbSearchProtocol?.relevanceCriteria || []).map((c: string, i: number) => (
                <div key={i} className="flex items-center justify-between gap-2 p-2 bg-secondary/50 rounded">
                  <span className="text-sm flex-1">{c}</span>
                  <button type="button" onClick={() => removeRelevanceCriterion(i)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
        <Info className="w-4 h-4 inline mr-2" />
        Clinical Evidence data is used by agents to validate PMCF progress against objectives,
        literature searches, and external database searches per MDCG 2022-21 Sections 9 and 10.
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// Regulatory Tab - Certificates, commitments, FSCAs, prior PSURs
function RegulatoryTab({
  regulatoryHistory,
  priorPsurs,
  deviceCode,
  onUpdate,
  isUpdating,
}: {
  regulatoryHistory: any;
  priorPsurs: any[];
  deviceCode: string;
  onUpdate: (data: any) => void;
  isUpdating: boolean;
}) {
  const [formData, setFormData] = useState({
    certificates: regulatoryHistory?.certificates || [],
    nbCommitments: regulatoryHistory?.nbCommitments || [],
    fscaHistory: regulatoryHistory?.fscaHistory || [],
    designChanges: regulatoryHistory?.designChanges || [],
  });

  const [newCommitment, setNewCommitment] = useState("");
  const [newCertificateType, setNewCertificateType] = useState("");
  const [newCertificateNB, setNewCertificateNB] = useState("");
  const [newCertificateIssue, setNewCertificateIssue] = useState("");
  const [newCertificateExpiry, setNewCertificateExpiry] = useState("");

  useEffect(() => {
    setFormData({
      certificates: regulatoryHistory?.certificates || [],
      nbCommitments: regulatoryHistory?.nbCommitments || [],
      fscaHistory: regulatoryHistory?.fscaHistory || [],
      designChanges: regulatoryHistory?.designChanges || [],
    });
  }, [regulatoryHistory, deviceCode]);

  const addCommitment = () => {
    if (!newCommitment.trim()) return;
    setFormData(prev => ({
      ...prev,
      nbCommitments: [
        ...(prev.nbCommitments || []),
        {
          commitmentId: `commit-${Date.now()}`,
          description: newCommitment.trim(),
          source: "Manual entry",
          status: "Open",
        },
      ],
    }));
    setNewCommitment("");
  };

  const removeCommitment = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      nbCommitments: (prev.nbCommitments || []).filter((_: any, i: number) => i !== idx),
    }));
  };

  const addCertificate = () => {
    if (!newCertificateType.trim()) return;
    setFormData(prev => ({
      ...prev,
      certificates: [
        ...(prev.certificates || []),
        {
          certificateId: `cert-${Date.now()}`,
          type: newCertificateType.trim(),
          notifiedBody: newCertificateNB.trim(),
          issueDate: newCertificateIssue,
          expiryDate: newCertificateExpiry,
          scope: "",
          status: "Active",
        },
      ],
    }));
    setNewCertificateType("");
    setNewCertificateNB("");
    setNewCertificateIssue("");
    setNewCertificateExpiry("");
  };

  const removeCertificate = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      certificates: (prev.certificates || []).filter((_: any, i: number) => i !== idx),
    }));
  };

  const handleSave = () => {
    onUpdate(formData);
  };

  return (
    <div className="space-y-6">
      {/* Certificates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Certificates</CardTitle>
          <CardDescription>
            Active regulatory certificates and their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Certificate Type</Label>
              <Input value={newCertificateType} onChange={(e) => setNewCertificateType(e.target.value)} placeholder="e.g., EU MDR Certificate" />
            </div>
            <div className="space-y-2">
              <Label>Notified Body</Label>
              <Input value={newCertificateNB} onChange={(e) => setNewCertificateNB(e.target.value)} placeholder="e.g., BSI" />
            </div>
            <div className="space-y-2">
              <Label>Issue Date</Label>
              <Input type="date" value={newCertificateIssue} onChange={(e) => setNewCertificateIssue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Expiry Date</Label>
              <Input type="date" value={newCertificateExpiry} onChange={(e) => setNewCertificateExpiry(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end mb-4">
            <Button type="button" variant="secondary" onClick={addCertificate}>
              <Plus className="w-4 h-4 mr-2" />
              Add Certificate
            </Button>
          </div>

          {formData.certificates?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Notified Body</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formData.certificates.map((cert: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{cert.type}</TableCell>
                    <TableCell>{cert.notifiedBody}</TableCell>
                    <TableCell>{cert.issueDate}</TableCell>
                    <TableCell>{cert.expiryDate}</TableCell>
                    <TableCell>
                      <Badge variant={cert.status === "Active" ? "default" : "secondary"}>
                        {cert.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeCertificate(i)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No certificates configured
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prior PSURs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Prior PSURs</CardTitle>
          <CardDescription>
            Historical PSUR conclusions and outstanding actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {priorPsurs?.length > 0 ? (
            <div className="space-y-4">
              {priorPsurs.map((psur: any, i: number) => (
                <div key={i} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">
                        {psur.periodStart?.split("T")[0]} to {psur.periodEnd?.split("T")[0]}
                      </p>
                      {psur.psurReference && (
                        <p className="text-sm text-muted-foreground">{psur.psurReference}</p>
                      )}
                    </div>
                    <Badge variant={psur.benefitRiskConclusion === "Favorable" ? "default" : "secondary"}>
                      {psur.benefitRiskConclusion || "Unknown"}
                    </Badge>
                  </div>
                  {psur.keyFindings?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium">Key Findings:</p>
                      <ul className="text-sm text-muted-foreground list-disc list-inside">
                        {psur.keyFindings.slice(0, 3).map((finding: string, j: number) => (
                          <li key={j}>{finding}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No prior PSURs configured
            </div>
          )}
        </CardContent>
      </Card>

      {/* NB Commitments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">NB Commitments</CardTitle>
          <CardDescription>
            Outstanding commitments from Notified Body audits
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 mb-4">
            <Label>Add commitment</Label>
            <div className="flex gap-2">
              <Input
                value={newCommitment}
                onChange={(e) => setNewCommitment(e.target.value)}
                placeholder="Add commitment description..."
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCommitment())}
              />
              <Button type="button" variant="secondary" onClick={addCommitment}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {formData.nbCommitments?.length > 0 ? (
            <div className="space-y-2">
              {formData.nbCommitments.map((commit: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <p className="text-sm">{commit.description}</p>
                    {commit.dueDate && (
                      <p className="text-xs text-muted-foreground">Due: {commit.dueDate}</p>
                    )}
                  </div>
                  <Badge variant={commit.status === "Completed" ? "default" : "secondary"}>
                    {commit.status}
                  </Badge>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeCommitment(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No commitments configured
            </div>
          )}
        </CardContent>
      </Card>

      <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
        <Info className="w-4 h-4 inline mr-2" />
        Regulatory history data enables agents to reference prior PSUR conclusions
        and track outstanding commitments in generated narratives.
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// Baselines Tab - Historical performance metrics for trend analysis
function BaselinesTab({ baselines }: { baselines: any[] }) {
  // Group baselines by metric type
  const groupedBaselines = baselines.reduce((acc: Record<string, any[]>, baseline) => {
    const type = baseline.metricType || "other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(baseline);
    return acc;
  }, {});

  const formatMetricType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="space-y-6">
      {Object.keys(groupedBaselines).length > 0 ? (
        Object.entries(groupedBaselines).map(([metricType, typeBaselines]) => (
          <Card key={metricType}>
            <CardHeader>
              <CardTitle className="text-lg">{formatMetricType(metricType)}</CardTitle>
              <CardDescription>
                Historical baseline values for trend comparison
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Methodology</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typeBaselines.map((baseline: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>
                        {baseline.periodStart?.split("T")[0]} to {baseline.periodEnd?.split("T")[0]}
                      </TableCell>
                      <TableCell className="font-medium">{baseline.value}</TableCell>
                      <TableCell>{baseline.unit || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {baseline.methodology || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{baseline.confidence || "Medium"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Baselines Configured</h3>
              <p className="text-sm max-w-md mx-auto">
                Performance baselines enable trend analysis by providing historical
                reference points for complaint rates, incident rates, and other metrics.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
        <Info className="w-4 h-4 inline mr-2" />
        Baseline data is used by the Trend Agent to calculate period-over-period changes
        and detect signals when current rates exceed 2x the baseline.
      </div>
    </div>
  );
}
