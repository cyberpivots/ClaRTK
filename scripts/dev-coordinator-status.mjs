#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const resolvedEnvPath = path.join(repoRoot, ".clartk", "dev", "resolved.env");

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
  const cookie = await login(runtimeApiBaseUrl, bootstrapEmail, bootstrapPassword);
  const headers = { cookie };

  const requests = {
    me: fetchJson(new URL("/v1/me", runtimeApiBaseUrl).toString(), { headers }),
    overview: fetchJson(new URL("/v1/workspace/overview", devConsoleApiBaseUrl).toString(), { headers }),
    tasks: fetchJson(new URL("/v1/coordination/tasks", devConsoleApiBaseUrl).toString(), { headers }),
    runs: fetchJson(new URL("/v1/coordination/runs", devConsoleApiBaseUrl).toString(), { headers }),
    reviews: fetchJson(
      new URL("/v1/reviews/ui/runs?surface=dev-console-web", devConsoleApiBaseUrl).toString(),
      { headers }
    ),
    docs: fetchJson(new URL("/v1/docs/catalog", devConsoleApiBaseUrl).toString(), { headers }),
    skills: fetchJson(new URL("/v1/skills", devConsoleApiBaseUrl).toString(), { headers })
  };

  const settledEntries = await Promise.all(
    Object.entries(requests).map(async ([key, promise]) => [key, await settle(promise)])
  );
  const settled = Object.fromEntries(settledEntries);
  const summary = buildSummary({
    runtimeApiBaseUrl,
    devConsoleApiBaseUrl,
    settled
  });

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

async function settle(promise) {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function buildSummary({ runtimeApiBaseUrl, devConsoleApiBaseUrl, settled }) {
  const me = settled.me.ok ? settled.me.value : null;
  const overview = settled.overview.ok ? settled.overview.value : null;
  const tasks = settled.tasks.ok ? settled.tasks.value : null;
  const runs = settled.runs.ok ? settled.runs.value : null;
  const reviews = settled.reviews.ok ? settled.reviews.value : null;
  const docs = settled.docs.ok ? settled.docs.value : null;
  const skills = settled.skills.ok ? settled.skills.value : null;

  const queueTotals =
    tasks?.queues?.map((queue) => ({
      queueName: queue.queueName,
      queuedCount: queue.queuedCount,
      leasedCount: queue.leasedCount,
      failedCount: queue.failedCount,
      succeededCount: queue.succeededCount
    })) ?? [];

  const coordinatorSkillPresent =
    skills?.items?.some((item) => item.skillId === "cli-coordinator" || item.name === "cli-coordinator") ??
    false;

  return {
    generatedAt: new Date().toISOString(),
    endpoints: {
      runtimeApiBaseUrl,
      devConsoleApiBaseUrl
    },
    account: me
      ? {
          accountId: me.account.accountId,
          email: me.account.email,
          role: me.account.role
        }
      : null,
    workspace: overview
      ? {
          status: overview.status,
          postgres: overview.postgres,
          serviceCount: overview.services.length,
          healthyServiceCount: overview.services.filter((service) => service.status === "ok").length,
          services: overview.services.map((service) => ({
            service: service.service,
            status: service.status
          }))
        }
      : null,
    coordination: {
      taskCount: tasks?.items?.length ?? 0,
      runCount: runs?.items?.length ?? 0,
      reviewRunCount: reviews?.runs?.length ?? 0,
      queues: queueTotals,
      latestRuns: (runs?.items ?? []).slice(0, 5).map((run) => ({
        agentRunId: run.agentRunId,
        agentName: run.agentName,
        taskSlug: run.taskSlug,
        status: run.status
      })),
      latestReviewRuns: (reviews?.runs ?? []).slice(0, 5).map((run) => ({
        uiReviewRunId: run.uiReviewRunId,
        status: run.status,
        scenarioSet: run.scenarioSet,
        createdAt: run.createdAt
      }))
    },
    catalog: {
      docCount: docs?.items?.length ?? 0,
      skillCount: skills?.items?.length ?? 0,
      coordinatorSkillPresent
    },
    errors: Object.fromEntries(
      Object.entries(settled)
        .filter(([, value]) => !value.ok)
        .map(([key, value]) => [key, value.error])
    )
  };
}

function printSummary(summary) {
  console.log("ClaRTK coordinator snapshot");
  console.log(`generated: ${summary.generatedAt}`);
  console.log(`runtime api: ${summary.endpoints.runtimeApiBaseUrl}`);
  console.log(`dev-console api: ${summary.endpoints.devConsoleApiBaseUrl}`);
  if (summary.account) {
    console.log(`account: ${summary.account.email} (${summary.account.role})`);
  }
  if (summary.workspace) {
    console.log(
      `workspace: ${summary.workspace.status} | postgres reachable=${summary.workspace.postgres.reachable} | services ${summary.workspace.healthyServiceCount}/${summary.workspace.serviceCount}`
    );
  }
  console.log(
    `coordination: tasks=${summary.coordination.taskCount} runs=${summary.coordination.runCount} ui-reviews=${summary.coordination.reviewRunCount}`
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
  if (Object.keys(summary.errors).length > 0) {
    console.log("errors:");
    for (const [key, value] of Object.entries(summary.errors)) {
      console.log(`- ${key}: ${value}`);
    }
    process.exitCode = 1;
  }
}

await main().catch((error) => {
  console.error(`dev-coordinator-status: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
