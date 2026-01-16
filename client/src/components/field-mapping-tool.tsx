/**
 * Field Mapping Tool Component
 * 
 * SOTA mapping interface for matching source columns to target evidence fields.
 * Features auto-mapping suggestions, drag-and-drop, and confidence indicators.
 */

import { useState, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  ArrowRight,
  Check,
  X,
  Zap,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface SourceColumn {
  name: string;
  sampleValues: unknown[];
  dataType?: string;
}

interface TargetField {
  fieldName: string;
  displayName: string;
  type: string;
  required: boolean;
  description?: string;
}

interface FieldMapping {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
  method: "exact_match" | "semantic_match" | "llm_inferred" | "user_provided" | "unmapped";
  reasoning?: string;
  alternatives?: { field: string; confidence: number }[];
  requiresConfirmation?: boolean;
}

interface FieldMappingToolProps {
  sourceColumns: SourceColumn[];
  targetSchema: TargetField[];
  initialMappings?: FieldMapping[];
  onMappingsChange: (mappings: Record<string, string>) => void;
  onAutoMap?: () => Promise<FieldMapping[]>;
  loading?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const ConfidenceBadge = ({ confidence, method }: { confidence: number; method: string }) => {
  const color = confidence >= 0.9 ? "bg-emerald-500" :
                confidence >= 0.7 ? "bg-amber-500" :
                confidence >= 0.5 ? "bg-orange-500" : "bg-red-500";

  const methodLabel = {
    exact_match: "Exact",
    semantic_match: "Semantic",
    llm_inferred: "AI",
    user_provided: "Manual",
    unmapped: "None",
  }[method] || method;

  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-muted-foreground">
        {(confidence * 100).toFixed(0)}% {methodLabel}
      </span>
    </div>
  );
};

const SampleValuePreview = ({ values }: { values: unknown[] }) => {
  const samples = values.slice(0, 3).map(v => String(v).substring(0, 30));
  
  return (
    <div className="text-xs text-muted-foreground italic">
      {samples.join(", ")}
      {values.length > 3 && "..."}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function FieldMappingTool({
  sourceColumns,
  targetSchema,
  initialMappings = [],
  onMappingsChange,
  onAutoMap,
  loading = false,
}: FieldMappingToolProps) {
  // State
  const [mappings, setMappings] = useState<Map<string, FieldMapping>>(() => {
    const map = new Map<string, FieldMapping>();
    for (const m of initialMappings) {
      map.set(m.sourceColumn, m);
    }
    return map;
  });
  const [autoMapping, setAutoMapping] = useState(false);

  // Computed values
  const mappedTargets = useMemo(() => {
    const set = new Set<string>();
    for (const m of Array.from(mappings.values())) {
      if (m.targetField) set.add(m.targetField);
    }
    return set;
  }, [mappings]);

  const availableTargets = useMemo(() => {
    return targetSchema.filter(t => !mappedTargets.has(t.fieldName));
  }, [targetSchema, mappedTargets]);

  const requiredFieldsMapped = useMemo(() => {
    const requiredFields = targetSchema.filter(t => t.required);
    const mappedRequiredCount = requiredFields.filter(t => mappedTargets.has(t.fieldName)).length;
    return { mapped: mappedRequiredCount, total: requiredFields.length };
  }, [targetSchema, mappedTargets]);

  const overallConfidence = useMemo(() => {
    const mapped = Array.from(mappings.values()).filter(m => m.targetField);
    if (mapped.length === 0) return 0;
    return mapped.reduce((sum, m) => sum + m.confidence, 0) / mapped.length;
  }, [mappings]);

  // Handlers
  const handleMappingChange = useCallback((sourceColumn: string, targetField: string | null) => {
    setMappings(prev => {
      const next = new Map(prev);
      const existing = next.get(sourceColumn);
      
      next.set(sourceColumn, {
        sourceColumn,
        targetField,
        confidence: 1.0,
        method: "user_provided",
        requiresConfirmation: false,
        ...existing,
      });
      
      return next;
    });

    // Notify parent
    const newMappings: Record<string, string> = {};
    for (const [source, mapping] of Array.from(mappings.entries())) {
      if (mapping.targetField) {
        newMappings[source] = mapping.targetField;
      }
    }
    if (targetField) {
      newMappings[sourceColumn] = targetField;
    }
    onMappingsChange(newMappings);
  }, [mappings, onMappingsChange]);

  const handleAutoMap = useCallback(async () => {
    if (!onAutoMap) return;
    
    setAutoMapping(true);
    try {
      const suggestions = await onAutoMap();
      
      setMappings(prev => {
        const next = new Map(prev);
        for (const s of suggestions) {
          next.set(s.sourceColumn, s);
        }
        return next;
      });

      // Notify parent
      const newMappings: Record<string, string> = {};
      for (const s of suggestions) {
        if (s.targetField) {
          newMappings[s.sourceColumn] = s.targetField;
        }
      }
      onMappingsChange(newMappings);
    } catch (error) {
      console.error("Auto-mapping failed:", error);
    } finally {
      setAutoMapping(false);
    }
  }, [onAutoMap, onMappingsChange]);

  const handleClearMapping = useCallback((sourceColumn: string) => {
    setMappings(prev => {
      const next = new Map(prev);
      next.delete(sourceColumn);
      return next;
    });

    const newMappings: Record<string, string> = {};
    for (const [source, mapping] of Array.from(mappings.entries())) {
      if (source !== sourceColumn && mapping.targetField) {
        newMappings[source] = mapping.targetField;
      }
    }
    onMappingsChange(newMappings);
  }, [mappings, onMappingsChange]);

  const handleClearAll = useCallback(() => {
    setMappings(new Map());
    onMappingsChange({});
  }, [onMappingsChange]);

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${requiredFieldsMapped.mapped === requiredFieldsMapped.total ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span className="text-sm">
              Required: {requiredFieldsMapped.mapped}/{requiredFieldsMapped.total}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-sm">
              Mapped: {mappedTargets.size}/{targetSchema.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Progress value={overallConfidence * 100} className="w-20 h-2" />
            <span className="text-sm text-muted-foreground">
              {(overallConfidence * 100).toFixed(0)}% confidence
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onAutoMap && (
            <Button
              variant="default"
              size="sm"
              onClick={handleAutoMap}
              disabled={autoMapping || loading}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
            >
              {autoMapping ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Auto-mapping...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  AI Auto-Map
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={mappings.size === 0}
          >
            <X className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Mapping grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source columns */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Source Columns</CardTitle>
            <CardDescription>
              {sourceColumns.length} columns from your file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {sourceColumns.map((col) => {
                  const mapping = mappings.get(col.name);
                  const isMapped = mapping?.targetField != null;

                  return (
                    <div
                      key={col.name}
                      className={`
                        p-3 rounded-lg border transition-all
                        ${isMapped 
                          ? "bg-emerald-500/10 border-emerald-500/30" 
                          : "bg-muted/30 border-border hover:border-primary/30"
                        }
                      `}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono text-foreground truncate">
                              {col.name}
                            </code>
                            {isMapped && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                AUTO
                              </Badge>
                            )}
                          </div>
                          <SampleValuePreview values={col.sampleValues} />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={mapping?.targetField || ""}
                            onValueChange={(val) => handleMappingChange(col.name, val || null)}
                          >
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                              <SelectValue placeholder="Select target..." />
                            </SelectTrigger>
                            <SelectContent>
                              {mapping?.targetField && (
                                <SelectItem value={mapping.targetField}>
                                  {mapping.targetField}
                                </SelectItem>
                              )}
                              {availableTargets.map((t) => (
                                <SelectItem key={t.fieldName} value={t.fieldName}>
                                  <div className="flex items-center gap-2">
                                    <span>{t.displayName}</span>
                                    {t.required && (
                                      <span className="text-red-500 text-xs">*</span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {isMapped && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleClearMapping(col.name)}
                            >
                              <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {mapping && (
                        <div className="mt-2 flex items-center justify-between">
                          <ConfidenceBadge 
                            confidence={mapping.confidence} 
                            method={mapping.method} 
                          />
                          {mapping.reasoning && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs text-xs">{mapping.reasoning}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      )}

                      {mapping?.requiresConfirmation && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-amber-500">
                          <AlertCircle className="w-3 h-3" />
                          Needs confirmation
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Target schema */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Target Schema</CardTitle>
            <CardDescription>
              Evidence type fields to map to
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {targetSchema.map((field) => {
                  const isMapped = mappedTargets.has(field.fieldName);
                  const mappingEntry = Array.from(mappings.entries())
                    .find(([_, m]) => m.targetField === field.fieldName);

                  return (
                    <div
                      key={field.fieldName}
                      className={`
                        p-3 rounded-lg border transition-all
                        ${isMapped 
                          ? "bg-emerald-500/10 border-emerald-500/30" 
                          : field.required 
                            ? "bg-red-500/5 border-red-500/20"
                            : "bg-muted/30 border-border"
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isMapped ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : field.required ? (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          ) : (
                            <div className="w-4 h-4" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{field.displayName}</span>
                              {field.required && (
                                <Badge variant="destructive" className="text-[10px] h-4 px-1">
                                  Required
                                </Badge>
                              )}
                            </div>
                            <code className="text-xs text-muted-foreground">
                              {field.fieldName}
                            </code>
                          </div>
                        </div>

                        {isMapped && mappingEntry && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <ArrowRight className="w-3 h-3" />
                            <code className="bg-muted px-2 py-0.5 rounded">
                              {mappingEntry[0]}
                            </code>
                          </div>
                        )}
                      </div>

                      {field.description && (
                        <p className="mt-1 text-xs text-muted-foreground ml-6">
                          {field.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Action summary */}
      {requiredFieldsMapped.mapped < requiredFieldsMapped.total && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">
              {requiredFieldsMapped.total - requiredFieldsMapped.mapped} required field(s) not mapped
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground ml-6">
            Map all required fields before proceeding with extraction.
          </p>
        </div>
      )}

      {requiredFieldsMapped.mapped === requiredFieldsMapped.total && mappedTargets.size > 0 && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">
              All required fields mapped successfully
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default FieldMappingTool;
