import path from "node:path";

import { DEFAULT_VIEWPORT, parseJsonArg, renderPresentationPreview } from "./presentation-preview-lib.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const artifactDir = argumentValue("--artifact-dir");
const markdownPath = argumentValue("--markdown-path");
const companionPath = argumentValue("--companion-path");
const viewport = parseJsonArg(argumentValue("--viewport"), DEFAULT_VIEWPORT);

if (!artifactDir) {
  throw new Error("--artifact-dir is required");
}
if (!markdownPath) {
  throw new Error("--markdown-path is required");
}

const result = await renderPresentationPreview({
  artifactDir: path.resolve(artifactDir),
  markdownPath: path.resolve(markdownPath),
  companionPath: companionPath ? path.resolve(companionPath) : null,
  viewport,
});

console.log(JSON.stringify(result, null, 2));
