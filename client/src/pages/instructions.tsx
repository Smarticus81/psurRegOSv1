import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  FileSpreadsheet,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  Download,
  ShoppingCart,
  MessageSquareWarning,
  Siren,
  Shield,
  BookMarked,
  Microscope,
  TrendingUp,
  Activity,
  FileText,
  Database,
  Stethoscope,
  ClipboardCheck,
  Scale,
  Users,
  Search,
  Globe,
  FileWarning,
  ArrowRight,
} from "lucide-react";
// Remove CANONICAL_EVIDENCE_TYPES import as we are using string literals
import { EVIDENCE_DEFINITIONS } from "@shared/schema";

interface ColumnSpec {
  name: string;
  required: boolean;
  dataType: string;
  description: string;
  example: string;
}

interface EvidenceTypeExample {
  type: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  columns: ColumnSpec[];
  sampleRows: Record<string, string>[];
  tips: string[];
  commonErrors: string[];
}

// Helper to generate generic examples
const createGenericExample = (type: string, label: string, icon: any, desc: string, kind: "summary" | "log" | "extract"): EvidenceTypeExample => {
  const columns = kind === "summary" ? [
      { name: "summary", required: true, dataType: "Text", description: "Summary content or high-level description", example: "Annual analysis shows stable performance." },
      { name: "period_start", required: true, dataType: "Date", description: "Start of data period", example: "2024-01-01" },
      { name: "period_end", required: true, dataType: "Date", description: "End of data period", example: "2024-12-31" },
      { name: "conclusion", required: false, dataType: "Text", description: "Conclusion or assessment status", example: "Acceptable - No action required" },
      { name: "device_code", required: false, dataType: "Text", description: "Device identifier", example: "CM-PRO-001" },
  ] : kind === "log" ? [
      { name: "id", required: true, dataType: "Text", description: "Record ID or Reference", example: "LOG-2024-001" },
      { name: "date", required: true, dataType: "Date", description: "Date of entry", example: "2024-06-15" },
      { name: "description", required: true, dataType: "Text", description: "Details of the event or change", example: "Updated IFU to version 2.0" },
      { name: "status", required: false, dataType: "Text", description: "Current status", example: "Completed" },
      { name: "device_code", required: false, dataType: "Text", description: "Device identifier", example: "CM-PRO-001" },
  ] : [ // extract
      { name: "source_document", required: true, dataType: "Text", description: "Name of source document", example: "CER v1.0" },
      { name: "section_reference", required: true, dataType: "Text", description: "Section number/ID", example: "Section 4.2" },
      { name: "content", required: true, dataType: "Text", description: "Extracted text content", example: "The device performs as intended with no new risks." },
      { name: "extraction_date", required: true, dataType: "Date", description: "Date extracted", example: "2024-12-01" },
      { name: "device_code", required: false, dataType: "Text", description: "Device identifier", example: "CM-PRO-001" },
  ];

  const sampleRows = kind === "summary" ? [
      { summary: "Annual analysis shows stable performance.", period_start: "2024-01-01", period_end: "2024-12-31", conclusion: "Acceptable", device_code: "CM-PRO-001" }
  ] : kind === "log" ? [
      { id: "LOG-2024-001", date: "2024-06-15", description: "Updated IFU to version 2.0", status: "Completed", device_code: "CM-PRO-001" }
  ] : [
      { source_document: "CER v1.0", section_reference: "4.2", content: "The device performs as intended.", extraction_date: "2024-12-01", device_code: "CM-PRO-001" }
  ];

  return {
      type, label, icon, description: desc, columns, sampleRows,
      tips: ["Ensure dates are ISO format (YYYY-MM-DD)", "Include device_code if specific to one device"],
      commonErrors: ["Missing required fields", "Date format errors"]
  };
};

const EVIDENCE_EXAMPLES: EvidenceTypeExample[] = [
  // --- SALES & USAGE ---
  {
    type: "sales_volume",
    label: "Sales Volume",
    icon: ShoppingCart,
    description: "Unit sales and distribution data showing how many devices were sold during the reporting period.",
    columns: [
      { name: "device_code", required: true, dataType: "Text", description: "Unique identifier for the device model", example: "CM-PRO-001" },
      { name: "product_name", required: false, dataType: "Text", description: "Human-readable product name", example: "CardioMonitor Pro" },
      { name: "quantity", required: true, dataType: "Integer", description: "Number of units sold", example: "1250" },
      { name: "region", required: false, dataType: "Text", description: "Geographic region", example: "EU" },
      { name: "country", required: false, dataType: "Text", description: "ISO 3166-1 alpha-2 country code", example: "DE" },
      { name: "sale_date", required: false, dataType: "Date", description: "Date of sale (YYYY-MM-DD)", example: "2024-06-15" },
      { name: "period_start", required: true, dataType: "Date", description: "Start of reporting period", example: "2024-01-01" },
      { name: "period_end", required: true, dataType: "Date", description: "End of reporting period", example: "2024-12-31" },
    ],
    sampleRows: [
      { device_code: "CM-PRO-001", product_name: "CardioMonitor Pro", quantity: "1250", region: "EU", country: "DE", sale_date: "2024-03-15", period_start: "2024-01-01", period_end: "2024-12-31" },
    ],
    tips: ["Ensure device_code matches exactly", "Quantity must be a positive number"],
    commonErrors: ["Missing device_code", "Invalid quantity"]
  },
  createGenericExample("sales_summary", "Sales Summary", ShoppingCart, "High-level summary of sales performance.", "summary"),
  createGenericExample("distribution_summary", "Distribution Summary", ShoppingCart, "Summary of device distribution logistics.", "summary"),
  createGenericExample("usage_estimate", "Usage Estimate", Users, "Estimates of patient usage/exposure based on sales.", "summary"),
  createGenericExample("sales_by_region", "Sales by Region", Globe, "Breakdown of sales by geographic region.", "summary"),
  createGenericExample("uk_population_characteristics", "UK Population Characteristics", Users, "Demographics of UK patient population.", "summary"),

  // --- COMPLAINTS ---
  {
    type: "complaint_record",
    label: "Complaint Records",
    icon: MessageSquareWarning,
    description: "Customer complaints and product issues reported during the surveillance period.",
    columns: [
      { name: "complaint_id", required: true, dataType: "Text", description: "Unique complaint reference", example: "CMP-001" },
      { name: "device_code", required: true, dataType: "Text", description: "Device identifier", example: "CM-PRO-001" },
      { name: "complaint_date", required: true, dataType: "Date", description: "Date received", example: "2024-05-12" },
      { name: "description", required: true, dataType: "Text", description: "Issue description", example: "Display flickering" },
      { name: "severity", required: false, dataType: "Text", description: "low, medium, high", example: "medium" },
      { name: "device_related", required: false, dataType: "Boolean", description: "TRUE/FALSE", example: "TRUE" },
      { name: "country", required: false, dataType: "Text", description: "Country code", example: "DE" },
    ],
    sampleRows: [
      { complaint_id: "CMP-001", device_code: "CM-PRO-001", complaint_date: "2024-05-12", description: "Display flickering", severity: "medium", device_related: "TRUE", country: "DE" },
    ],
    tips: ["Use consistent severity levels", "Include non-device-related complaints if logged"],
    commonErrors: ["Duplicate complaint_id", "Missing description"]
  },
  createGenericExample("complaint_summary", "Complaint Summary", MessageSquareWarning, "Narrative summary of complaint trends.", "summary"),
  createGenericExample("complaints_by_region", "Complaints by Region", Globe, "Aggregated complaints by geography.", "summary"),
  createGenericExample("complaints_by_type", "Complaints by Type", Activity, "Aggregated complaints by failure mode.", "summary"),
  createGenericExample("customer_feedback_summary", "Customer Feedback", Users, "General feedback summary (non-complaint).", "summary"),

  // --- INCIDENTS & VIGILANCE ---
  {
    type: "serious_incident_record",
    label: "Serious Incidents",
    icon: Siren,
    description: "Reportable serious incidents including deaths or serious injuries.",
    columns: [
      { name: "incident_id", required: true, dataType: "Text", description: "Vigilance reference", example: "VI-001" },
      { name: "device_code", required: true, dataType: "Text", description: "Device identifier", example: "CM-PRO-001" },
      { name: "incident_date", required: true, dataType: "Date", description: "Date occurred", example: "2024-04-15" },
      { name: "description", required: true, dataType: "Text", description: "Incident details", example: "Alarm failed" },
      { name: "patient_outcome", required: false, dataType: "Text", description: "death, injury, etc.", example: "injury" },
      { name: "reported_to", required: false, dataType: "Text", description: "Authority reported to", example: "BfArM" },
      { name: "serious", required: false, dataType: "Boolean", description: "TRUE", example: "TRUE" },
    ],
    sampleRows: [
      { incident_id: "VI-001", device_code: "CM-PRO-001", incident_date: "2024-04-15", description: "Alarm failed", patient_outcome: "injury", reported_to: "BfArM", serious: "TRUE" },
    ],
    tips: ["Include all vigilance reports", "Ensure IDs match authority records"],
    commonErrors: ["Missing incident_id", "Missing description"]
  },
  createGenericExample("serious_incident_summary", "Incident Summary", Siren, "Overview of serious incidents.", "summary"),
  createGenericExample("vigilance_report", "Vigilance Report", Siren, "Summary of vigilance reporting activities.", "summary"),
  createGenericExample("serious_incident_records_imdrf", "IMDRF Incidents", Siren, "Incidents coded with IMDRF terms.", "log"),

  // --- FSCA ---
  {
    type: "fsca_record",
    label: "FSCA Records",
    icon: Shield,
    description: "Field Safety Corrective Actions (recalls, safety notices).",
    columns: [
      { name: "fsca_id", required: true, dataType: "Text", description: "FSCA reference", example: "FSCA-001" },
      { name: "device_code", required: true, dataType: "Text", description: "Device identifier", example: "CM-PRO-001" },
      { name: "action_type", required: true, dataType: "Text", description: "recall, notice", example: "notice" },
      { name: "initiation_date", required: true, dataType: "Date", description: "Date started", example: "2024-03-01" },
      { name: "description", required: true, dataType: "Text", description: "Details", example: "Software update" },
      { name: "status", required: false, dataType: "Text", description: "open, closed", example: "closed" },
    ],
    sampleRows: [
      { fsca_id: "FSCA-001", device_code: "CM-PRO-001", action_type: "notice", initiation_date: "2024-03-01", description: "Software update", status: "closed" },
    ],
    tips: ["Include all actions in period"],
    commonErrors: ["Missing action_type"]
  },
  createGenericExample("fsca_summary", "FSCA Summary", Shield, "Narrative of FSCA activities.", "summary"),
  createGenericExample("recall_record", "Recall Records", Shield, "Specific recall events.", "log"),

  // --- CAPA ---
  {
    type: "capa_record",
    label: "CAPA Records",
    icon: ClipboardCheck,
    description: "Corrective and Preventive Actions linked to device safety.",
    columns: [
      { name: "capa_id", required: true, dataType: "Text", description: "CAPA reference", example: "CAPA-001" },
      { name: "description", required: true, dataType: "Text", description: "Issue description", example: "Process deviation" },
      { name: "initiation_date", required: false, dataType: "Date", description: "Date opened", example: "2024-02-10" },
      { name: "status", required: false, dataType: "Text", description: "open, closed", example: "open" },
      { name: "effectiveness", required: false, dataType: "Text", description: "Verification result", example: "Effective" },
    ],
    sampleRows: [
      { capa_id: "CAPA-001", description: "Process deviation in packaging", initiation_date: "2024-02-10", status: "closed", effectiveness: "Effective" },
    ],
    tips: ["Include CAPAs related to product quality/safety"],
    commonErrors: ["Missing capa_id"]
  },
  createGenericExample("capa_summary", "CAPA Summary", ClipboardCheck, "Overview of CAPA system performance.", "summary"),
  createGenericExample("ncr_record", "NCR Records", ClipboardCheck, "Non-Conformance Reports.", "log"),

  // --- PMCF ---
  {
    type: "pmcf_result",
    label: "PMCF Study Data",
    icon: Microscope,
    description: "Post-Market Clinical Follow-up study results.",
    columns: [
      { name: "study_id", required: true, dataType: "Text", description: "Study ID", example: "PMCF-001" },
      { name: "study_name", required: true, dataType: "Text", description: "Study Title", example: "Long-term registry" },
      { name: "status", required: false, dataType: "Text", description: "ongoing, completed", example: "ongoing" },
      { name: "enrolled_subjects", required: false, dataType: "Integer", description: "Count", example: "100" },
      { name: "findings", required: false, dataType: "Text", description: "Summary results", example: "No safety signals" },
    ],
    sampleRows: [
      { study_id: "PMCF-001", study_name: "Long-term registry", status: "ongoing", enrolled_subjects: "100", findings: "No safety signals" },
    ],
    tips: ["Update findings even for ongoing studies"],
    commonErrors: ["Missing study_id"]
  },
  createGenericExample("pmcf_summary", "PMCF Summary", Microscope, "Overall PMCF conclusion.", "summary"),
  createGenericExample("pmcf_report_extract", "PMCF Report Extract", Microscope, "Excerpt from PMCF evaluation report.", "extract"),
  createGenericExample("pmcf_activity_record", "PMCF Activity Log", Microscope, "Log of PMCF activities.", "log"),

  // --- LITERATURE ---
  {
    type: "literature_result",
    label: "Literature Search Results",
    icon: BookMarked,
    description: "Individual publication references from literature review.",
    columns: [
      { name: "reference_id", required: true, dataType: "Text", description: "DOI/PMID", example: "PMID-123" },
      { name: "title", required: true, dataType: "Text", description: "Article title", example: "Safety study" },
      { name: "relevance", required: false, dataType: "Text", description: "Relevance note", example: "High" },
      { name: "safety_signal", required: false, dataType: "Text", description: "Identified signals", example: "None" },
    ],
    sampleRows: [
      { reference_id: "PMID-123", title: "Safety study of device X", relevance: "High", safety_signal: "None" },
    ],
    tips: ["Include systematic review hits"],
    commonErrors: ["Missing ID"]
  },
  createGenericExample("literature_review_summary", "Literature Review Summary", BookMarked, "Conclusion of literature review.", "summary"),
  createGenericExample("literature_search_strategy", "Search Strategy", Search, "Databases and terms used.", "extract"),

  // --- TRENDS & SIGNALS ---
  createGenericExample("trend_analysis", "Trend Analysis", TrendingUp, "Analysis of safety/performance trends.", "summary"),
  createGenericExample("trend_metrics", "Trend Metrics", TrendingUp, "Key performance indicators.", "log"),
  createGenericExample("signal_log", "Signal Log", Activity, "Register of safety signals detected.", "log"),

  // --- REGULATORY & DEVICE ---
  createGenericExample("manufacturer_profile", "Manufacturer Profile", Database, "Manufacturer details.", "extract"),
  createGenericExample("device_registry_record", "Registry Record", Database, "Device registration status.", "extract"),
  createGenericExample("regulatory_certificate_record", "Certificates", Scale, "CE/UKCA certificate details.", "extract"),
  createGenericExample("ifu_extract", "IFU Extract", FileText, "Key warnings/contraindications from IFU.", "extract"),
  createGenericExample("change_control_record", "Change Control", ClipboardCheck, "Design/Process changes.", "log"),
  createGenericExample("labeling_change_log", "Labeling Changes", FileText, "Updates to label/IFU.", "log"),
  createGenericExample("device_lifetime_record", "Device Lifetime", Activity, "Shelf-life/service-life data.", "extract"),
  createGenericExample("data_source_register", "Data Sources", Database, "List of data sources used.", "log"),

  // --- RISK & CLINICAL ---
  createGenericExample("benefit_risk_assessment", "Benefit-Risk Assessment", Scale, "Latest benefit-risk conclusion.", "summary"),
  createGenericExample("cer_extract", "CER Extract", Stethoscope, "Clinical Evaluation Report excerpt.", "extract"),
  createGenericExample("clinical_evaluation_extract", "Clinical Eval Extract", Stethoscope, "Clinical data summary.", "extract"),
  createGenericExample("rmf_extract", "Risk Mgmt Extract", FileWarning, "Risk management file excerpt.", "extract"),
  createGenericExample("rmf_change_log", "Risk File Changes", FileWarning, "Updates to risk analysis.", "log"),
  createGenericExample("cer_change_log", "CER Changes", Stethoscope, "Updates to clinical evaluation.", "log"),

  // --- OTHER ---
  createGenericExample("external_db_summary", "External DB Summary", Globe, "MAUDE/EUDAMED search summary.", "summary"),
  createGenericExample("external_db_query_log", "DB Search Log", Search, "Log of database queries.", "log"),
  createGenericExample("previous_psur_extract", "Previous PSUR", FileText, "Data from last period.", "extract"),
  createGenericExample("previous_psur_actions", "Previous Actions", ClipboardCheck, "Status of previous actions.", "log"),
  createGenericExample("pms_plan_extract", "PMS Plan Extract", FileText, "PMS Plan goals/methods.", "extract"),
  createGenericExample("pms_activity_log", "PMS Activities", Activity, "Executed PMS activities.", "log"),
  createGenericExample("notified_body_review_record", "NB Review", Scale, "Feedback from Notified Body.", "extract"),
];

export default function Instructions() {
  const [activeTab, setActiveTab] = useState("overview");

  const generateCSVContent = (example: EvidenceTypeExample): string => {
    const headers = example.columns.map(c => c.name).join(",");
    const rows = example.sampleRows.map(row => 
      example.columns.map(c => {
        const value = row[c.name] || "";
        return value.includes(",") ? `"${value}"` : value;
      }).join(",")
    );
    return [headers, ...rows].join("\n");
  };


  return (
    <div className="h-full overflow-auto animate-slide-up" data-testid="instructions-page">
      <div className="max-w-5xl mx-auto space-y-12 py-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Data Guide
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Learn how to prepare your surveillance data files for PSUR generation.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="flex justify-center">
            <TabsList className="bg-secondary/50 p-1 rounded-xl border border-border">
              <TabsTrigger value="overview" className="rounded-lg px-6 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm font-medium text-sm transition-all">Getting Started</TabsTrigger>
              <TabsTrigger value="evidence-types" className="rounded-lg px-6 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm font-medium text-sm transition-all">Data Categories</TabsTrigger>
              <TabsTrigger value="troubleshooting" className="rounded-lg px-6 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm font-medium text-sm transition-all">Troubleshooting</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-8 mt-0 focus-visible:outline-none">
            <div className="glass-card p-10 space-y-10">
              <div className="space-y-2">
                <h3 className="text-2xl font-bold tracking-tight text-foreground">How to Prepare Your Data</h3>
                <p className="text-muted-foreground">Follow these steps to prepare your surveillance data for PSUR generation.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {[
                  { step: "01", title: "Export Your Data", desc: "Export data from your quality management system (QMS) into CSV or Excel format. Include all required columns with proper headers." },
                  { step: "02", title: "Create Report Draft", desc: "Start a new PSUR report. Select your device, regulatory template (EU MDR / UK MDR), and define the reporting period." },
                  { step: "03", title: "Upload Data Files", desc: "Upload your prepared files. The system will automatically recognize columns and map them to the appropriate data categories." },
                  { step: "04", title: "Verify Coverage", desc: "Review the data completeness checklist. Ensure all required categories are covered before generating the document." }
                ].map((s, i) => (
                  <div key={i} className="flex gap-6 group hover:-translate-y-1 transition-transform duration-500">
                    <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center text-xl font-bold text-primary/40 shadow-inner group-hover:bg-primary group-hover:text-white transition-all duration-500">{s.step}</div>
                    <div className="space-y-2">
                      <h4 className="text-lg font-semibold text-foreground">{s.title}</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass-card p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shadow-sm"><FileSpreadsheet className="h-5 w-5" /></div>
                  <h3 className="text-lg font-semibold text-foreground">Supported File Formats</h3>
                </div>
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-white/50 border border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">CSV Files</span>
                      <span className="ios-pill bg-emerald-500 text-white text-[9px] font-bold border-none">RECOMMENDED</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">Use UTF-8 encoding. First row should be column headers. Wrap text with commas in quotes.</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-white/50 border border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">Excel Files (.xlsx)</span>
                      <span className="ios-pill bg-blue-500 text-white text-[9px] font-bold border-none">SUPPORTED</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">Data is read from the first sheet. Column headers should be in the first row.</p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-8 space-y-6 bg-amber-500/[0.02] border-amber-500/20 shadow-amber-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shadow-sm"><AlertTriangle className="h-5 w-5" /></div>
                  <h3 className="text-lg font-semibold text-foreground">Important Notes</h3>
                </div>
                <ul className="space-y-4">
                  {[
                    { t: "Device Codes", d: "Device codes in your data must match exactly with your registered device code." },
                    { t: "Date Format", d: "Use ISO format for dates: YYYY-MM-DD (e.g., 2024-06-15). Other formats may not be recognized." },
                    { t: "Empty Rows", d: "Empty rows and placeholder values (N/A, null, -) are automatically skipped during processing." }
                  ].map((note, i) => (
                    <li key={i} className="flex gap-4">
                      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-amber-700">{note.t}</div>
                        <p className="text-xs text-amber-900/70 leading-relaxed">{note.d}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="evidence-types" className="mt-0 focus-visible:outline-none">
            <div className="glass-card p-10 space-y-10">
              <div className="space-y-2 text-center">
                <h3 className="text-2xl font-bold text-foreground">Data Categories Reference</h3>
                <p className="text-muted-foreground">Detailed specifications for each type of surveillance data.</p>
              </div>
              
              <Accordion type="single" collapsible className="w-full space-y-4">
                {EVIDENCE_EXAMPLES.map((example) => (
                  <AccordionItem key={example.type} value={example.type} className="border-none">
                    <AccordionTrigger className="glass-card px-8 py-6 hover:no-underline hover:bg-white transition-all group data-[state=open]:bg-white border border-border/50">
                      <div className="flex items-center gap-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary group-hover:bg-primary group-hover:text-white transition-all duration-500 shadow-sm">
                          <example.icon className="h-6 w-6" />
                        </div>
                        <div className="text-left space-y-1">
                          <div className="text-xl font-black tracking-tight text-foreground">{example.label}</div>
                          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{example.type}</div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="glass-card mt-2 p-10 bg-white/40 border border-primary/10 shadow-inner">
                      <div className="space-y-10">
                        <p className="text-lg text-muted-foreground font-medium italic leading-relaxed">"{example.description}"</p>
                        
                        <div className="space-y-6">
                          <h4 className="text-sm font-black uppercase tracking-[0.2em] text-foreground flex items-center gap-3">
                            <Info className="h-4 w-4 text-primary" />
                            Required Columns
                          </h4>
                          <div className="rounded-3xl border border-border/50 overflow-hidden bg-white shadow-xl">
                            <Table>
                              <TableHeader className="bg-secondary/50">
                                <TableRow>
                                  <TableHead className="text-[10px] font-black uppercase tracking-widest px-6 py-4">Attribute</TableHead>
                                  <TableHead className="text-[10px] font-black uppercase tracking-widest px-6 py-4 text-center">Protocol</TableHead>
                                  <TableHead className="text-[10px] font-black uppercase tracking-widest px-6 py-4">Definition</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {example.columns.map((col) => (
                                  <TableRow key={col.name} className="hover:bg-primary/[0.02] transition-colors">
                                    <TableCell className="px-6 py-4 font-black text-sm text-foreground">{col.name}</TableCell>
                                    <TableCell className="px-6 py-4 text-center">
                                      {col.required ? (
                                        <span className="ios-pill bg-destructive text-white text-[8px] font-black border-none px-3 py-1">MANDATORY</span>
                                      ) : (
                                        <span className="ios-pill bg-muted text-muted-foreground text-[8px] font-black border-none px-3 py-1">OPTIONAL</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-xs text-muted-foreground font-medium leading-relaxed">{col.description}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <h4 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-3">
                              <CheckCircle2 className="h-4 w-4" />
                              Optimization Tips
                            </h4>
                            <div className="p-6 rounded-3xl bg-emerald-500/[0.03] border border-emerald-500/10 space-y-3">
                              {example.tips.map((tip, i) => (
                                <div key={i} className="flex gap-3 text-xs text-emerald-900/70 font-medium">
                                  <div className="mt-1.5 w-1 h-1 rounded-full bg-emerald-500 flex-shrink-0" />
                                  {tip}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-4">
                            <h4 className="text-sm font-black uppercase tracking-[0.2em] text-destructive flex items-center gap-3">
                              <AlertCircle className="h-4 w-4" />
                              Critical Bypass Triggers
                            </h4>
                            <div className="p-6 rounded-3xl bg-destructive/[0.03] border border-destructive/10 space-y-3">
                              {example.commonErrors.map((error, i) => (
                                <div key={i} className="flex gap-3 text-xs text-destructive/70 font-medium">
                                  <div className="mt-1.5 w-1 h-1 rounded-full bg-destructive flex-shrink-0" />
                                  {error}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </TabsContent>

          <TabsContent value="troubleshooting" className="mt-0 focus-visible:outline-none">
            <div className="glass-card p-10 space-y-10 shadow-2xl animate-slide-up">
              <div className="space-y-2 text-center">
                <h3 className="text-2xl font-bold text-foreground">Common Issues</h3>
                <p className="text-muted-foreground">Solutions for common data import problems.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { q: "No Records Found", a: "Check that your file has data rows below the header row. Make sure the file is saved as UTF-8 encoded CSV or XLSX." },
                  { q: "Device Code Not Recognized", a: "The device code in your file must match exactly with your registered device. Use the column mapping tool to rename columns if needed." },
                  { q: "Date Format Error", a: "Dates must be in YYYY-MM-DD format (e.g., 2024-06-15). In Excel, format date cells as Custom: YYYY-MM-DD before exporting." },
                  { q: "Duplicate Records Skipped", a: "The system automatically removes duplicate records based on unique identifiers to prevent double-counting in your report." }
                ].map((item, i) => (
                  <div key={i} className="glass-card p-8 bg-white/50 border border-border/50 hover:border-primary/30 transition-all space-y-4 group">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{item.q}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>

              <div className="p-6 rounded-xl bg-primary/5 border border-primary/10">
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-foreground">Need Help?</div>
                  <p className="text-sm text-muted-foreground">If you're having trouble with data import or have questions about PSUR requirements, contact your regulatory affairs team or system administrator.</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
