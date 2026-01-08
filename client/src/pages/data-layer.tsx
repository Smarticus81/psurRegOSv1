import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  FileText,
  BarChart3,
  Trash2,
  AlertCircle,
} from "lucide-react";
import type { Company, DataSource, Device } from "@shared/schema";

export default function DataInputs() {
  const { toast } = useToast();
  const [uploadType, setUploadType] = useState<string>("sales");
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const uploadMetaRef = useRef<{ fileName: string; objectPath: string } | null>(null);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });
  const { data: dataSources = [] } = useQuery<DataSource[]>({
    queryKey: ["/api/data-sources"],
  });

  const company = companies[0];
  const companyId = company?.id?.toString() || "";
  const companyDataSources = company 
    ? dataSources.filter((ds) => ds.companyId === company.id)
    : [];

  const handleUploadComplete = async () => {
    if (!uploadMetaRef.current || !companyId) return;

    try {
      const response = await fetch("/api/data-sources/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyId,
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "sales": return <BarChart3 className="h-4 w-4" />;
      case "complaints": return <AlertCircle className="h-4 w-4" />;
      case "adverse_events": return <AlertCircle className="h-4 w-4" />;
      case "cer": return <FileText className="h-4 w-4" />;
      default: return <FileSpreadsheet className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Data Inputs</h1>
            <p className="text-sm text-muted-foreground">
              Upload and manage PSUR source data
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Upload New Data</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger className="w-40 h-9 text-sm" data-testid="select-upload-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales Data</SelectItem>
                  <SelectItem value="complaints">Complaints</SelectItem>
                  <SelectItem value="adverse_events">Adverse Events</SelectItem>
                  <SelectItem value="cer">CER Document</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-48 h-9 text-sm" data-testid="select-device-filter">
                  <SelectValue placeholder="All devices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id.toString()}>
                      {d.deviceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {company && (
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
                  buttonClassName="h-9"
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </ObjectUploader>
              )}
            </div>
          </CardContent>
        </Card>

        {companyDataSources.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No data uploaded yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload sales, complaints, or adverse event data to begin
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {companyDataSources.map((ds) => (
              <Card key={ds.id} data-testid={`card-datasource-${ds.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        {getTypeIcon(ds.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" data-testid={`text-datasource-name-${ds.id}`}>
                          {ds.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase">
                            {ds.type}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {ds.recordCount?.toLocaleString() || 0} records
                          </span>
                          {ds.columnMapping ? (
                            <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Mapped
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteDataSource(ds.id)}
                      data-testid={`button-delete-datasource-${ds.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
