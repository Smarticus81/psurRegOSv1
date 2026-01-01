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
  users,
  companies,
  devices,
  psurItems,
  dataSources,
  agentExecutions,
  auditEvents,
  generatedDocuments,
  grkbEntries,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
