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

function getTemplatesDir() {
  return path.resolve(process.cwd(), "server", "templates");
}

export function listTemplates() {
  const dir = getTemplatesDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

export function loadTemplate(templateIdRaw: string) {
  const templateId = (templateIdRaw || "").trim();
  if (!templateId) throw httpError(400, "templateId is required");

  const canonicalId = TEMPLATE_ALIASES[templateId] || templateId;
  const dir = getTemplatesDir();
  const filePath = path.join(dir, `${canonicalId}.json`);

  if (!fs.existsSync(filePath)) {
    throw httpError(
      400,
      `Template '${templateId}' not found. Expected file: ${filePath}. Available: ${listTemplates().join(", ")}`
    );
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (parsed.template_id !== canonicalId) {
    throw httpError(
      500,
      `Template ID mismatch: file '${canonicalId}.json' contains template_id '${parsed.template_id}'`
    );
  }
  if (!Array.isArray(parsed.slots)) throw httpError(500, `Template '${canonicalId}' invalid: slots must be array`);
  if (!parsed.mapping || typeof parsed.mapping !== "object") throw httpError(500, `Template '${canonicalId}' invalid: mapping must be object`);

  return parsed;
}
