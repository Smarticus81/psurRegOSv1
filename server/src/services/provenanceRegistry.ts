/**
 * Provenance Registry - Statement-Level Decision Traceability
 * 
 * SOTA system for unprecedented auditability of PSUR content.
 * Tracks the complete lineage of every data point and statement.
 * 
 * For each piece of content, answers:
 * - WHERE: Source file, row, column, cell reference
 * - WHEN: Extraction timestamp, transformation timestamp, render timestamp
 * - HOW: Derivation method (direct, aggregated, inferred, calculated)
 * - WHY: Regulatory requirement, slot obligation, business rule
 * - WHICH: Evidence atoms that contributed to this content
 * 
 * Regulatory Purpose: EU MDR Article 86 Post-Market Surveillance auditability
 */

import { v4 as uuidv4 } from "uuid";

// ═══════════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Source location - WHERE the data came from
 */
export interface SourceLocation {
  fileId: string;
  filename: string;
  fileType: "EXCEL" | "CSV" | "DOCX" | "PDF" | "JSON" | "API";
  sheetName?: string;       // For Excel
  rowNumber?: number;       // For tabular data
  columnName?: string;      // For tabular data
  cellReference?: string;   // e.g., "B15" for Excel
  pageNumber?: number;      // For PDF/DOCX
  sectionId?: string;       // For structured documents
  xpath?: string;           // For XML/HTML
  jsonPath?: string;        // For JSON
  uploadedAt: Date;
  uploadedBy?: string;
}

/**
 * Timestamp chain - WHEN things happened
 */
export interface TimestampChain {
  extractedAt: Date;
  transformedAt?: Date;
  validatedAt?: Date;
  renderedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
}

/**
 * Derivation method - HOW the value was obtained
 */
export type DerivationMethod = 
  | "DIRECT_EXTRACTION"     // Copied directly from source
  | "AGGREGATION_SUM"       // Sum of multiple values
  | "AGGREGATION_COUNT"     // Count of records
  | "AGGREGATION_AVERAGE"   // Average of values
  | "AGGREGATION_MAX"       // Maximum value
  | "AGGREGATION_MIN"       // Minimum value
  | "RATE_CALCULATION"      // Computed rate (numerator/denominator)
  | "PERCENTAGE"            // Percentage calculation
  | "LLM_INFERENCE"         // AI-inferred value
  | "LLM_GENERATION"        // AI-generated narrative
  | "RULE_BASED"            // Business rule applied
  | "DEFAULT_VALUE"         // Fallback/default used
  | "MANUAL_OVERRIDE"       // User override
  | "CROSS_REFERENCE"       // Referenced from another section
  | "NEGATIVE_EVIDENCE";    // Confirmed absence of data

/**
 * Regulatory justification - WHY this content exists
 */
export interface RegulatoryJustification {
  mdcgSection?: string;           // e.g., "MDCG.ANNEXI.EXEC_SUMMARY"
  articleReference?: string;      // e.g., "EU MDR Article 86"
  obligationId?: string;          // GRKB obligation ID
  obligationText?: string;        // Human-readable obligation
  slotId: string;                 // Template slot this fulfills
  slotTitle: string;
  businessReason?: string;        // Additional business context
}

/**
 * Quality metadata
 */
export interface QualityMetadata {
  confidence: number;             // 0-1 confidence score
  validationStatus: "VALIDATED" | "UNVALIDATED" | "FLAGGED" | "OVERRIDE";
  qualityFlags: string[];         // Any quality concerns
  humanReviewRequired: boolean;
  humanReviewNotes?: string;
}

/**
 * ProvenanceNode - Complete traceability for a single data point or statement
 */
export interface ProvenanceNode {
  nodeId: string;
  psurCaseId: number;
  
  // The actual content being traced
  contentType: "STATISTIC" | "STATEMENT" | "TABLE_ROW" | "TABLE_CELL" | "CHART_POINT" | "CONCLUSION" | "CALCULATION";
  contentValue: string;           // The actual value or text
  contentLocation: {              // Where in the PSUR this appears
    slotId: string;
    sectionTitle: string;
    paragraphIndex?: number;
    sentenceIndex?: number;
    tableRow?: number;
    tableColumn?: number;
  };
  
  // WHERE
  sources: SourceLocation[];
  
  // WHEN
  timestamps: TimestampChain;
  
  // HOW
  derivation: {
    method: DerivationMethod;
    formula?: string;             // For calculations: e.g., "COUNT(complaints)"
    parameters?: Record<string, unknown>;
    reasoning: string;            // Human-readable explanation
  };
  
  // WHY
  justification: RegulatoryJustification;
  
  // WHICH
  evidenceAtomIds: string[];      // Contributing evidence atoms
  parentNodeIds?: string[];       // If derived from other provenance nodes
  
  // Quality
  quality: QualityMetadata;
  
  // Metadata
  createdAt: Date;
  createdBy: string;              // Agent or user that created this
}

/**
 * TracedStatement - A sentence or paragraph with inline provenance markers
 */
export interface TracedStatement {
  statementId: string;
  slotId: string;
  text: string;
  provenanceMarkers: {
    startIndex: number;
    endIndex: number;
    nodeId: string;               // Reference to ProvenanceNode
    markerType: "STATISTIC" | "CLAIM" | "REFERENCE" | "CALCULATION";
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVENANCE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * In-memory registry for provenance nodes during PSUR compilation
 * Can be persisted to database after compilation completes
 */
class ProvenanceRegistryImpl {
  private nodes: Map<string, ProvenanceNode> = new Map();
  private nodesByPsurCase: Map<number, Set<string>> = new Map();
  private nodesBySlot: Map<string, Set<string>> = new Map();
  private nodesByAtom: Map<string, Set<string>> = new Map();
  
  /**
   * Register a new provenance node
   */
  public register(node: Omit<ProvenanceNode, "nodeId" | "createdAt">): ProvenanceNode {
    const fullNode: ProvenanceNode = {
      ...node,
      nodeId: uuidv4(),
      createdAt: new Date(),
    };
    
    // Store in main map
    this.nodes.set(fullNode.nodeId, fullNode);
    
    // Index by PSUR case
    if (!this.nodesByPsurCase.has(fullNode.psurCaseId)) {
      this.nodesByPsurCase.set(fullNode.psurCaseId, new Set());
    }
    this.nodesByPsurCase.get(fullNode.psurCaseId)!.add(fullNode.nodeId);
    
    // Index by slot
    const slotKey = `${fullNode.psurCaseId}:${fullNode.contentLocation.slotId}`;
    if (!this.nodesBySlot.has(slotKey)) {
      this.nodesBySlot.set(slotKey, new Set());
    }
    this.nodesBySlot.get(slotKey)!.add(fullNode.nodeId);
    
    // Index by evidence atoms
    for (const atomId of fullNode.evidenceAtomIds) {
      if (!this.nodesByAtom.has(atomId)) {
        this.nodesByAtom.set(atomId, new Set());
      }
      this.nodesByAtom.get(atomId)!.add(fullNode.nodeId);
    }
    
    return fullNode;
  }
  
  /**
   * Get a node by ID
   */
  public get(nodeId: string): ProvenanceNode | undefined {
    return this.nodes.get(nodeId);
  }
  
  /**
   * Get all nodes for a PSUR case
   */
  public getByPsurCase(psurCaseId: number): ProvenanceNode[] {
    const nodeIds = this.nodesByPsurCase.get(psurCaseId);
    if (!nodeIds) return [];
    return Array.from(nodeIds).map(id => this.nodes.get(id)!).filter(Boolean);
  }
  
  /**
   * Get all nodes for a specific slot
   */
  public getBySlot(psurCaseId: number, slotId: string): ProvenanceNode[] {
    const slotKey = `${psurCaseId}:${slotId}`;
    const nodeIds = this.nodesBySlot.get(slotKey);
    if (!nodeIds) return [];
    return Array.from(nodeIds).map(id => this.nodes.get(id)!).filter(Boolean);
  }
  
  /**
   * Get all nodes that reference a specific evidence atom
   */
  public getByAtom(atomId: string): ProvenanceNode[] {
    const nodeIds = this.nodesByAtom.get(atomId);
    if (!nodeIds) return [];
    return Array.from(nodeIds).map(id => this.nodes.get(id)!).filter(Boolean);
  }
  
  /**
   * Get provenance chain - trace back to source
   */
  public getProvenanceChain(nodeId: string): ProvenanceNode[] {
    const chain: ProvenanceNode[] = [];
    const visited = new Set<string>();
    
    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      
      const node = this.nodes.get(id);
      if (!node) return;
      
      chain.push(node);
      
      // Traverse parent nodes
      if (node.parentNodeIds) {
        for (const parentId of node.parentNodeIds) {
          traverse(parentId);
        }
      }
    };
    
    traverse(nodeId);
    return chain;
  }
  
  /**
   * Generate audit report for a PSUR case
   */
  public generateAuditReport(psurCaseId: number): ProvenanceAuditReport {
    const nodes = this.getByPsurCase(psurCaseId);
    
    // Group by slot
    const bySlot = new Map<string, ProvenanceNode[]>();
    for (const node of nodes) {
      const slotId = node.contentLocation.slotId;
      if (!bySlot.has(slotId)) {
        bySlot.set(slotId, []);
      }
      bySlot.get(slotId)!.push(node);
    }
    
    // Calculate statistics
    const derivationMethods = new Map<DerivationMethod, number>();
    const qualityFlags: string[] = [];
    let totalConfidence = 0;
    let humanReviewCount = 0;
    
    for (const node of nodes) {
      // Count derivation methods
      const method = node.derivation.method;
      derivationMethods.set(method, (derivationMethods.get(method) || 0) + 1);
      
      // Aggregate quality
      totalConfidence += node.quality.confidence;
      if (node.quality.humanReviewRequired) humanReviewCount++;
      qualityFlags.push(...node.quality.qualityFlags);
    }
    
    return {
      psurCaseId,
      generatedAt: new Date(),
      totalNodes: nodes.length,
      nodesBySlot: Object.fromEntries(bySlot),
      derivationMethodBreakdown: Object.fromEntries(derivationMethods),
      averageConfidence: nodes.length > 0 ? totalConfidence / nodes.length : 0,
      humanReviewRequired: humanReviewCount,
      qualityFlags: Array.from(new Set(qualityFlags)),
      uniqueSourceFiles: new Set(nodes.flatMap(n => n.sources.map(s => s.filename))).size,
      uniqueEvidenceAtoms: new Set(nodes.flatMap(n => n.evidenceAtomIds)).size,
    };
  }
  
  /**
   * Clear all nodes for a PSUR case
   */
  public clearCase(psurCaseId: number): void {
    const nodeIds = this.nodesByPsurCase.get(psurCaseId);
    if (!nodeIds) return;
    
    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      if (node) {
        // Remove from atom index
        for (const atomId of node.evidenceAtomIds) {
          this.nodesByAtom.get(atomId)?.delete(nodeId);
        }
        // Remove from slot index
        const slotKey = `${psurCaseId}:${node.contentLocation.slotId}`;
        this.nodesBySlot.get(slotKey)?.delete(nodeId);
      }
      this.nodes.delete(nodeId);
    }
    
    this.nodesByPsurCase.delete(psurCaseId);
  }
  
  /**
   * Export all nodes for persistence
   */
  public exportForPersistence(psurCaseId: number): ProvenanceNode[] {
    return this.getByPsurCase(psurCaseId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT REPORT TYPE
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProvenanceAuditReport {
  psurCaseId: number;
  generatedAt: Date;
  totalNodes: number;
  nodesBySlot: Record<string, ProvenanceNode[]>;
  derivationMethodBreakdown: Record<string, number>;
  averageConfidence: number;
  humanReviewRequired: number;
  qualityFlags: string[];
  uniqueSourceFiles: number;
  uniqueEvidenceAtoms: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const ProvenanceRegistry = new ProvenanceRegistryImpl();

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a provenance node for a statistic
 */
export function createStatisticProvenance(
  psurCaseId: number,
  slotId: string,
  sectionTitle: string,
  statisticName: string,
  value: number | string,
  derivation: {
    method: DerivationMethod;
    formula?: string;
    reasoning: string;
  },
  sources: SourceLocation[],
  evidenceAtomIds: string[],
  confidence: number,
  createdBy: string
): ProvenanceNode {
  return ProvenanceRegistry.register({
    psurCaseId,
    contentType: "STATISTIC",
    contentValue: String(value),
    contentLocation: { slotId, sectionTitle },
    sources,
    timestamps: { extractedAt: new Date() },
    derivation: { ...derivation },
    justification: {
      slotId,
      slotTitle: sectionTitle,
    },
    evidenceAtomIds,
    quality: {
      confidence,
      validationStatus: confidence >= 0.8 ? "VALIDATED" : "UNVALIDATED",
      qualityFlags: confidence < 0.7 ? ["LOW_CONFIDENCE"] : [],
      humanReviewRequired: confidence < 0.7,
    },
    createdBy,
  });
}

/**
 * Create a provenance node for an LLM-generated statement
 */
export function createStatementProvenance(
  psurCaseId: number,
  slotId: string,
  sectionTitle: string,
  statement: string,
  reasoning: string,
  evidenceAtomIds: string[],
  createdBy: string
): ProvenanceNode {
  return ProvenanceRegistry.register({
    psurCaseId,
    contentType: "STATEMENT",
    contentValue: statement,
    contentLocation: { slotId, sectionTitle },
    sources: [], // LLM-generated has no direct source
    timestamps: { extractedAt: new Date(), renderedAt: new Date() },
    derivation: {
      method: "LLM_GENERATION",
      reasoning,
    },
    justification: {
      slotId,
      slotTitle: sectionTitle,
    },
    evidenceAtomIds,
    quality: {
      confidence: 0.85, // LLM-generated content has moderate confidence
      validationStatus: "UNVALIDATED",
      qualityFlags: ["LLM_GENERATED"],
      humanReviewRequired: true,
    },
    createdBy,
  });
}

/**
 * Create a provenance node for a table cell
 */
export function createTableCellProvenance(
  psurCaseId: number,
  slotId: string,
  sectionTitle: string,
  row: number,
  column: number,
  value: string,
  derivation: DerivationMethod,
  sources: SourceLocation[],
  evidenceAtomIds: string[],
  createdBy: string
): ProvenanceNode {
  return ProvenanceRegistry.register({
    psurCaseId,
    contentType: "TABLE_CELL",
    contentValue: value,
    contentLocation: { slotId, sectionTitle, tableRow: row, tableColumn: column },
    sources,
    timestamps: { extractedAt: new Date() },
    derivation: {
      method: derivation,
      reasoning: `Table cell at row ${row}, column ${column}`,
    },
    justification: {
      slotId,
      slotTitle: sectionTitle,
    },
    evidenceAtomIds,
    quality: {
      confidence: 0.95,
      validationStatus: "VALIDATED",
      qualityFlags: [],
      humanReviewRequired: false,
    },
    createdBy,
  });
}
