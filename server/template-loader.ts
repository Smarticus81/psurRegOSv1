import fs from "fs";
import path from "path";

const TEMPLATE_ID_ALIASES: Record<string, string> = {
  "FORMQAR_054_C": "FormQAR-054_C",
  "formqar_054_c": "FormQAR-054_C",
  "FormQAR_054_C": "FormQAR-054_C",
  "FormQAR-054_C": "FormQAR-054_C",
  "MDCG_2022_21": "MDCG_2022_21_ANNEX_I",
  "MDCG_2022_21_ANNEX_I": "MDCG_2022_21_ANNEX_I",
  "mdcg_2022_21_annex_i": "MDCG_2022_21_ANNEX_I",
  "mdcg_2022_21": "MDCG_2022_21_ANNEX_I",
};

function resolveTemplateFilename(templateId: string): string {
  return TEMPLATE_ID_ALIASES[templateId] || templateId;
}

export function loadTemplate(templateId: string) {
  const templatesDir = path.join(process.cwd(), "server", "templates");
  const resolvedId = resolveTemplateFilename(templateId);
  const templatePath = path.join(templatesDir, `${resolvedId}.json`);

  if (!fs.existsSync(templatePath)) {
    const err: any = new Error(`Template '${templateId}' not found (resolved: ${resolvedId}).`);
    err.status = 400;
    throw err;
  }

  const raw = fs.readFileSync(templatePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed.template_id || !parsed.slots || !parsed.mapping) {
    const err: any = new Error(`Template '${templateId}' is invalid or malformed.`);
    err.status = 500;
    throw err;
  }

  return parsed;
}
