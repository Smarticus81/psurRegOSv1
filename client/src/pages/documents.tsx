import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import {
  FileText,
  Download,
  Eye,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Loader2,
} from "lucide-react";
import type { GeneratedDocument } from "@shared/schema";

export default function Documents() {
  const { data: documents = [], isLoading } = useQuery<GeneratedDocument[]>({
    queryKey: ["/api/documents"],
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-3xl font-light tracking-tight">Documents</h1>
            <p className="text-muted-foreground/80 text-sm">
              Generated regulatory documents and review packages
            </p>
          </div>
        </div>

        {documents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No documents yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Documents will appear here after you run the PSUR Agent. Go to Agent Orchestration to generate your first document.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <Card key={doc.id} className="flex flex-col" data-testid={`card-document-${doc.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <Badge 
                      variant="outline" 
                      className={
                        doc.reviewStatus === "approved" 
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300" 
                          : doc.reviewStatus === "rejected"
                          ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300"
                          : ""
                      }
                    >
                      {doc.reviewStatus === "approved" && <CheckCircle2 className="h-3 w-3" />}
                      {doc.reviewStatus === "rejected" && <AlertCircle className="h-3 w-3" />}
                      {doc.reviewStatus === "pending" && <Clock className="h-3 w-3" />}
                      {doc.reviewStatus}
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-3">{doc.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <span className="uppercase text-xs font-medium">{doc.documentType}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {doc.generatedAt ? new Date(doc.generatedAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 pt-0">
                  {doc.sections && Array.isArray(doc.sections) && (doc.sections as Array<{ name?: string }>).length > 0 && (
                    <div className="space-y-2 mb-4">
                      <p className="text-xs font-medium text-muted-foreground/70">Sections</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(doc.sections as Array<{ name?: string }>).slice(0, 4).map((section, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-1 rounded-lg bg-muted/50 text-muted-foreground">
                            {String(section.name || `Section ${idx + 1}`)}
                          </span>
                        ))}
                        {(doc.sections as Array<{ name?: string }>).length > 4 && (
                          <span className="text-[10px] px-2 py-1 rounded-lg bg-muted/50 text-muted-foreground">
                            +{(doc.sections as Array<{ name?: string }>).length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {doc.fileSize && (
                    <p className="text-xs text-muted-foreground">
                      {(doc.fileSize / 1024).toFixed(1)} KB
                    </p>
                  )}
                </CardContent>
                <div className="p-4 pt-0 mt-auto flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" data-testid={`button-preview-${doc.id}`}>
                    <Eye className="h-4 w-4" />
                    Preview
                  </Button>
                  <Button size="sm" className="flex-1" data-testid={`button-download-${doc.id}`}>
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review Checklist Template</CardTitle>
            <CardDescription>Standard checklist for PSUR document review</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reviewChecklistItems.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/30">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30">
                    <span className="text-xs font-medium text-muted-foreground">{idx + 1}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const reviewChecklistItems = [
  {
    title: "Data Accuracy Verified",
    description: "Spot-check 10 data points against source systems",
  },
  {
    title: "Regulatory Compliance Confirmed",
    description: "All required sections present per Article 86",
  },
  {
    title: "Narrative Quality Assessed",
    description: "Analysis is objective, well-written, and appropriate",
  },
  {
    title: "Citation Traceability Verified",
    description: "All claims are supported by referenced data",
  },
  {
    title: "Completeness Confirmed",
    description: "No placeholder text or missing information",
  },
];
