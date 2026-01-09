import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export chat models
export * from "./models/chat";

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
  templateId: text("template_id"), // Template to use: FormQAR-054_C or MDCG_2022_21_ANNEX_I
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

// ============== PSUR CASES ==============
export const psurCaseStatusEnum = ["draft", "qualified", "in_progress", "rendered", "exported"] as const;
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
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPsurCaseSchema = createInsertSchema(psurCases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PSURCase = typeof psurCases.$inferSelect;
export type InsertPSURCase = z.infer<typeof insertPsurCaseSchema>;

// ============== EVIDENCE UPLOADS ==============
export const evidenceUploadStatusEnum = ["pending", "processing", "completed", "failed", "rejected"] as const;
export type EvidenceUploadStatus = typeof evidenceUploadStatusEnum[number];

export const evidenceUploads = pgTable("evidence_uploads", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  sha256Hash: text("sha256_hash").notNull(),
  evidenceType: text("evidence_type").notNull(),
  deviceScopeId: integer("device_scope_id").references(() => devices.id),
  psurCaseId: integer("psur_case_id").references(() => psurCases.id),
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
});

export const insertEvidenceUploadSchema = createInsertSchema(evidenceUploads).omit({
  id: true,
  createdAt: true,
});

export type EvidenceUpload = typeof evidenceUploads.$inferSelect;
export type InsertEvidenceUpload = z.infer<typeof insertEvidenceUploadSchema>;

// ============== EVIDENCE DEFINITIONS REGISTRY ==============
// Single source of truth for all evidence types - consumed by UI, parser, storage, and queue-builder
export interface EvidenceDefinition {
  type: string;
  label: string;
  description: string;
  sections: string[];  // PSUR sections this evidence feeds into
  tier: number;        // Processing priority tier (0=admin, 1=sales/pop, 2=safety, 3=external, 4=conclusions)
  isAggregated: boolean;  // true for summary/aggregated data, false for raw records
  requiredFields: string[];  // Required fields for validation
  parserType: "dedicated" | "generic";  // Parser handling
}

export const EVIDENCE_DEFINITIONS: EvidenceDefinition[] = [
  { type: "manufacturer_master_data", label: "Manufacturer Master Data", description: "Legal entity name, address, contact info", sections: ["A"], tier: 0, isAggregated: false, requiredFields: [], parserType: "generic" },
  { type: "device_master_data", label: "Device Master Data", description: "UDI-DI, device identifiers, classification", sections: ["A"], tier: 0, isAggregated: false, requiredFields: [], parserType: "generic" },
  { type: "psur_case_record", label: "PSUR Case Record", description: "Reporting period, reference numbers, scope", sections: ["A", "M"], tier: 0, isAggregated: false, requiredFields: [], parserType: "generic" },
  { type: "sales_volume", label: "Sales Volume", description: "Unit sales and distribution data by period", sections: ["C"], tier: 1, isAggregated: false, requiredFields: ["deviceCode", "quantity", "periodStart", "periodEnd"], parserType: "dedicated" },
  { type: "population_estimate", label: "Population Estimate", description: "Patient/user population calculations", sections: ["C"], tier: 1, isAggregated: true, requiredFields: [], parserType: "generic" },
  { type: "exposure_model", label: "Exposure Model", description: "Device exposure methodology and data", sections: ["C", "G"], tier: 1, isAggregated: true, requiredFields: [], parserType: "generic" },
  { type: "incident_record", label: "Incident Records", description: "Serious and non-serious incident reports", sections: ["D", "E", "G", "M"], tier: 2, isAggregated: false, requiredFields: ["incidentId", "deviceCode", "incidentDate", "description"], parserType: "dedicated" },
  { type: "incidents", label: "Incidents (Aggregated)", description: "Aggregated incident data and trends", sections: ["D", "E", "G", "M"], tier: 2, isAggregated: true, requiredFields: [], parserType: "dedicated" },
  { type: "complaint_record", label: "Complaint Records", description: "Customer complaints and investigations", sections: ["F", "G", "M"], tier: 2, isAggregated: false, requiredFields: ["complaintId", "deviceCode", "complaintDate", "description"], parserType: "dedicated" },
  { type: "complaints", label: "Complaints (Aggregated)", description: "Aggregated complaint data and analysis", sections: ["F", "G", "M"], tier: 2, isAggregated: true, requiredFields: [], parserType: "dedicated" },
  { type: "fsca", label: "FSCA Records", description: "Field safety corrective actions", sections: ["H"], tier: 2, isAggregated: false, requiredFields: ["fscaId", "deviceCode", "actionType", "initiationDate"], parserType: "dedicated" },
  { type: "capa", label: "CAPA Records", description: "Corrective and preventive actions", sections: ["I"], tier: 2, isAggregated: false, requiredFields: ["capaId", "description"], parserType: "dedicated" },
  { type: "literature", label: "Literature Evidence", description: "Published literature review data", sections: ["J", "M"], tier: 3, isAggregated: false, requiredFields: [], parserType: "dedicated" },
  { type: "registry", label: "Registry/Database Data", description: "External database and registry queries", sections: ["K"], tier: 3, isAggregated: true, requiredFields: ["registryName"], parserType: "dedicated" },
  { type: "pmcf", label: "PMCF Study Data", description: "Post-market clinical follow-up results", sections: ["L", "M"], tier: 3, isAggregated: true, requiredFields: [], parserType: "dedicated" },
];

// Derive enum from registry for backwards compatibility
export const evidenceTypeEnum = EVIDENCE_DEFINITIONS.map(d => d.type) as unknown as readonly string[];
export type EvidenceType = typeof EVIDENCE_DEFINITIONS[number]["type"];

// Raw → Aggregated mapping: when raw records exist, they contribute to aggregated type requirements
export const RAW_TO_AGGREGATED_MAP: Record<string, string> = {
  "incident_record": "incidents",
  "complaint_record": "complaints",
};

export const AGGREGATED_TO_RAW_MAP: Record<string, string> = {
  "incidents": "incident_record",
  "complaints": "complaint_record",
};

// Helper functions for evidence registry
export function getEvidenceDefinition(type: string): EvidenceDefinition | undefined {
  return EVIDENCE_DEFINITIONS.find(d => d.type === type);
}

export function getEvidenceTypesForSection(section: string): EvidenceDefinition[] {
  return EVIDENCE_DEFINITIONS.filter(d => d.sections.includes(section));
}

export function getEvidenceTypesByTier(tier: number): EvidenceDefinition[] {
  return EVIDENCE_DEFINITIONS.filter(d => d.tier === tier);
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

export const evidenceAtoms = pgTable("evidence_atoms", {
  id: serial("id").primaryKey(),
  psurCaseId: integer("psur_case_id").references(() => psurCases.id, { onDelete: "cascade" }),
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
  data: jsonb("data").notNull(),
  normalizedData: jsonb("normalized_data"),
  provenance: jsonb("provenance").notNull(),
  validationErrors: jsonb("validation_errors"),
  status: text("status").notNull().default("valid"),
  version: integer("version").notNull().default(1),
  supersededBy: integer("superseded_by"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

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
  evidenceAtomIds: integer("evidence_atom_ids").array(),
  transformations: text("transformations").array(),
  obligationIds: text("obligation_ids").array(),
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
