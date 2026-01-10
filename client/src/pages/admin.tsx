import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Building2, 
  Plus, 
  Trash2, 
  Package, 
  Globe,
  Loader2,
  Save,
} from "lucide-react";
import type { Company, Device, InsertCompany, InsertDevice } from "@shared/schema";

const JURISDICTION_OPTIONS = [
  { value: "EU", label: "European Union" },
  { value: "UK", label: "United Kingdom" },
];

const DEVICE_CLASS_OPTIONS = ["Class I", "Class IIa", "Class IIb", "Class III"];

export default function Admin() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("company");
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  
  const { data: companies = [], isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: devices = [], isLoading: devicesLoading } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const company = companies[0];
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setDescription(company.description || "");
      setJurisdictions(company.jurisdictions || []);
    }
  }, [company]);

  const saveCompanyMutation = useMutation({
    mutationFn: async (data: Partial<InsertCompany> & { id?: number }) => {
      if (data.id) {
        return apiRequest("PATCH", `/api/companies/${data.id}`, data);
      }
      return apiRequest("POST", "/api/companies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company profile saved" });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const createDeviceMutation = useMutation({
    mutationFn: async (data: InsertDevice) => {
      return apiRequest("POST", "/api/devices", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      setIsDeviceDialogOpen(false);
      toast({ title: "Device added" });
    },
    onError: () => {
      toast({ title: "Failed to add device", variant: "destructive" });
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/devices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      toast({ title: "Device removed" });
    },
  });

  const handleSaveCompany = () => {
    saveCompanyMutation.mutate({
      id: company?.id,
      name,
      description,
      jurisdictions,
    });
  };

  const toggleJurisdiction = (value: string) => {
    setJurisdictions(prev => 
      prev.includes(value) 
        ? prev.filter(j => j !== value)
        : [...prev, value]
    );
  };

  const handleCreateDevice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!company) {
      toast({ title: "Create company profile first", variant: "destructive" });
      return;
    }
    
    const formData = new FormData(e.currentTarget);
    createDeviceMutation.mutate({
      companyId: company.id,
      deviceName: formData.get("deviceName") as string,
      deviceCode: formData.get("deviceCode") as string,
      deviceClass: formData.get("deviceClass") as string,
      riskLevel: formData.get("riskLevel") as string || "medium",
    });
  };

  if (companiesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto" data-testid="admin-page">
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Company profile and device registry
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="company" data-testid="tab-company">
              <Building2 className="h-4 w-4 mr-2" />
              Company
            </TabsTrigger>
            <TabsTrigger value="devices" data-testid="tab-devices">
              <Package className="h-4 w-4 mr-2" />
              Devices
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Company Profile</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Organization details for regulatory submissions
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name" className="text-xs">Company Name</Label>
                  <Input
                    id="company-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter company name"
                    className="h-9"
                    data-testid="input-company-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-description" className="text-xs">Description</Label>
                  <Textarea
                    id="company-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Company description"
                    className="min-h-20 resize-none"
                    data-testid="input-company-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Target Jurisdictions</Label>
                  <div className="flex flex-wrap gap-2">
                    {JURISDICTION_OPTIONS.map((j) => (
                      <label key={j.value} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={jurisdictions.includes(j.value)}
                          onCheckedChange={() => toggleJurisdiction(j.value)}
                          data-testid={`checkbox-jurisdiction-${j.value}`}
                        />
                        <span className="text-sm">{j.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={handleSaveCompany}
                  disabled={saveCompanyMutation.isPending || !name}
                  data-testid="button-save-company"
                >
                  {saveCompanyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Profile
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium">Device Registry</h3>
                <p className="text-xs text-muted-foreground">
                  {devices.length} device{devices.length !== 1 ? "s" : ""} registered
                </p>
              </div>
              <Button 
                size="sm" 
                onClick={() => setIsDeviceDialogOpen(true)}
                disabled={!company}
                data-testid="button-add-device"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Device
              </Button>
            </div>

            {!company && (
              <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                <CardContent className="p-4">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Create a company profile first before adding devices.
                  </p>
                </CardContent>
              </Card>
            )}

            {devices.length === 0 && company && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium">No devices registered</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add medical devices to generate PSURs
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {devices.map((device) => (
                <Card key={device.id} data-testid={`device-card-${device.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">{device.deviceName}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {device.deviceCode}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {device.deviceClass}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteDeviceMutation.mutate(device.id)}
                          data-testid={`button-delete-device-${device.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isDeviceDialogOpen} onOpenChange={setIsDeviceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Device</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateDevice}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="deviceName">Device Name</Label>
                <Input 
                  id="deviceName" 
                  name="deviceName" 
                  placeholder="e.g., CardioMonitor Pro"
                  required
                  data-testid="input-device-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deviceCode">Device Code</Label>
                <Input 
                  id="deviceCode" 
                  name="deviceCode" 
                  placeholder="e.g., CM-PRO-001"
                  required
                  data-testid="input-device-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deviceClass">Device Class</Label>
                <Select name="deviceClass" defaultValue="Class IIa">
                  <SelectTrigger data-testid="select-device-class">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_CLASS_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="riskLevel">Risk Level</Label>
                <Select name="riskLevel" defaultValue="medium">
                  <SelectTrigger data-testid="select-risk-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDeviceDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createDeviceMutation.isPending}
                data-testid="button-submit-device"
              >
                {createDeviceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Add Device
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
