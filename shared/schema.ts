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
