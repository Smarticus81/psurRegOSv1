import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";
import type { GeneratedDocument } from "@shared/schema";

export default function Documents() {
  const { data: documents = [], isLoading } = useQuery<GeneratedDocument[]>({
    queryKey: ["/api/documents"],
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Documents</h1>
            <p className="text-sm text-muted-foreground">
              Generated PSURs and regulatory documents
            </p>
          </div>
        </div>

        {documents.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No documents yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Documents appear here after PSUR generation
                </p>
                <Button size="sm" asChild>
                  <Link href="/agents">Go to PSUR Generator</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Review Checklist</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {reviewChecklistItems.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium text-muted-foreground">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
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

function DocumentRow({ doc }: { doc: GeneratedDocument }) {
  const statusColors: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  };
  const statusColor = statusColors[doc.reviewStatus || "pending"] || "";
  
  const StatusIcon = doc.reviewStatus === "approved" 
    ? CheckCircle2 
    : doc.reviewStatus === "rejected" 
    ? AlertCircle 
    : Clock;

  return (
    <Card className="hover-elevate" data-testid={`card-document-${doc.id}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{doc.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase">
                  {doc.documentType}
                </Badge>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor}`}>
                  <StatusIcon className="h-3 w-3 mr-0.5" />
                  {doc.reviewStatus}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {doc.generatedAt ? new Date(doc.generatedAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" data-testid={`button-preview-${doc.id}`}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" data-testid={`button-download-${doc.id}`}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const reviewChecklistItems = [
  { title: "Data Accuracy", description: "Spot-check data points against sources" },
  { title: "Regulatory Compliance", description: "All required sections present" },
  { title: "Narrative Quality", description: "Analysis is objective and appropriate" },
  { title: "Citation Traceability", description: "Claims supported by references" },
  { title: "Completeness", description: "No placeholder text or missing info" },
];
