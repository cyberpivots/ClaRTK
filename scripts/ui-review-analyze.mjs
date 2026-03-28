import path from "node:path";

import { analyzeDevConsoleReview } from "./ui-review-lib.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const summaryPath = argumentValue("--summary-path");
if (!summaryPath) {
  throw new Error("--summary-path is required");
}

const thresholdValue = argumentValue("--threshold");
const baselineRoot = argumentValue("--baseline-root");

const result = await analyzeDevConsoleReview({
  summaryPath: path.resolve(summaryPath),
  baselineRoot: baselineRoot ? path.resolve(baselineRoot) : undefined,
  threshold: thresholdValue ? Number(thresholdValue) : undefined
});

console.log(JSON.stringify(result, null, 2));
