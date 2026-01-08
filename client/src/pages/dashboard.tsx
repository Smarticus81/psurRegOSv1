import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Clock, 
  DollarSign, 
  Cpu, 
  Plus, 
  ArrowRight,
  Building2,
  Activity,
  Sparkles,
  Shield,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Link } from "wouter";
import type { Company, AgentExecution, GeneratedDocument } from "@shared/schema";

interface OrchestratorStatus {
  initialized: boolean;
  euObligations: number;
  ukObligations: number;
  constraints: number;
}

export default function Dashboard() {
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: executions = [] } = useQuery<AgentExecution[]>({
    queryKey: ["/api/agent-executions"],
  });

  const { data: documents = [] } = useQuery<GeneratedDocument[]>({
    queryKey: ["/api/documents"],
  });

  const { data: orchestratorStatus } = useQuery<OrchestratorStatus>({
    queryKey: ["/api/orchestrator/status"],
    refetchInterval: 30000,
  });

  const activeAgents = executions.filter(e => e.status === "running").length;
  const completedDocs = documents.length;
  const totalCost = executions.reduce((acc, e) => acc + parseFloat(e.costUsd || "0"), 0);
  const totalTimeSaved = completedDocs * 16;

  const recentExecutions = executions.slice(0, 5);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 space-y-10 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-3xl font-light tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground/80 text-sm">
              Post-market surveillance compliance for medical devices
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button asChild className="rounded-xl px-6" data-testid="button-generate-psur">
              <Link href="/agents">
                <Sparkles className="h-4 w-4" />
                Generate PSUR
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="zen-panel p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground/70">Documents</span>
              <FileText className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-3xl font-light">{completedDocs}</p>
            {completedDocs > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Generated</p>
            )}
          </div>
          <div className="zen-panel p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground/70">Time Saved</span>
              <Clock className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-3xl font-light">{totalTimeSaved}h</p>
            {totalTimeSaved > 0 && (
              <p className="text-xs text-muted-foreground/60">16h per document</p>
            )}
          </div>
          <div className="zen-panel p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground/70">Cost Savings</span>
              <DollarSign className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-3xl font-light">${(totalTimeSaved * 150).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground/60">vs consultant rates</p>
          </div>
          <div className="zen-panel p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground/70">In Progress</span>
              <Cpu className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <p className="text-3xl font-light">{activeAgents}</p>
            <p className="text-xs text-muted-foreground/60">generating now</p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">Compliance Kernel</CardTitle>
                <CardDescription>DSL-driven regulatory rule engine</CardDescription>
              </div>
            </div>
            {orchestratorStatus?.initialized ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                <AlertCircle className="h-3 w-3 mr-1" />
                Initializing
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-4 rounded-lg bg-muted/30 space-y-1">
                <p className="text-xs text-muted-foreground">EU MDR Obligations</p>
                <p className="text-2xl font-light">{orchestratorStatus?.euObligations || 0}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">MDCG 2022-21</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 space-y-1">
                <p className="text-xs text-muted-foreground">UK MDR Obligations</p>
                <p className="text-2xl font-light">{orchestratorStatus?.ukObligations || 0}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400">SI 2024/1368</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 space-y-1">
                <p className="text-xs text-muted-foreground">Active Constraints</p>
                <p className="text-2xl font-light">{orchestratorStatus?.constraints || 0}</p>
                <p className="text-xs text-muted-foreground">Validation rules</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg font-semibold">Compliance Tools</CardTitle>
                <CardDescription>Automated regulatory documentation</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <AgentCard
                name="PSUR Generator"
                description="Periodic Safety Update Report generation"
                status="active"
                processes={["EU MDR", "UK MDR", "FDA"]}
              />
              <AgentCard
                name="Data Import"
                description="Sales & complaint data aggregation"
                status="active"
                processes={["CSV/Excel import", "Normalization"]}
              />
              <AgentCard
                name="Trend Analysis"
                description="Statistical analysis & trend detection"
                status="active"
                processes={["SPC", "Complaint rates"]}
              />
              <AgentCard
                name="Document Builder"
                description="DOCX report generation"
                status="active"
                processes={["Templates", "Formatting"]}
              />
              <AgentCard
                name="CAPA Manager"
                description="Corrective & preventive actions"
                status="demo"
                processes={["Investigation", "Root cause"]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
                <CardDescription>Report generation and document history</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/agents">
                  View all
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentExecutions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                    <Activity className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No recent activity</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start by generating a PSUR document
                  </p>
                  <Button size="sm" className="mt-4" asChild>
                    <Link href="/agents">
                      <Plus className="h-4 w-4" />
                      Generate Report
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentExecutions.map((execution) => (
                    <div
                      key={execution.id}
                      className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/30"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          <Cpu className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {execution.agentType.toUpperCase()} Report
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(execution.jurisdictions as string[] | null)?.join(", ") || "All jurisdictions"}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={execution.status as any} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg font-semibold">Your Company</CardTitle>
              <CardDescription>Company profile and device portfolio</CardDescription>
            </div>
            <Button size="sm" asChild>
              <Link href="/companies">
                <ArrowRight className="h-4 w-4" />
                View Profile
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {companies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Company profile not set up</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Set up your company to start managing device portfolios
                </p>
                <Button size="sm" className="mt-4" asChild>
                  <Link href="/companies">
                    <Plus className="h-4 w-4" />
                    Set Up Company
                  </Link>
                </Button>
              </div>
            ) : (
              <Link href="/companies" className="block">
                <div className="p-4 rounded-md border bg-card hover-elevate cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{companies[0].name}</p>
                      <p className="text-xs text-muted-foreground">
                        {companies[0].jurisdictions?.join(", ") || "No jurisdictions configured"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AgentCard({
  name,
  description,
  status,
  processes,
}: {
  name: string;
  description: string;
  status: "active" | "demo" | "planned";
  processes: string[];
}) {
  return (
    <div className="group flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/20 hover:bg-muted/30 transition-all duration-300">
      <div className="flex items-center gap-4 min-w-0">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${
          status === "active" ? "bg-primary/10 group-hover:bg-primary/20" : "bg-muted/50"
        }`}>
          <Cpu className={`h-4 w-4 ${status === "active" ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{name}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              status === "active" 
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" 
                : status === "demo"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                : "bg-muted text-muted-foreground"
            }`}>
              {status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/70 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">
        {processes.map((p) => (
          <span key={p} className="text-[10px] px-2 py-1 rounded-lg bg-background/80 text-muted-foreground border border-border/50">
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}
