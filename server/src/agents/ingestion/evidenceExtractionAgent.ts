/**
 * Evidence Extraction Agent
 * 
 * Extracts structured evidence from parsed documents using
 * rule-based extraction and LLM-assisted classification.
 */

import { BaseAgent, AgentConfig, createAgentConfig } from "../baseAgent";
import { PROMPT_TEMPLATES } from "../llmService";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExtractionInput {
  parsedContent: {
    type: "tabular" | "document" | "mixed";
    rows?: Record<string, unknown>[];
    sections?: { title: string; content: string; page?: number }[];
    tables?: { name: string; headers: string[]; rows: unknown[][] }[];
  };
  sourceFile: string;
  sourceType: string;
  evidenceType: string;
  fieldMappings: Record<string, string>;
  context: {
    deviceCode: string;
    periodStart: string;
    periodEnd: string;
  };
}

export interface ExtractedRecord {
  recordId: string;
  evidenceType: string;
  normalizedData: Record<string, unknown>;
  rawData: Record<string, unknown>;
  sourceLocation: {
    file: string;
    sheet?: string;
    row?: number;
    section?: string;
    page?: number;
  };
  extractionConfidence: number;
  extractionMethod: string;
  classifications?: {
    severity?: string;
    isAdverseEvent?: boolean;
    isSeriousIncident?: boolean;
    classificationConfidence?: number;
    classificationReasoning?: string;
  };
  warnings: string[];
}

export interface ExtractionOutput {
  records: ExtractedRecord[];
  totalExtracted: number;
  totalSkipped: number;
  skippedReasons: { row: number; reason: string }[];
  classifications: {
    bySeverity: Record<string, number>;
    adverseEvents: number;
    seriousIncidents: number;
  };
  overallConfidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const EVIDENCE_SCHEMAS: Record<string, {
  requiredFields: string[];
  optionalFields: string[];
  dateFields: string[];
  numericFields: string[];
  classifyWithLLM: boolean;
}> = {
  complaint_record: {
    requiredFields: ["complaintId", "complaintDate", "description", "deviceCode"],
    optionalFields: [
      "severity",
      "region",
      "country",
      "patientOutcome",
      "rootCause",
      "correctiveAction",
      "investigationStatus",
      "serious",
      "complaintType",
    ],
    dateFields: ["complaintDate", "incidentDate", "closedDate"],
    numericFields: [],
    classifyWithLLM: true,
  },
  serious_incident_record: {
    requiredFields: ["incidentId", "incidentDate", "description", "deviceCode"],
    optionalFields: ["patientOutcome", "deviceInvolved", "rootCause", "correctiveAction", "reportedTo"],
    dateFields: ["incidentDate", "reportDate"],
    numericFields: [],
    classifyWithLLM: false,
  },
  sales_volume: {
    requiredFields: ["deviceCode", "region", "periodStart", "periodEnd", "quantity"],
    optionalFields: ["revenue", "productLine", "channel", "country"],
    dateFields: ["periodStart", "periodEnd", "saleDate"],
    numericFields: ["quantity", "revenue"],
    classifyWithLLM: false,
  },
  fsca_record: {
    requiredFields: ["fscaId", "initiationDate", "description", "deviceCode"],
    optionalFields: ["affectedUnits", "countries", "status", "completionDate", "rootCause"],
    dateFields: ["initiationDate", "completionDate"],
    numericFields: ["affectedUnits"],
    classifyWithLLM: false,
  },
  capa_record: {
    requiredFields: ["capaId", "openDate", "description", "deviceCode"],
    optionalFields: ["type", "status", "targetDate", "effectiveness", "rootCause", "closeDate"],
    dateFields: ["openDate", "targetDate", "closeDate"],
    numericFields: [],
    classifyWithLLM: false,
  },
  pmcf_result: {
    requiredFields: ["studyId", "studyType", "findings"],
    optionalFields: ["patientCount", "startDate", "endDate", "conclusions", "adverseEvents"],
    dateFields: ["startDate", "endDate"],
    numericFields: ["patientCount"],
    classifyWithLLM: false,
  },
  literature_result: {
    requiredFields: ["referenceId", "title", "relevance"],
    optionalFields: ["authors", "publicationDate", "journal", "findings", "safetySignals"],
    dateFields: ["publicationDate"],
    numericFields: [],
    classifyWithLLM: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE EXTRACTION AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export class EvidenceExtractionAgent extends BaseAgent<ExtractionInput, ExtractionOutput> {
  constructor(config?: Partial<AgentConfig>) {
    super(createAgentConfig("EvidenceExtractionAgent", "Evidence Extraction Agent", {
      llm: {
        provider: "auto",
        temperature: 0.1,
        maxTokens: 2048,
      },
      behavior: {
        confidenceThreshold: 0.7,
        maxRetries: 2,
        retryDelayMs: 500,
        timeoutMs: 120000,
      },
      ...config,
    }));
  }

  protected async execute(input: ExtractionInput): Promise<ExtractionOutput> {
    const records: ExtractedRecord[] = [];
    const skippedReasons: { row: number; reason: string }[] = [];
    const schema = EVIDENCE_SCHEMAS[input.evidenceType] || {
      requiredFields: [],
      optionalFields: [],
      dateFields: [],
      numericFields: [],
      classifyWithLLM: false,
    };

    await this.logTrace("EXTRACTION_AGENT_INVOKED", "INFO", "EVIDENCE_UPLOAD", undefined, {
      evidenceType: input.evidenceType,
      sourceFile: input.sourceFile,
      contentType: input.parsedContent.type,
    });

    // Extract based on content type
    if (input.parsedContent.type === "tabular" && input.parsedContent.rows) {
      for (let i = 0; i < input.parsedContent.rows.length; i++) {
        const row = input.parsedContent.rows[i];
        const result = await this.extractFromRow(
          row,
          i,
          input,
          schema
        );

        if (result.success) {
          records.push(result.record!);
        } else {
          skippedReasons.push({ row: i, reason: result.reason! });
        }
      }
    } else if (input.parsedContent.sections) {
      // Document-based extraction
      for (const section of input.parsedContent.sections) {
        const sectionRecords = await this.extractFromSection(section, input, schema);
        records.push(...sectionRecords);
      }
    }

    // Classify records if needed
    if (schema.classifyWithLLM && records.length > 0) {
      await this.classifyRecords(records, input);
    }

    // Calculate statistics
    const classifications = this.calculateClassificationStats(records);
    const overallConfidence = records.length > 0
      ? records.reduce((sum, r) => sum + r.extractionConfidence, 0) / records.length
      : 0;

    await this.logTrace("EXTRACTION_COMPLETED", "PASS", "EVIDENCE_UPLOAD", undefined, {
      totalExtracted: records.length,
      totalSkipped: skippedReasons.length,
      classifications,
      overallConfidence,
    });

    return {
      records,
      totalExtracted: records.length,
      totalSkipped: skippedReasons.length,
      skippedReasons,
      classifications,
      overallConfidence,
    };
  }

  private async extractFromRow(
    row: Record<string, unknown>,
    rowIndex: number,
    input: ExtractionInput,
    schema: typeof EVIDENCE_SCHEMAS[string]
  ): Promise<{ success: boolean; record?: ExtractedRecord; reason?: string }> {
    const normalizedData: Record<string, unknown> = {};
    const warnings: string[] = [];

    // Apply field mappings
    for (const [source, target] of Object.entries(input.fieldMappings)) {
      if (row[source] !== undefined && row[source] !== null && row[source] !== "") {
        let value: unknown = row[source];

        // Type conversion
        if (schema.dateFields.includes(target)) {
          value = this.normalizeDate(value);
        } else if (schema.numericFields.includes(target)) {
          value = this.normalizeNumber(value);
        } else {
          value = String(value).trim();
        }

        normalizedData[target] = value;
      }
    }

    // Check required fields
    const missingRequired = schema.requiredFields.filter(f => !normalizedData[f]);
    if (missingRequired.length > 0) {
      return {
        success: false,
        reason: `Missing required fields: ${missingRequired.join(", ")}`,
      };
    }

    // Validate date range
    const dateFields = schema.dateFields.filter(f => normalizedData[f]);
    for (const dateField of dateFields) {
      const dateVal = normalizedData[dateField];
      if (dateVal && !this.isWithinPeriod(dateVal as string, input.context.periodStart, input.context.periodEnd)) {
        warnings.push(`${dateField} (${dateVal}) is outside reporting period`);
      }
    }

    // Generate record ID
    const recordId = this.generateRecordId(input.evidenceType, normalizedData, rowIndex);

    const record: ExtractedRecord = {
      recordId,
      evidenceType: input.evidenceType,
      normalizedData,
      rawData: { ...row },
      sourceLocation: {
        file: input.sourceFile,
        row: rowIndex + 1,
      },
      extractionConfidence: this.calculateRowConfidence(normalizedData, schema),
      extractionMethod: "rule_based",
      warnings,
    };

    await this.logTrace("RECORD_EXTRACTED", "INFO", "EVIDENCE_ATOM", recordId, {
      evidenceType: input.evidenceType,
      fieldsExtracted: Object.keys(normalizedData).length,
      confidence: record.extractionConfidence,
      hasWarnings: warnings.length > 0,
    });

    return { success: true, record };
  }

  private async extractFromSection(
    section: { title: string; content: string; page?: number },
    input: ExtractionInput,
    schema: typeof EVIDENCE_SCHEMAS[string]
  ): Promise<ExtractedRecord[]> {
    // Use LLM to extract structured data from document section
    try {
      const { content } = await this.invokeLLMForJSON<{
        records: Record<string, unknown>[];
        extractionConfidence: number;
        warnings: string[];
      }>(
        PROMPT_TEMPLATES.EVIDENCE_EXTRACTION,
        `Document Type: ${input.sourceType}
Section Title: ${section.title}
Section Content:
${section.content.substring(0, 4000)}

Target Evidence Type: ${input.evidenceType}
Required Fields: ${schema.requiredFields.join(", ")}
Optional Fields: ${schema.optionalFields.join(", ")}`,
        undefined,
        {
          operation: "SECTION_EXTRACTION",
          entityType: "EVIDENCE_ATOM",
        }
      );

      const records: ExtractedRecord[] = [];

      for (let i = 0; i < content.records.length; i++) {
        const rawRecord = content.records[i];
        const recordId = this.generateRecordId(input.evidenceType, rawRecord, i);

        records.push({
          recordId,
          evidenceType: input.evidenceType,
          normalizedData: rawRecord,
          rawData: rawRecord,
          sourceLocation: {
            file: input.sourceFile,
            section: section.title,
            page: section.page,
          },
          extractionConfidence: content.extractionConfidence,
          extractionMethod: "llm_assisted",
          warnings: content.warnings,
        });
      }

      return records;

    } catch (error: any) {
      this.addWarning(`Section extraction failed for "${section.title}": ${error.message}`);
      return [];
    }
  }

  private async classifyRecords(records: ExtractedRecord[], input: ExtractionInput): Promise<void> {
    // Batch classify for efficiency
    const batchSize = 10;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      for (const record of batch) {
        try {
          const description = String(record.normalizedData.description || "");
          const outcome = String(
            record.normalizedData.patientOutcome || record.normalizedData.outcome || ""
          );

          const { content } = await this.invokeLLMForJSON<{
            severity: string;
            isAdverseEvent: boolean;
            isSeriousIncident: boolean;
            reasoning: string;
            confidence: number;
          }>(
            PROMPT_TEMPLATES.SEVERITY_CLASSIFICATION,
            `Complaint Description: ${description}
Device Type: ${input.context.deviceCode}
Patient Outcome: ${outcome}`,
            undefined,
            {
              operation: "SEVERITY_CLASSIFICATION",
              entityType: "EVIDENCE_ATOM",
              entityId: record.recordId,
            }
          );

          record.classifications = {
            severity: content.severity,
            isAdverseEvent: content.isAdverseEvent,
            isSeriousIncident: content.isSeriousIncident,
            classificationConfidence: content.confidence,
            classificationReasoning: content.reasoning,
          };

          // Update normalized data with classification
          record.normalizedData.severity = content.severity;
          record.normalizedData.isAdverseEvent = content.isAdverseEvent;
          record.normalizedData.isSeriousIncident = content.isSeriousIncident;

          await this.logTrace("CLASSIFICATION_PERFORMED", "INFO", "EVIDENCE_ATOM", record.recordId, {
            severity: content.severity,
            isAdverseEvent: content.isAdverseEvent,
            isSeriousIncident: content.isSeriousIncident,
            confidence: content.confidence,
            reasoning: content.reasoning,
          });

        } catch (error: any) {
          this.addWarning(`Classification failed for record ${record.recordId}: ${error.message}`);
          record.classifications = {
            severity: "UNKNOWN",
            classificationReasoning: `Classification failed: ${error.message}`,
          };
        }
      }
    }
  }

  private calculateClassificationStats(records: ExtractedRecord[]): ExtractionOutput["classifications"] {
    const bySeverity: Record<string, number> = {};
    let adverseEvents = 0;
    let seriousIncidents = 0;

    for (const record of records) {
      if (record.classifications?.severity) {
        bySeverity[record.classifications.severity] = (bySeverity[record.classifications.severity] || 0) + 1;
      }
      if (record.classifications?.isAdverseEvent) adverseEvents++;
      if (record.classifications?.isSeriousIncident) seriousIncidents++;
    }

    return { bySeverity, adverseEvents, seriousIncidents };
  }

  private normalizeDate(value: unknown): string | null {
    if (!value) return null;
    
    const str = String(value);
    
    // Try parsing common formats
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }

    // Excel serial date number
    if (/^\d+$/.test(str)) {
      const excelDate = new Date((Number(str) - 25569) * 86400 * 1000);
      if (!isNaN(excelDate.getTime())) {
        return excelDate.toISOString().split("T")[0];
      }
    }

    return str;
  }

  private normalizeNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    
    const num = Number(String(value).replace(/[^0-9.-]/g, ""));
    return isNaN(num) ? null : num;
  }

  private isWithinPeriod(dateStr: string, periodStart: string, periodEnd: string): boolean {
    const date = new Date(dateStr);
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    
    // Add grace period of 30 days
    start.setDate(start.getDate() - 30);
    end.setDate(end.getDate() + 30);
    
    return date >= start && date <= end;
  }

  private generateRecordId(evidenceType: string, data: Record<string, unknown>, index: number): string {
    const prefix = evidenceType.toUpperCase().replace(/_/g, "-").substring(0, 8);
    const idField = data.complaint_id || data.incident_id || data.capa_id || data.fsca_id || data.study_id;
    
    if (idField) {
      return `ATOM-${prefix}-${String(idField).substring(0, 20)}`;
    }
    
    return `ATOM-${prefix}-${Date.now()}-${index.toString().padStart(4, "0")}`;
  }

  private calculateRowConfidence(data: Record<string, unknown>, schema: typeof EVIDENCE_SCHEMAS[string]): number {
    const requiredCount = schema.requiredFields.length;
    const optionalCount = schema.optionalFields.length;
    
    const presentRequired = schema.requiredFields.filter(f => data[f]).length;
    const presentOptional = schema.optionalFields.filter(f => data[f]).length;
    
    const requiredScore = requiredCount > 0 ? presentRequired / requiredCount : 1;
    const optionalScore = optionalCount > 0 ? presentOptional / optionalCount : 0;
    
    return requiredScore * 0.7 + optionalScore * 0.3;
  }

  protected calculateConfidence(output: ExtractionOutput): number {
    return output.overallConfidence;
  }
}
