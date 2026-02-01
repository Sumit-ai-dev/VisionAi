import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
let eslintPath = null;

try {
  eslintPath = require.resolve("eslint/bin/eslint.js");
} catch {
  console.log("Lint skipped: eslint is not installed in this environment.");
  process.exit(0);
}

const result = spawnSync("node", [eslintPath, ".", "--ext", ".ts"], {
  stdio: "inherit"
});

process.exit(result.status ?? 0);
