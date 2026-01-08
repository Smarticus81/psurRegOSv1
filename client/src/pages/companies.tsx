import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Settings,
  Shield
} from "lucide-react";
import type { Company, Device, InsertCompany, InsertDevice } from "@shared/schema";

const jurisdictionOptions = ["EU", "UK", "US", "Canada", "Australia", "Japan"];
const deviceClassOptions = ["Class I", "Class IIa", "Class IIb", "Class III"];

export default function Companies() {
  const { toast } = useToast();
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const company = companies[0];
  const companyDevices = company ? devices.filter(d => d.companyId === company.id) : [];

  const createCompanyMutation = useMutation({
    mutationFn: async (data: InsertCompany) => {
      return apiRequest("POST", "/api/companies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setIsSetupDialogOpen(false);
      toast({ title: "Company profile created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create company profile", variant: "destructive" });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: { id: number } & Partial<InsertCompany>) => {
      return apiRequest("PATCH", `/api/companies/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setIsEditProfileOpen(false);
      toast({ title: "Company profile updated" });
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const createDeviceMutation = useMutation({
    mutationFn: async (data: InsertDevice) => {
      return apiRequest("POST", "/api/devices", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      setIsDeviceDialogOpen(false);
      toast({ title: "Device added successfully" });
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

  const handleCreateCompany = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedJurisdictions = jurisdictionOptions.filter(
      (j) => formData.get(`jurisdiction-${j}`) === "on"
    );
    
    createCompanyMutation.mutate({
      name: formData.get("name") as string,
      description: formData.get("description") as string || undefined,
      jurisdictions: selectedJurisdictions,
    });
  };

  const handleUpdateCompany = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!company) return;
    
    const formData = new FormData(e.currentTarget);
    const selectedJurisdictions = jurisdictionOptions.filter(
      (j) => formData.get(`edit-jurisdiction-${j}`) === "on"
    );
    
    updateCompanyMutation.mutate({
      id: company.id,
      name: formData.get("name") as string,
      description: formData.get("description") as string || undefined,
      jurisdictions: selectedJurisdictions,
    });
  };

  const handleCreateDevice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!company) return;
    
    const formData = new FormData(e.currentTarget);
    const selectedJurisdictions = jurisdictionOptions.filter(
      (j) => formData.get(`device-jurisdiction-${j}`) === "on"
    );

    createDeviceMutation.mutate({
      companyId: company.id,
      deviceName: formData.get("deviceName") as string,
      deviceCode: formData.get("deviceCode") as string,
      riskClass: formData.get("riskClass") as string,
      jurisdictions: selectedJurisdictions,
      basicUdf: formData.get("basicUdf") as string || undefined,
      gmdnCode: formData.get("gmdnCode") as string || undefined,
      deviceGroup: formData.get("deviceGroup") as string || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-3xl font-light tracking-tight">Company Profile</h1>
            <p className="text-muted-foreground/80 text-sm">
              Your organization details and device portfolio
            </p>
          </div>
          {company && (
            <Button variant="outline" className="rounded-xl" onClick={() => setIsEditProfileOpen(true)} data-testid="button-edit-profile">
              <Settings className="h-4 w-4" />
              Edit Profile
            </Button>
          )}
        </div>

        {!company ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">Set Up Your Company Profile</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Configure your company details to start managing device portfolios and generating regulatory documents.
              </p>
              <Button className="mt-6" onClick={() => setIsSetupDialogOpen(true)} data-testid="button-setup-company">
                <Plus className="h-4 w-4" />
                Set Up Company Profile
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Building2 className="h-7 w-7 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-xl" data-testid="text-company-name">{company.name}</CardTitle>
                    <CardDescription className="flex items-center gap-4 flex-wrap mt-1">
                      <span className="flex items-center gap-1">
                        <Package className="h-3.5 w-3.5" />
                        {companyDevices.length} device{companyDevices.length !== 1 ? 's' : ''}
                      </span>
                      {company.jurisdictions && company.jurisdictions.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3.5 w-3.5" />
                          {company.jurisdictions.join(", ")}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              {company.description && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{company.description}</p>
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-lg">Device Portfolio</CardTitle>
                  <CardDescription>Medical devices under regulatory surveillance</CardDescription>
                </div>
                <Button 
                  onClick={() => setIsDeviceDialogOpen(true)}
                  data-testid="button-add-device"
                >
                  <Plus className="h-4 w-4" />
                  Add Device
                </Button>
              </CardHeader>
              <CardContent>
                {companyDevices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                      <Shield className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No devices configured</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add your medical devices to generate PSURs and compliance documents
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {companyDevices.map((device) => (
                      <div 
                        key={device.id}
                        className="p-4 rounded-md border bg-card"
                        data-testid={`card-device-${device.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate" data-testid={`text-device-name-${device.id}`}>
                              {device.deviceName}
                            </p>
                            <p className="text-xs font-mono text-muted-foreground">{device.deviceCode}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="shrink-0">
                              {device.riskClass}
                            </Badge>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteDeviceMutation.mutate(device.id)}
                              data-testid={`button-delete-device-${device.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                        {device.deviceGroup && (
                          <p className="text-xs text-muted-foreground mt-2">{device.deviceGroup}</p>
                        )}
                        {device.jurisdictions && device.jurisdictions.length > 0 && (
                          <div className="flex gap-1 mt-3 flex-wrap">
                            {device.jurisdictions.map((j) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                                {j}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <Dialog open={isSetupDialogOpen} onOpenChange={setIsSetupDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set Up Company Profile</DialogTitle>
              <DialogDescription>
                Enter your company details to get started with regulatory document generation.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateCompany} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name</Label>
                <Input 
                  id="name" 
                  name="name" 
                  placeholder="e.g., FertilTech Medical"
                  required
                  data-testid="input-company-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input 
                  id="description" 
                  name="description" 
                  placeholder="Brief description of your company"
                  data-testid="input-company-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Active Jurisdictions</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select the regulatory regions where you market devices
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {jurisdictionOptions.map((j) => (
                    <div key={j} className="flex items-center gap-2">
                      <Checkbox id={`jurisdiction-${j}`} name={`jurisdiction-${j}`} />
                      <Label htmlFor={`jurisdiction-${j}`} className="text-sm font-normal cursor-pointer">
                        {j}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsSetupDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCompanyMutation.isPending} data-testid="button-submit-company">
                  {createCompanyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Profile
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Company Profile</DialogTitle>
              <DialogDescription>
                Update your company information and active jurisdictions.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateCompany} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Company Name</Label>
                <Input 
                  id="edit-name" 
                  name="name" 
                  defaultValue={company?.name || ""}
                  required
                  data-testid="input-edit-company-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input 
                  id="edit-description" 
                  name="description" 
                  defaultValue={company?.description || ""}
                  data-testid="input-edit-company-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Active Jurisdictions</Label>
                <div className="grid grid-cols-3 gap-2">
                  {jurisdictionOptions.map((j) => (
                    <div key={j} className="flex items-center gap-2">
                      <Checkbox 
                        id={`edit-jurisdiction-${j}`} 
                        name={`edit-jurisdiction-${j}`}
                        defaultChecked={company?.jurisdictions?.includes(j)}
                      />
                      <Label htmlFor={`edit-jurisdiction-${j}`} className="text-sm font-normal cursor-pointer">
                        {j}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditProfileOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateCompanyMutation.isPending} data-testid="button-update-company">
                  {updateCompanyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeviceDialogOpen} onOpenChange={setIsDeviceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Device</DialogTitle>
              <DialogDescription>
                Add a medical device to your portfolio for regulatory surveillance.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateDevice} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="deviceName">Device Name</Label>
                  <Input 
                    id="deviceName" 
                    name="deviceName" 
                    placeholder="e.g., Embryo Culture Media"
                    required
                    data-testid="input-device-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deviceCode">Device Code</Label>
                  <Input 
                    id="deviceCode" 
                    name="deviceCode" 
                    placeholder="e.g., ECM-001"
                    required
                    data-testid="input-device-code"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="riskClass">Risk Class</Label>
                  <Select name="riskClass" defaultValue="Class IIa">
                    <SelectTrigger data-testid="select-device-class">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {deviceClassOptions.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deviceGroup">Device Group</Label>
                  <Input 
                    id="deviceGroup" 
                    name="deviceGroup" 
                    placeholder="e.g., IVF Consumables"
                    data-testid="input-device-group"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="basicUdf">Basic UDI-DI</Label>
                  <Input 
                    id="basicUdf" 
                    name="basicUdf" 
                    placeholder="EU UDI"
                    data-testid="input-device-udi"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gmdnCode">GMDN Code</Label>
                  <Input 
                    id="gmdnCode" 
                    name="gmdnCode" 
                    placeholder="e.g., 47668"
                    data-testid="input-device-gmdn"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Device Jurisdictions</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select regions where this device is marketed
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {jurisdictionOptions.map((j) => (
                    <div key={j} className="flex items-center gap-2">
                      <Checkbox id={`device-jurisdiction-${j}`} name={`device-jurisdiction-${j}`} />
                      <Label htmlFor={`device-jurisdiction-${j}`} className="text-sm font-normal cursor-pointer">
                        {j}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDeviceDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createDeviceMutation.isPending} data-testid="button-submit-device">
                  {createDeviceMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add Device
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
