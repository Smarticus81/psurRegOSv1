import { 
  type User, type InsertUser,
  type Company, type InsertCompany,
  type Device, type InsertDevice,
  type PSURItem, type InsertPSURItem,
  type DataSource, type InsertDataSource,
  type AgentExecution, type InsertAgentExecution,
  type AuditEvent, type InsertAuditEvent,
  type GeneratedDocument, type InsertGeneratedDocument,
  type GRKBEntry, type InsertGRKBEntry,
  type PSURCase, type InsertPSURCase,
  type EvidenceUpload, type InsertEvidenceUpload,
  type EvidenceAtom, type InsertEvidenceAtom,
  type SlotProposal, type InsertSlotProposal,
  type CoverageReport, type InsertCoverageReport,
  type AuditBundle, type InsertAuditBundle,
  type CoverageSlotQueue, type InsertCoverageSlotQueue,
  type ColumnMappingProfile, type InsertColumnMappingProfile,
  type QualificationReport,
  users,
  companies,
  devices,
  psurItems,
  dataSources,
  agentExecutions,
  auditEvents,
  generatedDocuments,
  grkbEntries,
  psurCases,
  evidenceUploads,
  evidenceAtoms,
  slotProposals,
  coverageReports,
  auditBundles,
  coverageSlotQueues,
  columnMappingProfiles,
  slotDefinitions,
  qualificationReports,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getCompanies(): Promise<Company[]>;
  getCompany(id: number): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: number): Promise<boolean>;

  getDevices(): Promise<Device[]>;
  getDevicesByCompany(companyId: number): Promise<Device[]>;
  getDevice(id: number): Promise<Device | undefined>;
  createDevice(device: InsertDevice): Promise<Device>;
  updateDevice(id: number, device: Partial<InsertDevice>): Promise<Device | undefined>;
  deleteDevice(id: number): Promise<boolean>;

  getPSURItems(): Promise<PSURItem[]>;
  getPSURItemsByDevice(deviceId: number): Promise<PSURItem[]>;
  getPSURItem(id: number): Promise<PSURItem | undefined>;
  createPSURItem(item: InsertPSURItem): Promise<PSURItem>;
  updatePSURItem(id: number, item: Partial<InsertPSURItem>): Promise<PSURItem | undefined>;

  getDataSources(): Promise<DataSource[]>;
  getDataSourcesByCompany(companyId: number): Promise<DataSource[]>;
  getDataSource(id: number): Promise<DataSource | undefined>;
  createDataSource(source: InsertDataSource): Promise<DataSource>;
  updateDataSource(id: number, source: Partial<InsertDataSource>): Promise<DataSource | undefined>;
  deleteDataSource(id: number): Promise<boolean>;

  getAgentExecutions(): Promise<AgentExecution[]>;
  getAgentExecution(id: number): Promise<AgentExecution | undefined>;
  createAgentExecution(execution: InsertAgentExecution): Promise<AgentExecution>;
  updateAgentExecution(id: number, execution: Partial<InsertAgentExecution>): Promise<AgentExecution | undefined>;

  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;
  getAuditEvents(entityType?: string, entityId?: number): Promise<AuditEvent[]>;

  getDocuments(): Promise<GeneratedDocument[]>;
  getDocument(id: number): Promise<GeneratedDocument | undefined>;
  createDocument(doc: InsertGeneratedDocument): Promise<GeneratedDocument>;

  getGRKBEntries(regulation?: string, category?: string): Promise<GRKBEntry[]>;
  createGRKBEntry(entry: InsertGRKBEntry): Promise<GRKBEntry>;

  getPSURCases(): Promise<PSURCase[]>;
  getPSURCase(id: number): Promise<PSURCase | undefined>;
  getPSURCasesByDeviceAndPeriod(deviceId: number, startPeriod: Date, endPeriod: Date): Promise<PSURCase[]>;
  getActivePSURCaseForDevice(deviceId: number): Promise<PSURCase | undefined>;
  createPSURCase(psurCase: InsertPSURCase): Promise<PSURCase>;
  updatePSURCase(id: number, psurCase: Partial<InsertPSURCase>): Promise<PSURCase | undefined>;

  getEvidenceUploads(psurCaseId?: number): Promise<EvidenceUpload[]>;
  getEvidenceUpload(id: number): Promise<EvidenceUpload | undefined>;
  createEvidenceUpload(upload: InsertEvidenceUpload): Promise<EvidenceUpload>;
  updateEvidenceUpload(id: number, upload: Partial<InsertEvidenceUpload>): Promise<EvidenceUpload | undefined>;

  getEvidenceAtoms(psurCaseId?: number): Promise<EvidenceAtom[]>;
  getEvidenceAtomsByIds(ids: number[]): Promise<EvidenceAtom[]>;
  getEvidenceAtomsByUpload(uploadId: number): Promise<EvidenceAtom[]>;
  getEvidenceAtomsByType(evidenceType: string, psurCaseId?: number): Promise<EvidenceAtom[]>;
  getEvidenceAtomsByPeriod(startDate: Date, endDate: Date, psurCaseId?: number): Promise<EvidenceAtom[]>;
  createEvidenceAtom(atom: InsertEvidenceAtom): Promise<EvidenceAtom>;
  createEvidenceAtomsBatch(atoms: InsertEvidenceAtom[]): Promise<EvidenceAtom[]>;

  getSlotProposals(psurCaseId?: number): Promise<SlotProposal[]>;
  getSlotProposal(id: number): Promise<SlotProposal | undefined>;
  getAcceptedSlotProposals(psurCaseId?: number): Promise<SlotProposal[]>;
  createSlotProposal(proposal: InsertSlotProposal): Promise<SlotProposal>;
  updateSlotProposal(id: number, proposal: Partial<InsertSlotProposal>): Promise<SlotProposal | undefined>;

  getCoverageReports(psurCaseId?: number): Promise<CoverageReport[]>;
  createCoverageReport(report: InsertCoverageReport): Promise<CoverageReport>;

  getAuditBundles(psurCaseId?: number): Promise<AuditBundle[]>;
  createAuditBundle(bundle: InsertAuditBundle): Promise<AuditBundle>;

  getCoverageSlotQueues(psurCaseId?: number): Promise<CoverageSlotQueue[]>;
  getCoverageSlotQueue(id: number): Promise<CoverageSlotQueue | undefined>;
  createCoverageSlotQueue(queue: InsertCoverageSlotQueue): Promise<CoverageSlotQueue>;

  getColumnMappingProfiles(evidenceType?: string): Promise<ColumnMappingProfile[]>;
  getColumnMappingProfile(id: number): Promise<ColumnMappingProfile | undefined>;
  createColumnMappingProfile(profile: InsertColumnMappingProfile): Promise<ColumnMappingProfile>;
  updateColumnMappingProfile(id: number, profile: Partial<InsertColumnMappingProfile>): Promise<ColumnMappingProfile | undefined>;
  incrementMappingProfileUsage(id: number): Promise<void>;

  getTemplateRequirements(templateId: string): Promise<string[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [newCompany] = await db.insert(companies).values(company).returning();
    return newCompany;
  }

  async updateCompany(id: number, company: Partial<InsertCompany>): Promise<Company | undefined> {
    const [updated] = await db.update(companies).set(company).where(eq(companies.id, id)).returning();
    return updated;
  }

  async deleteCompany(id: number): Promise<boolean> {
    const result = await db.delete(companies).where(eq(companies.id, id)).returning();
    return result.length > 0;
  }

  async getDevices(): Promise<Device[]> {
    return db.select().from(devices).orderBy(desc(devices.createdAt));
  }

  async getDevicesByCompany(companyId: number): Promise<Device[]> {
    return db.select().from(devices).where(eq(devices.companyId, companyId));
  }

  async getDevice(id: number): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(eq(devices.id, id));
    return device;
  }

  async createDevice(device: InsertDevice): Promise<Device> {
    const [newDevice] = await db.insert(devices).values(device).returning();
    return newDevice;
  }

  async updateDevice(id: number, device: Partial<InsertDevice>): Promise<Device | undefined> {
    const [updated] = await db.update(devices).set(device).where(eq(devices.id, id)).returning();
    return updated;
  }

  async deleteDevice(id: number): Promise<boolean> {
    const result = await db.delete(devices).where(eq(devices.id, id)).returning();
    return result.length > 0;
  }

  async getPSURItems(): Promise<PSURItem[]> {
    return db.select().from(psurItems).orderBy(desc(psurItems.createdAt));
  }

  async getPSURItemsByDevice(deviceId: number): Promise<PSURItem[]> {
    return db.select().from(psurItems).where(eq(psurItems.deviceId, deviceId));
  }

  async getPSURItem(id: number): Promise<PSURItem | undefined> {
    const [item] = await db.select().from(psurItems).where(eq(psurItems.id, id));
    return item;
  }

  async createPSURItem(item: InsertPSURItem): Promise<PSURItem> {
    const [newItem] = await db.insert(psurItems).values(item).returning();
    return newItem;
  }

  async updatePSURItem(id: number, item: Partial<InsertPSURItem>): Promise<PSURItem | undefined> {
    const [updated] = await db.update(psurItems).set(item).where(eq(psurItems.id, id)).returning();
    return updated;
  }

  async getDataSources(): Promise<DataSource[]> {
    return db.select().from(dataSources).orderBy(desc(dataSources.createdAt));
  }

  async getDataSourcesByCompany(companyId: number): Promise<DataSource[]> {
    return db.select().from(dataSources).where(eq(dataSources.companyId, companyId));
  }

  async getDataSource(id: number): Promise<DataSource | undefined> {
    const [source] = await db.select().from(dataSources).where(eq(dataSources.id, id));
    return source;
  }

  async createDataSource(source: InsertDataSource): Promise<DataSource> {
    const [newSource] = await db.insert(dataSources).values(source).returning();
    return newSource;
  }

  async updateDataSource(id: number, source: Partial<InsertDataSource>): Promise<DataSource | undefined> {
    const [updated] = await db.update(dataSources).set(source).where(eq(dataSources.id, id)).returning();
    return updated;
  }

  async deleteDataSource(id: number): Promise<boolean> {
    const result = await db.delete(dataSources).where(eq(dataSources.id, id)).returning();
    return result.length > 0;
  }

  async getAgentExecutions(): Promise<AgentExecution[]> {
    return db.select().from(agentExecutions).orderBy(desc(agentExecutions.createdAt));
  }

  async getAgentExecution(id: number): Promise<AgentExecution | undefined> {
    const [execution] = await db.select().from(agentExecutions).where(eq(agentExecutions.id, id));
    return execution;
  }

  async createAgentExecution(execution: InsertAgentExecution): Promise<AgentExecution> {
    const [newExecution] = await db.insert(agentExecutions).values(execution).returning();
    return newExecution;
  }

  async updateAgentExecution(id: number, execution: Partial<InsertAgentExecution>): Promise<AgentExecution | undefined> {
    const [updated] = await db.update(agentExecutions).set(execution).where(eq(agentExecutions.id, id)).returning();
    return updated;
  }

  async createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
    const [newEvent] = await db.insert(auditEvents).values(event).returning();
    return newEvent;
  }

  async getAuditEvents(entityType?: string, entityId?: number): Promise<AuditEvent[]> {
    let query = db.select().from(auditEvents);
    
    if (entityType && entityId) {
      return db.select().from(auditEvents)
        .where(and(eq(auditEvents.entityType, entityType), eq(auditEvents.entityId, entityId)))
        .orderBy(desc(auditEvents.createdAt));
    } else if (entityType) {
      return db.select().from(auditEvents)
        .where(eq(auditEvents.entityType, entityType))
        .orderBy(desc(auditEvents.createdAt));
    }
    
    return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt));
  }

  async getDocuments(): Promise<GeneratedDocument[]> {
    return db.select().from(generatedDocuments).orderBy(desc(generatedDocuments.generatedAt));
  }

  async getDocument(id: number): Promise<GeneratedDocument | undefined> {
    const [doc] = await db.select().from(generatedDocuments).where(eq(generatedDocuments.id, id));
    return doc;
  }

  async createDocument(doc: InsertGeneratedDocument): Promise<GeneratedDocument> {
    const [newDoc] = await db.insert(generatedDocuments).values(doc).returning();
    return newDoc;
  }

  async getGRKBEntries(regulation?: string, category?: string): Promise<GRKBEntry[]> {
    if (regulation && category) {
      return db.select().from(grkbEntries)
        .where(and(eq(grkbEntries.regulation, regulation), eq(grkbEntries.category, category)));
    } else if (regulation) {
      return db.select().from(grkbEntries).where(eq(grkbEntries.regulation, regulation));
    } else if (category) {
      return db.select().from(grkbEntries).where(eq(grkbEntries.category, category));
    }
    return db.select().from(grkbEntries);
  }

  async createGRKBEntry(entry: InsertGRKBEntry): Promise<GRKBEntry> {
    const [newEntry] = await db.insert(grkbEntries).values(entry).returning();
    return newEntry;
  }

  async getPSURCases(): Promise<PSURCase[]> {
    return db.select().from(psurCases).orderBy(desc(psurCases.createdAt));
  }

  async getPSURCase(id: number): Promise<PSURCase | undefined> {
    const [psurCase] = await db.select().from(psurCases).where(eq(psurCases.id, id));
    return psurCase;
  }

  async getPSURCasesByDeviceAndPeriod(deviceId: number, startPeriod: Date, endPeriod: Date): Promise<PSURCase[]> {
    // Find all cases where the device is in deviceIds array and periods overlap or match
    const allCases = await db.select().from(psurCases).orderBy(desc(psurCases.createdAt));
    return allCases.filter(c => {
      const hasDevice = c.deviceIds?.includes(deviceId) || c.leadingDeviceId === deviceId;
      const sameStart = c.startPeriod.getTime() === startPeriod.getTime();
      const sameEnd = c.endPeriod.getTime() === endPeriod.getTime();
      return hasDevice && sameStart && sameEnd;
    });
  }

  async getActivePSURCaseForDevice(deviceId: number): Promise<PSURCase | undefined> {
    // Get the most recent non-closed, non-voided case for a device
    const allCases = await db.select().from(psurCases).orderBy(desc(psurCases.createdAt));
    return allCases.find(c => {
      const hasDevice = c.deviceIds?.includes(deviceId) || c.leadingDeviceId === deviceId;
      const isActive = c.status !== "closed" && c.status !== "voided";
      return hasDevice && isActive;
    });
  }

  async createPSURCase(psurCase: InsertPSURCase): Promise<PSURCase> {
    const [newCase] = await db.insert(psurCases).values(psurCase).returning();
    return newCase;
  }

  async updatePSURCase(id: number, psurCase: Partial<InsertPSURCase>): Promise<PSURCase | undefined> {
    const [updated] = await db.update(psurCases).set(psurCase).where(eq(psurCases.id, id)).returning();
    return updated;
  }

  async getEvidenceUploads(psurCaseId?: number): Promise<EvidenceUpload[]> {
    if (psurCaseId) {
      return db.select().from(evidenceUploads).where(eq(evidenceUploads.psurCaseId, psurCaseId)).orderBy(desc(evidenceUploads.createdAt));
    }
    return db.select().from(evidenceUploads).orderBy(desc(evidenceUploads.createdAt));
  }

  async getEvidenceUpload(id: number): Promise<EvidenceUpload | undefined> {
    const [upload] = await db.select().from(evidenceUploads).where(eq(evidenceUploads.id, id));
    return upload;
  }

  async createEvidenceUpload(upload: InsertEvidenceUpload): Promise<EvidenceUpload> {
    const [newUpload] = await db.insert(evidenceUploads).values(upload).returning();
    return newUpload;
  }

  async updateEvidenceUpload(id: number, upload: Partial<InsertEvidenceUpload>): Promise<EvidenceUpload | undefined> {
    const [updated] = await db.update(evidenceUploads).set(upload).where(eq(evidenceUploads.id, id)).returning();
    return updated;
  }

  async getEvidenceAtoms(psurCaseId?: number): Promise<EvidenceAtom[]> {
    if (psurCaseId) {
      return db.select().from(evidenceAtoms).where(eq(evidenceAtoms.psurCaseId, psurCaseId)).orderBy(desc(evidenceAtoms.createdAt));
    }
    return db.select().from(evidenceAtoms).orderBy(desc(evidenceAtoms.createdAt));
  }

  async getEvidenceAtomsByIds(ids: number[]): Promise<EvidenceAtom[]> {
    if (ids.length === 0) return [];
    return db.select().from(evidenceAtoms).where(inArray(evidenceAtoms.id, ids));
  }

  async getEvidenceAtomsByUpload(uploadId: number): Promise<EvidenceAtom[]> {
    return db.select().from(evidenceAtoms).where(eq(evidenceAtoms.uploadId, uploadId)).orderBy(desc(evidenceAtoms.createdAt));
  }

  async getEvidenceAtomsByType(evidenceType: string, psurCaseId?: number): Promise<EvidenceAtom[]> {
    if (psurCaseId) {
      return db.select().from(evidenceAtoms)
        .where(and(eq(evidenceAtoms.evidenceType, evidenceType), eq(evidenceAtoms.psurCaseId, psurCaseId)))
        .orderBy(desc(evidenceAtoms.createdAt));
    }
    return db.select().from(evidenceAtoms).where(eq(evidenceAtoms.evidenceType, evidenceType)).orderBy(desc(evidenceAtoms.createdAt));
  }

  async getEvidenceAtomsByPeriod(startDate: Date, endDate: Date, psurCaseId?: number): Promise<EvidenceAtom[]> {
    const allAtoms = await this.getEvidenceAtoms(psurCaseId);
    return allAtoms.filter(atom => {
      if (!atom.periodStart || !atom.periodEnd) return false;
      const atomStart = new Date(atom.periodStart);
      const atomEnd = new Date(atom.periodEnd);
      return atomStart >= startDate && atomEnd <= endDate;
    });
  }

  async createEvidenceAtom(atom: InsertEvidenceAtom): Promise<EvidenceAtom> {
    const [newAtom] = await db.insert(evidenceAtoms).values(atom).returning();
    return newAtom;
  }

  async createEvidenceAtomsBatch(atoms: InsertEvidenceAtom[]): Promise<EvidenceAtom[]> {
    if (atoms.length === 0) return [];
    return db.insert(evidenceAtoms).values(atoms).returning();
  }

  async getSlotProposals(psurCaseId?: number): Promise<SlotProposal[]> {
    if (psurCaseId) {
      return db.select().from(slotProposals).where(eq(slotProposals.psurCaseId, psurCaseId)).orderBy(desc(slotProposals.createdAt));
    }
    return db.select().from(slotProposals).orderBy(desc(slotProposals.createdAt));
  }

  async getSlotProposal(id: number): Promise<SlotProposal | undefined> {
    const [proposal] = await db.select().from(slotProposals).where(eq(slotProposals.id, id));
    return proposal;
  }

  async getAcceptedSlotProposals(psurCaseId?: number): Promise<SlotProposal[]> {
    if (psurCaseId) {
      return db.select().from(slotProposals)
        .where(and(eq(slotProposals.psurCaseId, psurCaseId), eq(slotProposals.status, "accepted")))
        .orderBy(desc(slotProposals.createdAt));
    }
    return db.select().from(slotProposals)
      .where(eq(slotProposals.status, "accepted"))
      .orderBy(desc(slotProposals.createdAt));
  }

  async createSlotProposal(proposal: InsertSlotProposal): Promise<SlotProposal> {
    const [newProposal] = await db.insert(slotProposals).values(proposal).returning();
    return newProposal;
  }

  async updateSlotProposal(id: number, proposal: Partial<InsertSlotProposal>): Promise<SlotProposal | undefined> {
    const [updated] = await db.update(slotProposals).set(proposal).where(eq(slotProposals.id, id)).returning();
    return updated;
  }

  async getCoverageReports(psurCaseId?: number): Promise<CoverageReport[]> {
    if (psurCaseId) {
      return db.select().from(coverageReports).where(eq(coverageReports.psurCaseId, psurCaseId)).orderBy(desc(coverageReports.createdAt));
    }
    return db.select().from(coverageReports).orderBy(desc(coverageReports.createdAt));
  }

  async createCoverageReport(report: InsertCoverageReport): Promise<CoverageReport> {
    const [newReport] = await db.insert(coverageReports).values(report).returning();
    return newReport;
  }

  async getAuditBundles(psurCaseId?: number): Promise<AuditBundle[]> {
    if (psurCaseId) {
      return db.select().from(auditBundles).where(eq(auditBundles.psurCaseId, psurCaseId)).orderBy(desc(auditBundles.exportedAt));
    }
    return db.select().from(auditBundles).orderBy(desc(auditBundles.exportedAt));
  }

  async createAuditBundle(bundle: InsertAuditBundle): Promise<AuditBundle> {
    const [newBundle] = await db.insert(auditBundles).values(bundle).returning();
    return newBundle;
  }

  async getCoverageSlotQueues(psurCaseId?: number): Promise<CoverageSlotQueue[]> {
    if (psurCaseId) {
      return db.select().from(coverageSlotQueues).where(eq(coverageSlotQueues.psurCaseId, psurCaseId)).orderBy(desc(coverageSlotQueues.generatedAt));
    }
    return db.select().from(coverageSlotQueues).orderBy(desc(coverageSlotQueues.generatedAt));
  }

  async getCoverageSlotQueue(id: number): Promise<CoverageSlotQueue | undefined> {
    const [queue] = await db.select().from(coverageSlotQueues).where(eq(coverageSlotQueues.id, id));
    return queue;
  }

  async createCoverageSlotQueue(queue: InsertCoverageSlotQueue): Promise<CoverageSlotQueue> {
    const [newQueue] = await db.insert(coverageSlotQueues).values(queue).returning();
    return newQueue;
  }

  async getColumnMappingProfiles(evidenceType?: string): Promise<ColumnMappingProfile[]> {
    if (evidenceType) {
      return db.select().from(columnMappingProfiles)
        .where(eq(columnMappingProfiles.evidenceType, evidenceType))
        .orderBy(desc(columnMappingProfiles.usageCount));
    }
    return db.select().from(columnMappingProfiles).orderBy(desc(columnMappingProfiles.usageCount));
  }

  async getColumnMappingProfile(id: number): Promise<ColumnMappingProfile | undefined> {
    const [profile] = await db.select().from(columnMappingProfiles).where(eq(columnMappingProfiles.id, id));
    return profile;
  }

  async createColumnMappingProfile(profile: InsertColumnMappingProfile): Promise<ColumnMappingProfile> {
    const [newProfile] = await db.insert(columnMappingProfiles).values(profile).returning();
    return newProfile;
  }

  async updateColumnMappingProfile(id: number, profile: Partial<InsertColumnMappingProfile>): Promise<ColumnMappingProfile | undefined> {
    const [updated] = await db.update(columnMappingProfiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(columnMappingProfiles.id, id))
      .returning();
    return updated;
  }

  async incrementMappingProfileUsage(id: number): Promise<void> {
    await db.execute(
      sql`UPDATE column_mapping_profiles SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    );
  }

  async findMatchingMappingProfile(evidenceType: string, sourceColumns: string[]): Promise<ColumnMappingProfile | undefined> {
    // Get all profiles for this evidence type ordered by usage
    const profiles = await db.select().from(columnMappingProfiles)
      .where(eq(columnMappingProfiles.evidenceType, evidenceType))
      .orderBy(desc(columnMappingProfiles.usageCount));
    
    // Calculate signature for input columns (sorted, lowercased, normalized)
    const normalizeColumn = (col: string) => col.toLowerCase().replace(/[\s_-]/g, "");
    const inputSignature = new Set(sourceColumns.map(normalizeColumn));
    
    // Find best matching profile
    for (const profile of profiles) {
      const profileMappings = profile.columnMappings as Record<string, string>;
      const profileColumns = Object.keys(profileMappings);
      const profileSignature = new Set(profileColumns.map(normalizeColumn));
      
      // Check if input has all the columns in the profile (profile is subset of input)
      let allFound = true;
      for (const col of Array.from(profileSignature)) {
        if (!inputSignature.has(col)) {
          allFound = false;
          break;
        }
      }
      
      // If all profile columns exist in input, this is a match
      if (allFound && profileColumns.length > 0) {
        return profile;
      }
    }
    
    return undefined;
  }

  async deleteColumnMappingProfile(id: number): Promise<boolean> {
    const result = await db.delete(columnMappingProfiles)
      .where(eq(columnMappingProfiles.id, id))
      .returning();
    return result.length > 0;
  }

  async getTemplateRequirements(templateId: string): Promise<string[]> {
    const slots = await db.select({
      requiredEvidenceTypes: slotDefinitions.requiredEvidenceTypes
    })
    .from(slotDefinitions)
    .where(eq(slotDefinitions.templateId, templateId));

    const types = new Set<string>();
    for (const slot of slots) {
      if (Array.isArray(slot.requiredEvidenceTypes)) {
        for (const t of slot.requiredEvidenceTypes) {
          types.add(t);
        }
      }
    }
    return Array.from(types);
  }

  async getQualificationReport(psurCaseId: number): Promise<QualificationReport | undefined> {
    const [report] = await db.select()
      .from(qualificationReports)
      .where(eq(qualificationReports.psurCaseId, psurCaseId))
      .orderBy(desc(qualificationReports.validatedAt))
      .limit(1);
    return report;
  }

  async getQualificationReportByTemplate(templateId: string): Promise<QualificationReport | undefined> {
    const [report] = await db.select()
      .from(qualificationReports)
      .where(eq(qualificationReports.templateId, templateId))
      .orderBy(desc(qualificationReports.validatedAt))
      .limit(1);
    return report;
  }
}

export const storage = new DatabaseStorage();
