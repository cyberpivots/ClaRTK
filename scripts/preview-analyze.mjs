import path from "node:path";

import { analyzePresentationPreview } from "./presentation-preview-lib.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const summaryPath = argumentValue("--summary-path");
if (!summaryPath) {
  throw new Error("--summary-path is required");
}

const result = await analyzePresentationPreview({
  summaryPath: path.resolve(summaryPath),
});

console.log(JSON.stringify(result, null, 2));
