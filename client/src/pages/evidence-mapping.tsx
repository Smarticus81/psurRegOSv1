import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
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
  ArrowRightLeft,
  Plus,
  Save,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  Circle,
  FileSpreadsheet,
  FileText,
  Database,
  AlertTriangle,
  ChevronRight,
  Pencil,
  Link2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EVIDENCE_DEFINITIONS, ENGINE_TARGET_FIELDS } from "@shared/schema";
import type { EngineTargetField } from "@shared/schema";

// ── Types ──

interface EvidenceSourceConfig {
  id: number;
  evidenceType: string;
  sourceDocumentName: string;
  sourceLocation: {
    sheet?: string;
    section?: string;
    pageRange?: string;
    tableIndex?: number;
  } | null;
  columnMappings: Record<string, string> | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MappingRow {
  sourceColumn: string;
  targetField: string;
}

// ── Constants ──

const TIER_LABELS: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: "Device Master", color: "text-cyan-400", bg: "bg-cyan-500/15 border-cyan-500/30" },
  1: { label: "Sales & Distribution", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30" },
  2: { label: "Safety", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30" },
  3: { label: "External / Clinical", color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/30" },
};

// ── Main Component ──

export default function EvidenceMapping() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingType, setEditingType] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<string>("all");

  // Editor state
  const [editDocName, setEditDocName] = useState("");
  const [editSheet, setEditSheet] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editPageRange, setEditPageRange] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editMappings, setEditMappings] = useState<MappingRow[]>([]);

  // Data
  const { data: configs = [], isLoading } = useQuery<EvidenceSourceConfig[]>({
    queryKey: ["/api/evidence-source-configs"],
  });

  // Build lookup: evidenceType → config
  const configByType = useMemo(() => {
    const map: Record<string, EvidenceSourceConfig> = {};
    for (const c of configs) {
      map[c.evidenceType] = c;
    }
    return map;
  }, [configs]);

  // Coverage stats
  const totalTypes = EVIDENCE_DEFINITIONS.length;
  const configuredCount = EVIDENCE_DEFINITIONS.filter((d) => configByType[d.type]).length;
  const coveragePct = totalTypes > 0 ? Math.round((configuredCount / totalTypes) * 100) : 0;

  // Group by tier
  const grouped = useMemo(() => {
    const tiers: Record<number, typeof EVIDENCE_DEFINITIONS> = {};
    for (const d of EVIDENCE_DEFINITIONS) {
      if (filterTier !== "all" && d.processingPriority !== Number(filterTier)) continue;
      if (!tiers[d.processingPriority]) tiers[d.processingPriority] = [];
      tiers[d.processingPriority].push(d);
    }
    return tiers;
  }, [filterTier]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async ({ existingId, data }: { existingId: number | null; data: any }) => {
      if (existingId) {
        const res = await apiRequest("PUT", `/api/evidence-source-configs/${existingId}`, data);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/evidence-source-configs", data);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence-source-configs"] });
      setEditingType(null);
      toast({ title: "Saved", description: "Evidence source configuration updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/evidence-source-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence-source-configs"] });
      setEditingType(null);
      toast({ title: "Removed", description: "Source assignment cleared." });
    },
  });

  // Open editor for an evidence type
  const openEditor = useCallback(
    (evidenceType: string) => {
      const existing = configByType[evidenceType];
      if (existing) {
        setEditDocName(existing.sourceDocumentName);
        setEditSheet(existing.sourceLocation?.sheet || "");
        setEditSection(existing.sourceLocation?.section || "");
        setEditPageRange(existing.sourceLocation?.pageRange || "");
        setEditNotes(existing.notes || "");
        setEditMappings(
          Object.entries(existing.columnMappings || {}).map(([sourceColumn, targetField]) => ({
            sourceColumn,
            targetField,
          }))
        );
      } else {
        setEditDocName("");
        setEditSheet("");
        setEditSection("");
        setEditPageRange("");
        setEditNotes("");
        setEditMappings([]);
      }
      setEditingType(evidenceType);
    },
    [configByType]
  );

  const handleSave = useCallback(() => {
    if (!editingType || !editDocName.trim()) return;

    const sourceLocation: Record<string, string | number> = {};
    if (editSheet.trim()) sourceLocation.sheet = editSheet.trim();
    if (editSection.trim()) sourceLocation.section = editSection.trim();
    if (editPageRange.trim()) sourceLocation.pageRange = editPageRange.trim();

    const columnMappings: Record<string, string> = {};
    for (const row of editMappings) {
      if (row.sourceColumn.trim() && row.targetField) {
        columnMappings[row.sourceColumn.trim()] = row.targetField;
      }
    }

    const existing = configByType[editingType];
    saveMutation.mutate({
      existingId: existing?.id || null,
      data: {
        evidenceType: editingType,
        sourceDocumentName: editDocName.trim(),
        sourceLocation: Object.keys(sourceLocation).length > 0 ? sourceLocation : null,
        columnMappings: Object.keys(columnMappings).length > 0 ? columnMappings : null,
        notes: editNotes.trim() || null,
      },
    });
  }, [editingType, editDocName, editSheet, editSection, editPageRange, editNotes, editMappings, configByType, saveMutation]);

  // Mapping row helpers
  const addMappingRow = () => setEditMappings((prev) => [...prev, { sourceColumn: "", targetField: "" }]);
  const removeMappingRow = (idx: number) => setEditMappings((prev) => prev.filter((_, i) => i !== idx));
  const updateMappingRow = (idx: number, field: "sourceColumn" | "targetField", value: string) =>
    setEditMappings((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));

  const editingDef = EVIDENCE_DEFINITIONS.find((d) => d.type === editingType);
  const targetFields: EngineTargetField[] = editingType ? ENGINE_TARGET_FIELDS[editingType] || [] : [];

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden">
      <div className="max-w-[1800px] mx-auto px-6 py-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowRightLeft className="w-6 h-6 text-primary" />
              Evidence Input Mapping
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Point each evidence type to its source document so agents know exactly where to look.
            </p>
          </div>
          <Select value={filterTier} onValueChange={setFilterTier}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="0">Tier 0: Device Master</SelectItem>
              <SelectItem value="1">Tier 1: Sales</SelectItem>
              <SelectItem value="2">Tier 2: Safety</SelectItem>
              <SelectItem value="3">Tier 3: External / Clinical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Coverage bar */}
        <Card className="mb-4">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 min-w-[140px]">
                <span className="text-2xl font-bold">{coveragePct}%</span>
                <span className="text-sm text-muted-foreground">coverage</span>
              </div>
              <Progress value={coveragePct} className="flex-1 h-2" />
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {configuredCount} configured
                </span>
                <span className="flex items-center gap-1">
                  <Circle className="w-3.5 h-3.5 text-zinc-500" />
                  {totalTypes - configuredCount} remaining
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Evidence type grid */}
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-6 pb-6">
                {Object.entries(grouped)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([tier, definitions]) => {
                    const tierNum = Number(tier);
                    const tierMeta = TIER_LABELS[tierNum] || { label: `Tier ${tier}`, color: "text-foreground", bg: "bg-secondary" };
                    const tierConfigured = definitions.filter((d) => configByType[d.type]).length;

                    return (
                      <div key={tier}>
                        {/* Tier header */}
                        <div className="flex items-center gap-3 mb-3">
                          <Badge className={`${tierMeta.bg} ${tierMeta.color} border text-xs font-medium`}>
                            Tier {tier}
                          </Badge>
                          <span className={`text-sm font-semibold ${tierMeta.color}`}>{tierMeta.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {tierConfigured}/{definitions.length} mapped
                          </span>
                        </div>

                        {/* Evidence type rows */}
                        <div className="grid gap-2">
                          {definitions.map((def) => {
                            const config = configByType[def.type];
                            const hasMapping = !!config;

                            return (
                              <div
                                key={def.type}
                                onClick={() => openEditor(def.type)}
                                className={`group flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all ${
                                  hasMapping
                                    ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50"
                                    : "border-border hover:border-primary/30 hover:bg-secondary/30"
                                }`}
                              >
                                {/* Status icon */}
                                <div className="shrink-0">
                                  {hasMapping ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                  ) : (
                                    <Circle className="w-5 h-5 text-zinc-600" />
                                  )}
                                </div>

                                {/* Evidence type info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{def.label}</span>
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                                      {def.type}
                                    </Badge>
                                    {def.requiredFields.length > 0 && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {def.requiredFields.length} required field{def.requiredFields.length !== 1 ? "s" : ""}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {def.description}
                                  </p>
                                </div>

                                {/* PSUR sections */}
                                <div className="shrink-0 flex items-center gap-1">
                                  {def.sections.map((s) => (
                                    <Badge
                                      key={s}
                                      variant="outline"
                                      className="text-[10px] px-1 py-0 font-mono"
                                    >
                                      {s}
                                    </Badge>
                                  ))}
                                </div>

                                {/* Assigned source */}
                                <div className="shrink-0 min-w-[200px] max-w-[300px]">
                                  {hasMapping ? (
                                    <div className="flex items-center gap-2 text-sm">
                                      <Link2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                      <span className="truncate font-mono text-xs">
                                        {config.sourceDocumentName}
                                      </span>
                                      {config.sourceLocation?.sheet && (
                                        <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] shrink-0">
                                          {config.sourceLocation.sheet}
                                        </Badge>
                                      )}
                                      {config.sourceLocation?.section && (
                                        <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px] shrink-0">
                                          {config.sourceLocation.section}
                                        </Badge>
                                      )}
                                      {config.columnMappings && Object.keys(config.columnMappings).length > 0 && (
                                        <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 text-[10px] shrink-0">
                                          {Object.keys(config.columnMappings).length} cols
                                        </Badge>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">
                                      Not configured
                                    </span>
                                  )}
                                </div>

                                {/* Action */}
                                <div className="shrink-0">
                                  {hasMapping ? (
                                    <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* ── Editor Dialog ── */}
      <Dialog open={!!editingType} onOpenChange={(open) => !open && setEditingType(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {configByType[editingType || ""] ? (
                <Pencil className="w-5 h-5 text-primary" />
              ) : (
                <Plus className="w-5 h-5 text-primary" />
              )}
              {editingDef?.label || editingType}
            </DialogTitle>
            <DialogDescription>
              {editingDef?.description}
              {editingDef?.sections && (
                <span className="ml-2">
                  (Sections: {editingDef.sections.join(", ")})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-5 py-2">
              {/* Source Document */}
              <div>
                <Label htmlFor="doc-name" className="font-medium">Source Document</Label>
                <p className="text-xs text-muted-foreground mb-1.5">
                  The filename the agent should look in for this evidence type.
                </p>
                <Input
                  id="doc-name"
                  value={editDocName}
                  onChange={(e) => setEditDocName(e.target.value)}
                  placeholder="e.g., complaints_2024.xlsx, CER_v3.docx, sales_data.csv"
                  className="font-mono text-sm"
                />
              </div>

              {/* Source Location */}
              <div>
                <Label className="font-medium">Source Location (optional)</Label>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Narrow down where in the document to find this data.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="loc-sheet" className="text-xs text-muted-foreground">Sheet Name</Label>
                    <Input
                      id="loc-sheet"
                      value={editSheet}
                      onChange={(e) => setEditSheet(e.target.value)}
                      placeholder="e.g., Sheet1, Complaints"
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="loc-section" className="text-xs text-muted-foreground">Section / Heading</Label>
                    <Input
                      id="loc-section"
                      value={editSection}
                      onChange={(e) => setEditSection(e.target.value)}
                      placeholder="e.g., Benefit-Risk Analysis"
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="loc-pages" className="text-xs text-muted-foreground">Page Range</Label>
                    <Input
                      id="loc-pages"
                      value={editPageRange}
                      onChange={(e) => setEditPageRange(e.target.value)}
                      placeholder="e.g., 12-18"
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Column Mappings (only show if target fields exist for this type) */}
              {targetFields.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <Label className="font-medium">Column Mappings (optional)</Label>
                      <p className="text-xs text-muted-foreground">
                        For spreadsheets: map source columns to engine fields.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={addMappingRow} className="gap-1 h-7 text-xs">
                      <Plus className="w-3 h-3" />
                      Add
                    </Button>
                  </div>
                  {editMappings.length === 0 ? (
                    <div className="text-center py-4 border border-dashed rounded-lg text-xs text-muted-foreground">
                      No column mappings. Click "Add" for spreadsheet sources.
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Source Column</TableHead>
                            <TableHead className="text-xs w-[40px] text-center">&rarr;</TableHead>
                            <TableHead className="text-xs">Target Field</TableHead>
                            <TableHead className="text-xs w-[40px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {editMappings.map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="py-1">
                                <Input
                                  value={row.sourceColumn}
                                  onChange={(e) => updateMappingRow(idx, "sourceColumn", e.target.value)}
                                  placeholder="Column name"
                                  className="h-7 text-xs"
                                />
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground text-xs">&rarr;</TableCell>
                              <TableCell className="py-1">
                                <Select
                                  value={row.targetField}
                                  onValueChange={(val) => updateMappingRow(idx, "targetField", val)}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Select field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {targetFields.map((f) => (
                                      <SelectItem key={f.field} value={f.field}>
                                        {f.label}
                                        {f.required ? " *" : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeMappingRow(idx)}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <CoverageIndicator mappings={editMappings} targetFields={targetFields} />
                    </>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <Label htmlFor="notes" className="font-medium">Notes (optional)</Label>
                <Input
                  id="notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g., Export from SAP every quarter, ask QA for latest version"
                  className="mt-1 text-sm"
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="flex items-center justify-between pt-3 border-t">
            <div>
              {configByType[editingType || ""] && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive gap-1.5"
                  onClick={() => {
                    const existing = configByType[editingType || ""];
                    if (existing) deleteMutation.mutate(existing.id);
                  }}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Remove Assignment
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditingType(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!editDocName.trim() || saveMutation.isPending}
                className="gap-1.5"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Coverage indicator for column mappings ──

function CoverageIndicator({
  mappings,
  targetFields,
}: {
  mappings: MappingRow[];
  targetFields: EngineTargetField[];
}) {
  const mappedFields = new Set(mappings.filter((m) => m.targetField).map((m) => m.targetField));
  const requiredFields = targetFields.filter((f) => f.required);
  const coveredRequired = requiredFields.filter((f) => mappedFields.has(f.field));
  const missingRequired = requiredFields.filter((f) => !mappedFields.has(f.field));

  return (
    <div className="mt-2 p-2 rounded bg-secondary/50 border text-xs">
      <div className="flex items-center gap-3">
        <CheckCircle2
          className={`w-3.5 h-3.5 ${
            missingRequired.length === 0 ? "text-emerald-400" : "text-amber-400"
          }`}
        />
        <span>
          {coveredRequired.length}/{requiredFields.length} required fields mapped
        </span>
        {missingRequired.length > 0 && (
          <span className="text-amber-400">
            Missing: {missingRequired.map((f) => f.label).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
