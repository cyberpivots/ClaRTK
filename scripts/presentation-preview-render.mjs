#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  buildPreviewManifest,
  copyRevealRuntime,
  ensureDirectory,
  loadDeckSources,
  materializeDeckArtifacts,
  renderPreviewHtml,
  renderPreviewInit,
  renderPreviewTheme
} from "./presentation-preview-lib.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--")) {
      continue;
    }
    options[key.slice(2)] = value;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const deckPath = options["deck-path"];
  const companionPath = options["companion-path"] ?? null;
  const artifactDir = options["artifact-dir"];

  if (!deckPath || !artifactDir) {
    throw new Error("--deck-path and --artifact-dir are required");
  }

  await ensureDirectory(artifactDir);
  const { parsedDeck, companionAbsolutePath, markdownAbsolutePath } = await loadDeckSources(
    deckPath,
    companionPath
  );
  const revealVendorPath = await copyRevealRuntime(artifactDir);
  const sourceDirectory = companionAbsolutePath
    ? path.dirname(companionAbsolutePath)
    : path.dirname(markdownAbsolutePath);
  const { slides, artifacts: mediaArtifacts } = await materializeDeckArtifacts(
    parsedDeck,
    artifactDir,
    sourceDirectory
  );
  const manifest = buildPreviewManifest(parsedDeck, slides, companionPath);
  const manifestPath = path.join(artifactDir, "manifest.json");
  const htmlPath = path.join(artifactDir, "index.html");
  const initPath = path.join(artifactDir, "init.js");
  const themePath = path.join(artifactDir, "theme.css");
  const renderSummaryPath = path.join(artifactDir, "render-summary.json");

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await fs.writeFile(htmlPath, renderPreviewHtml(manifest, revealVendorPath));
  await fs.writeFile(initPath, renderPreviewInit(manifest));
  await fs.writeFile(themePath, renderPreviewTheme(manifest));

  const result = {
    deckKey: manifest.deckKey,
    title: manifest.title,
    markdownPath: manifest.markdownPath,
    companionPath,
    manifest,
    summaryPath: path.relative(process.cwd(), renderSummaryPath).replaceAll(path.sep, "/"),
    manifestPath: path.relative(process.cwd(), manifestPath).replaceAll(path.sep, "/"),
    htmlPath: path.relative(process.cwd(), htmlPath).replaceAll(path.sep, "/"),
    entryRelativePath: path.relative(process.cwd(), htmlPath).replaceAll(path.sep, "/"),
    slideCount: manifest.slides.length,
    artifacts: [
      {
        kind: "preview.bundle.html",
        relativePath: path.relative(process.cwd(), htmlPath).replaceAll(path.sep, "/"),
        mediaType: "text/html; charset=utf-8"
      },
      {
        kind: "preview.bundle.manifest",
        relativePath: path.relative(process.cwd(), manifestPath).replaceAll(path.sep, "/"),
        mediaType: "application/json"
      },
      {
        kind: "preview.bundle.theme",
        relativePath: path.relative(process.cwd(), themePath).replaceAll(path.sep, "/"),
        mediaType: "text/css; charset=utf-8"
      },
      ...mediaArtifacts
    ]
  };

  await fs.writeFile(renderSummaryPath, JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
