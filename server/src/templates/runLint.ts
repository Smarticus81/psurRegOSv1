/**
 * CLI script to run template linting
 * Usage: npx tsx server/src/templates/runLint.ts
 */

import { lintAllTemplates, formatLintResults } from "./lintTemplates";

async function main() {
  console.log("Running template lint...\n");
  
  const results = await lintAllTemplates();
  console.log(formatLintResults(results));
  
  const hasErrors = results.some(r => !r.valid);
  const warningCount = results.reduce((acc, r) => acc + r.warnings.length, 0);
  
  console.log("\n" + "=".repeat(50));
  console.log(`SUMMARY: ${results.length} templates checked`);
  console.log(`  Valid: ${results.filter(r => r.valid).length}`);
  console.log(`  Invalid: ${results.filter(r => !r.valid).length}`);
  console.log(`  Warnings: ${warningCount}`);
  
  if (hasErrors) {
    console.log("\n[FAIL] Template linting failed with errors");
    process.exit(1);
  } else {
    console.log("\n[PASS] All templates are valid");
    process.exit(0);
  }
}

main().catch(e => {
  console.error("Template lint failed:", e);
  process.exit(1);
});
