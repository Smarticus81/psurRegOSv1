import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import {
  Database,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  FileText,
  BarChart3,
  Trash2,
} from "lucide-react";
import type { Company, DataSource } from "@shared/schema";

export default function DataLayer() {
  const { toast } = useToast();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [uploadType, setUploadType] = useState<string>("sales");
  const uploadMetaRef = useRef<{ fileName: string; objectPath: string } | null>(null);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: dataSources = [] } = useQuery<DataSource[]>({
    queryKey: ["/api/data-sources"],
  });

  const companyDataSources = dataSources.filter(
    (ds) => ds.companyId === parseInt(selectedCompany)
  );

  const handleUploadComplete = async () => {
    if (!uploadMetaRef.current || !selectedCompany) return;

    try {
      const response = await fetch("/api/data-sources/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompany,
          type: uploadType,
          fileName: uploadMetaRef.current.fileName,
          objectPath: uploadMetaRef.current.objectPath,
        }),
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
        toast({ title: "File uploaded successfully" });
      } else {
        throw new Error("Upload registration failed");
      }
    } catch (error) {
      toast({ title: "Failed to register upload", variant: "destructive" });
    } finally {
      uploadMetaRef.current = null;
    }
  };

  const handleDeleteDataSource = async (id: number) => {
    try {
      const response = await fetch(`/api/data-sources/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/data-sources"] });
        toast({ title: "Data source deleted" });
      } else {
        throw new Error("Delete failed");
      }
    } catch (error) {
      toast({ title: "Failed to delete data source", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Data Layer</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Unified data ingestion and normalization from any source
            </p>
          </div>
        </div>

        <Tabs defaultValue="sources" className="space-y-6">
          <TabsList>
            <TabsTrigger value="sources">Data Sources</TabsTrigger>
            <TabsTrigger value="upload">Upload Data</TabsTrigger>
            <TabsTrigger value="mapping">Column Mapping</TabsTrigger>
          </TabsList>

          <TabsContent value="sources" className="space-y-6">
            <div className="flex items-center gap-4">
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-64" data-testid="select-data-company">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!selectedCompany ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                    <Database className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">Select a Company</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Choose a company to view and manage its data sources.
                  </p>
                </CardContent>
              </Card>
            ) : companyDataSources.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">No Data Sources</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Upload sales data, complaints, or other data to get started.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {companyDataSources.map((ds) => (
                  <Card key={ds.id} data-testid={`card-datasource-${ds.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          {ds.type === "sales" && <BarChart3 className="h-5 w-5 text-primary" />}
                          {ds.type === "complaints" && <AlertCircle className="h-5 w-5 text-primary" />}
                          {ds.type === "adverse_events" && <AlertCircle className="h-5 w-5 text-primary" />}
                          {ds.type === "cer" && <FileText className="h-5 w-5 text-primary" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="uppercase text-[10px]">
                            {ds.type}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteDataSource(ds.id)}
                            data-testid={`button-delete-datasource-${ds.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      <CardTitle className="text-base mt-3" data-testid={`text-datasource-name-${ds.id}`}>
                        {ds.name}
                      </CardTitle>
                      <CardDescription data-testid={`text-datasource-records-${ds.id}`}>
                        {ds.recordCount?.toLocaleString() || 0} records
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2 text-xs text-muted-foreground">
                        {ds.lastUpdated && (
                          <p data-testid={`text-datasource-updated-${ds.id}`}>
                            Last updated: {new Date(ds.lastUpdated).toLocaleDateString()}
                          </p>
                        )}
                        {ds.columnMapping && (
                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Column mapping configured
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upload Data File</CardTitle>
                <CardDescription>
                  Upload Excel or CSV files containing sales, complaint, or adverse event data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                      <SelectTrigger data-testid="select-upload-company">
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data Type</Label>
                    <Select value={uploadType} onValueChange={setUploadType}>
                      <SelectTrigger data-testid="select-upload-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sales">Sales Data</SelectItem>
                        <SelectItem value="complaints">Complaints</SelectItem>
                        <SelectItem value="adverse_events">Adverse Events</SelectItem>
                        <SelectItem value="cer">Clinical Evaluation Report</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Click to upload files</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Supports CSV, XLS, XLSX files up to 10MB
                      </p>
                    </div>
                    {!selectedCompany ? (
                      <p className="text-sm text-muted-foreground">Please select a company first</p>
                    ) : (
                      <ObjectUploader
                        maxNumberOfFiles={5}
                        maxFileSize={10 * 1024 * 1024}
                        onGetUploadParameters={async (file) => {
                          const res = await fetch("/api/uploads/request-url", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              name: file.name,
                              size: file.size,
                              contentType: file.type,
                            }),
                          });
                          const { uploadURL, objectPath } = await res.json();
                          uploadMetaRef.current = { fileName: file.name, objectPath };
                          return {
                            method: "PUT",
                            url: uploadURL,
                            headers: { "Content-Type": file.type },
                          };
                        }}
                        onComplete={handleUploadComplete}
                        buttonClassName="min-w-[200px]"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Files
                      </ObjectUploader>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mapping" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Data Normalization</CardTitle>
                <CardDescription>
                  The system normalizes data from any format into a standard structure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Raw Data (Your Format)</h4>
                    <div className="rounded-md border bg-muted/30 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Product Code</TableHead>
                            <TableHead className="text-xs">Ship Country</TableHead>
                            <TableHead className="text-xs">Invoice Date</TableHead>
                            <TableHead className="text-xs">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-mono text-xs">ECM-001</TableCell>
                            <TableCell className="text-xs">France</TableCell>
                            <TableCell className="text-xs">2024-01-15</TableCell>
                            <TableCell className="text-xs">500</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-mono text-xs">ECM-001</TableCell>
                            <TableCell className="text-xs">Germany</TableCell>
                            <TableCell className="text-xs">2024-01-20</TableCell>
                            <TableCell className="text-xs">300</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-primary" />
                      Normalized Data (Standard Format)
                    </h4>
                    <div className="rounded-md border bg-primary/5 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">device</TableHead>
                            <TableHead className="text-xs">region</TableHead>
                            <TableHead className="text-xs">date</TableHead>
                            <TableHead className="text-xs">quantity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-mono text-xs">ECM-001</TableCell>
                            <TableCell className="text-xs">EU</TableCell>
                            <TableCell className="text-xs">2024-01-15</TableCell>
                            <TableCell className="text-xs">500</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-mono text-xs">ECM-001</TableCell>
                            <TableCell className="text-xs">EU</TableCell>
                            <TableCell className="text-xs">2024-01-20</TableCell>
                            <TableCell className="text-xs">300</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-md bg-muted/30">
                  <h4 className="text-sm font-medium mb-2">Column Mapping Rules</h4>
                  <div className="grid gap-2 text-xs text-muted-foreground">
                    <p><span className="font-mono">Product Code</span> → <span className="font-mono">device</span></p>
                    <p><span className="font-mono">Ship Country</span> → <span className="font-mono">country</span> → <span className="font-mono">region</span> (via country-to-region mapping)</p>
                    <p><span className="font-mono">Invoice Date</span> → <span className="font-mono">date</span> (standardized to ISO format)</p>
                    <p><span className="font-mono">Qty</span> → <span className="font-mono">quantity</span></p>
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
