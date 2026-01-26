/**
 * COMPLIANCE REPORT COMPONENT
 * 
 * Displays Annex I compliance audit results with warnings and recommendations
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

interface ComplianceAuditResult {
  templateId: string;
  overallComplianceScore: number;
  passedChecks: ComplianceCheck[];
  warnings: ComplianceWarning[];
  recommendations: string[];
  layerResults: {
    sectionStructure: LayerResult;
    obligationCoverage: LayerResult;
    requiredTables: LayerResult;
    evidenceTypes: LayerResult;
    calculationRules: LayerResult;
    narrativeConstraints: LayerResult;
    dependencies: LayerResult;
  };
  auditedAt: Date;
}

interface ComplianceCheck {
  checkId: string;
  layer: string;
  description: string;
  passed: boolean;
}

interface ComplianceWarning {
  level: "INFO" | "WARNING" | "CRITICAL";
  category: string;
  obligationId?: string;
  slotId?: string;
  message: string;
  remediation: string;
  impact: string;
}

interface LayerResult {
  score: number;
  recommendations: string[];
  [key: string]: any;
}

interface ComplianceReportProps {
  audit: ComplianceAuditResult;
}

export function ComplianceReport({ audit }: ComplianceReportProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-600">Excellent</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-600">Acceptable</Badge>;
    return <Badge variant="destructive">Needs Improvement</Badge>;
  };

  const getWarningIcon = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "WARNING":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "INFO":
        return <Info className="h-4 w-4 text-blue-600" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const criticalWarnings = audit.warnings.filter((w) => w.level === "CRITICAL");
  const normalWarnings = audit.warnings.filter((w) => w.level === "WARNING");
  const infoWarnings = audit.warnings.filter((w) => w.level === "INFO");

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>MDCG 2022-21 Annex I Compliance</span>
            {getScoreBadge(audit.overallComplianceScore)}
          </CardTitle>
          <CardDescription>
            Non-blocking compliance audit - Template is valid but may not meet full Annex I requirements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Compliance Score</span>
                <span className={`text-2xl font-bold ${getScoreColor(audit.overallComplianceScore)}`}>
                  {audit.overallComplianceScore}%
                </span>
              </div>
              <Progress value={audit.overallComplianceScore} className="h-2" />
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{criticalWarnings.length}</div>
                <div className="text-sm text-muted-foreground">Critical</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{normalWarnings.length}</div>
                <div className="text-sm text-muted-foreground">Warnings</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{audit.passedChecks.filter(c => c.passed).length}</div>
                <div className="text-sm text-muted-foreground">Passed</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {audit.warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Compliance Warnings</CardTitle>
            <CardDescription>Issues that may affect regulatory acceptance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {criticalWarnings.map((warning, idx) => (
                <Alert key={idx} variant="destructive">
                  <div className="flex items-start gap-3">
                    {getWarningIcon(warning.level)}
                    <div className="flex-1">
                      <AlertTitle className="text-sm font-semibold">
                        {warning.category}: {warning.message}
                      </AlertTitle>
                      <AlertDescription className="text-xs mt-1">
                        <div>
                          <strong>Remediation:</strong> {warning.remediation}
                        </div>
                        <div className="mt-1">
                          <strong>Impact:</strong> {warning.impact}
                        </div>
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              ))}

              {normalWarnings.map((warning, idx) => (
                <Alert key={idx}>
                  <div className="flex items-start gap-3">
                    {getWarningIcon(warning.level)}
                    <div className="flex-1">
                      <AlertTitle className="text-sm font-semibold">
                        {warning.category}: {warning.message}
                      </AlertTitle>
                      <AlertDescription className="text-xs mt-1">
                        <div>
                          <strong>Remediation:</strong> {warning.remediation}
                        </div>
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Layer Results */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Layer Analysis</CardTitle>
          <CardDescription>7-layer compliance validation results</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="structure" className="w-full">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="structure">Structure</TabsTrigger>
              <TabsTrigger value="obligations">Obligations</TabsTrigger>
              <TabsTrigger value="tables">Tables</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="calculations">Calculations</TabsTrigger>
              <TabsTrigger value="narratives">Narratives</TabsTrigger>
              <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
            </TabsList>

            <TabsContent value="structure" className="space-y-4">
              <LayerResultCard
                title="Section Structure"
                result={audit.layerResults.sectionStructure}
              />
            </TabsContent>

            <TabsContent value="obligations" className="space-y-4">
              <LayerResultCard
                title="Obligation Coverage"
                result={audit.layerResults.obligationCoverage}
              />
            </TabsContent>

            <TabsContent value="tables" className="space-y-4">
              <LayerResultCard
                title="Required Tables"
                result={audit.layerResults.requiredTables}
              />
            </TabsContent>

            <TabsContent value="evidence" className="space-y-4">
              <LayerResultCard
                title="Evidence Type Mapping"
                result={audit.layerResults.evidenceTypes}
              />
            </TabsContent>

            <TabsContent value="calculations" className="space-y-4">
              <LayerResultCard
                title="Calculation Rules"
                result={audit.layerResults.calculationRules}
              />
            </TabsContent>

            <TabsContent value="narratives" className="space-y-4">
              <LayerResultCard
                title="Narrative Constraints"
                result={audit.layerResults.narrativeConstraints}
              />
            </TabsContent>

            <TabsContent value="dependencies" className="space-y-4">
              <LayerResultCard
                title="Dependency Chain"
                result={audit.layerResults.dependencies}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {audit.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>Actions to improve compliance</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {audit.recommendations.slice(0, 10).map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
            {audit.recommendations.length > 10 && (
              <div className="text-xs text-muted-foreground mt-4">
                + {audit.recommendations.length - 10} more recommendations
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LayerResultCard({ title, result }: { title: string; result: LayerResult }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{title}</span>
          <span className={`text-xl font-bold ${getScoreColor(result.score)}`}>
            {result.score}%
          </span>
        </div>
        <Progress value={result.score} className="h-2" />
      </div>

      {result.recommendations.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Recommendations:</div>
          <ul className="space-y-1">
            {result.recommendations.slice(0, 5).map((rec, idx) => (
              <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                <span className="text-blue-600">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
