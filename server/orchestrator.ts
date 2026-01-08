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
  if (!initResult.success) {
    return initResult;
  }

  const seedResult = await runOrchestratorCommand(["demo-seed"]);
  return seedResult;
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

export async function listObligations(): Promise<
  OrchestratorResult<Obligation[]>
> {
  const result = await runOrchestratorCommand(["list-obligations"]);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const obligations: Obligation[] = [];
  const lines = result.data?.split("\n") || [];
  
  for (const line of lines) {
    const match = line.match(/│\s+([^\s│]+)\s+│\s+([^│]+)\s+│\s+(\w+)\s+│\s+(true|false)\s+│/);
    if (match) {
      obligations.push({
        id: match[1].trim(),
        title: match[2].trim(),
        jurisdiction: match[3].trim(),
        mandatory: match[4] === "true",
        required_evidence_types: [],
        allowed_transformations: [],
        forbidden_transformations: [],
        required_time_scope: null,
        sources: [],
      });
    }
  }

  return { success: true, data: obligations };
}

export async function listConstraints(): Promise<
  OrchestratorResult<Constraint[]>
> {
  const result = await runOrchestratorCommand(["list-constraints"]);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const constraints: Constraint[] = [];
  const lines = result.data?.split("\n") || [];

  for (const line of lines) {
    const match = line.match(/│\s+([^\s│]+)\s+│\s+(BLOCK|WARN)\s+│\s+([^│]+)\s+│/);
    if (match) {
      constraints.push({
        id: match[1].trim(),
        severity: match[2] as "BLOCK" | "WARN",
        trigger: match[3].trim(),
        condition: "",
        action: "",
        jurisdiction: null,
      });
    }
  }

  return { success: true, data: constraints };
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

export async function ensureOrchestratorInitialized(): Promise<boolean> {
  if (orchestratorInitialized) {
    return true;
  }

  console.log("[Orchestrator] Initializing compliance kernel...");
  const initResult = await initializeOrchestrator();
  
  if (initResult.success) {
    console.log("[Orchestrator] Compliance kernel initialized successfully");
    
    const euResult = await compileEuDsl();
    if (euResult.success) {
      console.log(`[Orchestrator] EU DSL compiled: ${euResult.data?.obligations} obligations, ${euResult.data?.constraints} constraints`);
    }
    
    const ukResult = await compileUkDsl();
    if (ukResult.success) {
      console.log(`[Orchestrator] UK DSL compiled: ${ukResult.data?.obligations} obligations, ${ukResult.data?.constraints} constraints`);
    }
    
    orchestratorInitialized = true;
    return true;
  } else {
    console.error("[Orchestrator] Failed to initialize:", initResult.error);
    return false;
  }
}
