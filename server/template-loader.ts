import fs from "fs";
import path from "path";

type HttpError = Error & { status?: number };

function httpError(status: number, message: string): HttpError {
  const err: HttpError = new Error(message);
  err.status = status;
  return err;
}

const TEMPLATE_ALIASES: Record<string, string> = {
  "MDCG_2022_21": "MDCG_2022_21_ANNEX_I",
  "MDCG_2022_21_ANNEX_I": "MDCG_2022_21_ANNEX_I",
  "FormQAR-054_C": "FormQAR-054_C",
  "FORMQAR_054_C": "FormQAR-054_C",
  "formqar_054_c": "FormQAR-054_C",
  "FormQAR_054_C": "FormQAR-054_C",
  "mdcg_2022_21_annex_i": "MDCG_2022_21_ANNEX_I",
  "mdcg_2022_21": "MDCG_2022_21_ANNEX_I",
};

function candidateTemplateDirs(): string[] {
  const dirs = new Set<string>();

  dirs.add(path.resolve(__dirname, "..", "templates"));
  dirs.add(path.resolve(__dirname, "..", "..", "server", "templates"));
  dirs.add(path.resolve(process.cwd(), "server", "templates"));
  dirs.add(path.resolve(process.cwd(), "templates"));

  return Array.from(dirs);
}

function findTemplatePath(canonicalId: string) {
  const tried: string[] = [];
  for (const dir of candidateTemplateDirs()) {
    const p = path.join(dir, `${canonicalId}.json`);
    tried.push(p);
    if (fs.existsSync(p)) return { found: p, tried };
  }
  return { found: null as string | null, tried };
}

export function loadTemplate(templateIdRaw: string) {
  const templateId = (templateIdRaw || "").trim();
  if (!templateId) throw httpError(400, "templateId is required.");

  const canonicalId = TEMPLATE_ALIASES[templateId] || templateId;
  const { found, tried } = findTemplatePath(canonicalId);

  if (!found) {
    throw httpError(
      400,
      `Template '${templateId}' not found. Canonical: '${canonicalId}'. Searched:\n- ${tried.join("\n- ")}`
    );
  }

  const raw = fs.readFileSync(found, "utf8");
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw httpError(500, `Template '${canonicalId}' JSON parse error at ${found}: ${e?.message || e}`);
  }

  if (!parsed.template_id || typeof parsed.template_id !== "string") {
    throw httpError(500, `Template '${canonicalId}' missing template_id (file: ${found}).`);
  }
  if (!Array.isArray(parsed.slots)) {
    throw httpError(500, `Template '${canonicalId}' slots must be an array (file: ${found}).`);
  }
  if (!parsed.mapping || typeof parsed.mapping !== "object") {
    throw httpError(500, `Template '${canonicalId}' mapping must be an object (file: ${found}).`);
  }
  if (parsed.template_id !== canonicalId) {
    throw httpError(
      500,
      `Template ID mismatch: expected '${canonicalId}', got '${parsed.template_id}' (file: ${found}).`
    );
  }

  return parsed;
}
