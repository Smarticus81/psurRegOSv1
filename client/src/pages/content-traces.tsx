/**
 * Content Traces Page - SOTA Ultra-Granular PSUR Content Traceability
 * 
 * Shows WHY/HOW/WHAT for every content element with:
 * - Real-time trace streaming during compilation
 * - Advanced filtering and natural language search
 * - Slot-based grouping with timeline view
 * - Export capabilities for audit compliance
 * - Visualization of trace statistics
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  Filter,
  FileText,
  Calculator,
  Table as TableIcon,
  ListOrdered,
  ChevronDown,
  ChevronRight,
  Cpu,
  Link,
  FileCheck,
  AlertCircle,
  BarChart3,
  RefreshCw,
  Download,
  Clock,
  ArrowLeft,
  TrendingUp,
  PieChart,
  Hash,
  BookOpen,
  FileQuestion,
  Sparkles,
  Layers,
  Activity,
  CheckCircle2,
  Target,
  Workflow,
  GitBranch,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type ContentType =
  | "sentence"
  | "paragraph"
  | "table_row"
  | "table_cell"
  | "calculation"
  | "entry"
  | "chart_point"
  | "conclusion"
  | "list_item"
  | "heading";

interface ContentTrace {
  id: number;
  psurCaseId: number;
  slotId: string;
  slotTitle: string | null;
  contentType: ContentType;
  contentId: string;
  contentIndex: number;
  contentPreview: string;
  contentHash: string;
  rationale: string;
  methodology: string;
  standardReference: string | null;
  evidenceType: string | null;
  atomIds: string[] | null;
  sourceDocument: string | null;
  dataSourceId: number | null;
  obligationId: string | null;
  obligationTitle: string | null;
  jurisdictions: string[] | null;
  calculationType: string | null;
  calculationFormula: string | null;
  calculationInputs: Record<string, unknown> | null;
  agentId: string;
  agentName: string | null;
  createdAt: string;
}

interface ContentTraceStats {
  totalTraces: number;
  byContentType: Record<string, number>;
  byAgent: Record<string, number>;
  byObligation: Record<string, number>;
  byEvidenceType: Record<string, number>;
  calculationsCount: number;
  withNegativeEvidence: number;
}

interface PSURCase {
  id: number;
  psurReference: string;
  deviceInfo?: { deviceName?: string };
  templateId?: string;
  status: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT TYPE STYLING
// ═══════════════════════════════════════════════════════════════════════════════

const CONTENT_TYPE_CONFIG: Record<ContentType, { 
  icon: React.ComponentType<{ className?: string }>; 
  color: string;
  bgColor: string;
  label: string;
  description: string;
}> = {
  sentence: { 
    icon: FileText, 
    color: "text-blue-600", 
    bgColor: "bg-blue-50 dark:bg-blue-950", 
    label: "Sentence",
    description: "Individual narrative sentence with evidence citations"
  },
  paragraph: { 
    icon: BookOpen, 
    color: "text-indigo-600", 
    bgColor: "bg-indigo-50 dark:bg-indigo-950", 
    label: "Paragraph",
    description: "Complete narrative paragraph synthesizing evidence"
  },
  table_row: { 
    icon: TableIcon, 
    color: "text-purple-600", 
    bgColor: "bg-purple-50 dark:bg-purple-950", 
    label: "Table Row",
    description: "Data table row with multiple cells"
  },
  table_cell: { 
    icon: Hash, 
    color: "text-violet-600", 
    bgColor: "bg-violet-50 dark:bg-violet-950", 
    label: "Cell",
    description: "Individual table cell value"
  },
  calculation: { 
    icon: Calculator, 
    color: "text-amber-600", 
    bgColor: "bg-amber-50 dark:bg-amber-950", 
    label: "Calculation",
    description: "Computed value with formula and inputs"
  },
  entry: { 
    icon: ListOrdered, 
    color: "text-green-600", 
    bgColor: "bg-green-50 dark:bg-green-950", 
    label: "Entry",
    description: "Enumerated list entry"
  },
  chart_point: { 
    icon: TrendingUp, 
    color: "text-cyan-600", 
    bgColor: "bg-cyan-50 dark:bg-cyan-950", 
    label: "Chart Point",
    description: "Data point in visualization"
  },
  conclusion: { 
    icon: Target, 
    color: "text-emerald-600", 
    bgColor: "bg-emerald-50 dark:bg-emerald-950", 
    label: "Conclusion",
    description: "Regulatory conclusion with evidence basis"
  },
  list_item: { 
    icon: CheckCircle2, 
    color: "text-gray-600", 
    bgColor: "bg-gray-50 dark:bg-gray-950", 
    label: "List Item",
    description: "Bullet point or numbered item"
  },
  heading: { 
    icon: FileQuestion, 
    color: "text-slate-600", 
    bgColor: "bg-slate-50 dark:bg-slate-950", 
    label: "Heading",
    description: "Section or subsection heading"
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRACE ROW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function TraceRow({ trace, isExpanded, onToggle }: { 
  trace: ContentTrace; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = CONTENT_TYPE_CONFIG[trace.contentType] || CONTENT_TYPE_CONFIG.sentence;
  const Icon = config.icon;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <TableRow className={cn(
        "hover:bg-muted/50 transition-colors cursor-pointer",
        isExpanded && "bg-muted/30"
      )} onClick={onToggle}>
        <TableCell className="w-8">
          <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={cn("gap-1.5", config.bgColor, config.color)}
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TableCell>
        <TableCell className="max-w-md">
          <p className="truncate font-mono text-xs text-muted-foreground">
            {trace.contentPreview}
          </p>
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className="gap-1 text-xs">
            <Cpu className="h-3 w-3" />
            {trace.agentName || trace.agentId}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
          {trace.slotTitle || trace.slotId}
        </TableCell>
        <TableCell>
          {trace.atomIds && trace.atomIds.length > 0 ? (
            <Badge variant="outline" className="gap-1 text-xs">
              <Link className="h-3 w-3" />
              {trace.atomIds.length} atoms
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {new Date(trace.createdAt).toLocaleTimeString()}
        </TableCell>
      </TableRow>
      
      <CollapsibleContent asChild>
        <TableRow className="bg-muted/20 border-l-4 border-l-primary/30">
          <TableCell colSpan={7} className="p-0">
            <div className="p-6 space-y-6">
              {/* Header with content preview */}
              <div className={cn(
                "rounded-lg p-4",
                config.bgColor
              )}>
                <div className="flex items-start gap-3">
                  <div className={cn("p-2 rounded-md bg-background/50", config.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{config.label}</span>
                      <span className="text-xs text-muted-foreground">#{trace.contentIndex}</span>
                      {trace.obligationId && (
                        <Badge variant="outline" className="text-xs">
                          {trace.obligationId}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm break-words">{trace.contentPreview}</p>
                  </div>
                </div>
              </div>

              {/* Decision Details Grid */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Rationale (WHY) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <span>Rationale (WHY)</span>
                  </div>
                  <p className="text-sm text-muted-foreground bg-background rounded-md p-3 border">
                    {trace.rationale}
                  </p>
                </div>

                {/* Methodology (HOW) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <GitBranch className="h-4 w-4 text-blue-500" />
                    <span>Methodology (HOW)</span>
                  </div>
                  <p className="text-sm text-muted-foreground bg-background rounded-md p-3 border">
                    {trace.methodology}
                  </p>
                </div>

                {/* Standard Reference */}
                {trace.standardReference && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <FileCheck className="h-4 w-4 text-green-500" />
                      <span>Standard Reference</span>
                    </div>
                    <p className="text-sm text-muted-foreground bg-background rounded-md p-3 border">
                      {trace.standardReference}
                    </p>
                  </div>
                )}

                {/* Obligation */}
                {trace.obligationTitle && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Target className="h-4 w-4 text-purple-500" />
                      <span>Regulatory Obligation</span>
                    </div>
                    <p className="text-sm text-muted-foreground bg-background rounded-md p-3 border">
                      {trace.obligationTitle}
                      {trace.obligationId && (
                        <span className="block text-xs mt-1 text-muted-foreground/70">
                          ID: {trace.obligationId}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Calculation Details */}
              {trace.contentType === "calculation" && trace.calculationFormula && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Calculator className="h-4 w-4 text-orange-500" />
                    <span>Calculation Details</span>
                  </div>
                  <div className="bg-background rounded-md p-4 border space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Type:</span>
                      <Badge variant="outline" className="ml-2">
                        {trace.calculationType || "formula"}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Formula:</span>
                      <code className="ml-2 bg-muted px-2 py-1 rounded text-sm font-mono">
                        {trace.calculationFormula}
                      </code>
                    </div>
                    {trace.calculationInputs && Object.keys(trace.calculationInputs).length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground">Inputs:</span>
                        <pre className="mt-1 bg-muted p-2 rounded text-xs overflow-x-auto">
                          {JSON.stringify(trace.calculationInputs, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Evidence Atoms */}
              {trace.atomIds && trace.atomIds.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Link className="h-4 w-4 text-cyan-500" />
                    <span>Evidence Atoms ({trace.atomIds.length})</span>
                    {trace.evidenceType && (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {trace.evidenceType}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 bg-background rounded-md p-3 border">
                    {trace.atomIds.map((atomId) => (
                      <Badge key={atomId} variant="outline" className="text-xs font-mono">
                        {atomId}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Source & Metadata */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                <div className="flex items-center gap-4">
                  {trace.sourceDocument && (
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {trace.sourceDocument}
                    </span>
                  )}
                  {trace.jurisdictions && trace.jurisdictions.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      {trace.jurisdictions.join(", ")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(trace.createdAt).toLocaleString()}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/50">
                    {trace.contentHash.substring(0, 12)}...
                  </span>
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT GROUP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function SlotGroup({ slotId, slotTitle, traces }: {
  slotId: string;
  slotTitle: string | null;
  traces: ContentTrace[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedTraceIds, setExpandedTraceIds] = useState<Set<number>>(new Set());

  const toggleTrace = (id: number) => {
    setExpandedTraceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Count by content type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    traces.forEach(t => {
      counts[t.contentType] = (counts[t.contentType] || 0) + 1;
    });
    return counts;
  }, [traces]);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
                <div>
                  <CardTitle className="text-base">{slotTitle || slotId}</CardTitle>
                  <CardDescription className="text-xs font-mono">{slotId}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {Object.entries(typeCounts).slice(0, 4).map(([type, count]) => {
                  const config = CONTENT_TYPE_CONFIG[type as ContentType];
                  if (!config) return null;
                  const Icon = config.icon;
                  return (
                    <Badge key={type} variant="secondary" className="gap-1 text-xs">
                      <Icon className="h-3 w-3" />
                      {count}
                    </Badge>
                  );
                })}
                <Badge variant="outline">{traces.length} traces</Badge>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead className="w-[120px]">Agent</TableHead>
                  <TableHead className="w-[120px]">Section</TableHead>
                  <TableHead className="w-[80px]">Evidence</TableHead>
                  <TableHead className="w-[80px]">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traces.map((trace) => (
                  <TraceRow 
                    key={trace.id} 
                    trace={trace} 
                    isExpanded={expandedTraceIds.has(trace.id)}
                    onToggle={() => toggleTrace(trace.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATS VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

function StatsVisualization({ stats }: { stats: ContentTraceStats }) {
  // Sort content types by count
  const sortedTypes = Object.entries(stats.byContentType)
    .sort((a, b) => b[1] - a[1]);
  
  const maxCount = Math.max(...Object.values(stats.byContentType), 1);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Traces */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Total Traces
          </CardDescription>
          <CardTitle className="text-3xl">{stats.totalTraces.toLocaleString()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Content elements with full traceability
          </p>
        </CardContent>
      </Card>

      {/* Calculations */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Calculations
          </CardDescription>
          <CardTitle className="text-3xl">{stats.calculationsCount.toLocaleString()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            With formulas and input values
          </p>
        </CardContent>
      </Card>

      {/* Agents */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Agents
          </CardDescription>
          <CardTitle className="text-3xl">{Object.keys(stats.byAgent).length}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Contributing to content generation
          </p>
        </CardContent>
      </Card>

      {/* Evidence Types */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Evidence Types
          </CardDescription>
          <CardTitle className="text-3xl">{Object.keys(stats.byEvidenceType).length}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Different evidence sources used
          </p>
        </CardContent>
      </Card>

      {/* Content Type Distribution */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Content Type Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedTypes.map(([type, count]) => {
            const config = CONTENT_TYPE_CONFIG[type as ContentType];
            if (!config) return null;
            const Icon = config.icon;
            const percentage = ((count / stats.totalTraces) * 100).toFixed(1);
            
            return (
              <div key={type} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", config.color)} />
                    {config.label}
                  </span>
                  <span className="text-muted-foreground">{count} ({percentage}%)</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full transition-all", config.bgColor)}
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Agent Distribution */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Agent Contributions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(stats.byAgent)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([agent, count]) => (
              <div key={agent} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Workflow className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono text-xs">{agent}</span>
                </span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ContentTraces() {
  const [selectedPsurCaseId, setSelectedPsurCaseId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "slots" | "timeline">("slots");
  const [expandedTraceIds, setExpandedTraceIds] = useState<Set<number>>(new Set());

  // Fetch PSUR cases for selection
  const { data: psurCases = [] } = useQuery<PSURCase[]>({
    queryKey: ["/api/psur-cases"],
    queryFn: async () => {
      const res = await fetch("/api/psur-cases");
      if (!res.ok) throw new Error("Failed to fetch PSUR cases");
      return res.json();
    },
  });

  // Auto-select first case if none selected
  useEffect(() => {
    if (psurCases.length > 0 && !selectedPsurCaseId) {
      setSelectedPsurCaseId(psurCases[0].id);
    }
  }, [psurCases, selectedPsurCaseId]);

  // Fetch content traces for selected case
  const { data: tracesResponse, isLoading: tracesLoading, refetch } = useQuery({
    queryKey: ["/api/psur-cases", selectedPsurCaseId, "content-traces", contentTypeFilter, searchText],
    queryFn: async () => {
      if (!selectedPsurCaseId) return { traces: [], stats: null };
      const params = new URLSearchParams();
      if (contentTypeFilter !== "all") params.set("contentType", contentTypeFilter);
      if (searchText) params.set("search", searchText);
      params.set("limit", "500"); // Get more traces
      const res = await fetch(`/api/psur-cases/${selectedPsurCaseId}/content-traces?${params}`);
      if (!res.ok) throw new Error("Failed to fetch content traces");
      return res.json();
    },
    enabled: !!selectedPsurCaseId,
    refetchInterval: 5000, // Poll for new traces during compilation
  });

  const traces = tracesResponse?.traces || [];
  const stats = tracesResponse?.stats as ContentTraceStats | null;

  // Group traces by slot
  const tracesBySlot = useMemo(() => {
    const grouped = new Map<string, ContentTrace[]>();
    traces.forEach((trace: ContentTrace) => {
      if (!grouped.has(trace.slotId)) {
        grouped.set(trace.slotId, []);
      }
      grouped.get(trace.slotId)!.push(trace);
    });
    return grouped;
  }, [traces]);

  // Get slot info (title) from first trace in each group
  const slotInfo = useMemo(() => {
    const info = new Map<string, string | null>();
    tracesBySlot.forEach((slotTraces, slotId) => {
      info.set(slotId, slotTraces[0]?.slotTitle || null);
    });
    return info;
  }, [tracesBySlot]);

  const selectedCase = psurCases.find(c => c.id === selectedPsurCaseId);

  const toggleTrace = (id: number) => {
    setExpandedTraceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Export traces
  const handleExport = async () => {
    if (!selectedPsurCaseId) return;
    try {
      const res = await fetch(`/api/psur-cases/${selectedPsurCaseId}/content-traces/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `content-traces-${selectedPsurCaseId}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/psur" className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </a>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <Eye className="h-8 w-8 text-primary" />
                Content Traces
              </h1>
              <p className="text-muted-foreground">
                Ultra-granular traceability for every content element
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={!selectedPsurCaseId}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!selectedPsurCaseId || traces.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export JSONL
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="w-64">
                <label className="text-sm font-medium mb-2 block">PSUR Report</label>
                <Select
                  value={selectedPsurCaseId?.toString() || ""}
                  onValueChange={(v) => setSelectedPsurCaseId(parseInt(v) || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a report..." />
                  </SelectTrigger>
                  <SelectContent>
                    {psurCases.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.deviceInfo?.deviceName || c.psurReference}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-48">
                <label className="text-sm font-medium mb-2 block">Content Type</label>
                <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <Separator className="my-1" />
                    {Object.entries(CONTENT_TYPE_CONFIG).map(([type, config]) => (
                      <SelectItem key={type} value={type}>
                        <span className="flex items-center gap-2">
                          <config.icon className={cn("h-4 w-4", config.color)} />
                          {config.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1 min-w-64">
                <label className="text-sm font-medium mb-2 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search content, rationale, methodology..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
                <TabsList>
                  <TabsTrigger value="slots" className="gap-2">
                    <Layers className="h-4 w-4" />
                    Slots
                  </TabsTrigger>
                  <TabsTrigger value="table" className="gap-2">
                    <TableIcon className="h-4 w-4" />
                    Table
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="gap-2">
                    <Activity className="h-4 w-4" />
                    Stats
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Selected Case Info */}
        {selectedCase && (
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="outline" className="gap-1">
              <FileText className="h-3 w-3" />
              {selectedCase.deviceInfo?.deviceName || selectedCase.psurReference}
            </Badge>
            {selectedCase.templateId && (
              <Badge variant="secondary" className="gap-1">
                <Layers className="h-3 w-3" />
                {selectedCase.templateId}
              </Badge>
            )}
            <Badge variant={selectedCase.status === "exported" ? "default" : "secondary"}>
              {selectedCase.status}
            </Badge>
            {stats && (
              <span className="text-muted-foreground ml-auto">
                {stats.totalTraces.toLocaleString()} traces across {tracesBySlot.size} sections
              </span>
            )}
          </div>
        )}

        {/* Content */}
        {!selectedPsurCaseId ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center text-muted-foreground">
                <Filter className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-semibold mb-2">Select a Report</h3>
                <p>Choose a PSUR report to view its content traces</p>
              </div>
            </CardContent>
          </Card>
        ) : tracesLoading ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center text-muted-foreground">
                <RefreshCw className="h-10 w-10 mx-auto mb-4 animate-spin" />
                <p>Loading content traces...</p>
              </div>
            </CardContent>
          </Card>
        ) : traces.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-semibold mb-2">No Content Traces Found</h3>
                <p>Content traces are generated during PSUR document compilation.</p>
                <p className="text-sm mt-2">Run the workflow to generate traces for this report.</p>
              </div>
            </CardContent>
          </Card>
        ) : viewMode === "timeline" && stats ? (
          <StatsVisualization stats={stats} />
        ) : viewMode === "slots" ? (
          <div className="space-y-4">
            {Array.from(tracesBySlot.entries()).map(([slotId, slotTraces]) => (
              <SlotGroup 
                key={slotId}
                slotId={slotId}
                slotTitle={slotInfo.get(slotId) || null}
                traces={slotTraces}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TableIcon className="h-5 w-5" />
                All Content Traces
              </CardTitle>
              <CardDescription>
                {traces.length} traces found. Click a row to expand details.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead>Content</TableHead>
                      <TableHead className="w-[120px]">Agent</TableHead>
                      <TableHead className="w-[150px]">Section</TableHead>
                      <TableHead className="w-[80px]">Evidence</TableHead>
                      <TableHead className="w-[80px]">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traces.map((trace: ContentTrace) => (
                      <TraceRow 
                        key={trace.id} 
                        trace={trace}
                        isExpanded={expandedTraceIds.has(trace.id)}
                        onToggle={() => toggleTrace(trace.id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
