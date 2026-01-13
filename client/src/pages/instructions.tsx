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

  const downloadSampleCSV = (example: EvidenceTypeExample) => {
    const content = generateCSVContent(example);
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sample_${example.type}.csv`;
    link.click();
  };

  return (
    <div className="h-full overflow-auto" data-testid="instructions-page">
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Evidence Upload Instructions
            </h1>
            <p className="text-sm text-muted-foreground">
              Complete guide for preparing and uploading evidence files
            </p>
          </div>
          <a
            href="/api/samples/download-all"
            className="flex items-center gap-2 px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            download
          >
            <Download className="h-4 w-4" />
            Download All Samples (.zip)
          </a>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="evidence-types">Evidence Types</TabsTrigger>
            <TabsTrigger value="troubleshooting">Troubleshooting</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Getting Started</CardTitle>
                <CardDescription className="text-xs">
                  How to prepare and upload evidence for your PSUR
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-4">
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">1</div>
                    <div>
                      <h4 className="font-medium text-sm">Prepare Your Data</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Export data from your quality management system, ERP, or other sources into CSV or Excel format. 
                        Each evidence type has specific required columns - see the Evidence Types tab for details.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">2</div>
                    <div>
                      <h4 className="font-medium text-sm">Create a PSUR Case</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        In the PSUR Wizard, create a new case by selecting your template (EU MDR Annex I or UK MDR), 
                        device, and reporting period. The system will create a case reference for you.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">3</div>
                    <div>
                      <h4 className="font-medium text-sm">Upload Evidence Files</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        In Step 2, upload your evidence files one at a time. Select the correct evidence type 
                        from the dropdown before uploading. The system will validate and parse your data automatically.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">4</div>
                    <div>
                      <h4 className="font-medium text-sm">Complete Required Evidence</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        The wizard shows which evidence types are required for your template. You must upload 
                        at least one file for each required type before proceeding to report generation.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Supported File Formats</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">CSV</Badge>
                      <span className="text-sm font-medium">Comma-Separated Values</span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>UTF-8 encoding recommended</li>
                      <li>First row must be column headers</li>
                      <li>Use quotes for values containing commas</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">XLSX</Badge>
                      <span className="text-sm font-medium">Excel Workbook</span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>First sheet is used by default</li>
                      <li>First row must be column headers</li>
                      <li>Date columns should be formatted as dates</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-300">Important Notes</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="font-bold">1.</span>
                    <span><strong>Device Code Matching:</strong> The device_code in your data must exactly match the device code registered in the Admin panel.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold">2.</span>
                    <span><strong>Date Format:</strong> All dates should be in ISO format (YYYY-MM-DD). Other formats may cause parsing errors.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold">3.</span>
                    <span><strong>Empty Rows:</strong> Rows with all empty values or only placeholder text (N/A, null, etc.) will be skipped.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold">4.</span>
                    <span><strong>File Size:</strong> Maximum file size is 10MB. For larger datasets, split into multiple files.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evidence-types" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Evidence Types Reference (EU MDR & UK MDR)</CardTitle>
                <CardDescription className="text-xs">
                  Click each type to see column specifications and sample data. 
                  <br/>
                  Types marked as <strong>summary</strong> or <strong>extract</strong> can be uploaded as simple CSVs with "summary" or "content" columns.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <Accordion type="single" collapsible className="w-full">
                  {EVIDENCE_EXAMPLES.map((example) => (
                    <AccordionItem key={example.type} value={example.type}>
                      <AccordionTrigger className="text-sm hover:no-underline">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                            <example.icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="text-left">
                            <div className="font-medium">{example.label}</div>
                            <div className="text-xs text-muted-foreground font-normal">{example.type}</div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-2">
                          <p className="text-sm text-muted-foreground">{example.description}</p>
                          
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Info className="h-4 w-4" />
                              Column Specifications
                            </h4>
                            <ScrollArea className="w-full">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Column Name</TableHead>
                                    <TableHead className="text-xs">Required</TableHead>
                                    <TableHead className="text-xs">Data Type</TableHead>
                                    <TableHead className="text-xs">Description</TableHead>
                                    <TableHead className="text-xs">Example</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {example.columns.map((col) => (
                                    <TableRow key={col.name}>
                                      <TableCell className="text-xs font-mono">{col.name}</TableCell>
                                      <TableCell>
                                        {col.required ? (
                                          <Badge variant="destructive" className="text-xs">Required</Badge>
                                        ) : (
                                          <Badge variant="secondary" className="text-xs">Optional</Badge>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-xs">{col.dataType}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground max-w-48">{col.description}</TableCell>
                                      <TableCell className="text-xs font-mono text-muted-foreground">{col.example}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-medium flex items-center gap-2">
                                <FileSpreadsheet className="h-4 w-4" />
                                Sample Data
                              </h4>
                              <button
                                onClick={() => downloadSampleCSV(example)}
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <Download className="h-3 w-3" />
                                Download Sample CSV
                              </button>
                            </div>
                            <ScrollArea className="w-full">
                              <div className="rounded border bg-muted/30 p-2 overflow-x-auto">
                                <pre className="text-xs font-mono whitespace-pre">
                                  {generateCSVContent(example)}
                                </pre>
                              </div>
                            </ScrollArea>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-4 w-4" />
                                Tips
                              </h4>
                              <ul className="text-xs text-muted-foreground space-y-1">
                                {example.tips.map((tip, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-green-600 dark:text-green-400">-</span>
                                    {tip}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-red-600 dark:text-red-400">
                                <AlertTriangle className="h-4 w-4" />
                                Common Errors
                              </h4>
                              <ul className="text-xs text-muted-foreground space-y-1">
                                {example.commonErrors.map((error, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-red-600 dark:text-red-400">-</span>
                                    {error}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="troubleshooting" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Common Issues and Solutions</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="no-records">
                    <AccordionTrigger className="text-sm">
                      "No data records found in file"
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-muted-foreground space-y-2">
                      <p>This error occurs when the file contains only headers or empty rows.</p>
                      <p><strong>Solutions:</strong></p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Verify your file has actual data rows below the header row</li>
                        <li>Check that data rows don't contain only placeholder values like "N/A" or "null"</li>
                        <li>Ensure the file encoding is UTF-8</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="missing-device-code">
                    <AccordionTrigger className="text-sm">
                      "Missing required field: deviceCode"
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-muted-foreground space-y-2">
                      <p>The device code column is required for most evidence types.</p>
                      <p><strong>Solutions:</strong></p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Add a column named "device_code" to your file</li>
                        <li>Or, if your file has the device code in a differently-named column, rename it to "device_code"</li>
                        <li>Alternatively, select a device in the upload form - this will be used as the default device code</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="unsupported-type">
                    <AccordionTrigger className="text-sm">
                      "Unsupported evidence type"
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-muted-foreground space-y-2">
                      <p>The selected evidence type is not recognized by the system.</p>
                      <p><strong>Solutions:</strong></p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Use the dropdown to select one of the supported evidence types</li>
                        <li>Supported types: sales_volume, complaint_record, serious_incident_record, fsca_record, pmcf_result, literature_result</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="date-format">
                    <AccordionTrigger className="text-sm">
                      "Invalid date format"
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-muted-foreground space-y-2">
                      <p>Date columns must be in ISO format.</p>
                      <p><strong>Solutions:</strong></p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Use YYYY-MM-DD format (e.g., 2024-06-15)</li>
                        <li>If using Excel, format the column as "YYYY-MM-DD" custom format</li>
                        <li>Avoid formats like MM/DD/YYYY or DD-MM-YYYY</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="atoms-not-created">
                    <AccordionTrigger className="text-sm">
                      Upload succeeds but "atomsCreated: 0"
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-muted-foreground space-y-2">
                      <p>Records were parsed but not saved to the database.</p>
                      <p><strong>Solutions:</strong></p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Check if you're re-uploading duplicate data - atoms with the same ID for the same case are skipped</li>
                        <li>Verify that required fields have valid values</li>
                        <li>Check the server logs for specific validation errors</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="step3-blocked">
                    <AccordionTrigger className="text-sm">
                      Cannot proceed to Step 3 (Generate PSUR)
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-muted-foreground space-y-2">
                      <p>Step 3 requires all mandatory evidence types to have at least one atom.</p>
                      <p><strong>Solutions:</strong></p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Check the "Required Evidence" section - any showing "0" must have data uploaded</li>
                        <li>For the EU MDR Annex I template, you need: sales_volume, complaint_record, serious_incident_record, fsca_record, pmcf_result, literature_result</li>
                        <li>Upload files with real data (not just headers or placeholder rows)</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">Need More Help?</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  If you continue to experience issues, check the browser console (F12) and server logs for detailed error messages.
                  Ensure your CSV files are properly formatted and contain valid data in all required columns.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
