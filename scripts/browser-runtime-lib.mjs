import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

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

export function isLikelyPlaywrightBrowserDependencyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /error while loading shared libraries|cannot open shared object file|libnspr4\.so/i.test(message);
}

export async function bootstrapChromiumRuntimeLibraries(browserExecutablePath) {
  if (process.platform !== "linux") {
    return { configured: false, installedPackages: [], missingLibraries: [] };
  }

  const cacheRoot = runtimeCacheRoot();
  const extractRoot = path.join(cacheRoot, "root");
  const downloadRoot = path.join(cacheRoot, "downloads");
  await fs.mkdir(cacheRoot, { recursive: true });
  await fs.mkdir(extractRoot, { recursive: true });
  await fs.mkdir(downloadRoot, { recursive: true });
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
