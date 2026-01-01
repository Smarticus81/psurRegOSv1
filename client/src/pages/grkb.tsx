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
    article: "Article 86",
    title: "Periodic Safety Update Report",
    frequency: {
      class_i: "Not required unless requested",
      class_iia: "Upon request by competent authority",
      class_iib: "Annual or upon request",
      class_iii: "Annual",
      class_iii_implant: "Annual",
    },
    required_sections: [
      "Device identification and classification",
      "Surveillance period covered",
      "Sales and distribution data by region",
      "Complaint data summary and analysis",
      "Adverse event summary and reporting",
      "Trend analysis (statistical process control)",
      "Benefit-risk evaluation update",
      "Conclusions and corrective actions",
    ],
    device_grouping: {
      guidance: "MDCG 2022-21",
      criteria: [
        "Same generic device group",
        "Same intended purpose",
        "Similar design and technical characteristics",
        "Same clinical effects",
      ],
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
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
            <p className="text-muted-foreground text-sm mt-1">
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
                          <h4 className="text-sm font-medium mb-2">Required Sections</h4>
                          <div className="space-y-1">
                            {euMdrRequirements.psur_requirements.required_sections.map((section, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                                <span>{section}</span>
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
                        MDCG 2022-21 - Device Grouping Guidance
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Guidance on grouping devices for PSUR purposes
                        </p>
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Grouping Criteria:</h4>
                          {euMdrRequirements.psur_requirements.device_grouping.criteria.map((criterion, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                                {idx + 1}
                              </span>
                              <span>{criterion}</span>
                            </div>
                          ))}
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
