import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const serverEntry = resolve("src/server/index.ts");
const source = readFileSync(serverEntry, "utf-8");

const checks = [
  {
    label: "realtime offer route",
    pattern: /app\.post\(["']\/api\/realtime\/offer["']/
  },
  {
    label: "vision route",
    pattern: /app\.post\(["']\/api\/vision["']/
  },
  {
    label: "json middleware",
    pattern: /express\.json\(\{[^}]*limit:\s*["']25mb["']/
  }
];

const failures = checks.filter((check) => !check.pattern.test(source));

if (failures.length > 0) {
  console.error("Smoke check failed:");
  failures.forEach((failure) => {
    console.error(`- Missing ${failure.label}`);
  });
  process.exit(1);
}

console.log("OK: server routes registered");
