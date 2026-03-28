#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { chromium } from "playwright";

import { ensureDirectory, mediaTypeForPath, parseJsonArg } from "./presentation-preview-lib.mjs";

const execFile = promisify(execFileCallback);
const CHROMIUM_RUNTIME_PACKAGE_MAP = new Map([
  ["libnspr4.so", "libnspr4"],
  ["libnss3.so", "libnss3"],
  ["libnssutil3.so", "libnss3"],
  ["libsmime3.so", "libnss3"],
  ["libssl3.so", "libnss3"],
  ["libplc4.so", "libnspr4"],
  ["libplds4.so", "libnspr4"],
  ["libasound.so.2", "libasound2t64"]
]);

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

function parseMissingLibraries(lddOutput) {
  return Array.from(
    new Set(
      lddOutput
        .split("\n")
        .map((line) => line.match(/^\s*(\S+)\s+=>\s+not found$/)?.[1] ?? null)
        .filter((value) => value !== null)
    )
  );
}

async function detectMissingLibraries(browserExecutablePath) {
  try {
    const { stdout, stderr } = await execFile("ldd", [browserExecutablePath], {
      env: process.env
    });
    return parseMissingLibraries(`${stdout}\n${stderr}`);
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    return parseMissingLibraries(`${stdout}\n${stderr}`);
  }
}

function runtimeCacheRoot() {
  return path.join(
    process.cwd(),
    ".clartk",
    "dev",
    "tooling",
    "playwright-runtime-libs",
    `${process.platform}-${process.arch}`
  );
}

async function configureRuntimeLibraryPath(rootDir) {
  const candidateDirs = [
    path.join(rootDir, "usr", "lib", "x86_64-linux-gnu"),
    path.join(rootDir, "lib", "x86_64-linux-gnu"),
    path.join(rootDir, "usr", "lib64"),
    path.join(rootDir, "usr", "lib")
  ];
  const existingDirs = [];
  for (const candidate of candidateDirs) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) {
        existingDirs.push(candidate);
      }
    } catch {
      // ignored
    }
  }
  if (!existingDirs.length) {
    return [];
  }
  const currentEntries = (process.env.LD_LIBRARY_PATH ?? "")
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const merged = Array.from(new Set([...existingDirs, ...currentEntries]));
  process.env.LD_LIBRARY_PATH = merged.join(":");
  return existingDirs;
}

async function bootstrapChromiumRuntimeLibraries(browserExecutablePath) {
  if (process.platform !== "linux") {
    return { configured: false, installedPackages: [], missingLibraries: [] };
  }

  const cacheRoot = runtimeCacheRoot();
  const extractRoot = path.join(cacheRoot, "root");
  const downloadRoot = path.join(cacheRoot, "downloads");
  await ensureDirectory(cacheRoot);
  await ensureDirectory(extractRoot);
  await ensureDirectory(downloadRoot);
  await configureRuntimeLibraryPath(extractRoot);

  let missingLibraries = await detectMissingLibraries(browserExecutablePath);
  if (!missingLibraries.length) {
    return { configured: true, installedPackages: [], missingLibraries: [] };
  }

  const packageNames = Array.from(
    new Set(
      missingLibraries
        .map((libraryName) => CHROMIUM_RUNTIME_PACKAGE_MAP.get(libraryName) ?? null)
        .filter((packageName) => packageName !== null)
    )
  );
  if (!packageNames.length) {
    return { configured: false, installedPackages: [], missingLibraries };
  }

  await execFile("apt", ["download", ...packageNames], {
    cwd: downloadRoot,
    env: process.env
  });

  const debEntries = (await fs.readdir(downloadRoot))
    .filter((entry) => entry.endsWith(".deb"))
    .map((entry) => path.join(downloadRoot, entry));
  for (const debPath of debEntries) {
    await execFile("dpkg-deb", ["-x", debPath, extractRoot], {
      env: process.env
    });
  }

  await configureRuntimeLibraryPath(extractRoot);
  missingLibraries = await detectMissingLibraries(browserExecutablePath);
  return {
    configured: true,
    installedPackages: packageNames,
    missingLibraries
  };
}

async function startStaticServer(rootDir) {
  const absoluteRootDir = path.resolve(rootDir);
  const server = http.createServer(async (request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
    const resolvedPath = path.resolve(absoluteRootDir, relativePath);
    const normalizedRoot = absoluteRootDir.endsWith(path.sep)
      ? absoluteRootDir
      : `${absoluteRootDir}${path.sep}`;
    if (resolvedPath !== absoluteRootDir && !resolvedPath.startsWith(normalizedRoot)) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, { "Content-Type": mediaTypeForPath(resolvedPath) });
      response.end(await fs.readFile(resolvedPath));
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind static preview server");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const artifactDir = options["artifact-dir"];
  const viewport = parseJsonArg(options["viewport"], { width: 1440, height: 900 });
  if (!artifactDir) {
    throw new Error("--artifact-dir is required");
  }

  const manifestPath = path.join(artifactDir, "manifest.json");
  const analysisDir = path.join(artifactDir, "analysis");
  const summaryPath = path.join(analysisDir, "analysis-summary.json");
  await ensureDirectory(analysisDir);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const { server, baseUrl } = await startStaticServer(artifactDir);
  const artifacts = [];
  const warnings = [];
  const consoleErrors = [];
  const requestFailures = [];
  let browser = null;

  try {
    try {
      const runtimeBootstrap = await bootstrapChromiumRuntimeLibraries(chromium.executablePath());
      if (runtimeBootstrap.missingLibraries.length) {
        warnings.push(
          `Chromium still missing runtime libraries: ${runtimeBootstrap.missingLibraries.join(", ")}`
        );
      }
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      warnings.push(`browser launch failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!browser) {
      const fallbackSummary = {
        status: "warning",
        warnings,
        consoleErrors,
        requestFailures,
        slides: [],
        analysisSummaryPath: path.relative(process.cwd(), summaryPath).replaceAll(path.sep, "/"),
        artifacts
      };
      await fs.writeFile(summaryPath, JSON.stringify(fallbackSummary, null, 2));
      process.stdout.write(`${JSON.stringify(fallbackSummary)}\n`);
      return;
    }

    const page = await browser.newPage({ viewport });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });
    page.on("requestfailed", (request) => {
      requestFailures.push({
        url: request.url(),
        errorText: request.failure()?.errorText ?? "request failed"
      });
    });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);

    const slideSummaries = [];
    for (let index = 0; index < manifest.slides.length; index += 1) {
      const slide = manifest.slides[index];
      await page.evaluate((targetIndex) => {
        if (globalThis.Reveal && typeof globalThis.Reveal.slide === "function") {
          globalThis.Reveal.slide(targetIndex);
        }
      }, index);
      await page.waitForTimeout(200);
      const screenshotPath = path.join(analysisDir, `${slide.slideId}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const relativePath = path.relative(process.cwd(), screenshotPath).replaceAll(path.sep, "/");
      artifacts.push({
        kind: "preview.analysis.screenshot",
        relativePath,
        mediaType: "image/png"
      });
      slideSummaries.push({
        slideId: slide.slideId,
        screenshotPath: relativePath
      });
    }

    const summary = {
      status: consoleErrors.length || requestFailures.length ? "warning" : "ready_for_review",
      warnings,
      consoleErrors,
      requestFailures,
      slides: slideSummaries,
      analysisSummaryPath: path.relative(process.cwd(), summaryPath).replaceAll(path.sep, "/"),
      artifacts: [
        ...artifacts,
        {
          kind: "preview.analysis.summary",
          relativePath: path.relative(process.cwd(), summaryPath).replaceAll(path.sep, "/"),
          mediaType: "application/json"
        }
      ]
    };
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await browser?.close().catch(() => {});
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve(undefined))));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
