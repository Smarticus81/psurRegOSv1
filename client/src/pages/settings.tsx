import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Building2, 
  Globe, 
  Save,
  Plus,
  X
} from "lucide-react";
import type { Company } from "@shared/schema";
import { useState, useEffect } from "react";

const JURISDICTION_OPTIONS = [
  { value: "EU", label: "European Union" },
  { value: "UK", label: "United Kingdom" },
  { value: "US", label: "United States (FDA)" },
  { value: "Canada", label: "Health Canada" },
  { value: "Australia", label: "TGA Australia" },
  { value: "Japan", label: "PMDA Japan" },
];

export default function Settings() {
  const { toast } = useToast();
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const company = companies[0];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setDescription(company.description || "");
      setJurisdictions(company.jurisdictions || []);
    }
  }, [company]);

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; jurisdictions: string[] }) => {
      if (company) {
        return apiRequest("PATCH", `/api/companies/${company.id}`, data);
      } else {
        return apiRequest("POST", "/api/companies", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company profile saved" });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const toggleJurisdiction = (value: string) => {
    if (jurisdictions.includes(value)) {
      setJurisdictions(jurisdictions.filter(j => j !== value));
    } else {
      setJurisdictions([...jurisdictions, value]);
    }
  };

  const handleSave = () => {
    updateMutation.mutate({ name, description, jurisdictions });
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure your company profile and system preferences
          </p>
        </div>

        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Company Profile</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Your organization details for regulatory submissions
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-name" className="text-xs">Company Name</Label>
              <Input
                id="company-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter company name"
                className="h-9"
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief company description"
                rows={2}
                className="text-sm"
                data-testid="input-company-description"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Jurisdictions</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Select the regulatory markets where you operate
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="flex flex-wrap gap-2">
              {JURISDICTION_OPTIONS.map((option) => {
                const isSelected = jurisdictions.includes(option.value);
                return (
                  <Badge
                    key={option.value}
                    variant={isSelected ? "default" : "outline"}
                    className={`cursor-pointer text-xs ${
                      isSelected 
                        ? "" 
                        : "hover:bg-muted"
                    }`}
                    onClick={() => toggleJurisdiction(option.value)}
                    data-testid={`badge-jurisdiction-${option.value.toLowerCase()}`}
                  >
                    {isSelected && <X className="h-3 w-3 mr-1" />}
                    {option.label}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending || !name}
            size="sm"
            data-testid="button-save-settings"
          >
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
