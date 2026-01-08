import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  ArrowRight,
  Box,
  Shield,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  Upload,
  FileText
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Device, Company } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrchestratorStatus {
  initialized: boolean;
  euObligations: number;
  ukObligations: number;
  constraints: number;
}

export default function Dashboard() {
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: orchestratorStatus } = useQuery<OrchestratorStatus>({
    queryKey: ["/api/orchestrator/status"],
    refetchInterval: 30000,
  });

  const company = companies[0];

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Device Portfolio</h1>
            <p className="text-sm text-muted-foreground">
              {company?.name || "Configure company in Settings"}
            </p>
          </div>
          <Button size="sm" data-testid="button-add-device">
            <Plus className="h-4 w-4" />
            Add Device
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CompactStatCard 
            label="Total Devices" 
            value={devices.length} 
            icon={Box}
          />
          <CompactStatCard 
            label="EU Obligations" 
            value={orchestratorStatus?.euObligations || 0}
            icon={Shield}
            sublabel="MDCG 2022-21"
          />
          <CompactStatCard 
            label="UK Obligations" 
            value={orchestratorStatus?.ukObligations || 0}
            icon={Shield}
            sublabel="SI 2024/1368"
          />
          <CompactStatCard 
            label="Constraints" 
            value={orchestratorStatus?.constraints || 0}
            icon={CheckCircle2}
            sublabel="Active rules"
          />
        </div>

        <div className="flex items-center gap-2">
          {orchestratorStatus?.initialized ? (
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Compliance Kernel Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
              <AlertCircle className="h-3 w-3 mr-1" />
              Initializing
            </Badge>
          )}
        </div>

        {devices.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
                  <Box className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No devices registered</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Add your medical devices to start generating PSURs
                </p>
                <Button size="sm" data-testid="button-add-first-device">
                  <Plus className="h-4 w-4" />
                  Add First Device
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <DeviceRow key={device.id} device={device} />
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="grid gap-2 sm:grid-cols-3">
              <Link href="/data">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Upload className="h-4 w-4" />
                  Upload Data Inputs
                </Button>
              </Link>
              <Link href="/agents">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <FileText className="h-4 w-4" />
                  Generate PSUR
                </Button>
              </Link>
              <Link href="/documents">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <ArrowRight className="h-4 w-4" />
                  View Documents
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CompactStatCard({ 
  label, 
  value, 
  icon: Icon,
  sublabel 
}: { 
  label: string; 
  value: number | string; 
  icon: any;
  sublabel?: string;
}) {
  return (
    <div className="zen-panel p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-semibold">{value}</p>
      {sublabel && (
        <p className="text-[10px] text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}

function DeviceRow({ device }: { device: Device }) {
  const [, navigate] = useLocation();
  const classColors: Record<string, string> = {
    "Class I": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    "Class IIa": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "Class IIb": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    "Class III": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  const classColor = classColors[device.riskClass] || "bg-muted text-muted-foreground";

  return (
    <Card className="hover-elevate">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Box className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{device.deviceName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${classColor}`}>
                  {device.riskClass}
                </Badge>
                {device.deviceCode && (
                  <span className="text-[10px] text-muted-foreground">
                    {device.deviceCode}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/agents?device=${device.id}`}>
                <FileText className="h-4 w-4" />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid={`button-device-menu-${device.id}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/data")}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Data
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/agents?device=${device.id}`)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate PSUR
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
