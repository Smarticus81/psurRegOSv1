import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  Search,
  FileText,
  Scale,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from "lucide-react";

const euMdrRequirements = {
  psur_requirements: {
    article: "Article 86 & MDCG 2022-21",
    title: "Periodic Safety Update Report (MDCG 2022-21 Compliant)",
    guidance_document: "MDCG 2022-21 - Guidance on PSUR according to Regulation (EU) 2017/745",
    effective_date: "December 2022",
    frequency: {
      class_i: "PMS Report only (not PSUR)",
      class_iia: "Every 2 years or upon request",
      class_iib: "Annually or upon request",
      class_iii: "Annually (12-month reporting period)",
      class_iii_implant: "Annually (12-month reporting period)",
    },
    required_sections: [
      { section: 1, title: "Executive Summary", description: "Overview of conclusions and key findings" },
      { section: 2, title: "Device Description", description: "Device characteristics, intended purpose, classification, Basic UDI-DI, EMDN codes" },
      { section: 3, title: "Data Collection Period", description: "Start/end dates aligned with MDR certification date" },
      { section: 4, title: "PMS Data Analysis", description: "Data summary with IMDRF AET coding, trend identification" },
      { section: 5, title: "Serious Incidents & FSCA", description: "Device problems, root causes, patient impact, Field Safety Corrective Actions" },
      { section: 6, title: "Non-Serious Incidents & Complaints", description: "Complaints grouped by IMDRF medical device problem codes" },
      { section: 7, title: "Sales Volume & Population Exposed", description: "Units sold vs. patient exposure estimates, demographics" },
      { section: 8, title: "CAPA Information", description: "Type, scope, status, root cause (IMDRF codes), effectiveness assessment" },
      { section: 9, title: "Literature & Similar Devices", description: "Relevant findings from specialist literature, comparative data" },
      { section: 10, title: "Benefit-Risk Evaluation", description: "Updated benefit-risk determination with change impact analysis" },
      { section: 11, title: "Conclusions", description: "Overall safety assessment, need for further actions" },
    ],
    device_grouping: {
      guidance: "MDCG 2022-21 Annex I",
      criteria: [
        "Same generic device group (GMDN)",
        "Same intended purpose",
        "Similar design and technical characteristics",
        "Same clinical effects and risk profile",
        "Lead device assigned to drive PSUR schedule",
      ],
    },
    data_presentation: {
      format: "Annex II Tables",
      coding: "IMDRF AET codes for adverse events and medical device problems",
      yearly_breakdown: "Historical data from previous reporting periods",
    },
    submission: {
      portal: "EUDAMED PSUR Web Form",
      access: "Available to Notified Bodies and Competent Authorities",
    },
  },
};

const ukMdrRequirements = {
  psur_requirements: {
    title: "UK PSUR Requirements",
    frequency: "Annual for Class IIb and III",
    submission: "MHRA portal",
    divergence_from_eu: [
      "Separate UKCA marking requirements",
      "Different submission portal (MHRA)",
      "UK Responsible Person required",
      "Post-Brexit specific requirements",
    ],
  },
};

const fdaRequirements = {
  periodic_reporting: {
    title: "Medical Device Reporting (MDR)",
    reference: "21 CFR 803",
    reportable_events: [
      "Death caused or contributed to by device",
      "Serious injury caused or contributed to by device",
      "Malfunction that could cause death or serious injury",
    ],
    timelines: {
      death_serious_injury: "30 calendar days",
      malfunction: "30 calendar days",
      five_day_report: "For public health urgent situations",
    },
  },
};

export default function GRKB() {
  const [selectedRegulation, setSelectedRegulation] = useState("EU_MDR");
  const [selectedCategory, setSelectedCategory] = useState("psur_requirements");
  const [searchQuery, setSearchQuery] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);

  const handleQuery = () => {
    let result;
    if (selectedRegulation === "EU_MDR") {
      result = euMdrRequirements[selectedCategory as keyof typeof euMdrRequirements];
    } else if (selectedRegulation === "UK_MDR") {
      result = ukMdrRequirements.psur_requirements;
    } else {
      result = fdaRequirements.periodic_reporting;
    }
    setQueryResult(result);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-3xl font-light tracking-tight">Knowledge Base</h1>
            <p className="text-muted-foreground/80 text-sm">
              Global Regulatory Knowledge Base (GRKB) - Structured regulatory intelligence
            </p>
          </div>
        </div>

        <Tabs defaultValue="query" className="space-y-6">
          <TabsList>
            <TabsTrigger value="query">Query GRKB</TabsTrigger>
            <TabsTrigger value="eu_mdr">EU MDR</TabsTrigger>
            <TabsTrigger value="uk_mdr">UK MDR</TabsTrigger>
            <TabsTrigger value="fda">FDA</TabsTrigger>
          </TabsList>

          <TabsContent value="query" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Query Regulatory Requirements</CardTitle>
                <CardDescription>
                  Search the structured knowledge base for specific regulatory requirements
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Regulation</label>
                    <Select value={selectedRegulation} onValueChange={setSelectedRegulation}>
                      <SelectTrigger data-testid="select-regulation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EU_MDR">EU MDR</SelectItem>
                        <SelectItem value="UK_MDR">UK MDR</SelectItem>
                        <SelectItem value="FDA">FDA 21 CFR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Requirement Type</label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="psur_requirements">PSUR Requirements</SelectItem>
                        <SelectItem value="complaint_handling">Complaint Handling</SelectItem>
                        <SelectItem value="adverse_event_reporting">Adverse Event Reporting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Device Class</label>
                    <Select defaultValue="class_iib">
                      <SelectTrigger data-testid="select-device-class">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="class_i">Class I</SelectItem>
                        <SelectItem value="class_iia">Class IIa</SelectItem>
                        <SelectItem value="class_iib">Class IIb</SelectItem>
                        <SelectItem value="class_iii">Class III</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={handleQuery} data-testid="button-query-grkb">
                  <Sparkles className="h-4 w-4" />
                  Query GRKB
                </Button>

                {queryResult && (
                  <div className="mt-6 p-4 rounded-md bg-muted/30 border">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Query Result
                    </h4>
                    <pre className="text-xs font-mono overflow-auto max-h-96 p-3 rounded bg-background">
                      {JSON.stringify(queryResult, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">About GRKB</CardTitle>
                <CardDescription>
                  The system contains structured representations of regulations, not just text
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-md bg-muted/30">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 mb-3">
                      <Scale className="h-5 w-5 text-primary" />
                    </div>
                    <h4 className="font-medium">Structured Data</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Regulations parsed into queryable structures with article references
                    </p>
                  </div>
                  <div className="p-4 rounded-md bg-muted/30">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 mb-3">
                      <AlertTriangle className="h-5 w-5 text-primary" />
                    </div>
                    <h4 className="font-medium">Validation Rules</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Built-in compliance checks and regulatory cadence enforcement
                    </p>
                  </div>
                  <div className="p-4 rounded-md bg-muted/30">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 mb-3">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <h4 className="font-medium">Cross-Reference</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Links between regulations, guidance documents, and standards
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="eu_mdr" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Badge>EU MDR</Badge>
                  Medical Device Regulation 2017/745
                </CardTitle>
                <CardDescription>
                  European Union regulatory requirements for medical devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="article86">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Article 86 - Periodic Safety Update Report
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-medium mb-2">PSUR Frequency by Class</h4>
                          <div className="space-y-2 text-sm">
                            {Object.entries(euMdrRequirements.psur_requirements.frequency).map(([key, value]) => (
                              <div key={key} className="flex justify-between items-center p-2 rounded bg-muted/30">
                                <span className="font-medium">{key.replace(/_/g, ' ').replace('class ', 'Class ')}</span>
                                <span className="text-muted-foreground">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-2">MDCG 2022-21 Required Sections</h4>
                          <div className="space-y-1">
                            {euMdrRequirements.psur_requirements.required_sections.map((section) => (
                              <div key={section.section} className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium shrink-0">
                                  {section.section}
                                </span>
                                <div>
                                  <span className="font-medium">{section.title}</span>
                                  <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="mdcg">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        MDCG 2022-21 - PSUR Guidance Document
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4">
                        <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
                          <p className="text-sm font-medium">Official Guidance Document</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {euMdrRequirements.psur_requirements.guidance_document}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Effective: {euMdrRequirements.psur_requirements.effective_date}
                          </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">Device Grouping Criteria (Annex I):</h4>
                            {euMdrRequirements.psur_requirements.device_grouping.criteria.map((criterion, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium shrink-0">
                                  {idx + 1}
                                </span>
                                <span>{criterion}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">Data Presentation (Annex II):</h4>
                            <div className="p-2 rounded bg-muted/30 text-sm">
                              <p><span className="font-medium">Format:</span> {euMdrRequirements.psur_requirements.data_presentation.format}</p>
                              <p className="mt-1"><span className="font-medium">Coding:</span> {euMdrRequirements.psur_requirements.data_presentation.coding}</p>
                            </div>
                            <h4 className="text-sm font-medium mt-3">Submission:</h4>
                            <div className="p-2 rounded bg-muted/30 text-sm">
                              <p><span className="font-medium">Portal:</span> {euMdrRequirements.psur_requirements.submission.portal}</p>
                              <p className="mt-1"><span className="font-medium">Access:</span> {euMdrRequirements.psur_requirements.submission.access}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="uk_mdr" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Badge variant="secondary">UK MDR</Badge>
                  UK Medical Devices Regulations 2002
                </CardTitle>
                <CardDescription>
                  Post-Brexit UK regulatory requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-md bg-muted/30">
                    <h4 className="font-medium mb-2">Key Divergences from EU MDR</h4>
                    <div className="space-y-2">
                      {ukMdrRequirements.psur_requirements.divergence_from_eu.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
                    <ExternalLink className="h-4 w-4 text-primary" />
                    <span className="text-sm">Submission via: {ukMdrRequirements.psur_requirements.submission}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fda" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Badge variant="outline">FDA</Badge>
                  21 CFR Part 803 - Medical Device Reporting
                </CardTitle>
                <CardDescription>
                  US FDA requirements for medical device manufacturers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Reportable Events</h4>
                    <div className="space-y-2">
                      {fdaRequirements.periodic_reporting.reportable_events.map((event, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                          <span>{event}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2">Reporting Timelines</h4>
                    <div className="grid gap-2 md:grid-cols-3">
                      {Object.entries(fdaRequirements.periodic_reporting.timelines).map(([key, value]) => (
                        <div key={key} className="p-3 rounded-md bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground">{key.replace(/_/g, ' ')}</p>
                          <p className="font-medium mt-1">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
