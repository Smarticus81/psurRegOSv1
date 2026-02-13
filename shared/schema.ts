import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, serial, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============== USERS ==============
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============== COMPANIES ==============
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  jurisdictions: text("jurisdictions").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  devices: many(devices),
  dataSources: many(dataSources),
}));

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

// ============== DEVICES ==============
export const deviceClassEnum = ["Class I", "Class IIa", "Class IIb", "Class III"] as const;
export type DeviceClass = typeof deviceClassEnum[number];

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  deviceCode: text("device_code").notNull(),
  riskClass: text("risk_class").notNull(), // Class I, IIa, IIb, III
  jurisdictions: text("jurisdictions").array().default(sql`ARRAY[]::text[]`),
  basicUdf: text("basic_udf"), // EU UDI
  gmdnCode: text("gmdn_code"),
  imdrfClassification: text("imdrf_classification"),
  deviceGroup: text("device_group"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const devicesRelations = relations(devices, ({ one, many }) => ({
  company: one(companies, {
    fields: [devices.companyId],
    references: [companies.id],
  }),
  psurItems: many(psurItems),
}));

export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  createdAt: true,
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;

// ============== PSUR ITEMS ==============
export const psurStatusEnum = ["not_started", "assigned", "in_progress", "draft", "in_review", "submitted", "closed", "on_hold"] as const;
export type PSURStatus = typeof psurStatusEnum[number];

export const psurFrequencyEnum = ["annual", "biennial", "5_years", "ad_hoc"] as const;
export type PSURFrequency = typeof psurFrequencyEnum[number];

export const psurItems = pgTable("psur_items", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  psurNumber: text("psur_number").notNull(),
  jurisdiction: text("jurisdiction").notNull(), // EU, UK, US, Canada
  startPeriod: timestamp("start_period").notNull(),
  endPeriod: timestamp("end_period").notNull(),
  dueDate: timestamp("due_date").notNull(),
  frequency: text("frequency").notNull(), // annual, biennial, 5_years, ad_hoc
  status: text("status").notNull().default("not_started"),
  writer: text("writer"),
  reviewedBy: text("reviewed_by"),
  notes: text("notes"),
  documentPath: text("document_path"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const psurItemsRelations = relations(psurItems, ({ one }) => ({
  device: one(devices, {
    fields: [psurItems.deviceId],
    references: [devices.id],
  }),
}));

export const insertPsurItemSchema = createInsertSchema(psurItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PSURItem = typeof psurItems.$inferSelect;
export type InsertPSURItem = z.infer<typeof insertPsurItemSchema>;

// ============== DATA SOURCES ==============
export const dataSourceTypeEnum = ["sales", "complaints", "adverse_events", "cer"] as const;
export type DataSourceType = typeof dataSourceTypeEnum[number];

export const dataSources = pgTable("data_sources", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // sales, complaints, adverse_events, cer
  filePath: text("file_path"),
  columnMapping: jsonb("column_mapping"), // JSON mapping of source columns to standard columns
  recordCount: integer("record_count").default(0),
  lastUpdated: timestamp("last_updated"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const dataSourcesRelations = relations(dataSources, ({ one }) => ({
  company: one(companies, {
    fields: [dataSources.companyId],
    references: [companies.id],
  }),
}));

export const insertDataSourceSchema = createInsertSchema(dataSources).omit({
  id: true,
  createdAt: true,
});

export type DataSource = typeof dataSources.$inferSelect;
export type InsertDataSource = z.infer<typeof insertDataSourceSchema>;

// ============== AGENT EXECUTIONS ==============
export const agentStatusEnum = ["pending", "running", "completed", "failed", "cancelled"] as const;
export type AgentStatus = typeof agentStatusEnum[number];

export const agentExecutions = pgTable("agent_executions", {
  id: serial("id").primaryKey(),
  agentType: text("agent_type").notNull(), // psur, capa, complaint, trending
  status: text("status").notNull().default("pending"),
  deviceId: integer("device_id").references(() => devices.id),
  psurItemId: integer("psur_item_id").references(() => psurItems.id),
  jurisdictions: text("jurisdictions").array().default(sql`ARRAY[]::text[]`), // Multiple jurisdictions
  pmsPlanNumber: text("pms_plan_number"), // For quick start lookup
  previousPsurNumber: text("previous_psur_number"), // For quick start lookup
  partNumbers: text("part_numbers").array(), // Device part numbers for the surveillance
  templateId: text("template_id"), // Template to use: MDCG_2022_21_ANNEX_I
  startPeriod: timestamp("start_period"),
  endPeriod: timestamp("end_period"),
  steps: jsonb("steps").default(sql`'[]'::jsonb`), // Array of step objects
  currentStep: integer("current_step").default(0),
  totalSteps: integer("total_steps").default(0),
  result: jsonb("result"), // Final result data
  error: text("error"),
  tokensUsed: integer("tokens_used").default(0),
  costUsd: text("cost_usd").default("0"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAgentExecutionSchema = createInsertSchema(agentExecutions).omit({
  id: true,
  createdAt: true,
});

export type AgentExecution = typeof agentExecutions.$inferSelect;
export type InsertAgentExecution = z.infer<typeof insertAgentExecutionSchema>;

// ============== AUDIT EVENTS ==============
export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // company, device, psur_item, agent_execution
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(), // create, update, delete, status_change
  actor: text("actor"), // user or agent id
  previousData: jsonb("previous_data"),
  newData: jsonb("new_data"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({
  id: true,
  createdAt: true,
});

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;

// ============== SALES DATA ==============
export const salesData = pgTable("sales_data", {
  id: serial("id").primaryKey(),
  dataSourceId: integer("data_source_id").notNull().references(() => dataSources.id, { onDelete: "cascade" }),
  deviceCode: text("device_code").notNull(),
  country: text("country"),
  region: text("region"),
  quantity: integer("quantity").notNull(),
  saleDate: timestamp("sale_date").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSalesDataSchema = createInsertSchema(salesData).omit({
  id: true,
  createdAt: true,
});

export type SalesDataRecord = typeof salesData.$inferSelect;
export type InsertSalesData = z.infer<typeof insertSalesDataSchema>;

// ============== COMPLAINT DATA ==============
export const complaintSeverityEnum = ["low", "medium", "high", "critical"] as const;
export type ComplaintSeverity = typeof complaintSeverityEnum[number];

export const complaintData = pgTable("complaint_data", {
  id: serial("id").primaryKey(),
  dataSourceId: integer("data_source_id").notNull().references(() => dataSources.id, { onDelete: "cascade" }),
  complaintId: text("complaint_id").notNull(),
  deviceCode: text("device_code").notNull(),
  description: text("description"),
  customerEffect: text("customer_effect"),
  severity: text("severity"), // low, medium, high, critical
  receivedDate: timestamp("received_date").notNull(),
  closedDate: timestamp("closed_date"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertComplaintDataSchema = createInsertSchema(complaintData).omit({
  id: true,
  createdAt: true,
});

export type ComplaintDataRecord = typeof complaintData.$inferSelect;
export type InsertComplaintData = z.infer<typeof insertComplaintDataSchema>;

// ============== GENERATED DOCUMENTS ==============
export const generatedDocuments = pgTable("generated_documents", {
  id: serial("id").primaryKey(),
  agentExecutionId: integer("agent_execution_id").references(() => agentExecutions.id),
  psurItemId: integer("psur_item_id").references(() => psurItems.id),
  documentType: text("document_type").notNull(), // psur, pmsr, capa
  title: text("title").notNull(),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  sections: jsonb("sections"), // Array of section objects with completion status
  reviewStatus: text("review_status").default("pending"), // pending, approved, rejected
  reviewNotes: text("review_notes"),
  generatedAt: timestamp("generated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertGeneratedDocumentSchema = createInsertSchema(generatedDocuments).omit({
  id: true,
  generatedAt: true,
});

export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
export type InsertGeneratedDocument = z.infer<typeof insertGeneratedDocumentSchema>;

// ============== GRKB ENTRIES ==============
export const grkbEntries = pgTable("grkb_entries", {
  id: serial("id").primaryKey(),
  regulation: text("regulation").notNull(), // EU_MDR, UK_MDR, FDA
  category: text("category").notNull(), // psur_requirements, complaint_handling, adverse_event_reporting
  deviceClass: text("device_class"),
  requirement: jsonb("requirement").notNull(), // Structured requirement data
  references: text("references").array(), // Article numbers, guidance documents
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertGrkbEntrySchema = createInsertSchema(grkbEntries).omit({
  id: true,
  createdAt: true,
});

export type GRKBEntry = typeof grkbEntries.$inferSelect;
export type InsertGRKBEntry = z.infer<typeof insertGrkbEntrySchema>;

// ============== GRKB OBLIGATIONS (NEW - DB-backed source of truth) ==============
// This is the new, properly structured GRKB table for Step 1 qualification
export const grkbKindEnum = ["obligation", "constraint", "definition"] as const;
export type GrkbKind = typeof grkbKindEnum[number];

export const grkbObligations = pgTable("grkb_obligations", {
  id: serial("id").primaryKey(),
  obligationId: text("obligation_id").notNull(), // Stable unique identifier, e.g., "EU_MDR.PSUR.OBL.001"
  jurisdiction: text("jurisdiction").notNull(), // EU_MDR, UK_MDR
  artifactType: text("artifact_type").notNull(), // PSUR, CER, PMS_REPORT
  templateId: text("template_id"), // Nullable: applies to specific template or all if null
  kind: text("kind").notNull().default("obligation"), // obligation, constraint, definition
  title: text("title").notNull(),
  text: text("text").notNull(), // Full obligation text
  sourceCitation: text("source_citation"), // e.g., "Article 86(1)", "MDCG 2022-21 Section 3.2"
  version: text("version").notNull().default("1.0.0"),
  effectiveFrom: timestamp("effective_from"),
  mandatory: boolean("mandatory").notNull().default(true),
  requiredEvidenceTypes: text("required_evidence_types").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertGrkbObligationSchema = createInsertSchema(grkbObligations).omit({
  id: true,
  createdAt: true,
});

export type GrkbObligation = typeof grkbObligations.$inferSelect;
export type InsertGrkbObligation = z.infer<typeof insertGrkbObligationSchema>;

// ============== QUALIFICATION REPORTS ==============
// Persisted result of Step 1 qualification
export const qualificationReports = pgTable("qualification_reports", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").references(() => psurCases.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  jurisdictions: text("jurisdictions").array().default(sql`ARRAY[]::text[]`),
  status: text("status").notNull(), // VERIFIED or BLOCKED
  slotCount: integer("slot_count").notNull(),
  mappingCount: integer("mapping_count").notNull(),
  mandatoryObligationsTotal: integer("mandatory_obligations_total").notNull(),
  mandatoryObligationsFound: integer("mandatory_obligations_found").notNull(),
  missingObligations: jsonb("missing_obligations"), // Array of {jurisdiction, count, message}
  constraints: integer("constraints").notNull(),
  blockingErrors: text("blocking_errors").array().default(sql`ARRAY[]::text[]`),
  validatedAt: timestamp("validated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertQualificationReportSchema = createInsertSchema(qualificationReports).omit({
  id: true,
  createdAt: true,
});

export type QualificationReport = typeof qualificationReports.$inferSelect;
export type InsertQualificationReport = z.infer<typeof insertQualificationReportSchema>;

// ============== PSUR CASES ==============
export const psurCaseStatusEnum = ["draft", "qualified", "in_progress", "rendered", "exported", "closed", "voided"] as const;
export type PSURCaseStatus = typeof psurCaseStatusEnum[number];

export const psurCases = pgTable("psur_cases", {
  id: serial("id").primaryKey(),
  psurReference: text("psur_reference").notNull(),
  version: integer("version").notNull().default(1),
  templateId: text("template_id").notNull(),
  jurisdictions: text("jurisdictions").array().default(sql`ARRAY[]::text[]`),
  startPeriod: timestamp("start_period").notNull(),
  endPeriod: timestamp("end_period").notNull(),
  deviceIds: integer("device_ids").array(),
  leadingDeviceId: integer("leading_device_id").references(() => devices.id),
  groupingRationale: text("grouping_rationale"),
  qualificationStatus: text("qualification_status").default("pending"),
  qualificationResult: jsonb("qualification_result"),
  // Device info extracted from evidence (auto-populated during ingestion)
  deviceInfo: jsonb("device_info").$type<{
    deviceCode?: string;
    deviceName?: string;
    manufacturerName?: string;
    udiDi?: string;
    gmdnCode?: string;
    riskClass?: string;
    intendedPurpose?: string;
    extractedFrom?: string; // source file name
    extractedAt?: string;   // ISO timestamp
  }>(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPsurCaseSchema = createInsertSchema(psurCases, {
  // Coerce date strings to Date objects for timestamp fields
  startPeriod: z.coerce.date(),
  endPeriod: z.coerce.date(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PSURCase = typeof psurCases.$inferSelect;
export type InsertPSURCase = z.infer<typeof insertPsurCaseSchema>;

// ============== EVIDENCE UPLOADS ==============
export const evidenceUploadStatusEnum = ["pending", "processing", "completed", "failed", "rejected"] as const;
export type EvidenceUploadStatus = typeof evidenceUploadStatusEnum[number];

export const evidenceUploads = pgTable(
  "evidence_uploads",
  {
    id: serial("id").primaryKey(),
    filename: text("filename").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    sha256Hash: text("sha256_hash").notNull(),
    evidenceType: text("evidence_type").notNull(),
    deviceScopeId: integer("device_scope_id").references(() => devices.id),
    // REQUIRED: Every upload must be linked to a PSUR case
    psurCaseId: integer("psur_case_id").notNull().references(() => psurCases.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").default("system"),
    sourceSystem: text("source_system"),
    extractionNotes: text("extraction_notes"),
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    status: text("status").notNull().default("pending"),
    processingErrors: jsonb("processing_errors"),
    atomsCreated: integer("atoms_created").default(0),
    recordsParsed: integer("records_parsed").default(0),
    recordsRejected: integer("records_rejected").default(0),
    storagePath: text("storage_path"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    processedAt: timestamp("processed_at"),
  },
  (t) => ({
    // Index for fast lookups by PSUR case
    caseIdx: index("evidence_uploads_case_idx").on(t.psurCaseId),
  })
);

export const insertEvidenceUploadSchema = createInsertSchema(evidenceUploads).omit({
  id: true,
  createdAt: true,
});

export type EvidenceUpload = typeof evidenceUploads.$inferSelect;
export type InsertEvidenceUpload = z.infer<typeof insertEvidenceUploadSchema>;

// ============== EVIDENCE TIER ==============
export const EVIDENCE_TIER = {
  PRIMARY: "primary",
  CALCULATED: "calculated",
  EXTRACTED: "extracted",
} as const;
export type EvidenceTier = typeof EVIDENCE_TIER[keyof typeof EVIDENCE_TIER];

// ============== EVIDENCE DEFINITIONS REGISTRY ==============
// Single source of truth for all evidence types - consumed by UI, parser, storage, and queue-builder
export interface EvidenceDefinition {
  type: string;
  label: string;
  description: string;
  sections: string[];  // PSUR sections this evidence feeds into
  processingPriority: number;  // Processing priority tier (0=device, 1=sales, 2=safety, 3=external)
  evidenceTier: EvidenceTier;  // PRIMARY/CALCULATED/EXTRACTED
  isAggregated: boolean;  // true for summary/aggregated data, false for raw records
  requiredFields: string[];  // Required fields for validation
  parserType: "dedicated" | "generic";  // Parser handling
}

export const EVIDENCE_DEFINITIONS: EvidenceDefinition[] = [
  // ── Tier 0: Device Master Data ──
  // Source: Device registry, technical file, EUDAMED, EU DoC
  { type: "device_identification", label: "Device Identification", description: "UDI-DI, GMDN/EMDN codes, device name, models, SRN — from device registry or technical file", sections: ["A", "B"], processingPriority: 0, evidenceTier: "primary", isAggregated: false, requiredFields: ["deviceName"], parserType: "generic" },
  { type: "device_classification", label: "Device Classification", description: "Risk class (I/IIa/IIb/III), classification rule, device group — from technical file or EUDAMED", sections: ["A"], processingPriority: 0, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "generic" },
  { type: "device_intended_use", label: "Device Intended Use", description: "Intended purpose, indications, contraindications, target population — from IFU or technical file", sections: ["A", "B"], processingPriority: 0, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "generic" },
  { type: "device_technical_specs", label: "Device Technical Specs", description: "Physical characteristics, materials, sterility, shelf life — from technical file", sections: ["B"], processingPriority: 0, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "generic" },
  { type: "manufacturer_details", label: "Manufacturer Details", description: "Legal manufacturer name, address, SRN, Authorized Rep, Notified Body — from EU DoC or EUDAMED", sections: ["A"], processingPriority: 0, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "generic" },
  { type: "regulatory_certificates", label: "Regulatory Certificates", description: "CE certificate number, UKCA, FDA clearance numbers, expiry dates — from certificate copies", sections: ["A"], processingPriority: 0, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "generic" },

  // ── Tier 1: Sales & Distribution ──
  // Source: ERP system (SAP, D365, Oracle), distribution records
  { type: "sales_transactions", label: "Sales / Distribution Data", description: "Raw sales or shipment line items (order date, quantity, product, region) — from ERP or distribution system export. The system aggregates into units sold by product, region, and period.", sections: ["C"], processingPriority: 1, evidenceTier: "primary", isAggregated: false, requiredFields: ["quantity"], parserType: "dedicated" },
  { type: "market_history", label: "Market History", description: "Date first placed on market, markets entered/exited, volume trends — from regulatory or commercial records", sections: ["C"], processingPriority: 1, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "generic" },

  // ── Tier 2: Safety (Complaints, Incidents, FSCA, CAPA) ──
  // Source: QMS (TrackWise, Greenlight, MasterControl), vigilance system
  { type: "complaint_record", label: "Complaint Records", description: "Complaint ID, date, description, severity, product, lot, region, investigation — from QMS complaint database export", sections: ["D", "E"], processingPriority: 2, evidenceTier: "primary", isAggregated: false, requiredFields: ["complaintDate", "description"], parserType: "dedicated" },
  { type: "complaint_investigation", label: "Complaint Investigation", description: "Investigation findings, root cause, confirmed/unconfirmed, corrective action — from QMS (if separate from complaint export)", sections: ["D", "E"], processingPriority: 2, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "serious_incident_record", label: "Serious Incident Records", description: "Incident ID, date, description, outcome (death/injury/malfunction), product, lot — from vigilance system export", sections: ["F", "H"], processingPriority: 2, evidenceTier: "primary", isAggregated: false, requiredFields: ["incidentDate", "description"], parserType: "dedicated" },
  { type: "serious_incident_investigation", label: "Serious Incident Investigation", description: "Root cause analysis, IMDRF codes, actions taken, outcome — from vigilance system (if separate from incident export)", sections: ["F", "H"], processingPriority: 2, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "vigilance_submission_log", label: "Vigilance Submission Log", description: "Dates reported to EUDAMED and competent authorities, timeline compliance — from regulatory affairs records", sections: ["F"], processingPriority: 2, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "fsca_record", label: "FSCA Records", description: "FSCA ID, type (recall/advisory/correction), reason, date, scope, regions, status — from FSCA tracking system", sections: ["G"], processingPriority: 2, evidenceTier: "primary", isAggregated: false, requiredFields: ["fscaId", "actionType", "initiationDate"], parserType: "dedicated" },
  { type: "fsca_effectiveness", label: "FSCA Effectiveness", description: "Completion %, devices retrieved/corrected, effectiveness verification — from FSCA tracking system", sections: ["G"], processingPriority: 2, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "capa_record", label: "CAPA Records", description: "CAPA ID, trigger, root cause, corrective/preventive actions, effectiveness — from QMS CAPA module", sections: ["H"], processingPriority: 2, evidenceTier: "primary", isAggregated: false, requiredFields: ["capaId", "description"], parserType: "dedicated" },
  { type: "ncr_record", label: "NCR Records", description: "Non-conformance reports that may trigger CAPAs — from QMS NCR module", sections: ["H"], processingPriority: 2, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },

  // ── Tier 3: Literature & External Databases ──
  // Source: Literature search reports, external database exports
  { type: "literature_search_protocol", label: "Literature Search Protocol", description: "Databases searched, keywords, date range, inclusion/exclusion criteria — from literature review report", sections: ["I"], processingPriority: 3, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "literature_screening_results", label: "Literature Screening Results", description: "Studies identified, screened, included, excluded with reasons (PRISMA) — from literature review report", sections: ["I"], processingPriority: 3, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "literature_findings", label: "Literature Findings", description: "Individual study results, safety signals, performance data — from literature review or CER", sections: ["I", "L"], processingPriority: 3, evidenceTier: "extracted", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "external_db_query_log", label: "External DB Search Log", description: "Database (MAUDE/MHRA/TGA), search terms, dates, hit count — from external database search records", sections: ["J"], processingPriority: 3, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "external_db_findings", label: "External DB Findings", description: "Relevant incidents on similar devices from MAUDE, MHRA, TGA, etc. — from external database search results", sections: ["J"], processingPriority: 3, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },

  // ── Tier 3: PMCF ──
  // Source: PMCF plan, PMCF evaluation report, clinical study reports
  { type: "pmcf_activity_record", label: "PMCF Activity Record", description: "Study/activity ID, type (registry/survey/trial), status, timelines — from PMCF plan or evaluation report", sections: ["K"], processingPriority: 3, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "pmcf_results", label: "PMCF Results", description: "Study outcomes, safety/performance findings, adverse events — from PMCF evaluation report or study reports", sections: ["K", "L"], processingPriority: 3, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },

  // ── Tier 3: Clinical Evaluation & Risk Management (document extracts) ──
  // Source: CER, Risk Management File (RMF/RACT)
  { type: "benefit_risk_assessment", label: "Benefit-Risk Assessment", description: "Clinical benefits, known risks, benefit-risk determination, acceptability conclusion — from CER or standalone B/R document", sections: ["L"], processingPriority: 3, evidenceTier: "extracted", isAggregated: false, requiredFields: [], parserType: "generic" },
  { type: "risk_management_summary", label: "Risk Management Summary", description: "Identified hazards, risk controls, residual risk levels, acceptability criteria — from Risk Management File or RACT", sections: ["H", "L"], processingPriority: 3, evidenceTier: "extracted", isAggregated: false, requiredFields: [], parserType: "generic" },
  { type: "clinical_evaluation_summary", label: "Clinical Evaluation Summary", description: "CER conclusions, equivalence claims, clinical data sufficiency, state of the art — from Clinical Evaluation Report", sections: ["I", "K", "L"], processingPriority: 3, evidenceTier: "extracted", isAggregated: false, requiredFields: [], parserType: "generic" },

  // ── Tier 3: PMS & Previous PSUR ──
  // Source: PMS plan, previous PSUR document
  { type: "pms_activity_log", label: "PMS Activity Log", description: "Surveillance activities performed, planned vs actual dates, findings — from PMS plan or activity tracker", sections: ["C", "M"], processingPriority: 3, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "previous_psur_action_status", label: "Previous PSUR Action Status", description: "Status of actions/commitments from previous PSUR (completed/ongoing/overdue) — from previous PSUR document", sections: ["A", "M"], processingPriority: 3, evidenceTier: "primary", isAggregated: false, requiredFields: [], parserType: "generic" },
];

// Derive enum from registry for backwards compatibility
export const evidenceTypeEnum = EVIDENCE_DEFINITIONS.map(d => d.type) as unknown as readonly string[];
export type EvidenceType = typeof EVIDENCE_DEFINITIONS[number]["type"];

// ============== ENGINE TARGET FIELDS REGISTRY ==============
// Maps evidence types to the target fields expected by PSUR engines (derived from atomAdapters.ts).
// Used by the Evidence Mapping page UI and the suggest-mappings endpoint.
export interface EngineTargetField {
  field: string;
  label: string;
  required: boolean;
  type: "string" | "number" | "boolean" | "date";
}

export const ENGINE_TARGET_FIELDS: Record<string, EngineTargetField[]> = {
  complaint_record: [
    { field: "complaintId", label: "Complaint ID", required: true, type: "string" },
    { field: "deviceCode", label: "Device Code", required: false, type: "string" },
    { field: "complaintDate", label: "Complaint Date", required: true, type: "date" },
    { field: "description", label: "Description", required: true, type: "string" },
    { field: "category", label: "Category", required: false, type: "string" },
    { field: "severity", label: "Severity", required: false, type: "string" },
    { field: "harmLevel", label: "Harm Level", required: false, type: "string" },
    { field: "deviceRelated", label: "Device Related", required: false, type: "boolean" },
    { field: "patientInjury", label: "Patient Injury", required: false, type: "boolean" },
    { field: "investigationStatus", label: "Investigation Status", required: false, type: "string" },
    { field: "rootCause", label: "Root Cause", required: false, type: "string" },
    { field: "imdrfProblemCode", label: "IMDRF Problem Code", required: false, type: "string" },
    { field: "imdrfMdpCode", label: "IMDRF MDP Code", required: false, type: "string" },
    { field: "imdrfMdpTerm", label: "IMDRF MDP Term", required: false, type: "string" },
    { field: "imdrfHarmCode", label: "IMDRF Harm Code", required: false, type: "string" },
    { field: "imdrfHarmTerm", label: "IMDRF Harm Term", required: false, type: "string" },
    { field: "country", label: "Country", required: false, type: "string" },
    { field: "complaintConfirmed", label: "Complaint Confirmed", required: false, type: "string" },
    { field: "investigationFindings", label: "Investigation Findings", required: false, type: "string" },
    { field: "correctiveActions", label: "Corrective Actions", required: false, type: "string" },
    { field: "productNumber", label: "Product Number", required: false, type: "string" },
    { field: "lotNumber", label: "Lot Number", required: false, type: "string" },
  ],
  complaint_investigation: [
    { field: "complaintId", label: "Complaint ID", required: true, type: "string" },
    { field: "investigationFindings", label: "Investigation Findings", required: false, type: "string" },
    { field: "rootCause", label: "Root Cause", required: false, type: "string" },
    { field: "complaintConfirmed", label: "Confirmed", required: false, type: "string" },
    { field: "correctiveActions", label: "Corrective Actions", required: false, type: "string" },
  ],
  sales_transactions: [
    { field: "quantity", label: "Quantity / Units", required: true, type: "number" },
    { field: "saleDate", label: "Order / Ship Date", required: true, type: "date" },
    { field: "productName", label: "Product Name / SKU", required: false, type: "string" },
    { field: "deviceCode", label: "Device / Catalog Code", required: false, type: "string" },
    { field: "region", label: "Region / Market", required: false, type: "string" },
    { field: "country", label: "Country", required: false, type: "string" },
    { field: "lotNumber", label: "Lot / Batch Number", required: false, type: "string" },
    { field: "orderNumber", label: "Order / Invoice Number", required: false, type: "string" },
    { field: "customer", label: "Customer / Ship-to", required: false, type: "string" },
  ],
  serious_incident_record: [
    { field: "incidentId", label: "Incident ID", required: true, type: "string" },
    { field: "deviceCode", label: "Device Code", required: false, type: "string" },
    { field: "incidentDate", label: "Incident Date", required: true, type: "date" },
    { field: "reportDate", label: "Report Date", required: false, type: "date" },
    { field: "description", label: "Description", required: true, type: "string" },
    { field: "outcome", label: "Outcome", required: false, type: "string" },
    { field: "severity", label: "Severity", required: false, type: "string" },
    { field: "reportedToAuthority", label: "Reported to Authority", required: false, type: "boolean" },
    { field: "authorityReference", label: "Authority Reference", required: false, type: "string" },
    { field: "country", label: "Country", required: false, type: "string" },
    { field: "imdrfAnnexACode", label: "IMDRF Annex A Code", required: false, type: "string" },
    { field: "imdrfAnnexCCode", label: "IMDRF Annex C Code", required: false, type: "string" },
    { field: "imdrfAnnexFCode", label: "IMDRF Annex F Code", required: false, type: "string" },
    { field: "relatedCapa", label: "Related CAPA", required: false, type: "string" },
    { field: "relatedFsca", label: "Related FSCA", required: false, type: "string" },
    { field: "riskFileReference", label: "Risk File Reference", required: false, type: "string" },
  ],
  fsca_record: [
    { field: "fscaId", label: "FSCA ID", required: true, type: "string" },
    { field: "deviceCode", label: "Device Code", required: false, type: "string" },
    { field: "actionType", label: "Action Type", required: true, type: "string" },
    { field: "initiationDate", label: "Initiation Date", required: true, type: "date" },
    { field: "completionDate", label: "Completion Date", required: false, type: "date" },
    { field: "status", label: "Status", required: false, type: "string" },
    { field: "description", label: "Description", required: true, type: "string" },
    { field: "affectedUnits", label: "Affected Units", required: false, type: "number" },
    { field: "fsnReference", label: "FSN Reference", required: false, type: "string" },
    { field: "countries", label: "Countries", required: false, type: "string" },
    { field: "capaReference", label: "CAPA Reference", required: false, type: "string" },
  ],
  capa_record: [
    { field: "capaId", label: "CAPA ID", required: true, type: "string" },
    { field: "type", label: "Type (Corrective/Preventive)", required: false, type: "string" },
    { field: "status", label: "Status", required: false, type: "string" },
    { field: "openDate", label: "Open Date", required: true, type: "date" },
    { field: "closeDate", label: "Close Date", required: false, type: "date" },
    { field: "description", label: "Description", required: true, type: "string" },
    { field: "effectiveness", label: "Effectiveness", required: false, type: "string" },
    { field: "riskFileReference", label: "Risk File Reference", required: false, type: "string" },
  ],
  literature_findings: [
    { field: "referenceId", label: "Reference ID", required: true, type: "string" },
    { field: "title", label: "Title", required: true, type: "string" },
    { field: "authors", label: "Authors", required: false, type: "string" },
    { field: "publicationDate", label: "Publication Date", required: false, type: "date" },
    { field: "journal", label: "Journal", required: false, type: "string" },
    { field: "abstract", label: "Abstract", required: false, type: "string" },
    { field: "relevance", label: "Relevance", required: false, type: "string" },
    { field: "deviceRelated", label: "Device Related", required: false, type: "boolean" },
    { field: "safetySignal", label: "Safety Signal", required: false, type: "boolean" },
    { field: "safetySignalDescription", label: "Safety Signal Description", required: false, type: "string" },
    { field: "newRiskIdentified", label: "New Risk Identified", required: false, type: "boolean" },
    { field: "riskDescription", label: "Risk Description", required: false, type: "string" },
    { field: "stateOfArtRelevant", label: "State of Art Relevant", required: false, type: "boolean" },
    { field: "stateOfArtFindings", label: "State of Art Findings", required: false, type: "string" },
    { field: "searchDatabase", label: "Search Database", required: false, type: "string" },
    { field: "searchDate", label: "Search Date", required: false, type: "date" },
  ],
  pmcf_results: [
    { field: "studyId", label: "Study ID", required: true, type: "string" },
    { field: "studyName", label: "Study Name", required: false, type: "string" },
    { field: "studyType", label: "Study Type", required: false, type: "string" },
    { field: "status", label: "Status", required: false, type: "string" },
    { field: "enrolledSubjects", label: "Enrolled Subjects", required: false, type: "number" },
    { field: "startDate", label: "Start Date", required: false, type: "date" },
    { field: "endDate", label: "End Date", required: false, type: "date" },
    { field: "findings", label: "Findings", required: false, type: "string" },
    { field: "adverseEvents", label: "Adverse Events", required: false, type: "number" },
    { field: "deviceFailures", label: "Device Failures", required: false, type: "number" },
    { field: "clinicalEndpointsReached", label: "Clinical Endpoints Reached", required: false, type: "boolean" },
    { field: "deviceCode", label: "Device Code", required: false, type: "string" },
  ],
};

// Raw → Aggregated mapping: when raw records exist, they contribute to aggregated type requirements
export const RAW_TO_AGGREGATED_MAP: Record<string, string> = {
  "complaint_record": "complaint_metrics",
  "serious_incident_record": "serious_incident_metrics",
  "sales_transactions": "sales_aggregated",
  "fsca_record": "fsca_metrics",
  "capa_record": "capa_metrics",
  // Backward compat aliases
  "sales_volume": "sales_aggregated",
};

export const AGGREGATED_TO_RAW_MAP: Record<string, string> = {
  "complaint_metrics": "complaint_record",
  "serious_incident_metrics": "serious_incident_record",
  "sales_aggregated": "sales_transactions",
  "fsca_metrics": "fsca_record",
  "capa_metrics": "capa_record",
  // Backward compat aliases
  "incidents": "serious_incident_record",
  "complaints": "complaint_record",
};

// Helper functions for evidence registry
export function getEvidenceDefinition(type: string): EvidenceDefinition | undefined {
  return EVIDENCE_DEFINITIONS.find(d => d.type === type);
}

export function getEvidenceTypesForSection(section: string): EvidenceDefinition[] {
  return EVIDENCE_DEFINITIONS.filter(d => d.sections.includes(section));
}

export function getEvidenceTypesByTier(processingPriority: number): EvidenceDefinition[] {
  return EVIDENCE_DEFINITIONS.filter(d => d.processingPriority === processingPriority);
}

// Get all evidence types that satisfy a slot requirement (including raw→aggregated mappings)
export function getTypesContributingTo(requiredType: string): string[] {
  const types = [requiredType];
  const rawType = AGGREGATED_TO_RAW_MAP[requiredType];
  if (rawType) types.push(rawType);
  return types;
}

// Check if an available evidence type satisfies a required type
export function evidenceTypeSatisfies(availableType: string, requiredType: string): boolean {
  if (availableType === requiredType) return true;
  // Raw records satisfy aggregated requirements
  if (RAW_TO_AGGREGATED_MAP[availableType] === requiredType) return true;
  return false;
}

// ============== EVIDENCE ATOMS ==============

export const evidenceAtomStatusEnum = ["valid", "invalid", "superseded"] as const;
export type EvidenceAtomStatus = typeof evidenceAtomStatusEnum[number];

export const evidenceAtoms = pgTable(
  "evidence_atoms",
  {
    id: serial("id").primaryKey(),
    atomId: text("atom_id").notNull(),
    // REQUIRED: Every atom must be linked to a PSUR case
    psurCaseId: integer("psur_case_id").notNull().references(() => psurCases.id, { onDelete: "cascade" }),
    uploadId: integer("upload_id").references(() => evidenceUploads.id),
    evidenceType: text("evidence_type").notNull(),
    sourceSystem: text("source_system").notNull(),
    extractDate: timestamp("extract_date").notNull(),
    queryFilters: jsonb("query_filters"),
    contentHash: text("content_hash").notNull(),
    recordCount: integer("record_count"),
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    deviceScopeId: integer("device_scope_id").references(() => devices.id),
    deviceRef: jsonb("device_ref"),
    data: jsonb("data").notNull(),
    normalizedData: jsonb("normalized_data"),
    provenance: jsonb("provenance").notNull(),
    validationErrors: jsonb("validation_errors"),
    status: text("status").notNull().default("valid"),
    version: integer("version").notNull().default(1),
    supersededBy: integer("superseded_by"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    // Index for fast lookups by PSUR case
    caseIdx: index("evidence_atoms_case_idx").on(t.psurCaseId),
    // Index for fast lookups by evidence type + case
    typeCaseIdx: index("evidence_atoms_type_case_idx").on(t.evidenceType, t.psurCaseId),
  })
);

export const insertEvidenceAtomSchema = createInsertSchema(evidenceAtoms).omit({
  id: true,
  createdAt: true,
});

export type EvidenceAtom = typeof evidenceAtoms.$inferSelect;
export type InsertEvidenceAtom = z.infer<typeof insertEvidenceAtomSchema>;

// Canonical validation schemas for evidence atoms
export const salesVolumeAtomDataSchema = z.object({
  deviceCode: z.string(),
  productName: z.string().optional(),
  quantity: z.number().int().nonnegative(),
  region: z.string().optional(),
  country: z.string().optional(),
  distributionChannel: z.string().optional(),
  saleDate: z.string().datetime().optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  currency: z.string().optional(),
  revenue: z.number().optional(),
});

export const complaintRecordAtomDataSchema = z.object({
  complaintId: z.string(),
  deviceCode: z.string(),
  productName: z.string().optional(),
  complaintDate: z.string().datetime(),
  reportedBy: z.string().optional(),
  description: z.string(),
  category: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  deviceRelated: z.boolean().optional(),
  patientInjury: z.boolean().optional(),
  investigationStatus: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  imdrfCode: z.string().optional(),
  country: z.string().optional(),
});

export type SalesVolumeAtomData = z.infer<typeof salesVolumeAtomDataSchema>;
export type ComplaintRecordAtomData = z.infer<typeof complaintRecordAtomDataSchema>;

// ============== SLOT PROPOSALS ==============
export const proposalStatusEnum = ["pending", "accepted", "rejected", "revised"] as const;
export type ProposalStatus = typeof proposalStatusEnum[number];

export const slotProposals = pgTable("slot_proposals", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").references(() => psurCases.id, { onDelete: "cascade" }),
  slotId: text("slot_id").notNull(),
  templateId: text("template_id").notNull(),
  content: text("content"),
  evidenceAtomIds: integer("evidence_atom_ids").array().notNull(),
  claimedObligationIds: text("claimed_obligation_ids").array().notNull(),
  methodStatement: text("method_statement").notNull(),
  transformations: text("transformations").array(),
  obligationIds: text("obligation_ids").array(),
  confidenceScore: text("confidence_score"),
  status: text("status").notNull().default("pending"),
  adjudicationResult: jsonb("adjudication_result"),
  rejectionReasons: text("rejection_reasons").array(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  adjudicatedAt: timestamp("adjudicated_at"),
});

export const insertSlotProposalSchema = createInsertSchema(slotProposals).omit({
  id: true,
  createdAt: true,
});

export type SlotProposal = typeof slotProposals.$inferSelect;
export type InsertSlotProposal = z.infer<typeof insertSlotProposalSchema>;

// ============== COVERAGE REPORTS ==============
export const coverageReports = pgTable("coverage_reports", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").references(() => psurCases.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  totalObligations: integer("total_obligations").notNull(),
  satisfiedObligations: integer("satisfied_obligations").notNull(),
  missingObligations: text("missing_obligations").array(),
  totalSlots: integer("total_slots").notNull(),
  filledSlots: integer("filled_slots").notNull(),
  emptySlots: text("empty_slots").array(),
  justifiedAbsences: jsonb("justified_absences"),
  coveragePercent: text("coverage_percent"),
  passed: boolean("passed").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCoverageReportSchema = createInsertSchema(coverageReports).omit({
  id: true,
  createdAt: true,
});

export type CoverageReport = typeof coverageReports.$inferSelect;
export type InsertCoverageReport = z.infer<typeof insertCoverageReportSchema>;

// ============== AUDIT BUNDLES ==============
export const auditBundles = pgTable("audit_bundles", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").references(() => psurCases.id, { onDelete: "cascade" }),
  bundleReference: text("bundle_reference").notNull(),
  traceJsonlPath: text("trace_jsonl_path"),
  coverageReportPath: text("coverage_report_path"),
  evidenceRegisterPath: text("evidence_register_path"),
  qualificationReportPath: text("qualification_report_path"),
  renderedDocumentPath: text("rendered_document_path"),
  metadata: jsonb("metadata"),
  exportedAt: timestamp("exported_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAuditBundleSchema = createInsertSchema(auditBundles).omit({
  id: true,
  exportedAt: true,
});

export type AuditBundle = typeof auditBundles.$inferSelect;
export type InsertAuditBundle = z.infer<typeof insertAuditBundleSchema>;

// ============== DECISION TRACE ==============
// Core trace entries for audit trail - each row is an immutable decision event
export const decisionTraceEventTypeEnum = [
  // Workflow lifecycle
  "WORKFLOW_STARTED",
  "WORKFLOW_COMPLETED",
  "WORKFLOW_FAILED",
  // Template events
  "TEMPLATE_QUALIFIED",
  "TEMPLATE_BLOCKED",
  // Case events
  "CASE_CREATED",
  // Evidence events
  "EVIDENCE_UPLOADED",
  "EVIDENCE_ATOM_CREATED",
  "EVIDENCE_INGESTED",
  "NEGATIVE_EVIDENCE_CREATED",
  // Slot events
  "SLOT_PROPOSED",
  "SLOT_ACCEPTED",
  "SLOT_REJECTED",
  // Coverage and rendering
  "COVERAGE_COMPUTED",
  "DOCUMENT_RENDERED",
  "BUNDLE_EXPORTED",
  // Validation
  "VALIDATION_PASSED",
  "VALIDATION_FAILED",
  "TRACE_GAP_DETECTED",
  // Obligations
  "OBLIGATION_SATISFIED",
  "OBLIGATION_UNSATISFIED",
  // Agent events
  "AGENT_SPAWNED",
  "AGENT_INITIALIZED",
  "AGENT_COMPLETED",
  "AGENT_FAILED",
  "LLM_INVOKED",
  "LLM_RESPONSE_RECEIVED",
  "DECISION_MADE",
  // Ingestion agent events
  "EXTRACTION_AGENT_INVOKED",
  "EXTRACTION_COMPLETED",
  "RECORD_EXTRACTED",
  "CLASSIFICATION_PERFORMED",
  "FIELD_MAPPING_RESOLVED",
  "FIELD_MAPPING_REFINED",
  "EVIDENCE_CLASSIFIED",
  // Narrative agent events
  "NARRATIVE_GENERATION_STARTED",
  "NARRATIVE_GENERATED",
  "CITATION_VERIFIED",
  // Context loading events
  "DOSSIER_CONTEXT_LOADED",
  "AGENT_ROLE_CONTEXT_LOADED",
  // Analytics engine events
  "ANALYTICS_INJECTED",
] as const;

export type DecisionTraceEventType = typeof decisionTraceEventTypeEnum[number];

export const decisionTraceEntries = pgTable("decision_trace_entries", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").references(() => psurCases.id, { onDelete: "cascade" }),
  traceId: text("trace_id").notNull(), // UUID for grouping related traces
  sequenceNum: integer("sequence_num").notNull(), // Order within a trace
  eventType: text("event_type").notNull(), // From decisionTraceEventTypeEnum
  eventTimestamp: timestamp("event_timestamp").notNull().default(sql`CURRENT_TIMESTAMP`),

  // The actor/component that made the decision
  actor: text("actor").notNull(), // e.g., "workflowRunner", "adjudicator", "ingestEvidence"

  // Core decision data
  entityType: text("entity_type"), // e.g., "slot", "evidence_atom", "obligation"
  entityId: text("entity_id"), // The ID of the entity being decided upon
  decision: text("decision"), // The outcome: "ACCEPT", "REJECT", "PASS", "FAIL", etc.

  // ═══════════════════════════════════════════════════════════════════════════
  // ENHANCED TRACEABILITY FIELDS - Natural Language & GRKB Tie-back
  // ═══════════════════════════════════════════════════════════════════════════

  // Human-readable summary for generalist understanding
  humanSummary: text("human_summary"), // Plain English explanation of the decision

  // GRKB Regulatory Context - stores actual obligation text for audit trail
  regulatoryContext: jsonb("regulatory_context"), // {obligationId, obligationText, sourceCitation, jurisdictions, mandatory}

  // Evidence Justification - explains why evidence satisfies the requirement
  evidenceJustification: jsonb("evidence_justification"), // {requiredTypes, providedTypes, atomCount, periodCoverage, justificationNarrative}

  // Compliance Assertion - explicit statement of compliance status
  complianceAssertion: jsonb("compliance_assertion"), // {satisfies[], doesNotSatisfy[], complianceStatement}

  // ═══════════════════════════════════════════════════════════════════════════

  // Detailed data (JSON)
  inputData: jsonb("input_data"), // What went into the decision
  outputData: jsonb("output_data"), // What came out
  reasons: jsonb("reasons"), // Array of reasons for the decision

  // Traceability links
  parentTraceEntryId: integer("parent_trace_entry_id"), // For hierarchical tracing
  relatedEntityIds: jsonb("related_entity_ids"), // Array of related IDs (evidence atoms, etc.)

  // Verification
  contentHash: text("content_hash").notNull(), // SHA256 of the entry content for integrity
  previousHash: text("previous_hash"), // Hash of previous entry in chain

  // Metadata
  workflowStep: integer("workflow_step"),
  templateId: text("template_id"),
  jurisdictions: jsonb("jurisdictions"),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  traceIdIdx: index("decision_trace_trace_id_idx").on(table.traceId),
  psurCaseIdIdx: index("decision_trace_psur_case_id_idx").on(table.psurCaseId),
  eventTypeIdx: index("decision_trace_event_type_idx").on(table.eventType),
  entityIdIdx: index("decision_trace_entity_id_idx").on(table.entityId),
  eventTimestampIdx: index("decision_trace_timestamp_idx").on(table.eventTimestamp),
  // New indexes for enhanced queryability
  humanSummaryIdx: index("decision_trace_human_summary_idx").on(table.humanSummary),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED TRACEABILITY TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Regulatory context stored with each trace entry for GRKB tie-back
export interface TraceRegulatoryContext {
  obligationId: string;
  obligationText: string;           // Full text from grkb_obligations.text
  sourceCitation: string | null;    // e.g., "MDR Article 86(1)"
  jurisdictions: string[];
  mandatory: boolean;
  requirementLevel?: "MUST" | "SHOULD" | "MAY";
}

// Evidence justification explaining why evidence satisfies requirements
export interface TraceEvidenceJustification {
  requiredEvidenceTypes: string[];
  providedEvidenceTypes: string[];
  atomCount: number;
  inPeriodAtomCount?: number;
  periodCoverage: "full" | "partial" | "none" | "not_applicable";
  justificationNarrative: string;   // "15 complaint records covering Jan-Dec 2024"
  atomSummaries?: Array<{
    atomId: string;
    evidenceType: string;
    summary: string;
  }>;
}

// Compliance assertion for explicit obligation satisfaction tracking
export interface TraceComplianceAssertion {
  satisfies: string[];              // Obligation IDs this decision satisfies
  partiallySatisfies?: string[];    // Obligation IDs partially met
  doesNotSatisfy: string[];         // Obligation IDs with gaps
  complianceStatement: string;      // Plain English compliance explanation
  riskLevel?: "low" | "medium" | "high" | "critical";
}

export const insertDecisionTraceEntrySchema = createInsertSchema(decisionTraceEntries).omit({
  id: true,
  createdAt: true,
});

export type DecisionTraceEntry = typeof decisionTraceEntries.$inferSelect;
export type InsertDecisionTraceEntry = z.infer<typeof insertDecisionTraceEntrySchema>;

// Aggregated trace summary per case for quick auditing
export const decisionTraceSummaries = pgTable("decision_trace_summaries", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").references(() => psurCases.id, { onDelete: "cascade" }).unique(),
  traceId: text("trace_id").notNull().unique(),

  // Counts by event type
  totalEvents: integer("total_events").notNull().default(0),
  acceptedSlots: integer("accepted_slots").notNull().default(0),
  rejectedSlots: integer("rejected_slots").notNull().default(0),
  traceGaps: integer("trace_gaps").notNull().default(0),
  evidenceAtoms: integer("evidence_atoms").notNull().default(0),
  negativeEvidence: integer("negative_evidence").notNull().default(0),
  obligationsSatisfied: integer("obligations_satisfied").notNull().default(0),
  obligationsUnsatisfied: integer("obligations_unsatisfied").notNull().default(0),

  // Workflow status
  workflowStatus: text("workflow_status").notNull().default("NOT_STARTED"), // STARTED, COMPLETED, FAILED
  completedSteps: jsonb("completed_steps"), // Array of completed step numbers
  failedStep: integer("failed_step"),
  failureReason: text("failure_reason"),

  // Chain verification
  firstEntryHash: text("first_entry_hash"),
  lastEntryHash: text("last_entry_hash"),
  chainValid: boolean("chain_valid").default(true),

  // Timestamps
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT TRACING - Ultra-granular tracing of EVERY PSUR content element
// ═══════════════════════════════════════════════════════════════════════════════
// Traces individual content elements: sentences, table cells, calculations, entries, conclusions, etc.
// Each trace captures the complete decision rationale with regulatory/evidence linkage

export const contentTraces = pgTable("content_traces", {
  id: serial("id").primaryKey(),

  // Linking
  psurCaseId: integer("psur_case_id").notNull().references(() => psurCases.id, { onDelete: "cascade" }),
  slotId: text("slot_id").notNull(), // Which slot this content belongs to
  slotTitle: text("slot_title"),

  // Content Identification
  contentType: text("content_type").notNull(), // "sentence", "paragraph", "table_row", "table_cell", "calculation", "entry", "chart_point", "conclusion", "list_item"
  contentId: text("content_id").notNull(), // Unique ID for this content element
  contentIndex: integer("content_index").notNull(), // Position within slot (e.g., 3rd paragraph, row 2 cell 5)
  contentPreview: text("content_preview").notNull(), // First 500 chars of actual content

  // Decision Rationale
  rationale: text("rationale").notNull(), // Plain English explanation of WHY this content was created
  methodology: text("methodology").notNull(), // HOW the decision was made (e.g., "averaged 3 complaint records", "calculated as (numerator/denominator)*100")
  standardReference: text("standard_reference"), // Regulatory standard or requirement being met (e.g., "MDR Article 86(1)")

  // Evidence & Sources
  evidenceType: text("evidence_type"), // Type of evidence used (e.g., "complaint_records", "sales_data", "clinical_observations")
  atomIds: text("atom_ids").array().default(sql`ARRAY[]::text[]`), // Array of evidence atom IDs supporting this content
  sourceDocument: text("source_document"), // Reference to source file/document (e.g., "complaint_data_2024.csv")
  dataSourceId: integer("data_source_id").references(() => dataSources.id, { onDelete: "set null" }),

  // Regulatory Linkage
  obligationId: text("obligation_id"), // GRKB obligation this content satisfies
  obligationTitle: text("obligation_title"),
  jurisdictions: text("jurisdictions").array().default(sql`ARRAY[]::text[]`),

  // Calculation Details (if applicable)
  calculationType: text("calculation_type"), // "average", "sum", "percentage", "count", "formula", "aggregation", etc.
  calculationFormula: text("calculation_formula"), // Actual formula used (e.g., "(42+38+45)/3")
  calculationInputs: jsonb("calculation_inputs"), // {value1: 42, value2: 38, value3: 45, result: 41.67}

  // Agent Information
  agentId: text("agent_id").notNull(), // Which agent made the decision (e.g., "narrative_agent_v1", "table_filler_agent")
  agentName: text("agent_name"), // Human-readable agent name

  // Timestamp and Chain
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  contentHash: text("content_hash").notNull(), // SHA256 of content for integrity

  // Queryability Enhancement
  searchableText: text("searchable_text"), // Concatenated text for NL search: rationale + methodology + evidence types
}, (table) => ({
  psurCaseIdIdx: index("content_trace_psur_case_id_idx").on(table.psurCaseId),
  slotIdIdx: index("content_trace_slot_id_idx").on(table.slotId),
  contentTypeIdx: index("content_trace_content_type_idx").on(table.contentType),
  obligationIdIdx: index("content_trace_obligation_id_idx").on(table.obligationId),
  agentIdIdx: index("content_trace_agent_id_idx").on(table.agentId),
  searchableIdx: index("content_trace_searchable_idx").on(table.searchableText),
  createdAtIdx: index("content_trace_created_at_idx").on(table.createdAt),
}));

// Schemas for content traces
export const insertContentTraceSchema = createInsertSchema(contentTraces).omit({
  id: true,
  createdAt: true,
});

export type ContentTrace = typeof contentTraces.$inferSelect;
export type InsertContentTrace = z.infer<typeof insertContentTraceSchema>;

export const insertDecisionTraceSummarySchema = createInsertSchema(decisionTraceSummaries).omit({
  id: true,
  lastUpdatedAt: true,
});

export type DecisionTraceSummary = typeof decisionTraceSummaries.$inferSelect;
export type InsertDecisionTraceSummary = z.infer<typeof insertDecisionTraceSummarySchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// SENTENCE-LEVEL ATTRIBUTION (Granular Traceability)
// ═══════════════════════════════════════════════════════════════════════════════

// Each sentence/claim in generated content with full provenance chain
export const sentenceAttributions = pgTable("sentence_attributions", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").notNull().references(() => psurCases.id, { onDelete: "cascade" }),
  slotId: text("slot_id").notNull(),

  // Content positioning
  sentenceText: text("sentence_text").notNull(),
  sentenceIndex: integer("sentence_index").notNull(),  // Position within paragraph
  paragraphIndex: integer("paragraph_index").notNull(), // Position within slot
  contentHash: text("content_hash").notNull(),  // For deduplication

  // Attribution chain - links to sources
  evidenceAtomIds: integer("evidence_atom_ids").array().notNull().default(sql`ARRAY[]::integer[]`),
  obligationIds: text("obligation_ids").array().notNull().default(sql`ARRAY[]::text[]`),

  // For computed values (totals, percentages, rates)
  hasCalculation: boolean("has_calculation").default(false),
  calculationTrace: jsonb("calculation_trace").$type<{
    resultValue: string;
    resultType: "count" | "sum" | "percentage" | "rate" | "average" | "ratio";
    formula: string;
    inputs: Array<{
      atomId: number;
      field: string;
      value: number | string;
      sourceDocument?: string;
    }>;
  }>(),

  // Generation metadata
  llmReasoning: text("llm_reasoning"),  // Why this content was generated
  methodStatement: text("method_statement"),  // How it was derived
  confidenceScore: text("confidence_score"),
  generationModel: text("generation_model"),
  generationTimestamp: timestamp("generation_timestamp").default(sql`CURRENT_TIMESTAMP`),

  // Verification workflow
  verificationStatus: text("verification_status").default("unverified"), // unverified, verified, rejected
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at"),
  verificationNotes: text("verification_notes"),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  caseSlotIdx: index("sentence_attr_case_slot_idx").on(t.psurCaseId, t.slotId),
  evidenceIdx: index("sentence_attr_evidence_idx").on(t.evidenceAtomIds),
}));

export const insertSentenceAttributionSchema = createInsertSchema(sentenceAttributions).omit({
  id: true,
  createdAt: true,
});

export type SentenceAttribution = typeof sentenceAttributions.$inferSelect;
export type InsertSentenceAttribution = z.infer<typeof insertSentenceAttributionSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// GRKB VALIDATION REPORTS (Pre-Generation Compliance Check)
// ═══════════════════════════════════════════════════════════════════════════════

// Validation result before generation - blocks if mandatory requirements unmet
export const grkbValidationReports = pgTable("grkb_validation_reports", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").notNull().references(() => psurCases.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  jurisdictions: text("jurisdictions").array().notNull().default(sql`ARRAY[]::text[]`),

  // Overall status
  validationStatus: text("validation_status").notNull(), // PASS, FAIL, WARNING
  canProceed: boolean("can_proceed").notNull().default(false),

  // Obligation coverage
  mandatoryObligationsTotal: integer("mandatory_obligations_total").notNull(),
  mandatoryObligationsSatisfied: integer("mandatory_obligations_satisfied").notNull(),
  optionalObligationsTotal: integer("optional_obligations_total").notNull().default(0),
  optionalObligationsSatisfied: integer("optional_obligations_satisfied").notNull().default(0),

  // Evidence coverage
  requiredEvidenceTypesTotal: integer("required_evidence_types_total").notNull(),
  requiredEvidenceTypesPresent: integer("required_evidence_types_present").notNull(),
  evidenceCoveragePercent: text("evidence_coverage_percent"),

  // Blocking issues (mandatory obligations without evidence)
  blockingIssues: jsonb("blocking_issues").$type<Array<{
    obligationId: string;
    obligationText: string;
    sourceCitation: string;
    requiredEvidenceTypes: string[];
    missingEvidenceTypes: string[];
    severity: "critical" | "high";
  }>>(),

  // Warnings (optional obligations without evidence)
  warnings: jsonb("warnings").$type<Array<{
    obligationId: string;
    obligationText: string;
    sourceCitation: string;
    missingEvidenceTypes: string[];
    severity: "medium" | "low";
  }>>(),

  // Evidence gaps summary
  missingEvidenceTypes: text("missing_evidence_types").array().default(sql`ARRAY[]::text[]`),
  unsatisfiedObligationIds: text("unsatisfied_obligation_ids").array().default(sql`ARRAY[]::text[]`),

  // Slot readiness
  slotsReady: integer("slots_ready").notNull().default(0),
  slotsBlocked: integer("slots_blocked").notNull().default(0),
  slotDetails: jsonb("slot_details").$type<Array<{
    slotId: string;
    slotTitle: string;
    status: "ready" | "blocked" | "partial";
    obligationsCovered: string[];
    obligationsMissing: string[];
    evidenceCount: number;
  }>>(),

  validatedAt: timestamp("validated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  caseIdx: index("grkb_validation_case_idx").on(t.psurCaseId),
}));

export const insertGrkbValidationReportSchema = createInsertSchema(grkbValidationReports).omit({
  id: true,
  createdAt: true,
});

export type GrkbValidationReport = typeof grkbValidationReports.$inferSelect;
export type InsertGrkbValidationReport = z.infer<typeof insertGrkbValidationReportSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// PROVENANCE GRAPH EDGES (For future graph DB sync)
// ═══════════════════════════════════════════════════════════════════════════════

// Captures relationships for graph DB export
export const provenanceEdges = pgTable("provenance_edges", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").notNull().references(() => psurCases.id, { onDelete: "cascade" }),

  // Edge definition
  edgeType: text("edge_type").notNull(), // "cites", "satisfies", "computed_from", "extracted_from", "belongs_to"
  sourceVertexType: text("source_vertex_type").notNull(), // "sentence", "evidence_atom", "calculation", etc.
  sourceVertexId: text("source_vertex_id").notNull(),
  targetVertexType: text("target_vertex_type").notNull(),
  targetVertexId: text("target_vertex_id").notNull(),

  // Edge properties
  properties: jsonb("properties").$type<Record<string, any>>(),
  weight: text("weight"),  // For ranked relationships

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  caseIdx: index("provenance_edges_case_idx").on(t.psurCaseId),
  sourceIdx: index("provenance_edges_source_idx").on(t.sourceVertexType, t.sourceVertexId),
  targetIdx: index("provenance_edges_target_idx").on(t.targetVertexType, t.targetVertexId),
}));

export const insertProvenanceEdgeSchema = createInsertSchema(provenanceEdges).omit({
  id: true,
  createdAt: true,
});

export type ProvenanceEdge = typeof provenanceEdges.$inferSelect;
export type InsertProvenanceEdge = z.infer<typeof insertProvenanceEdgeSchema>;

// ============== COVERAGE SLOT QUEUE ==============
export const coverageSlotQueues = pgTable("coverage_slot_queues", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").references(() => psurCases.id, { onDelete: "cascade" }),
  psurReference: text("psur_reference").notNull(),
  profileId: text("profile_id").notNull(),
  mandatoryObligationsTotal: integer("mandatory_obligations_total").notNull(),
  mandatoryObligationsSatisfied: integer("mandatory_obligations_satisfied").notNull(),
  mandatoryObligationsRemaining: integer("mandatory_obligations_remaining").notNull(),
  requiredSlotsTotal: integer("required_slots_total").notNull(),
  requiredSlotsFilled: integer("required_slots_filled").notNull(),
  requiredSlotsRemaining: integer("required_slots_remaining").notNull(),
  queue: jsonb("queue").notNull(),
  generatedAt: timestamp("generated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCoverageSlotQueueSchema = createInsertSchema(coverageSlotQueues).omit({
  id: true,
  generatedAt: true,
});

export type CoverageSlotQueue = typeof coverageSlotQueues.$inferSelect;
export type InsertCoverageSlotQueue = z.infer<typeof insertCoverageSlotQueueSchema>;

// Queue Item TypeScript type (for the queue jsonb array)
export interface QueueSlotItem {
  queue_rank: number;
  slot_id: string;
  slot_path: string;
  slot_type: "narrative" | "table" | "kv" | "object" | "array";
  requiredness: "required" | "conditional" | "required_if_applicable";
  mapped_obligations: {
    obligation_id: string;
    requirement_level: "MUST" | "SHOULD" | "MUST_IF_APPLICABLE";
    status: "unsatisfied" | "partially_satisfied" | "satisfied";
    why_unsatisfied: string[];
  }[];
  evidence_requirements: {
    required_evidence_types: string[];
    available_evidence_types: string[];
    missing_evidence_types: string[];
    in_period_evidence_types?: string[];
    period_check: "pass" | "partial" | "fail" | "unknown";
    evidence_coverage?: {
      type: string;
      available: boolean;
      inPeriod: boolean;
      coverage: "full" | "partial" | "none" | "out_of_period";
      atomCount: number;
      inPeriodCount: number;
    }[];
  };
  generation_contract: {
    allowed_transformations: string[];
    forbidden_transformations: string[];
    must_include: string[];
    trace_granularity: "paragraph" | "cell" | "key";
  };
  dependencies: {
    must_fill_before: string[];
    must_have_evidence_before: string[];
  };
  recommended_agents: string[];
  acceptance_criteria: string[];
}

// ============== COLUMN MAPPING PROFILES ==============
export const columnMappingProfiles = pgTable("column_mapping_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  evidenceType: text("evidence_type").notNull(),
  sourceSystemHint: text("source_system_hint"),
  columnMappings: jsonb("column_mappings").notNull(),
  defaultValues: jsonb("default_values"),
  isActive: boolean("is_active").default(true).notNull(),
  filePatterns: jsonb("file_patterns"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
});

export const insertColumnMappingProfileSchema = createInsertSchema(columnMappingProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export type ColumnMappingProfile = typeof columnMappingProfiles.$inferSelect;
export type InsertColumnMappingProfile = z.infer<typeof insertColumnMappingProfileSchema>;

// ============== EVIDENCE SOURCE CONFIGS ==============
// Pre-configures which source document contains each evidence type.
// Tells ingestion agents exactly where to look, eliminating guesswork.
export const evidenceSourceConfigs = pgTable("evidence_source_configs", {
  id: serial("id").primaryKey(),
  evidenceType: text("evidence_type").notNull(),
  sourceDocumentName: text("source_document_name").notNull(),
  sourceLocation: jsonb("source_location").$type<{
    sheet?: string;         // Excel sheet name
    section?: string;       // Document section heading
    pageRange?: string;     // e.g. "1-5" or "12"
    tableIndex?: number;    // Which table in the document
  }>(),
  columnMappings: jsonb("column_mappings").$type<Record<string, string>>(), // source col → target field
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertEvidenceSourceConfigSchema = createInsertSchema(evidenceSourceConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type EvidenceSourceConfig = typeof evidenceSourceConfigs.$inferSelect;
export type InsertEvidenceSourceConfig = z.infer<typeof insertEvidenceSourceConfigSchema>;

// ============== CANONICAL EVIDENCE TYPES ==============
// Single source of truth for evidence types across the entire system (12-category taxonomy)
export const CANONICAL_EVIDENCE_TYPES = {
  // ── Category 1: Device Master Data ──
  DEVICE_IDENTIFICATION: "device_identification",
  DEVICE_CLASSIFICATION: "device_classification",
  DEVICE_INTENDED_USE: "device_intended_use",
  DEVICE_TECHNICAL_SPECS: "device_technical_specs",
  MANUFACTURER_DETAILS: "manufacturer_details",
  REGULATORY_CERTIFICATES: "regulatory_certificates",

  // ── Category 2: Complaints (Non-Serious) ──
  COMPLAINT: "complaint_record",
  COMPLAINT_INVESTIGATION: "complaint_investigation",
  COMPLAINT_METRICS: "complaint_metrics",
  IMDRF_CLASSIFICATION_COMPLAINTS: "imdrf_classification_complaints",
  COMPLAINT_CONTROL_CHART: "complaint_control_chart",
  COMPLAINT_SEGMENTATION: "complaint_segmentation",
  ROOT_CAUSE_CLUSTERS: "root_cause_clusters",

  // ── Category 3: Vigilance (Serious Incidents) ──
  SERIOUS_INCIDENT: "serious_incident_record",
  SERIOUS_INCIDENT_INVESTIGATION: "serious_incident_investigation",
  IMDRF_CLASSIFICATION_INCIDENTS: "imdrf_classification_incidents",
  VIGILANCE_SUBMISSION_LOG: "vigilance_submission_log",
  SERIOUS_INCIDENT_METRICS: "serious_incident_metrics",

  // ── Category 4: Sales & Distribution ──
  SALES: "sales_transactions",
  SALES_AGGREGATED: "sales_aggregated",
  POPULATION_EXPOSURE: "population_exposure",
  MARKET_HISTORY: "market_history",

  // ── Category 5: FSCA ──
  FSCA: "fsca_record",
  FSCA_EFFECTIVENESS: "fsca_effectiveness",
  FSCA_METRICS: "fsca_metrics",

  // ── Category 6: CAPA ──
  CAPA: "capa_record",
  NCR: "ncr_record",
  CAPA_METRICS: "capa_metrics",

  // ── Category 7: CER (Extracted) ──
  CER_METADATA: "cer_metadata",
  CER_INTENDED_USE: "cer_intended_use",
  CER_CLINICAL_BENEFITS: "cer_clinical_benefits",
  CER_CLINICAL_RISKS: "cer_clinical_risks",
  CER_LITERATURE_SUMMARY: "cer_literature_summary",
  CER_PMCF_SUMMARY: "cer_pmcf_summary",
  CER_EQUIVALENCE: "cer_equivalence",
  CER_STATE_OF_ART: "cer_state_of_art",
  CER_CONCLUSIONS: "cer_conclusions",
  CER_CHANGE_LOG: "cer_change_log",

  // ── Category 8: RMF (Extracted) ──
  RMF_METADATA: "rmf_metadata",
  RMF_HAZARD_ANALYSIS: "rmf_hazard_analysis",
  RMF_RISK_ASSESSMENT_PRE: "rmf_risk_assessment_pre",
  RMF_RISK_CONTROLS: "rmf_risk_controls",
  RMF_RISK_ASSESSMENT_POST: "rmf_risk_assessment_post",
  RMF_ACCEPTABILITY: "rmf_acceptability",
  RMF_BENEFIT_RISK: "rmf_benefit_risk",
  RMF_CHANGE_LOG: "rmf_change_log",

  // ── Category 9: PMCF ──
  PMCF_PLAN_EXTRACT: "pmcf_plan_extract",
  PMCF_ACTIVITY_RECORD: "pmcf_activity_record",
  PMCF_RESULTS: "pmcf_results",
  PMCF_EVALUATION_SUMMARY: "pmcf_evaluation_summary",

  // ── Category 10: Literature & External Databases ──
  LITERATURE_SEARCH_PROTOCOL: "literature_search_protocol",
  LITERATURE_SCREENING_RESULTS: "literature_screening_results",
  LITERATURE_FINDINGS: "literature_findings",
  LITERATURE_SYNTHESIS: "literature_synthesis",
  EXTERNAL_DB_QUERY_LOG: "external_db_query_log",
  EXTERNAL_DB_FINDINGS: "external_db_findings",

  // ── Category 11: PMS Plan & Activity Log ──
  PMS_PLAN_EXTRACT: "pms_plan_extract",
  PMS_ACTIVITY_LOG: "pms_activity_log",

  // ── Category 12: Previous PSUR ──
  PREVIOUS_PSUR_METADATA: "previous_psur_metadata",
  PREVIOUS_PSUR_CONCLUSIONS: "previous_psur_conclusions",
  PREVIOUS_PSUR_METRICS: "previous_psur_metrics",
  PREVIOUS_PSUR_ACTIONS: "previous_psur_actions",
  PREVIOUS_PSUR_ACTION_STATUS: "previous_psur_action_status",

  // ── Calculated Evidence (engine-generated, not uploaded) ──
  COMPLAINT_RATE_ANALYSIS: "complaint_rate_analysis",
  STATISTICAL_TRENDING: "statistical_trending",
  CONTROL_CHART_DATA: "control_chart_data",
  SEGMENTATION_ANALYSIS: "segmentation_analysis",
  BENEFIT_RISK_QUANTIFICATION: "benefit_risk_quantification",
  RISK_REASSESSMENT: "risk_reassessment",

  // ── Backward Compatibility Aliases ──
  // These map old keys to new canonical values for code that references old enum keys
  SALES_SUMMARY: "sales_aggregated",
  SALES_BY_REGION: "sales_aggregated",
  DISTRIBUTION_SUMMARY: "sales_aggregated",
  USAGE_ESTIMATE: "population_exposure",
  COMPLAINT_SUMMARY: "complaint_metrics",
  COMPLAINTS_BY_REGION: "complaint_metrics",
  SERIOUS_INCIDENT_SUMMARY: "serious_incident_metrics",
  SERIOUS_INCIDENT_IMDRF: "imdrf_classification_incidents",
  TREND_ANALYSIS: "statistical_trending",
  SIGNAL_LOG: "statistical_trending",
  FSCA_SUMMARY: "fsca_metrics",
  CAPA_SUMMARY: "capa_metrics",
  PMCF_SUMMARY: "pmcf_evaluation_summary",
  LITERATURE_REVIEW_SUMMARY: "literature_synthesis",
  LITERATURE_SEARCH_STRATEGY: "literature_search_protocol",
  EXTERNAL_DB_SUMMARY: "external_db_findings",
  VIGILANCE_REPORT: "serious_incident_metrics",
  BENEFIT_RISK_ASSESSMENT: "benefit_risk_quantification",
  RISK_ASSESSMENT: "risk_reassessment",
  RECALL: "fsca_record",
  DEVICE_REGISTRY: "device_identification",
  MANUFACTURER_PROFILE: "manufacturer_details",
  REGULATORY_CERTIFICATE: "regulatory_certificates",
  CHANGE_CONTROL: "pms_activity_log",
  DATA_SOURCE_REGISTER: "pms_activity_log",
  CER_EXTRACT: "cer_metadata",
  RMF_EXTRACT: "rmf_metadata",
  IFU_EXTRACT: "device_intended_use",
  CLINICAL_EVALUATION_EXTRACT: "cer_conclusions",
  PREVIOUS_PSUR_EXTRACT: "previous_psur_metadata",
  PMCF_REPORT_EXTRACT: "pmcf_evaluation_summary",
  PMCF: "pmcf_results",
  LITERATURE: "literature_findings",
} as const;

export type CanonicalEvidenceType = typeof CANONICAL_EVIDENCE_TYPES[keyof typeof CANONICAL_EVIDENCE_TYPES];

// ============== SLOT DEFINITIONS (Canonical Slot Catalog) ==============
// ============== TEMPLATES ==============
// Stores complete template JSON in database for deployment persistence
export const templates = pgTable(
  "templates",
  {
    id: serial("id").primaryKey(),
    templateId: text("template_id").notNull().unique(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    jurisdictions: jsonb("jurisdictions").notNull().$type<string[]>(),
    templateType: text("template_type").notNull(), // 'slot-based' | 'form-based'
    templateJson: jsonb("template_json").notNull(), // Full template structure
    complianceAudit: jsonb("compliance_audit"), // Annex I compliance audit result
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    templateIdIdx: index("templates_template_id_idx").on(t.templateId),
  })
);

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;

// DB is the canonical source of truth for slot contracts
// Template JSON describes layout/structure; Slot Catalog defines evidence + obligation contracts
export const slotDefinitions = pgTable(
  "slot_definitions",
  {
    id: serial("id").primaryKey(),

    // A stable canonical ID that code can refer to (deterministic)
    slotId: text("slot_id").notNull(),

    // Human readable
    title: text("title").notNull(),
    description: text("description").notNull(),

    // Which template(s) it applies to
    // e.g. "MDCG_2022_21_ANNEX_I"
    templateId: text("template_id").notNull(),

    // Which jurisdictions it applies to (stored as JSONB array)
    // e.g. ["EU_MDR"], ["EU_MDR","UK_MDR"]
    jurisdictions: jsonb("jurisdictions").notNull().$type<string[]>(),

    // Evidence requirements: canonical evidence types
    // e.g. ["sales_volume"], ["complaint_record"]
    requiredEvidenceTypes: jsonb("required_evidence_types").notNull().$type<string[]>(),

    // If true, workflow must FAIL if evidence not available (industry-ready behavior)
    hardRequireEvidence: boolean("hard_require_evidence").notNull().default(true),

    // Minimum evidence atoms required (usually 1)
    minAtoms: integer("min_atoms").notNull().default(1),

    // For deterministic ordering in UI + orchestration
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    slotIdUnique: uniqueIndex("slot_definitions_slot_id_uq").on(t.slotId, t.templateId),
  })
);

export const insertSlotDefinitionSchema = createInsertSchema(slotDefinitions).omit({
  id: true,
  createdAt: true,
});

export type SlotDefinition = typeof slotDefinitions.$inferSelect;
export type InsertSlotDefinition = z.infer<typeof insertSlotDefinitionSchema>;

// ============== SLOT OBLIGATION LINKS ==============
// Maps slots to their required regulatory obligations with SOTA grounding metadata
export const slotObligationLinks = pgTable(
  "slot_obligation_links",
  {
    id: serial("id").primaryKey(),
    templateId: text("template_id").notNull(),
    slotId: text("slot_id").notNull(),

    // Must match grkb_obligations.obligationId
    obligationId: text("obligation_id").notNull(),

    // Whether this link is mandatory for coverage
    mandatory: boolean("mandatory").notNull().default(true),

    // SOTA grounding metadata
    confidence: integer("confidence").default(0), // 0-100 confidence score
    matchMethod: text("match_method"), // semantic, evidence_type, regulatory_ref, llm_analysis, manual
    reasoning: text("reasoning"), // Explanation of why this match was made
    isManualOverride: boolean("is_manual_override").default(false),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    slotObligationUnique: uniqueIndex("slot_obligation_links_uq").on(
      t.templateId,
      t.slotId,
      t.obligationId
    ),
  })
);

export const insertSlotObligationLinkSchema = createInsertSchema(slotObligationLinks).omit({
  id: true,
});

export type SlotObligationLink = typeof slotObligationLinks.$inferSelect;
export type InsertSlotObligationLink = z.infer<typeof insertSlotObligationLinkSchema>;

// ============== CANONICAL ORCHESTRATOR WORKFLOW TYPES ==============
// Single source of truth for workflow state - UI renders from these types only

export type WorkflowStepStatus = "NOT_STARTED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED";

export interface WorkflowScope {
  templateId: string;
  jurisdictions: ("EU_MDR" | "UK_MDR")[];
  deviceCode: string;
  periodStart: string;
  periodEnd: string;
}

export interface WorkflowCase {
  psurCaseId: number;
  psurRef: string;
  version: number;
}

export interface WorkflowStepSummary {
  [key: string]: string | number | boolean | string[] | undefined;
}

// Step 3: Evidence Ingest Report
export interface EvidenceIngestReport {
  uploadedAtoms: number;
  linkedToCaseAtoms: number;
  rejectedRows: number;
  sampleErrors: string[];
  byType: Record<string, number>;
}

// Step 5: Adjudication Report
export interface AdjudicationReport {
  acceptedCount: number;
  rejectedCount: number;
  acceptedProposalIds: string[];
  rejected: Array<{ proposalId: string; reasons: string[] }>;
}

// Step 6: Coverage Report
export interface CoverageReportData {
  obligationsSatisfied: number;
  obligationsTotal: number;
  slotsFilled: number;
  slotsTotal: number;
  missingEvidenceTypes: string[];
  coveragePercent: number;
  passed: boolean;
}

// Step 8: Export Bundle Report
export interface ExportBundleReport {
  bundleFiles: string[];
  downloadUrl?: string;
}

// Step 1: Qualification Report Data (for workflow result)
export interface QualificationReportData {
  status: "VERIFIED" | "BLOCKED";
  templateId: string;
  jurisdictions: string[];
  slotCount: number;
  mappingCount: number;
  mandatoryObligationsTotal: number;
  mandatoryObligationsFound: number;
  missingObligations: {
    jurisdiction: string;
    count: number;
    message: string;
  }[];
  constraints: number;
  validatedAt: string;
  blockingErrors: string[];
}

export interface WorkflowStep {
  step: number;
  name: string;
  status: WorkflowStepStatus;
  startedAt?: string;
  endedAt?: string;
  summary: WorkflowStepSummary;
  report?: QualificationReportData | EvidenceIngestReport | AdjudicationReport | CoverageReportData | ExportBundleReport | Record<string, unknown>;
  error?: string;
}

export interface KernelStatus {
  euObligations: number;
  ukObligations: number;
  constraints: number;
  templateSlots: number;
}

export interface OrchestratorWorkflowResult {
  scope: WorkflowScope;
  case: WorkflowCase;
  steps: WorkflowStep[];
  kernelStatus: KernelStatus;
}

// Request schema for POST /api/orchestrator/run
export const orchestratorRunRequestSchema = z.object({
  templateId: z.string(),
  jurisdictions: z.array(z.enum(["EU_MDR", "UK_MDR"])).min(1),
  deviceCode: z.string().min(1),
  deviceId: z.number().int().positive().optional(), // Optional - not required if using deviceCode directly
  periodStart: z.string(),
  periodEnd: z.string(),
  psurCaseId: z.number().int().positive().optional(),
  runSteps: z.array(z.number().int().min(1).max(8)).optional(),
  /** Enable AI-powered narrative generation for NARRATIVE slots */
  enableAIGeneration: z.boolean().optional(),
  /** Document styling: corporate, regulatory, or premium */
  documentStyle: z.enum(["corporate", "regulatory", "premium"]).optional(),
  /** Enable chart generation */
  enableCharts: z.boolean().optional(),
});

export type OrchestratorRunRequest = z.infer<typeof orchestratorRunRequestSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// PSUR-GRKB ENHANCED RELATIONAL MODEL
// State-of-the-art PSUR-specific regulatory knowledge base
// ═══════════════════════════════════════════════════════════════════════════════

// ============== PSUR EVIDENCE TYPE REGISTRY ==============
// Formal definitions of all PSUR evidence types with validation schemas
export const psurEvidenceTypeCategory = ["safety", "clinical", "commercial", "quality", "regulatory"] as const;
export type PsurEvidenceTypeCategory = typeof psurEvidenceTypeCategory[number];

export const psurEvidenceTypes = pgTable("psur_evidence_types", {
  id: serial("id").primaryKey(),
  evidenceTypeId: text("evidence_type_id").notNull().unique(), // e.g., "complaint_record"
  displayName: text("display_name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // safety, clinical, commercial, quality, regulatory

  // Schema definition
  requiredFields: text("required_fields").array().default(sql`ARRAY[]::text[]`),
  optionalFields: text("optional_fields").array().default(sql`ARRAY[]::text[]`),
  fieldDefinitions: jsonb("field_definitions"), // {field: {type, format, description, enum?}}

  // Validation rules
  validationRules: jsonb("validation_rules"), // Array of {rule, errorMessage, severity}

  // Source expectations
  expectedSourceTypes: text("expected_source_types").array().default(sql`ARRAY['excel', 'csv']::text[]`),

  // Classification
  supportsClassification: boolean("supports_classification").default(false),
  classificationModel: text("classification_model"), // Model to use if classification enabled

  // PSUR section mapping hints
  typicalPsurSections: text("typical_psur_sections").array().default(sql`ARRAY[]::text[]`),

  // Metadata
  version: text("version").notNull().default("1.0.0"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  evidenceTypeIdIdx: uniqueIndex("psur_evidence_types_id_idx").on(table.evidenceTypeId),
  categoryIdx: index("psur_evidence_types_category_idx").on(table.category),
}));

export const insertPsurEvidenceTypeSchema = createInsertSchema(psurEvidenceTypes).omit({
  id: true,
  createdAt: true,
});

export type PsurEvidenceType = typeof psurEvidenceTypes.$inferSelect;
export type InsertPsurEvidenceType = z.infer<typeof insertPsurEvidenceTypeSchema>;

// ============== PSUR SECTIONS ==============
// MDCG 2022-21 Annex I / FormQAR-054 section structure
export const psurSectionType = ["cover", "toc", "narrative", "table", "appendix"] as const;
export type PsurSectionType = typeof psurSectionType[number];

export const psurSections = pgTable("psur_sections", {
  id: serial("id").primaryKey(),
  sectionId: text("section_id").notNull(), // e.g., "MDCG.ANNEX_I.A"
  templateId: text("template_id").notNull(), // MDCG_2022_21_ANNEX_I

  // Hierarchy
  parentSectionId: text("parent_section_id"), // For nested sections
  sectionNumber: text("section_number").notNull(), // "A", "B.1", "3.2.1"
  sectionPath: text("section_path").notNull(), // "A > Device Description"
  displayOrder: integer("display_order").notNull(), // For sorting

  // Content
  title: text("title").notNull(),
  description: text("description"),
  sectionType: text("section_type").notNull(), // cover, toc, narrative, table, appendix

  // Requirements
  mandatory: boolean("mandatory").default(true),
  minimumWordCount: integer("minimum_word_count"),
  maximumWordCount: integer("maximum_word_count"),

  // Evidence requirements for this section
  requiredEvidenceTypes: text("required_evidence_types").array().default(sql`ARRAY[]::text[]`),
  minimumEvidenceAtoms: integer("minimum_evidence_atoms").default(0),

  // Rendering hints
  renderAs: text("render_as"), // narrative, table, bullet_list, etc.
  tableSchema: jsonb("table_schema"), // Column definitions for table sections

  // Regulatory source
  regulatoryBasis: text("regulatory_basis"), // "MDCG 2022-21 Section 3.2"

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  sectionIdIdx: index("psur_sections_section_id_idx").on(table.sectionId),
  templateIdIdx: index("psur_sections_template_id_idx").on(table.templateId),
  parentIdx: index("psur_sections_parent_idx").on(table.parentSectionId),
}));

export const insertPsurSectionSchema = createInsertSchema(psurSections).omit({
  id: true,
  createdAt: true,
});

export type PsurSection = typeof psurSections.$inferSelect;
export type InsertPsurSection = z.infer<typeof insertPsurSectionSchema>;

// ============== PSUR OBLIGATION DEPENDENCIES ==============
// Cross-references and dependencies between obligations
export const psurObligationRelationType = [
  "REQUIRES",        // This obligation requires another to be satisfied first
  "CROSS_REFERENCES", // This obligation references another in its text
  "SUPERSEDES",      // This obligation replaces another (temporal)
  "CONFLICTS_WITH",  // These obligations cannot both be satisfied
  "IMPLIES",         // Satisfying this automatically satisfies another
  "SAME_SECTION"     // Related obligations in the same PSUR section
] as const;
export type PsurObligationRelationType = typeof psurObligationRelationType[number];

export const psurObligationDependencies = pgTable("psur_obligation_dependencies", {
  id: serial("id").primaryKey(),

  fromObligationId: text("from_obligation_id").notNull(), // References grkb_obligations.obligation_id
  toObligationId: text("to_obligation_id").notNull(),

  relationType: text("relation_type").notNull(), // REQUIRES, CROSS_REFERENCES, etc.

  // Metadata
  strength: text("strength").default("STRONG"), // STRONG, WEAK, INFORMATIONAL
  description: text("description"), // Why this relationship exists
  regulatoryBasis: text("regulatory_basis"), // Source citation for the relationship

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  fromIdx: index("psur_obligation_deps_from_idx").on(table.fromObligationId),
  toIdx: index("psur_obligation_deps_to_idx").on(table.toObligationId),
  relationIdx: index("psur_obligation_deps_relation_idx").on(table.relationType),
  uniqueRelation: uniqueIndex("psur_obligation_deps_unique").on(
    table.fromObligationId,
    table.toObligationId,
    table.relationType
  ),
}));

export const insertPsurObligationDependencySchema = createInsertSchema(psurObligationDependencies).omit({
  id: true,
  createdAt: true,
});

export type PsurObligationDependency = typeof psurObligationDependencies.$inferSelect;
export type InsertPsurObligationDependency = z.infer<typeof insertPsurObligationDependencySchema>;

// ============== PSUR SLOT-OBLIGATION MAPPING ==============
// Enhanced mapping between template slots and regulatory obligations
export const psurSlotObligations = pgTable("psur_slot_obligations", {
  id: serial("id").primaryKey(),

  templateId: text("template_id").notNull(),
  slotId: text("slot_id").notNull(),
  obligationId: text("obligation_id").notNull(), // References grkb_obligations.obligation_id

  // Mapping metadata
  mandatory: boolean("mandatory").default(true), // Is this mapping required for compliance?
  coveragePercentage: integer("coverage_percentage").default(100), // How much of the obligation this slot covers

  // Evidence requirements specific to this mapping
  minimumEvidenceAtoms: integer("minimum_evidence_atoms").default(1),
  allowEmptyWithJustification: boolean("allow_empty_with_justification").default(false),

  // Rationale
  mappingRationale: text("mapping_rationale"), // Why this slot maps to this obligation
  regulatoryBasis: text("regulatory_basis"), // Citation supporting the mapping

  // Validation
  validationRules: jsonb("validation_rules"), // Specific rules for this mapping

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  templateSlotIdx: index("psur_slot_oblig_template_slot_idx").on(table.templateId, table.slotId),
  obligationIdx: index("psur_slot_oblig_obligation_idx").on(table.obligationId),
  uniqueMapping: uniqueIndex("psur_slot_oblig_unique").on(
    table.templateId,
    table.slotId,
    table.obligationId
  ),
}));

export const insertPsurSlotObligationSchema = createInsertSchema(psurSlotObligations).omit({
  id: true,
  createdAt: true,
});

export type PsurSlotObligation = typeof psurSlotObligations.$inferSelect;
export type InsertPsurSlotObligation = z.infer<typeof insertPsurSlotObligationSchema>;

// ============== PSUR COMPLIANCE CHECKLIST ==============
// Pre-computed compliance checklist items for a PSUR case
export const psurComplianceStatus = ["pending", "satisfied", "not_applicable", "waived", "failed"] as const;
export type PsurComplianceStatus = typeof psurComplianceStatus[number];

export const psurComplianceChecklist = pgTable("psur_compliance_checklist", {
  id: serial("id").primaryKey(),

  psurCaseId: integer("psur_case_id").notNull().references(() => psurCases.id, { onDelete: "cascade" }),
  obligationId: text("obligation_id").notNull(),

  // Status
  status: text("status").notNull().default("pending"), // pending, satisfied, not_applicable, waived, failed

  // Evidence linking
  satisfiedBySlots: text("satisfied_by_slots").array().default(sql`ARRAY[]::text[]`),
  evidenceAtomIds: text("evidence_atom_ids").array().default(sql`ARRAY[]::text[]`),
  evidenceCount: integer("evidence_count").default(0),

  // Validation
  validationPassed: boolean("validation_passed"),
  validationErrors: text("validation_errors").array().default(sql`ARRAY[]::text[]`),
  validationWarnings: text("validation_warnings").array().default(sql`ARRAY[]::text[]`),

  // Waivers / Justifications
  waiverJustification: text("waiver_justification"),
  waiverApprovedBy: text("waiver_approved_by"),
  waiverApprovedAt: timestamp("waiver_approved_at"),

  // Audit
  lastCheckedAt: timestamp("last_checked_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  checkedBy: text("checked_by").default("system"),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  caseObligationIdx: uniqueIndex("psur_checklist_case_obligation_idx").on(
    table.psurCaseId,
    table.obligationId
  ),
  statusIdx: index("psur_checklist_status_idx").on(table.status),
}));

export const insertPsurComplianceChecklistSchema = createInsertSchema(psurComplianceChecklist).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PsurComplianceChecklist = typeof psurComplianceChecklist.$inferSelect;
export type InsertPsurComplianceChecklist = z.infer<typeof insertPsurComplianceChecklistSchema>;

// ============== RELATIONS ==============

export const psurEvidenceTypesRelations = relations(psurEvidenceTypes, ({ many }) => ({
  // Evidence atoms of this type
}));

export const psurSectionsRelations = relations(psurSections, ({ one, many }) => ({
  parentSection: one(psurSections, {
    fields: [psurSections.parentSectionId],
    references: [psurSections.sectionId],
  }),
}));

export const psurComplianceChecklistRelations = relations(psurComplianceChecklist, ({ one }) => ({
  psurCase: one(psurCases, {
    fields: [psurComplianceChecklist.psurCaseId],
    references: [psurCases.id],
  }),
}));

// ============== SYSTEM INSTRUCTIONS ==============
export const systemInstructions = pgTable("system_instructions", {
  key: text("key").primaryKey(), // E.g., "NARRATIVE_GENERATION"
  category: text("category").notNull(), // "ingestion", "runtime", "compliance"
  description: text("description"),
  template: text("template").notNull(), // The current active template
  defaultTemplate: text("default_template").notNull(), // The original default (for reset)
  version: integer("version").notNull().default(1),
  variables: jsonb("variables"), // Array of variable names expected
  lastUpdated: timestamp("last_updated").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedBy: text("updated_by"),
});

export const insertSystemInstructionSchema = createInsertSchema(systemInstructions);
export type SystemInstruction = typeof systemInstructions.$inferSelect;
export type InsertSystemInstruction = z.infer<typeof insertSystemInstructionSchema>;

export const instructionVersions = pgTable("instruction_versions", {
  id: serial("id").primaryKey(),
  instructionKey: text("instruction_key").notNull().references(() => systemInstructions.key, { onDelete: "cascade" }),
  template: text("template").notNull(),
  version: integer("version").notNull(),
  changeReason: text("change_reason"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: text("created_by"),
});

export const insertInstructionVersionSchema = createInsertSchema(instructionVersions).omit({
  id: true,
  createdAt: true,
});
export type InstructionVersion = typeof instructionVersions.$inferSelect;
export type InsertInstructionVersion = z.infer<typeof insertInstructionVersionSchema>;

export const systemInstructionsRelations = relations(systemInstructions, ({ many }) => ({
  versions: many(instructionVersions),
}));

export const instructionVersionsRelations = relations(instructionVersions, ({ one }) => ({
  instruction: one(systemInstructions, {
    fields: [instructionVersions.instructionKey],
    references: [systemInstructions.key],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE DOSSIER CONTEXT SYSTEM
// Rich device-specific context for non-generic PSUR content generation
// ═══════════════════════════════════════════════════════════════════════════════

// ============== DEVICE DOSSIERS ==============
// Core dossier table - one per device
export const deviceDossiers = pgTable("device_dossiers", {
  id: serial("id").primaryKey(),
  deviceCode: text("device_code").notNull().unique(),
  deviceId: integer("device_id").references(() => devices.id, { onDelete: "set null" }),

  // Identity
  basicUdiDi: text("basic_udi_di"),
  tradeName: text("trade_name").notNull(),
  manufacturerName: text("manufacturer_name"),

  // Classification
  classification: jsonb("classification").$type<{
    class: "I" | "IIa" | "IIb" | "III";
    rule: string;
    rationale: string;
  }>(),

  // Device variants and accessories
  variants: jsonb("variants").$type<Array<{
    variantId: string;
    name: string;
    udiDi?: string;
    description?: string;
  }>>(),
  accessories: text("accessories").array().default(sql`ARRAY[]::text[]`),

  // Software info (if applicable)
  software: jsonb("software").$type<{
    version: string;
    significantChanges: string[];
    isSaMD: boolean;
  }>(),

  // Market info
  marketEntryDate: timestamp("market_entry_date"),
  cumulativeExposure: jsonb("cumulative_exposure").$type<{
    patientYears?: number;
    unitsDistributed?: number;
    asOfDate: string;
  }>(),

  // Dossier completeness tracking
  completenessScore: integer("completeness_score").default(0), // 0-100
  lastValidatedAt: timestamp("last_validated_at"),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  deviceCodeIdx: uniqueIndex("device_dossiers_device_code_idx").on(t.deviceCode),
}));

export const insertDeviceDossierSchema = createInsertSchema(deviceDossiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DeviceDossier = typeof deviceDossiers.$inferSelect;
export type InsertDeviceDossier = z.infer<typeof insertDeviceDossierSchema>;

// ============== DOSSIER CLINICAL CONTEXT ==============
// Clinical/therapeutic context for the device
export const dossierClinicalContext = pgTable("dossier_clinical_context", {
  id: serial("id").primaryKey(),
  deviceCode: text("device_code").notNull().references(() => deviceDossiers.deviceCode, { onDelete: "cascade" }),

  // Intended purpose (verbatim from IFU)
  intendedPurpose: text("intended_purpose").notNull(),

  // Indications and contraindications
  indications: text("indications").array().default(sql`ARRAY[]::text[]`),
  contraindications: text("contraindications").array().default(sql`ARRAY[]::text[]`),

  // Target population
  targetPopulation: jsonb("target_population").$type<{
    description: string;
    ageRange?: { min: number; max: number };
    conditions: string[];
    excludedPopulations: string[];
  }>(),

  // Clinical benefits (key for B/R assessment)
  clinicalBenefits: jsonb("clinical_benefits").$type<Array<{
    benefitId: string;
    description: string;
    endpoint: string;
    evidenceSource: string;
    quantifiedValue?: string;
  }>>(),

  // Alternative treatments (for B/R context)
  alternativeTreatments: text("alternative_treatments").array().default(sql`ARRAY[]::text[]`),

  // State of the art
  stateOfTheArt: jsonb("state_of_the_art").$type<{
    description: string;
    benchmarkDevices: string[];
    performanceThresholds: Record<string, number>;
  }>(),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  deviceCodeIdx: uniqueIndex("dossier_clinical_device_code_idx").on(t.deviceCode),
}));

export const insertDossierClinicalContextSchema = createInsertSchema(dossierClinicalContext).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DossierClinicalContext = typeof dossierClinicalContext.$inferSelect;
export type InsertDossierClinicalContext = z.infer<typeof insertDossierClinicalContextSchema>;

// ============== DOSSIER RISK CONTEXT ==============
// Risk management context from Risk Analysis/FMEA
export const dossierRiskContext = pgTable("dossier_risk_context", {
  id: serial("id").primaryKey(),
  deviceCode: text("device_code").notNull().references(() => deviceDossiers.deviceCode, { onDelete: "cascade" }),

  // Principal identified risks (top risks from risk file)
  principalRisks: jsonb("principal_risks").$type<Array<{
    riskId: string;
    hazard: string;
    harm: string;
    severity: "Negligible" | "Minor" | "Serious" | "Critical" | "Catastrophic";
    probability: string;
    preMarketOccurrenceRate?: number;
    mitigations: string[];
    residualRiskAcceptable: boolean;
  }>>(),

  // Risk acceptability criteria
  residualRiskAcceptability: jsonb("residual_risk_acceptability").$type<{
    criteria: string;
    afapAnalysisSummary: string;
  }>(),

  // Signal detection thresholds
  riskThresholds: jsonb("risk_thresholds").$type<{
    complaintRateThreshold: number;
    seriousIncidentThreshold: number;
    signalDetectionMethod: string;
  }>(),

  // Hazard categories for IMDRF mapping
  hazardCategories: text("hazard_categories").array().default(sql`ARRAY[]::text[]`),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  deviceCodeIdx: uniqueIndex("dossier_risk_device_code_idx").on(t.deviceCode),
}));

export const insertDossierRiskContextSchema = createInsertSchema(dossierRiskContext).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DossierRiskContext = typeof dossierRiskContext.$inferSelect;
export type InsertDossierRiskContext = z.infer<typeof insertDossierRiskContextSchema>;

// ============== DOSSIER PRIOR PSURS ==============
// Summaries of prior PSURs for continuity
export const dossierPriorPsurs = pgTable("dossier_prior_psurs", {
  id: serial("id").primaryKey(),
  deviceCode: text("device_code").notNull().references(() => deviceDossiers.deviceCode, { onDelete: "cascade" }),

  // Period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  psurReference: text("psur_reference"),

  // Conclusions
  benefitRiskConclusion: text("benefit_risk_conclusion"), // "Favorable" | "Acceptable" | "Unfavorable"
  keyFindings: text("key_findings").array().default(sql`ARRAY[]::text[]`),

  // Actions and commitments
  actionsRequired: jsonb("actions_required").$type<Array<{
    actionId: string;
    description: string;
    dueDate?: string;
    completed: boolean;
    completedDate?: string;
  }>>(),

  // Key metrics from that period (for trend comparison)
  periodMetrics: jsonb("period_metrics").$type<{
    totalUnits?: number;
    totalComplaints?: number;
    complaintRate?: number;
    seriousIncidents?: number;
    fscaCount?: number;
  }>(),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  deviceCodeIdx: index("dossier_prior_psurs_device_code_idx").on(t.deviceCode),
  periodIdx: index("dossier_prior_psurs_period_idx").on(t.periodStart, t.periodEnd),
}));

export const insertDossierPriorPsurSchema = createInsertSchema(dossierPriorPsurs).omit({
  id: true,
  createdAt: true,
});

export type DossierPriorPsur = typeof dossierPriorPsurs.$inferSelect;
export type InsertDossierPriorPsur = z.infer<typeof insertDossierPriorPsurSchema>;

// ============== DOSSIER BASELINES ==============
// Historical performance baselines for trend analysis
export const dossierBaselines = pgTable("dossier_baselines", {
  id: serial("id").primaryKey(),
  deviceCode: text("device_code").notNull().references(() => deviceDossiers.deviceCode, { onDelete: "cascade" }),

  // Metric identification
  metricType: text("metric_type").notNull(), // complaint_rate, incident_rate, return_rate, etc.

  // Period for this baseline
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Value
  value: text("value").notNull(), // Stored as text for precision
  denominator: integer("denominator"), // Units sold/distributed
  unit: text("unit"), // "per_1000_units", "percent", "count"

  // Methodology
  methodology: text("methodology"), // How baseline was calculated
  dataSource: text("data_source"), // Where data came from

  // Confidence
  confidence: text("confidence"), // High, Medium, Low
  notes: text("notes"),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  deviceCodeIdx: index("dossier_baselines_device_code_idx").on(t.deviceCode),
  metricTypeIdx: index("dossier_baselines_metric_type_idx").on(t.metricType),
}));

export const insertDossierBaselineSchema = createInsertSchema(dossierBaselines).omit({
  id: true,
  createdAt: true,
});

export type DossierBaseline = typeof dossierBaselines.$inferSelect;
export type InsertDossierBaseline = z.infer<typeof insertDossierBaselineSchema>;

// ============== DOSSIER CLINICAL EVIDENCE ==============
// Clinical evidence foundation (CER, PMCF, Literature)
export const dossierClinicalEvidence = pgTable("dossier_clinical_evidence", {
  id: serial("id").primaryKey(),
  deviceCode: text("device_code").notNull().references(() => deviceDossiers.deviceCode, { onDelete: "cascade" }),

  // CER conclusions
  cerConclusions: jsonb("cer_conclusions").$type<{
    lastUpdateDate: string;
    benefitRiskConclusion: string;
    keyFindings: string[];
    dataGapsIdentified: string[];
  }>(),

  // PMCF plan
  pmcfPlan: jsonb("pmcf_plan").$type<{
    objectives: string[];
    endpoints: Array<{
      endpointId: string;
      description: string;
      targetValue?: string;
      measurementMethod?: string;
    }>;
    targetEnrollment?: number;
    currentStatus: string;
    studyIds?: string[];
  }>(),

  // Literature search protocol
  literatureSearchProtocol: jsonb("literature_search_protocol").$type<{
    databases: string[];
    searchStrings: string[];
    inclusionCriteria: string[];
    exclusionCriteria: string[];
    lastSearchDate: string;
  }>(),

  // External database search protocol (MDCG 2022-21 Section 10)
  externalDbSearchProtocol: jsonb("external_db_search_protocol").$type<{
    databases: string[];
    queryTerms: string[];
    dateRange?: string;
    lastSearchDate: string;
    relevanceCriteria: string[];
  }>(),

  // Equivalent devices (if equivalence route)
  equivalentDevices: jsonb("equivalent_devices").$type<Array<{
    deviceName: string;
    manufacturer: string;
    equivalenceType: "Technical" | "Biological" | "Clinical";
    equivalenceJustification: string;
  }>>(),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  deviceCodeIdx: uniqueIndex("dossier_clinical_evidence_device_code_idx").on(t.deviceCode),
}));

export const insertDossierClinicalEvidenceSchema = createInsertSchema(dossierClinicalEvidence).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DossierClinicalEvidence = typeof dossierClinicalEvidence.$inferSelect;
export type InsertDossierClinicalEvidence = z.infer<typeof insertDossierClinicalEvidenceSchema>;

// ============== DOSSIER REGULATORY HISTORY ==============
// Regulatory certificates, commitments, and history
export const dossierRegulatoryHistory = pgTable("dossier_regulatory_history", {
  id: serial("id").primaryKey(),
  deviceCode: text("device_code").notNull().references(() => deviceDossiers.deviceCode, { onDelete: "cascade" }),

  // Certificates
  certificates: jsonb("certificates").$type<Array<{
    certificateId: string;
    type: string; // EC Certificate, UK CA Mark, etc.
    notifiedBody: string;
    issueDate: string;
    expiryDate: string;
    scope: string;
    status: "Active" | "Expired" | "Suspended" | "Withdrawn";
  }>>(),

  // NB Commitments/Conditions
  nbCommitments: jsonb("nb_commitments").$type<Array<{
    commitmentId: string;
    description: string;
    source: string; // Which audit/review
    dueDate?: string;
    status: "Open" | "In Progress" | "Completed" | "Overdue";
    completedDate?: string;
    evidence?: string;
  }>>(),

  // FSCA History
  fscaHistory: jsonb("fsca_history").$type<Array<{
    fscaId: string;
    type: string; // Recall, Advisory, etc.
    initiationDate: string;
    description: string;
    affectedUnits?: number;
    regions: string[];
    status: "Active" | "Completed";
    completionDate?: string;
  }>>(),

  // Design changes
  designChanges: jsonb("design_changes").$type<Array<{
    changeId: string;
    description: string;
    effectiveDate: string;
    type: string; // Hardware, Software, Labeling, etc.
    significance: "Significant" | "Non-Significant";
    regulatoryImpact: string;
  }>>(),

  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  deviceCodeIdx: uniqueIndex("dossier_regulatory_device_code_idx").on(t.deviceCode),
}));

export const insertDossierRegulatoryHistorySchema = createInsertSchema(dossierRegulatoryHistory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DossierRegulatoryHistory = typeof dossierRegulatoryHistory.$inferSelect;
export type InsertDossierRegulatoryHistory = z.infer<typeof insertDossierRegulatoryHistorySchema>;

// ============== DOSSIER RELATIONS ==============
export const deviceDossiersRelations = relations(deviceDossiers, ({ one, many }) => ({
  device: one(devices, {
    fields: [deviceDossiers.deviceId],
    references: [devices.id],
  }),
  clinicalContext: one(dossierClinicalContext, {
    fields: [deviceDossiers.deviceCode],
    references: [dossierClinicalContext.deviceCode],
  }),
  riskContext: one(dossierRiskContext, {
    fields: [deviceDossiers.deviceCode],
    references: [dossierRiskContext.deviceCode],
  }),
  clinicalEvidence: one(dossierClinicalEvidence, {
    fields: [deviceDossiers.deviceCode],
    references: [dossierClinicalEvidence.deviceCode],
  }),
  regulatoryHistory: one(dossierRegulatoryHistory, {
    fields: [deviceDossiers.deviceCode],
    references: [dossierRegulatoryHistory.deviceCode],
  }),
  priorPsurs: many(dossierPriorPsurs),
  baselines: many(dossierBaselines),
}));

export const dossierPriorPsursRelations = relations(dossierPriorPsurs, ({ one }) => ({
  dossier: one(deviceDossiers, {
    fields: [dossierPriorPsurs.deviceCode],
    references: [deviceDossiers.deviceCode],
  }),
}));

export const dossierBaselinesRelations = relations(dossierBaselines, ({ one }) => ({
  dossier: one(deviceDossiers, {
    fields: [dossierBaselines.deviceCode],
    references: [deviceDossiers.deviceCode],
  }),
}));
