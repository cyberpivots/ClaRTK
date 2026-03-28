#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const resolvedEnvPath = path.join(repoRoot, ".clartk", "dev", "resolved.env");
const fallbackScriptPath = path.join(repoRoot, "scripts", "dev-coordinator-status-db.py");
const execFileAsync = promisify(execFile);

const resolvedEnv = await loadEnvFile(resolvedEnvPath).catch(() => ({}));
const runtimeApiBaseUrl =
  process.env.CLARTK_RUNTIME_API_BASE_URL ??
  `http://127.0.0.1:${process.env.CLARTK_API_PORT ?? process.env.PORT ?? resolvedEnv.CLARTK_API_PORT ?? "3000"}`;
const devConsoleApiBaseUrl =
  process.env.CLARTK_DEV_CONSOLE_API_BASE_URL ??
  `http://127.0.0.1:${process.env.CLARTK_DEV_CONSOLE_API_PORT ?? "3300"}`;
const bootstrapEmail =
  process.env.CLARTK_BOOTSTRAP_ADMIN_EMAIL ??
  resolvedEnv.CLARTK_BOOTSTRAP_ADMIN_EMAIL ??
  "admin@clartk.local";
const bootstrapPassword =
  process.env.CLARTK_BOOTSTRAP_ADMIN_PASSWORD ??
  resolvedEnv.CLARTK_BOOTSTRAP_ADMIN_PASSWORD ??
  "clartk-admin";
const jsonMode = process.argv.includes("--json");

async function main() {
  let summary;
  let primaryError = null;

  try {
    const cookie = await login(runtimeApiBaseUrl, bootstrapEmail, bootstrapPassword);
    summary = await fetchJson(
      new URL("/v1/workspace/coordinator-status", devConsoleApiBaseUrl).toString(),
      { headers: { cookie } }
    );
  } catch (error) {
    primaryError = error instanceof Error ? error.message : String(error);
    summary = await loadFallbackSummary(primaryError);
  }

  if (jsonMode) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printSummary(summary);
}

async function loadEnvFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function login(baseUrl, email, password) {
  const response = await fetch(new URL("/v1/auth/login", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) {
    throw new Error(`login failed: ${response.status} ${await safeBody(response)}`);
  }
  const cookies = getSetCookies(response);
  const sessionCookie = cookies
    .map((item) => item.split(";", 1)[0].trim())
    .filter(Boolean)
    .join("; ");
  if (!sessionCookie) {
    throw new Error("login succeeded but no session cookie was returned");
  }
  return sessionCookie;
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const header = response.headers.get("set-cookie");
  if (!header) {
    return [];
  }
  return header.split(/,(?=[^;,]+=)/g);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${await safeBody(response)}`);
  }
  return response.json();
}

async function safeBody(response) {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}

async function loadFallbackSummary(primaryError) {
  try {
    const { stdout } = await execFileAsync(
      "uv",
      ["run", "python", fallbackScriptPath],
      {
        cwd: repoRoot,
        env: process.env,
        maxBuffer: 1024 * 1024 * 4
      }
    );
    const summary = JSON.parse(stdout);
    if (primaryError) {
      summary.errors = [
        { key: "primary", error: primaryError },
        ...(Array.isArray(summary.errors) ? summary.errors : [])
      ];
    }
    return summary;
  } catch (fallbackError) {
    return {
      generatedAt: new Date().toISOString(),
      endpoints: {
        runtimeApiBaseUrl,
        devConsoleApiBaseUrl,
        agentMemoryBaseUrl: process.env.CLARTK_AGENT_MEMORY_BASE_URL ?? "http://127.0.0.1:3100"
      },
      account: null,
      workspace: {
        status: "degraded",
        postgres: {
          host: resolvedEnv.CLARTK_RESOLVED_POSTGRES_HOST ?? "127.0.0.1",
          port: Number(resolvedEnv.CLARTK_RESOLVED_POSTGRES_PORT ?? "55432"),
          source: resolvedEnv.CLARTK_RESOLVED_POSTGRES_SOURCE ?? "configured_env",
          reachable: false
        },
        backup: null,
        services: []
      },
      coordination: {
        taskCount: 0,
        runCount: 0,
        reviewRunCount: 0,
        blockedTaskCount: 0,
        staleLeaseCount: 0,
        queues: [],
        latestRuns: [],
        latestReviewRuns: []
      },
      catalog: {
        docCount: 0,
        skillCount: 0,
        coordinatorSkillPresent: false
      },
      errors: [
        ...(primaryError ? [{ key: "primary", error: primaryError }] : []),
        {
          key: "fallback",
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        }
      ],
      source: "unconfigured"
    };
  }
}

function printSummary(summary) {
  const services = summary.workspace?.services ?? [];
  const healthyServiceCount = services.filter((service) => service.status === "ok").length;
  console.log("ClaRTK coordinator snapshot");
  console.log(`generated: ${summary.generatedAt}`);
  console.log(`runtime api: ${summary.endpoints.runtimeApiBaseUrl}`);
  console.log(`dev-console api: ${summary.endpoints.devConsoleApiBaseUrl}`);
  if (summary.account) {
    console.log(`account: ${summary.account.email} (${summary.account.role})`);
  }
  if (summary.workspace) {
    console.log(
      `workspace: ${summary.workspace.status} | postgres reachable=${summary.workspace.postgres.reachable} | services ${healthyServiceCount}/${services.length}`
    );
  }
  console.log(
    `coordination: tasks=${summary.coordination.taskCount} runs=${summary.coordination.runCount} ui-reviews=${summary.coordination.reviewRunCount} blocked=${summary.coordination.blockedTaskCount ?? 0} stale-leases=${summary.coordination.staleLeaseCount ?? 0}`
  );
  if (summary.coordination.queues.length > 0) {
    console.log("queues:");
    for (const queue of summary.coordination.queues.slice(0, 8)) {
      console.log(
        `- ${queue.queueName}: queued=${queue.queuedCount} leased=${queue.leasedCount} failed=${queue.failedCount} succeeded=${queue.succeededCount}`
      );
    }
  }
  if (summary.coordination.latestRuns.length > 0) {
    console.log("latest runs:");
    for (const run of summary.coordination.latestRuns) {
      console.log(`- #${run.agentRunId} ${run.agentName} ${run.taskSlug} ${run.status}`);
    }
  }
  if (summary.coordination.latestReviewRuns.length > 0) {
    console.log("latest ui reviews:");
    for (const run of summary.coordination.latestReviewRuns) {
      console.log(`- #${run.uiReviewRunId} ${run.scenarioSet} ${run.status} ${run.createdAt}`);
    }
  }
  console.log(
    `catalog: docs=${summary.catalog.docCount} skills=${summary.catalog.skillCount} coordinator-skill=${summary.catalog.coordinatorSkillPresent ? "present" : "missing"}`
  );
  if (Array.isArray(summary.errors) && summary.errors.length > 0) {
    console.log("errors:");
    for (const error of summary.errors) {
      console.log(`- ${error.key}: ${error.error}`);
    }
    process.exitCode = 1;
  }
}

await main().catch((error) => {
  console.error(`dev-coordinator-status: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
