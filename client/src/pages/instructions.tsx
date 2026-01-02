import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Upload,
  Cpu,
  CheckCircle2,
  Database,
  BookOpen,
  ArrowRight,
  Clock,
  AlertCircle,
  Lightbulb,
} from "lucide-react";

const steps = [
  {
    number: 1,
    title: "Prepare Your Device Data",
    icon: Database,
    description: "Before generating a PSUR, ensure your device information is registered in the system.",
    details: [
      "Navigate to the Dashboard to view your device families",
      "Verify device names, part numbers, and risk classifications are correct",
      "Check that Basic UDI-DI and GMDN codes are assigned if available",
    ],
    tip: "Device data should match your technical documentation exactly.",
  },
  {
    number: 2,
    title: "Upload Surveillance Data",
    icon: Upload,
    description: "Upload your post-market surveillance data files for the reporting period.",
    details: [
      "Go to Data Layer in the sidebar",
      "Click 'Upload Data' and select your data type (Sales, Complaints, or Adverse Events)",
      "Upload your CSV or Excel files containing the surveillance data",
      "The system will automatically map columns and validate the data",
    ],
    tip: "Upload separate files for sales data, customer complaints, and any adverse event reports.",
  },
  {
    number: 3,
    title: "Review Knowledge Base Requirements",
    icon: BookOpen,
    description: "Familiarize yourself with the regulatory requirements for your device class.",
    details: [
      "Navigate to Knowledge Base in the sidebar",
      "Filter by your applicable regulation (EU MDR, UK MDR, FDA, etc.)",
      "Review the PSUR section requirements for your device class",
      "Note any specific data presentation formats required",
    ],
    tip: "Class III devices require more detailed analysis than Class I or IIa devices.",
  },
  {
    number: 4,
    title: "Configure Agent Execution",
    icon: Cpu,
    description: "Set up the PSUR generation parameters using Quick Start or Manual mode.",
    details: [
      "Go to Agent Orchestration in the sidebar",
      "Quick Start: Enter your PMS Plan Number or Previous PSUR Number to auto-retrieve settings",
      "Manual: Select applicable jurisdictions, device, part numbers, and surveillance period",
      "You can select multiple jurisdictions if your device is sold in multiple markets",
    ],
    tip: "If you have a previous PSUR, use its number for Quick Start - it will carry over all device settings.",
  },
  {
    number: 5,
    title: "Start PSUR Generation",
    icon: Cpu,
    description: "Click Generate PSUR to start the AI-powered document creation process.",
    details: [
      "Review your configuration settings one final time",
      "Click the 'Generate PSUR' button to start the process",
      "Watch the workflow progress through all 13 MDCG 2022-21 sections",
      "The execution log shows real-time updates on each step",
    ],
    tip: "Generation typically takes 2-5 minutes depending on data volume.",
  },
  {
    number: 6,
    title: "Review Generated Document",
    icon: FileText,
    description: "Review the AI-generated PSUR and make any necessary adjustments.",
    details: [
      "Navigate to Documents in the sidebar when complete",
      "Open the newly generated PSUR document",
      "Review each section for accuracy and completeness",
      "Check that all data tables match your source data",
    ],
    tip: "Always verify the benefit-risk evaluation conclusion aligns with your clinical assessment.",
  },
  {
    number: 7,
    title: "Approve and Export",
    icon: CheckCircle2,
    description: "Finalize the document for submission to regulatory authorities.",
    details: [
      "Mark the document as 'Approved' after your review",
      "Download the final PSUR in PDF format",
      "The document is formatted for EUDAMED submission",
      "Keep a copy in your quality management system",
    ],
    tip: "Submit your PSUR before the due date shown in your PMS plan.",
  },
];

const frequentlyAskedQuestions = [
  {
    question: "How often do I need to generate a PSUR?",
    answer: "For EU MDR, Class III and implantable devices require annual PSURs. Class IIa and IIb devices require biennial reports. Class I devices typically only need a PSUR on request.",
  },
  {
    question: "What data do I need to upload?",
    answer: "You should upload: (1) Sales data by country/region for the reporting period, (2) Customer complaint records, (3) Any adverse event reports filed, and (4) CAPA documentation if applicable.",
  },
  {
    question: "Can I generate PSURs for multiple jurisdictions at once?",
    answer: "Yes! In Manual configuration mode, you can select multiple jurisdictions. The system will include requirements from all selected regulations in a combined report.",
  },
  {
    question: "What if my device has no incidents to report?",
    answer: "That's okay - the PSUR will document that no incidents occurred during the reporting period, which is valuable safety evidence. The benefit-risk evaluation will reflect this positive data.",
  },
  {
    question: "How long does document generation take?",
    answer: "Typically 2-5 minutes depending on the amount of data. The progress bar and execution log show real-time updates so you can track the process.",
  },
];

export default function Instructions() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">PSUR Generation Guide</h1>
          <p className="text-muted-foreground">
            Step-by-step instructions for generating MDCG 2022-21 compliant Periodic Safety Update Reports
          </p>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">Before You Begin</p>
              <p className="text-sm text-muted-foreground">
                Make sure you have your device technical file, sales data, and complaint records ready. 
                The PSUR generation process works best when all source data is uploaded first.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg font-medium">Step-by-Step Process</h2>
          
          {steps.map((step, index) => (
            <Card key={step.number}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    {step.number}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <step.icon className="h-4 w-4 text-muted-foreground" />
                      {step.title}
                    </CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {step.details.map((detail, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
                
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                  <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    <span className="font-medium">Tip:</span> {step.tip}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Separator />

        <div className="space-y-4">
          <h2 className="text-lg font-medium">Frequently Asked Questions</h2>
          
          <div className="space-y-3">
            {frequentlyAskedQuestions.map((faq, idx) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    {faq.question}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white">
              <Clock className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">PSUR Submission Deadlines</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                EU MDR requires PSURs to be submitted through EUDAMED. Make sure to submit at least 15 days before your regulatory deadline 
                to allow time for any necessary revisions. The system tracks due dates in your PSUR schedule on the Dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
