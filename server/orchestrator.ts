import { spawn } from "child_process";
import path from "path";

export interface OrchestratorResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CompilationSummary {
  sources: number;
  obligations: number;
  constraints: number;
}

export interface QualificationResult {
  status: "PASS" | "FAIL";
  issues?: string[];
}

export interface Obligation {
  id: string;
  title: string;
  jurisdiction: string;
  mandatory: boolean;
  required_evidence_types: string[];
  allowed_transformations: string[];
  forbidden_transformations: string[];
  required_time_scope: string | null;
  sources: string[];
}

export interface Constraint {
  id: string;
  severity: "BLOCK" | "WARN";
  trigger: string;
  condition: string;
  action: string;
  jurisdiction: string | null;
}

export interface AdjudicationResult {
  status: "ACCEPTED" | "REJECTED";
  reasons?: string[];
}

const ORCHESTRATOR_DIR = path.join(process.cwd(), "psur_orchestrator");
const PYTHON_CMD = "python";

async function runOrchestratorCommand(
  args: string[]
): Promise<OrchestratorResult<string>> {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_CMD, ["-m", "psur_orchestrator.cli", ...args], {
      cwd: ORCHESTRATOR_DIR,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, data: stdout });
      } else {
        resolve({ success: false, error: stderr || stdout });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

export async function initializeOrchestrator(): Promise<OrchestratorResult> {
  const initResult = await runOrchestratorCommand(["init"]);
  return initResult;
}

export async function compileEuDsl(): Promise<
  OrchestratorResult<CompilationSummary>
> {
  const result = await runOrchestratorCommand([
    "compile",
    "psur_orchestrator/dsl/examples/eu_psur.dsl",
  ]);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const sourceMatch = result.data?.match(/Sources\s+│\s+(\d+)/);
  const obligationMatch = result.data?.match(/Obligations\s+│\s+(\d+)/);
  const constraintMatch = result.data?.match(/Constraints\s+│\s+(\d+)/);

  return {
    success: true,
    data: {
      sources: sourceMatch ? parseInt(sourceMatch[1]) : 0,
      obligations: obligationMatch ? parseInt(obligationMatch[1]) : 0,
      constraints: constraintMatch ? parseInt(constraintMatch[1]) : 0,
    },
  };
}

export async function compileUkDsl(): Promise<
  OrchestratorResult<CompilationSummary>
> {
  const result = await runOrchestratorCommand([
    "compile",
    "psur_orchestrator/dsl/examples/uk_psur.dsl",
  ]);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const sourceMatch = result.data?.match(/Sources\s+│\s+(\d+)/);
  const obligationMatch = result.data?.match(/Obligations\s+│\s+(\d+)/);
  const constraintMatch = result.data?.match(/Constraints\s+│\s+(\d+)/);

  return {
    success: true,
    data: {
      sources: sourceMatch ? parseInt(sourceMatch[1]) : 0,
      obligations: obligationMatch ? parseInt(obligationMatch[1]) : 0,
      constraints: constraintMatch ? parseInt(constraintMatch[1]) : 0,
    },
  };
}

export async function qualifyTemplate(
  templateId: string
): Promise<OrchestratorResult<QualificationResult>> {
  const result = await runOrchestratorCommand([
    "qualify",
    "--template",
    templateId,
  ]);

  if (result.data?.includes("QUALIFICATION PASSED")) {
    return { success: true, data: { status: "PASS" } };
  } else if (result.data?.includes("QUALIFICATION FAILED")) {
    return { success: true, data: { status: "FAIL", issues: [] } };
  }

  return { success: false, error: result.error || "Unknown qualification result" };
}

function extractJson(output: string): string {
  const lines = output.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      return trimmed;
    }
  }
  return "[]";
}

export async function listObligations(): Promise<
  OrchestratorResult<Obligation[]>
> {
  const result = await runOrchestratorCommand(["list-obligations", "--json"]);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  try {
    const jsonStr = extractJson(result.data || "");
    const obligations = JSON.parse(jsonStr) as Obligation[];
    return { success: true, data: obligations };
  } catch (e) {
    return { success: false, error: "Failed to parse obligations JSON" };
  }
}

export async function listConstraints(): Promise<
  OrchestratorResult<Constraint[]>
> {
  const result = await runOrchestratorCommand(["list-constraints", "--json"]);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  try {
    const jsonStr = extractJson(result.data || "");
    const constraints = JSON.parse(jsonStr) as Constraint[];
    return { success: true, data: constraints };
  } catch (e) {
    return { success: false, error: "Failed to parse constraints JSON" };
  }
}

export async function getOrchestratorStatus(): Promise<
  OrchestratorResult<{
    initialized: boolean;
    euObligations: number;
    ukObligations: number;
    constraints: number;
  }>
> {
  const obligationsResult = await listObligations();
  const constraintsResult = await listConstraints();

  if (!obligationsResult.success || !constraintsResult.success) {
    return {
      success: true,
      data: {
        initialized: false,
        euObligations: 0,
        ukObligations: 0,
        constraints: 0,
      },
    };
  }

  const euCount = obligationsResult.data?.filter(
    (o) => o.jurisdiction === "EU"
  ).length || 0;
  const ukCount = obligationsResult.data?.filter(
    (o) => o.jurisdiction === "UK"
  ).length || 0;

  return {
    success: true,
    data: {
      initialized: true,
      euObligations: euCount,
      ukObligations: ukCount,
      constraints: constraintsResult.data?.length || 0,
    },
  };
}

let orchestratorInitialized = false;

export async function compileCombinedDsl(): Promise<
  OrchestratorResult<CompilationSummary>
> {
  const result = await runOrchestratorCommand([
    "compile",
    "psur_orchestrator/dsl/examples/combined.dsl",
  ]);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const sourceMatch = result.data?.match(/Sources\s+│\s+(\d+)/);
  const obligationMatch = result.data?.match(/Obligations\s+│\s+(\d+)/);
  const constraintMatch = result.data?.match(/Constraints\s+│\s+(\d+)/);

  return {
    success: true,
    data: {
      sources: sourceMatch ? parseInt(sourceMatch[1]) : 0,
      obligations: obligationMatch ? parseInt(obligationMatch[1]) : 0,
      constraints: constraintMatch ? parseInt(constraintMatch[1]) : 0,
    },
  };
}

export async function ensureOrchestratorInitialized(): Promise<boolean> {
  if (orchestratorInitialized) {
    return true;
  }

  console.log("[Orchestrator] Initializing compliance kernel...");
  const initResult = await initializeOrchestrator();
  
  if (initResult.success) {
    console.log("[Orchestrator] Compliance kernel initialized successfully");
    
    const combinedResult = await compileCombinedDsl();
    if (combinedResult.success) {
      console.log(`[Orchestrator] Combined DSL compiled: ${combinedResult.data?.obligations} obligations, ${combinedResult.data?.constraints} constraints`);
    }
    
    orchestratorInitialized = true;
    return true;
  } else {
    console.error("[Orchestrator] Failed to initialize:", initResult.error);
    return false;
  }
}
