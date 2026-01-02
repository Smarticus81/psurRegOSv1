import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { 
  FileText, 
  Clock, 
  DollarSign, 
  Cpu, 
  Plus, 
  ArrowRight,
  Building2,
  Activity,
  Sparkles
} from "lucide-react";
import { Link } from "wouter";
import type { Company, AgentExecution, GeneratedDocument } from "@shared/schema";

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

  const activeAgents = executions.filter(e => e.status === "running").length;
  const completedDocs = documents.length;
  const totalCost = executions.reduce((acc, e) => acc + parseFloat(e.costUsd || "0"), 0);
  const totalTimeSaved = completedDocs * 16;

  const recentExecutions = executions.slice(0, 5);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Intelligent agent framework for medical device compliance
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild data-testid="button-generate-psur">
              <Link href="/agents">
                <Sparkles className="h-4 w-4" />
                Generate PSUR
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Documents Generated"
            value={completedDocs}
            subtitle="total"
            icon={<FileText className="h-5 w-5 text-muted-foreground" />}
            trend={completedDocs > 0 ? { value: "+100%", direction: "up", label: "vs manual" } : undefined}
          />
          <MetricCard
            title="Time Saved"
            value={`${totalTimeSaved}h`}
            subtitle="estimated"
            icon={<Clock className="h-5 w-5 text-muted-foreground" />}
            trend={totalTimeSaved > 0 ? { value: "16h", direction: "up", label: "per doc" } : undefined}
          />
          <MetricCard
            title="Cost Savings"
            value={`$${(totalTimeSaved * 150).toLocaleString()}`}
            subtitle="vs consultant"
            icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
          />
          <MetricCard
            title="Active Agents"
            value={activeAgents}
            subtitle="running"
            icon={<Cpu className="h-5 w-5 text-muted-foreground" />}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg font-semibold">Available Agents</CardTitle>
                <CardDescription>AI-powered regulatory automation</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <AgentCard
                name="PSUR Agent"
                description="Periodic Safety Update Report generation"
                status="active"
                processes={["EU MDR", "UK MDR", "FDA"]}
              />
              <AgentCard
                name="Data Collection Agent"
                description="Sales & complaint data aggregation"
                status="active"
                processes={["CSV/Excel import", "Normalization"]}
              />
              <AgentCard
                name="Analysis Agent"
                description="Statistical analysis & trend detection"
                status="active"
                processes={["SPC", "Complaint rates"]}
              />
              <AgentCard
                name="Document Agent"
                description="DOCX report generation"
                status="active"
                processes={["Templates", "Formatting"]}
              />
              <AgentCard
                name="CAPA Agent"
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
                <CardDescription>Agent executions and document generation</CardDescription>
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
                      Start Agent
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
                            {execution.agentType.toUpperCase()} Agent
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
              <CardTitle className="text-lg font-semibold">Configured Companies</CardTitle>
              <CardDescription>Manufacturer profiles and device portfolios</CardDescription>
            </div>
            <Button size="sm" asChild>
              <Link href="/companies">
                <Plus className="h-4 w-4" />
                Add Company
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {companies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No companies configured</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add a company to start managing device portfolios
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {companies.map((company) => (
                  <Link
                    key={company.id}
                    href={`/companies/${company.id}`}
                    className="block"
                  >
                    <div className="p-4 rounded-md border bg-card hover-elevate cursor-pointer transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{company.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {company.jurisdictions?.join(", ") || "No jurisdictions"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
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
    <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/30">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Cpu className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{name}</p>
            <StatusBadge 
              status={status === "active" ? "completed" : status === "demo" ? "in_progress" : "pending"} 
              showIcon={false}
              className="text-[10px] px-1.5 py-0"
            />
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-1 flex-wrap justify-end">
        {processes.map((p) => (
          <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}
