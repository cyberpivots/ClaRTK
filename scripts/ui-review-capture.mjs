import path from "node:path";

import { captureDevConsoleReview, parseJsonArg } from "./ui-review-lib.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const artifactDir = argumentValue("--artifact-dir");
const baseUrl = argumentValue("--base-url");
const viewport = parseJsonArg(argumentValue("--viewport"), undefined);
const email = argumentValue("--email");
const password = argumentValue("--password");
const recordVideo = argumentValue("--record-video");

const result = await captureDevConsoleReview({
  artifactDir: artifactDir ? path.resolve(artifactDir) : undefined,
  baseUrl,
  viewport,
  email,
  password,
  recordVideo
});

console.log(JSON.stringify(result, null, 2));
