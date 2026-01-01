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
  ChevronRight,
  Loader2
} from "lucide-react";
import { Link } from "wouter";
import type { Company, Device, InsertCompany, InsertDevice } from "@shared/schema";

const jurisdictionOptions = ["EU", "UK", "US", "Canada", "Australia", "Japan"];
const deviceClassOptions = ["Class I", "Class IIa", "Class IIb", "Class III"];

export default function Companies() {
  const { toast } = useToast();
  const [isCompanyDialogOpen, setIsCompanyDialogOpen] = useState(false);
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [expandedCompany, setExpandedCompany] = useState<number | null>(null);

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (data: InsertCompany) => {
      return apiRequest("POST", "/api/companies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setIsCompanyDialogOpen(false);
      toast({ title: "Company created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create company", variant: "destructive" });
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

  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      toast({ title: "Company deleted" });
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

  const handleCreateDevice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCompanyId) return;
    
    const formData = new FormData(e.currentTarget);
    const selectedJurisdictions = jurisdictionOptions.filter(
      (j) => formData.get(`device-jurisdiction-${j}`) === "on"
    );

    createDeviceMutation.mutate({
      companyId: selectedCompanyId,
      deviceName: formData.get("deviceName") as string,
      deviceCode: formData.get("deviceCode") as string,
      riskClass: formData.get("riskClass") as string,
      jurisdictions: selectedJurisdictions,
      basicUdf: formData.get("basicUdf") as string || undefined,
      gmdnCode: formData.get("gmdnCode") as string || undefined,
      deviceGroup: formData.get("deviceGroup") as string || undefined,
    });
  };

  const getDevicesForCompany = (companyId: number) => 
    devices.filter(d => d.companyId === companyId);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage manufacturer profiles and device portfolios
            </p>
          </div>
          <Button onClick={() => setIsCompanyDialogOpen(true)} data-testid="button-add-company">
            <Plus className="h-4 w-4" />
            Add Company
          </Button>
        </div>

        {companies.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No companies yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Add a company to start configuring device portfolios and generating regulatory documents.
              </p>
              <Button className="mt-6" onClick={() => setIsCompanyDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Your First Company
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {companies.map((company) => {
              const companyDevices = getDevicesForCompany(company.id);
              const isExpanded = expandedCompany === company.id;
              
              return (
                <Card key={company.id} data-testid={`card-company-${company.id}`}>
                  <CardHeader 
                    className="cursor-pointer"
                    onClick={() => setExpandedCompany(isExpanded ? null : company.id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          <Building2 className="h-6 w-6 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-lg">{company.name}</CardTitle>
                          <CardDescription className="flex items-center gap-2 flex-wrap mt-1">
                            <span className="flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {companyDevices.length} devices
                            </span>
                            {company.jurisdictions && company.jurisdictions.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Globe className="h-3 w-3" />
                                {company.jurisdictions.join(", ")}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCompanyMutation.mutate(company.id);
                          }}
                          data-testid={`button-delete-company-${company.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </div>
                  </CardHeader>
                  
                  {isExpanded && (
                    <CardContent className="pt-0">
                      <div className="border-t pt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Device Portfolio</h4>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedCompanyId(company.id);
                              setIsDeviceDialogOpen(true);
                            }}
                            data-testid={`button-add-device-${company.id}`}
                          >
                            <Plus className="h-4 w-4" />
                            Add Device
                          </Button>
                        </div>
                        
                        {companyDevices.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            No devices configured. Add a device to get started.
                          </div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            {companyDevices.map((device) => (
                              <div 
                                key={device.id}
                                className="p-4 rounded-md border bg-card/50"
                                data-testid={`card-device-${device.id}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-medium truncate">{device.deviceName}</p>
                                    <p className="text-xs font-mono text-muted-foreground">{device.deviceCode}</p>
                                  </div>
                                  <Badge variant="outline" className="shrink-0">
                                    {device.riskClass}
                                  </Badge>
                                </div>
                                {device.jurisdictions && device.jurisdictions.length > 0 && (
                                  <div className="flex gap-1 mt-2 flex-wrap">
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
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={isCompanyDialogOpen} onOpenChange={setIsCompanyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Company</DialogTitle>
              <DialogDescription>
                Create a new manufacturer profile to manage device portfolios.
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
                  placeholder="Brief description of the company"
                  data-testid="input-company-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Jurisdictions</Label>
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
                <Button type="button" variant="outline" onClick={() => setIsCompanyDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCompanyMutation.isPending} data-testid="button-submit-company">
                  {createCompanyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Company
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
                Add a medical device to the company portfolio.
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
                <Label>Jurisdictions</Label>
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
