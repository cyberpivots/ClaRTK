import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import {
  bootstrapChromiumRuntimeLibraries,
  isLikelyPlaywrightBrowserDependencyError
} from "./browser-runtime-lib.mjs";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_UI_REVIEW_ROOT = path.join(repoRoot, ".clartk", "dev", "ui-review");
export const DEFAULT_BASELINE_ROOT = path.join(DEFAULT_UI_REVIEW_ROOT, "baselines");
export const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
export const DEFAULT_SURFACE = "dev-console-web";
export const DEFAULT_SCENARIO_SET = "default";
export const DEFAULT_THRESHOLD = 0.005;

const WINDOWS_POWERSHELL_PATH = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const WINDOWS_EDGE_CANDIDATES = [
  "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe"
];

const panelScenarios = [
  {
    panelKey: "preview",
    navIndex: 0,
    label: "Preview",
    expectedTexts: ["Preview Stage", "Selected Slide", "Run Rail"]
  },
  {
    panelKey: "coordination",
    navIndex: 1,
    label: "Coordination",
    expectedTexts: ["Quick Actions", "Queue Health", "Retry Selected Task"]
  },
  {
    panelKey: "review",
    navIndex: 2,
    label: "Review",
    expectedTexts: ["Review Control", "Recent Runs", "Stored runs"]
  },
  {
    panelKey: "preferences",
    navIndex: 3,
    label: "Preferences",
    expectedTexts: ["Derived Defaults", "Manual Overrides", "Prefer Compact HUD"]
  },
  {
    panelKey: "index",
    navIndex: 4,
    label: "Index",
    expectedTexts: ["Workspace Status", "Services", "Reachable"]
  }
];

const shellExpectedTexts = [...panelScenarios.map((scenario) => scenario.label), "Previous", "Next"];

function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function ensureBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "1" || value.toLowerCase() === "true";
  }
  return fallback;
}

export function parseJsonArg(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function ensureDirectory(target) {
  await fs.mkdir(target, { recursive: true });
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(target, value) {
  await ensureDirectory(path.dirname(target));
  await fs.writeFile(target, JSON.stringify(value, null, 2));
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function reserveDebugPort() {
  for (let port = 9330; port <= 9399; port += 1) {
    if (!(await isPortInUse(port))) {
      return port;
    }
  }
  throw new Error("Failed to reserve a Windows Edge debug port in the 9330-9399 range.");
}

function randomSegment() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function toPowerShellSingleQuoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function toWindowsPath(target) {
  const match = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(String(target));
  if (match) {
    return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
  }
  return String(target).replaceAll("/", "\\");
}

async function waitForJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`Unexpected ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function stopWindowsEdgeDebugPort(port) {
  if (!(await exists(WINDOWS_POWERSHELL_PATH))) {
    return;
  }
  const stopCommand = [
    "Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\"",
    `| Where-Object { $_.CommandLine -match '--remote-debugging-port=${port}' }`,
    "| ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
  ].join(" ");
  await execFileAsync(WINDOWS_POWERSHELL_PATH, ["-NoProfile", "-Command", stopCommand]).catch(() => {});
}

function relativePathFromRoot(target) {
  return path.relative(repoRoot, target).replaceAll(path.sep, "/");
}

function mediaTypeForPath(target) {
  if (target.endsWith(".png")) {
    return "image/png";
  }
  if (target.endsWith(".webm")) {
    return "video/webm";
  }
  if (target.endsWith(".zip")) {
    return "application/zip";
  }
  if (target.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

export function buildAssetDescriptor(target, kind) {
  return {
    kind,
    relativePath: relativePathFromRoot(target),
    mediaType: mediaTypeForPath(target)
  };
}

function buildViewportKey(viewport) {
  return `${viewport.width}x${viewport.height}`;
}

async function collectPanelSnapshot(page, expectedTexts, requiredShellTexts = shellExpectedTexts) {
  return page.evaluate(({ texts, shellTexts }) => {
    const shellRoot = document.querySelector("[data-review-shell='true']") ?? document.body;
    const missionSurface =
      document.querySelector("[data-review-shell-region='mission-surface']") ??
      document.querySelector(".console-main") ??
      shellRoot;
    const visibleLoadingTexts = Array.from(missionSurface.querySelectorAll("*"))
      .map((node) => node.textContent?.trim() ?? "")
      .filter((text) => text && /loading/i.test(text))
      .slice(0, 10);
    const missionText = missionSurface.textContent ?? "";
    const shellText = shellRoot.textContent ?? "";
    const missingTexts = texts.filter((text) => !missionText.includes(text));
    const missingShellTexts = shellTexts.filter((text) => !shellText.includes(text));
    const reviewButtons = Array.from(
      shellRoot.querySelectorAll("[data-review-shell-button]")
    );
    const truncatedLabels = reviewButtons
      .map((button) => {
        const element = button;
        const label =
          element.getAttribute("data-review-label") ??
          element.textContent?.trim().replace(/\s+/g, " ") ??
          "button";
        const overflowX = Math.max(0, element.scrollWidth - element.clientWidth);
        const overflowY = Math.max(0, element.scrollHeight - element.clientHeight);
        if (overflowX <= 2 && overflowY <= 2) {
          return null;
        }
        return { label, overflowX, overflowY };
      })
      .filter(Boolean);
    const documentVerticalOverflowPx = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const shellRect = shellRoot.getBoundingClientRect();
    return {
      title: document.title,
      bodyTextLength: missionText.trim().length,
      visibleLoadingTexts,
      missingTexts,
      missingShellTexts,
      horizontalOverflowPx: Math.max(0, shellRoot.scrollWidth - window.innerWidth),
      documentVerticalOverflowPx,
      shellBottomOverflowPx: Math.max(0, shellRect.bottom - window.innerHeight),
      truncatedLabels,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }, { texts: expectedTexts, shellTexts: requiredShellTexts });
}

async function captureShellScreenshot(page, screenshotPath) {
  await page.screenshot({
    path: screenshotPath,
    animations: "disabled"
  });
}

async function capturePanelScreenshot(page, screenshotPath) {
  const visibleBox = await page.locator(".console-main").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: Math.max(1, Math.floor(Math.min(rect.width, window.innerWidth - Math.max(rect.left, 0)))),
      height: Math.max(1, Math.floor(Math.min(rect.height, window.innerHeight - Math.max(rect.top, 0))))
    };
  });
  const rawScreenshotPath = `${screenshotPath}.raw.png`;
  await page.locator(".console-main").screenshot({
    path: rawScreenshotPath,
    animations: "disabled"
  });

  const rawPng = await loadPng(rawScreenshotPath);
  if (rawPng.height <= 1 || rawPng.width <= 1 || visibleBox.height <= 1) {
    await page.screenshot({
      path: screenshotPath,
      animations: "disabled"
    });
    await fs.unlink(rawScreenshotPath).catch(() => {});
    return;
  }

  const cropWidth = Math.max(1, Math.min(rawPng.width, visibleBox.width));
  const cropHeight = Math.max(1, Math.min(rawPng.height, visibleBox.height));
  if (cropWidth === rawPng.width && cropHeight === rawPng.height) {
    await fs.rename(rawScreenshotPath, screenshotPath).catch(async () => {
      await fs.copyFile(rawScreenshotPath, screenshotPath);
      await fs.unlink(rawScreenshotPath).catch(() => {});
    });
    return;
  }

  const croppedPng = new PNG({ width: cropWidth, height: cropHeight });
  PNG.bitblt(rawPng, croppedPng, 0, 0, cropWidth, cropHeight, 0, 0);
  await fs.writeFile(screenshotPath, PNG.sync.write(croppedPng));
  await fs.unlink(rawScreenshotPath).catch(() => {});
}

async function loginIfNeeded(page, email, password) {
  if (await page.locator(".console-shell").isVisible().catch(() => false)) {
    return;
  }
  if (await page.getByRole("button", { name: /^sign in$/i }).isVisible().catch(() => false)) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
  }
  await page.locator(".console-shell").waitFor({ timeout: 15000 });
}

async function activatePanel(page, scenario) {
  const shellClass = `.console-shell-${scenario.panelKey}`;
  if (scenario.panelKey !== "preview") {
    await page.locator(".icon-nav-button").nth(scenario.navIndex).click();
  }
  await page.locator(shellClass).waitFor({ timeout: 15000 });
}

async function selectStableReviewRun(page) {
  return page.evaluate(() => {
    const inspectButtons = Array.from(document.querySelectorAll("button")).filter(
      (button) => button.textContent?.trim() === "Inspect review"
    );
    for (const button of inspectButtons) {
      const cardText =
        button.closest(".list-block-item")?.textContent ??
        button.parentElement?.textContent ??
        "";
      if (/baseline_promoted|ready_for_review|analyzed/i.test(cardText)) {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      }
    }
    return false;
  });
}

async function waitForScenarioSettled(page, scenario, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = await collectPanelSnapshot(page, scenario.expectedTexts);
  while (Date.now() < deadline) {
    if (
      scenario.panelKey === "review" &&
      snapshot.visibleLoadingTexts.some((text) => /loading findings|capture_running/i.test(text))
    ) {
      const selectedStableRun = await selectStableReviewRun(page);
      if (selectedStableRun) {
        await page.waitForTimeout(500);
        snapshot = await collectPanelSnapshot(page, scenario.expectedTexts);
        if (snapshot.visibleLoadingTexts.length === 0 && snapshot.missingTexts.length === 0) {
          return snapshot;
        }
      }
    }
    if (snapshot.visibleLoadingTexts.length === 0 && snapshot.missingTexts.length === 0) {
      return snapshot;
    }
    await page.waitForTimeout(250);
    snapshot = await collectPanelSnapshot(page, scenario.expectedTexts);
  }
  return snapshot;
}

async function launchNativeChromium({ viewport, videosDir }) {
  let browser;
  let context;
  const launchDescriptor = {
    browserName: "chromium",
    launchStrategy: "playwright-launch",
    videoCapable: true
  };

  try {
    await bootstrapChromiumRuntimeLibraries(chromium.executablePath()).catch(() => {});
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport,
      recordVideo: {
        dir: videosDir,
        size: viewport
      }
    });
    const page = await context.newPage();
    return {
      ...launchDescriptor,
      browser,
      context,
      page,
      async finalize({ persistVideo }) {
        let videoDescriptor = null;
        try {
          if (page.video()) {
            await context.close();
            const rawVideoPath = await page.video().path();
            const finalVideoPath = path.join(videosDir, "session.webm");
            if (await exists(rawVideoPath)) {
              await fs.rename(rawVideoPath, finalVideoPath).catch(async () => {
                await fs.copyFile(rawVideoPath, finalVideoPath);
                await fs.unlink(rawVideoPath);
              });
              if (persistVideo) {
                videoDescriptor = buildAssetDescriptor(finalVideoPath, "ui.review.video");
              } else {
                await fs.unlink(finalVideoPath).catch(() => {});
              }
            }
          } else {
            await context.close();
          }
        } finally {
          await browser?.close().catch(() => {});
        }
        return { videoDescriptor };
      }
    };
  } catch (error) {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    throw error;
  }
}

async function launchWindowsEdgeCdp({ viewport }) {
  const edgeExecutable = await firstExistingPath(WINDOWS_EDGE_CANDIDATES);
  if (!edgeExecutable) {
    throw new Error("Windows Edge executable was not found for UI review CDP fallback.");
  }
  if (!(await exists(WINDOWS_POWERSHELL_PATH))) {
    throw new Error("Windows PowerShell was not found for UI review CDP fallback.");
  }

  const port = await reserveDebugPort();
  const userDataDir = `C:\\Temp\\clartk-ui-review-${randomSegment()}`;
  const argumentList = [
    "--headless=new",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${viewport.width},${viewport.height}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ];
  const startCommand = [
    "$process = Start-Process",
    `-FilePath ${toPowerShellSingleQuoted(toWindowsPath(edgeExecutable))}`,
    `-ArgumentList @(${argumentList.map((value) => toPowerShellSingleQuoted(value)).join(", ")})`,
    "-PassThru;",
    "Write-Output $process.Id"
  ].join(" ");
  const startResult = await execFileAsync(WINDOWS_POWERSHELL_PATH, [
    "-NoProfile",
    "-Command",
    startCommand
  ]);
  const launchedPid = Number.parseInt(String(startResult.stdout).trim(), 10);
  if (!Number.isFinite(launchedPid)) {
    throw new Error(`Failed to launch Windows Edge CDP fallback. stdout=${String(startResult.stdout).trim()}`);
  }

  let browser;
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`, 15000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("Windows Edge CDP fallback connected without a default browser context.");
    }
    const page =
      context
        .pages()
        .find((candidate) => {
          const url = String(candidate.url());
          return url === "about:blank" || (!url.startsWith("chrome-extension://") && !url.startsWith("edge://"));
        }) ?? (await context.newPage());
    return {
      browserName: "chromium",
      launchStrategy: "windows-edge-cdp",
      videoCapable: false,
      browser,
      context,
      page,
      async finalize() {
        try {
          await browser?.close().catch(() => {});
        } finally {
          await stopWindowsEdgeDebugPort(port);
        }
        return { videoDescriptor: null };
      }
    };
  } catch (error) {
    await browser?.close().catch(() => {});
    await stopWindowsEdgeDebugPort(port);
    throw error;
  }
}

async function launchReviewBrowser(options) {
  try {
    return await launchNativeChromium(options);
  } catch (error) {
    if (!isLikelyPlaywrightBrowserDependencyError(error)) {
      throw error;
    }
  }

  return launchWindowsEdgeCdp(options);
}

export async function captureDevConsoleReview(options = {}) {
  const surface = options.surface ?? DEFAULT_SURFACE;
  const scenarioSet = options.scenarioSet ?? DEFAULT_SCENARIO_SET;
  const baseUrl = options.baseUrl ?? "http://127.0.0.1:5180";
  const reviewRoot = options.reviewRoot ?? DEFAULT_UI_REVIEW_ROOT;
  const artifactDir =
    options.artifactDir ??
    path.join(reviewRoot, "runs", `${Date.now()}-${sanitizeSegment(surface)}-${sanitizeSegment(scenarioSet)}`);
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const email = options.email ?? process.env.CLARTK_BOOTSTRAP_ADMIN_EMAIL ?? "admin@clartk.local";
  const password = options.password ?? process.env.CLARTK_BOOTSTRAP_ADMIN_PASSWORD ?? "clartk-admin";
  const explicitVideo = ensureBoolean(options.recordVideo, false);

  const screenshotsDir = path.join(artifactDir, "screenshots");
  const videosDir = path.join(artifactDir, "videos");
  const captureDir = path.join(artifactDir, "capture");
  await ensureDirectory(screenshotsDir);
  await ensureDirectory(videosDir);
  await ensureDirectory(captureDir);

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const responseErrors = [];
  const artifacts = [];
  const steps = [];
  const tracePath = path.join(captureDir, "trace.zip");
  const summaryPath = path.join(captureDir, "capture-summary.json");
  let browserSession;
  let context;
  let page;
  let videoDescriptor = null;
  let overallError = null;
  const startedAt = new Date().toISOString();
  let launchStrategy = "playwright-launch";
  let browserName = "chromium";

  try {
    browserSession = await launchReviewBrowser({
      viewport,
      videosDir
    });
    launchStrategy = browserSession.launchStrategy;
    browserName = browserSession.browserName;
    context = browserSession.context;
    await context.tracing.start({ screenshots: true, snapshots: true });
    page = browserSession.page;
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push({
          type: message.type(),
          text: message.text(),
          location: message.location()
        });
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push({
        name: error.name,
        message: error.message
      });
    });
    page.on("requestfailed", (request) => {
      failedRequests.push({
        method: request.method(),
        url: request.url(),
        failureText: request.failure()?.errorText ?? "unknown"
      });
    });
    page.on("response", async (response) => {
      if (response.status() < 400) {
        return;
      }
      responseErrors.push({
        status: response.status(),
        url: response.url(),
        method: response.request().method()
      });
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await loginIfNeeded(page, email, password);

    for (const scenario of panelScenarios) {
      const stepStartedAt = Date.now();
      await activatePanel(page, scenario);
      const panelSnapshot = await waitForScenarioSettled(page, scenario);
      const screenshotPath = path.join(
        screenshotsDir,
        `${sanitizeSegment(scenario.panelKey)}-${sanitizeSegment("loaded")}.png`
      );
      const panelScreenshotPath = path.join(
        screenshotsDir,
        `${sanitizeSegment(scenario.panelKey)}-${sanitizeSegment("panel")}.png`
      );
      await captureShellScreenshot(page, screenshotPath);
      await capturePanelScreenshot(page, panelScreenshotPath);
      artifacts.push(buildAssetDescriptor(screenshotPath, "ui.review.screenshot"));
      artifacts.push(buildAssetDescriptor(panelScreenshotPath, "ui.review.panel_screenshot"));
      steps.push({
        panelKey: scenario.panelKey,
        scenarioName: scenario.panelKey,
        checkpointName: "loaded",
        expectedTexts: scenario.expectedTexts,
        durationMs: Date.now() - stepStartedAt,
        screenshot: buildAssetDescriptor(screenshotPath, "ui.review.screenshot"),
        panelScreenshot: buildAssetDescriptor(panelScreenshotPath, "ui.review.panel_screenshot"),
        panelSnapshot
      });
    }
  } catch (error) {
    overallError = {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error)
    };
    if (page) {
      try {
        const failureShot = path.join(screenshotsDir, "failure-terminal.png");
        await page.screenshot({ path: failureShot });
        artifacts.push(buildAssetDescriptor(failureShot, "ui.review.failure_screenshot"));
      } catch {
        // ignore terminal screenshot failures
      }
    }
  } finally {
    if (context) {
      try {
        await context.tracing.stop({ path: tracePath });
        artifacts.push(buildAssetDescriptor(tracePath, "ui.review.trace"));
      } catch {
        // ignore trace stop errors
      }
    }
    try {
      const finalizeResult = await browserSession?.finalize({
        persistVideo: Boolean(overallError || explicitVideo)
      });
      if (finalizeResult?.videoDescriptor) {
        videoDescriptor = finalizeResult.videoDescriptor;
        artifacts.push(videoDescriptor);
      }
    } catch {
      // ignore close/video persistence errors
    }
  }

  const summary = {
    surface,
    scenarioSet,
    baseUrl,
    browser: browserName,
    launchStrategy,
    viewport,
    viewportKey: buildViewportKey(viewport),
    startedAt,
    completedAt: new Date().toISOString(),
    status: overallError ? "failed" : "captured",
    steps,
    artifacts,
    trace: buildAssetDescriptor(tracePath, "ui.review.trace"),
    video: videoDescriptor,
    consoleErrors,
    pageErrors,
    failedRequests,
    responseErrors,
    error: overallError
  };
  await writeJson(summaryPath, summary);

  return {
    artifactDir,
    summaryPath,
    summary
  };
}

async function loadPng(target) {
  return PNG.sync.read(await fs.readFile(target));
}

function buildDiffImagePath(diffDir, step) {
  return path.join(
    diffDir,
    `${sanitizeSegment(step.scenarioName)}-${sanitizeSegment(step.checkpointName)}-diff.png`
  );
}

function buildBaselinePath(baselineRoot, summary, step) {
  return path.join(
    baselineRoot,
    summary.surface,
    summary.browser,
    summary.viewportKey,
    `${sanitizeSegment(step.scenarioName)}-${sanitizeSegment(step.checkpointName)}.png`
  );
}

export async function analyzeDevConsoleReview(options = {}) {
  const summaryPath = options.summaryPath;
  if (!summaryPath) {
    throw new Error("summaryPath is required");
  }
  const baselineRoot = options.baselineRoot ?? DEFAULT_BASELINE_ROOT;
  const threshold = typeof options.threshold === "number" ? options.threshold : DEFAULT_THRESHOLD;
  const analysisDir = path.join(path.dirname(summaryPath), "..", "analysis");
  const diffDir = path.join(analysisDir, "diffs");
  await ensureDirectory(diffDir);

  const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
  const findings = [];
  const analysisArtifacts = [];

  if (summary.status !== "captured" && summary.error) {
    findings.push({
      category: "capture_error",
      severity: "critical",
      title: "Capture stage reported an execution error",
      summary: summary.error.message,
      scenarioName: null,
      checkpointName: null,
      evidenceJson: {
        error: summary.error,
        captureSummaryPath: relativePathFromRoot(summaryPath)
      }
    });
  }

  for (const responseError of summary.responseErrors) {
    if (!String(responseError.url).includes("/v1/")) {
      continue;
    }
    findings.push({
      category: "api_error",
      severity: responseError.status >= 500 ? "critical" : "error",
      title: `API request returned ${responseError.status}`,
      summary: `${responseError.method} ${responseError.url} returned ${responseError.status}.`,
      scenarioName: null,
      checkpointName: null,
      evidenceJson: { responseError }
    });
  }

  for (const entry of summary.consoleErrors) {
    findings.push({
      category: "console_error",
      severity: "error",
      title: "Console error detected during review",
      summary: entry.text,
      scenarioName: null,
      checkpointName: null,
      evidenceJson: { consoleError: entry }
    });
  }

  for (const entry of summary.pageErrors) {
    findings.push({
      category: "page_error",
      severity: "critical",
      title: "Unhandled page error detected during review",
      summary: entry.message,
      scenarioName: null,
      checkpointName: null,
      evidenceJson: { pageError: entry }
    });
  }

  for (const entry of summary.failedRequests) {
    findings.push({
      category: "request_failure",
      severity: "error",
      title: "Browser request failed during review",
      summary: `${entry.method} ${entry.url} failed: ${entry.failureText}.`,
      scenarioName: null,
      checkpointName: null,
      evidenceJson: { failedRequest: entry }
    });
  }

  for (const step of summary.steps) {
    const snapshot = {
      visibleLoadingTexts: Array.isArray(step.panelSnapshot?.visibleLoadingTexts)
        ? step.panelSnapshot.visibleLoadingTexts
        : [],
      missingTexts: Array.isArray(step.panelSnapshot?.missingTexts)
        ? step.panelSnapshot.missingTexts
        : [],
      missingShellTexts: Array.isArray(step.panelSnapshot?.missingShellTexts)
        ? step.panelSnapshot.missingShellTexts
        : [],
      horizontalOverflowPx: Number(step.panelSnapshot?.horizontalOverflowPx ?? 0),
      documentVerticalOverflowPx: Number(step.panelSnapshot?.documentVerticalOverflowPx ?? 0),
      shellBottomOverflowPx: Number(step.panelSnapshot?.shellBottomOverflowPx ?? 0),
      truncatedLabels: Array.isArray(step.panelSnapshot?.truncatedLabels)
        ? step.panelSnapshot.truncatedLabels
        : []
    };

    if (snapshot.visibleLoadingTexts.length > 0) {
      findings.push({
        category: "loading_stall",
        severity: "warning",
        title: `Loading text persisted in ${step.scenarioName}`,
        summary: `Visible loading indicators remained after the ${step.scenarioName} panel settled.`,
        scenarioName: step.scenarioName,
        checkpointName: step.checkpointName,
        evidenceJson: {
          loadingTexts: snapshot.visibleLoadingTexts,
          screenshot: step.screenshot
        }
      });
    }

    if (snapshot.missingTexts.length > 0) {
      findings.push({
        category: "missing_content",
        severity: "error",
        title: `Expected content missing in ${step.scenarioName}`,
        summary: `The ${step.scenarioName} panel did not render all expected review markers.`,
        scenarioName: step.scenarioName,
        checkpointName: step.checkpointName,
        evidenceJson: {
          missingTexts: snapshot.missingTexts,
          screenshot: step.screenshot
        }
      });
    }

    if (snapshot.missingShellTexts.length > 0) {
      findings.push({
        category: "shell_content_missing",
        severity: "error",
        title: `Shell controls missing in ${step.scenarioName}`,
        summary: `The ${step.scenarioName} shell snapshot did not include all required navigation controls.`,
        scenarioName: step.scenarioName,
        checkpointName: step.checkpointName,
        evidenceJson: {
          missingShellTexts: snapshot.missingShellTexts,
          screenshot: step.screenshot,
          panelScreenshot: step.panelScreenshot ?? null
        }
      });
    }

    if (snapshot.horizontalOverflowPx > 16) {
      findings.push({
        category: "layout_overflow",
        severity: "warning",
        title: `Horizontal overflow detected in ${step.scenarioName}`,
        summary: `The ${step.scenarioName} panel exceeded the viewport width by ${snapshot.horizontalOverflowPx}px.`,
        scenarioName: step.scenarioName,
        checkpointName: step.checkpointName,
        evidenceJson: {
          horizontalOverflowPx: snapshot.horizontalOverflowPx,
          screenshot: step.screenshot
        }
      });
    }

    if (
      snapshot.documentVerticalOverflowPx > 16 ||
      snapshot.shellBottomOverflowPx > 16
    ) {
      findings.push({
        category: "top_level_scroll",
        severity: "error",
        title: `Top-level scroll detected in ${step.scenarioName}`,
        summary: `The ${step.scenarioName} shell exceeded the initial viewport height.`,
        scenarioName: step.scenarioName,
        checkpointName: step.checkpointName,
        evidenceJson: {
          documentVerticalOverflowPx: snapshot.documentVerticalOverflowPx,
          shellBottomOverflowPx: snapshot.shellBottomOverflowPx,
          screenshot: step.screenshot,
          panelScreenshot: step.panelScreenshot ?? null
        }
      });
    }

    if (snapshot.truncatedLabels.length > 0) {
      findings.push({
        category: "navigation_truncation",
        severity: "error",
        title: `Navigation label clipping detected in ${step.scenarioName}`,
        summary: `One or more shell navigation buttons overflowed their bounds in ${step.scenarioName}.`,
        scenarioName: step.scenarioName,
        checkpointName: step.checkpointName,
        evidenceJson: {
          truncatedLabels: snapshot.truncatedLabels,
          screenshot: step.screenshot,
          panelScreenshot: step.panelScreenshot ?? null
        }
      });
    }

    const screenshotPath = path.join(repoRoot, step.screenshot.relativePath);
    const baselinePath = buildBaselinePath(baselineRoot, summary, step);
    if (!(await exists(baselinePath))) {
      continue;
    }

    const current = await loadPng(screenshotPath);
    const baseline = await loadPng(baselinePath);
    if (current.width !== baseline.width || current.height !== baseline.height) {
      findings.push({
        category: "visual_diff",
        severity: "error",
        title: `Baseline dimensions changed for ${step.scenarioName}`,
        summary: `Current screenshot dimensions differ from the approved baseline for ${step.scenarioName}.`,
        scenarioName: step.scenarioName,
        checkpointName: step.checkpointName,
        evidenceJson: {
          screenshot: step.screenshot,
          baseline: buildAssetDescriptor(baselinePath, "ui.review.baseline")
        }
      });
      continue;
    }

    const diffImage = new PNG({ width: current.width, height: current.height });
    const diffPixels = pixelmatch(
      baseline.data,
      current.data,
      diffImage.data,
      current.width,
      current.height,
      {
        threshold: 0.1
      }
    );
    const diffRatio = diffPixels / (current.width * current.height);
    if (diffRatio <= threshold) {
      continue;
    }

    const diffPath = buildDiffImagePath(diffDir, step);
    await fs.writeFile(diffPath, PNG.sync.write(diffImage));
    const diffDescriptor = buildAssetDescriptor(diffPath, "ui.review.diff");
    analysisArtifacts.push(diffDescriptor);
    findings.push({
      category: "visual_diff",
      severity: diffRatio > 0.05 ? "error" : "warning",
      title: `Visual baseline drift in ${step.scenarioName}`,
      summary: `The ${step.scenarioName} panel differs from its approved baseline by ${(diffRatio * 100).toFixed(2)}%.`,
      scenarioName: step.scenarioName,
      checkpointName: step.checkpointName,
      evidenceJson: {
        diffRatio,
        screenshot: step.screenshot,
        baseline: buildAssetDescriptor(baselinePath, "ui.review.baseline"),
        diff: diffDescriptor
      }
    });
  }

  const outcome = findings.some((finding) => ["error", "critical"].includes(finding.severity))
    ? "failed"
    : "passed";
  const analysisSummary = {
    status: outcome,
    findings,
    artifacts: analysisArtifacts,
    threshold,
    completedAt: new Date().toISOString()
  };
  const analysisSummaryPath = path.join(analysisDir, "analysis-summary.json");
  await writeJson(analysisSummaryPath, analysisSummary);

  return {
    analysisSummaryPath,
    analysisSummary
  };
}
