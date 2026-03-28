#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const companionAllowedKeys = new Set(["revealConfig", "theme", "slides"]);
const slideAllowedKeys = new Set(["layout", "eyebrow", "className", "media"]);
const mediaAllowedKeys = new Set([
  "kind",
  "src",
  "alt",
  "caption",
  "title",
  "allow",
  "poster",
  "controls",
  "muted",
  "loop",
  "autoplay"
]);

export function isRemoteAsset(source) {
  return /^https?:\/\//i.test(source);
}

export function isSafeDeckPath(relativePath) {
  return (
    typeof relativePath === "string" &&
    relativePath.startsWith("docs/presentations/") &&
    relativePath.endsWith(".md") &&
    !relativePath.endsWith("-canva-brief.md")
  );
}

export function buildDeckKey(markdownPath) {
  return path.basename(markdownPath, ".md");
}

export async function ensureDirectory(target) {
  await fs.mkdir(target, { recursive: true });
}

export function parseJsonArg(value, fallback = {}) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`invalid json argument: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeRepoRelativePath(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    return inputPath;
  }
  const absolutePath = path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
  const relativePath = path.relative(repoRoot, absolutePath).replaceAll(path.sep, "/");
  if (relativePath.startsWith("..")) {
    return inputPath;
  }
  return relativePath;
}

export async function loadDeckSources(deckPath, companionPath = null) {
  const normalizedDeckPath = normalizeRepoRelativePath(deckPath);
  const markdownAbsolutePath = path.resolve(repoRoot, normalizedDeckPath);
  if (!isSafeDeckPath(normalizedDeckPath)) {
    throw new Error(`deck path must stay within docs/presentations: ${deckPath}`);
  }
  const markdown = await fs.readFile(markdownAbsolutePath, "utf8");
  const normalizedCompanionPath = companionPath ? normalizeRepoRelativePath(companionPath) : null;
  const companionAbsolutePath = normalizedCompanionPath
    ? path.resolve(repoRoot, normalizedCompanionPath)
    : null;
  let companion = null;
  if (normalizedCompanionPath) {
    if (
      !normalizedCompanionPath.startsWith("docs/presentations/") ||
      !normalizedCompanionPath.endsWith(".preview.json")
    ) {
      throw new Error(`companion path must stay within docs/presentations and end with .preview.json: ${companionPath}`);
    }
    companion = JSON.parse(await fs.readFile(companionAbsolutePath, "utf8"));
    validateCompanion(companion);
  }

  const parsedDeck = parseDeckMarkdown(markdown, normalizedDeckPath);
  const mergedDeck = mergeDeckWithCompanion(parsedDeck, companion);
  return {
    parsedDeck: mergedDeck,
    companion,
    markdownAbsolutePath,
    companionAbsolutePath
  };
}

export function parseDeckMarkdown(markdown, markdownPath) {
  const lines = markdown.split(/\r?\n/);
  const slideIndices = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^##\s+Slide\s+\d+/.test(lines[index])) {
      slideIndices.push(index);
    }
  }

  const titleLine = lines.find((line) => line.startsWith("# "));
  const statusLine = lines.find((line) => line.startsWith("- Status:"));
  const summaryLine = lines.find((line) => line.startsWith("- Scope:"));
  const deck = {
    deckKey: buildDeckKey(markdownPath),
    title: titleLine ? titleLine.slice(2).trim() : buildDeckKey(markdownPath),
    status: statusLine ? statusLine.replace("- Status:", "").trim() : "Draft",
    summary: summaryLine ? summaryLine.replace("- Scope:", "").trim() : "",
    markdownPath,
    slides: []
  };

  for (let slideIndex = 0; slideIndex < slideIndices.length; slideIndex += 1) {
    const start = slideIndices[slideIndex];
    const end = slideIndices[slideIndex + 1] ?? lines.length;
    const sectionLines = lines.slice(start + 1, end);
    const slide = {
      slideId: `slide-${String(slideIndex + 1).padStart(2, "0")}`,
      title: "",
      audienceGoal: "",
      bullets: [],
      speakerNotes: "",
      visualGuidance: "",
      evidencePaths: [],
      hasPreviewOverride: false,
      media: []
    };
    let activeField = null;
    for (const rawLine of sectionLines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        continue;
      }
      if (line.startsWith("- Slide title:")) {
        slide.title = line.replace("- Slide title:", "").trim();
        activeField = null;
        continue;
      }
      if (line.startsWith("- Audience goal:")) {
        slide.audienceGoal = line.replace("- Audience goal:", "").trim();
        activeField = null;
        continue;
      }
      if (line.startsWith("- On-slide bullets:")) {
        activeField = "bullets";
        continue;
      }
      if (line.startsWith("- Speaker notes:")) {
        activeField = "speakerNotes";
        const value = line.replace("- Speaker notes:", "").trim();
        if (value) {
          slide.speakerNotes = value;
        }
        continue;
      }
      if (line.startsWith("- Visual guidance:")) {
        activeField = "visualGuidance";
        const value = line.replace("- Visual guidance:", "").trim();
        if (value) {
          slide.visualGuidance = value;
        }
        continue;
      }
      if (line.startsWith("- Evidence links:")) {
        activeField = "evidencePaths";
        continue;
      }
      if (/^\s*-\s+/.test(rawLine) && activeField === "bullets") {
        slide.bullets.push(rawLine.replace(/^\s*-\s+/, "").trim());
        continue;
      }
      if (/^\s*-\s+/.test(rawLine) && activeField === "evidencePaths") {
        const item = rawLine.replace(/^\s*-\s+/, "").trim();
        const linkMatch = item.match(/\(([^)]+)\)/);
        slide.evidencePaths.push(linkMatch?.[1] ?? item);
        continue;
      }
      if (activeField === "speakerNotes") {
        slide.speakerNotes = [slide.speakerNotes, line.trim()].filter(Boolean).join(" ");
        continue;
      }
      if (activeField === "visualGuidance") {
        slide.visualGuidance = [slide.visualGuidance, line.trim()].filter(Boolean).join(" ");
      }
    }
    deck.slides.push(slide);
  }

  return deck;
}

export function validateCompanion(companion) {
  if (!companion || typeof companion !== "object" || Array.isArray(companion)) {
    throw new Error("preview companion must be a JSON object");
  }
  for (const key of Object.keys(companion)) {
    if (!companionAllowedKeys.has(key)) {
      throw new Error(`unsupported preview companion key: ${key}`);
    }
  }
  const slides = companion.slides ?? {};
  if (slides && (typeof slides !== "object" || Array.isArray(slides))) {
    throw new Error("preview companion slides must be an object keyed by slide id");
  }
  for (const [slideId, config] of Object.entries(slides)) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(`preview companion slide entry must be an object: ${slideId}`);
    }
    for (const key of Object.keys(config)) {
      if (!slideAllowedKeys.has(key)) {
        throw new Error(`unsupported preview slide override key on ${slideId}: ${key}`);
      }
    }
    if (config.media !== undefined && !Array.isArray(config.media)) {
      throw new Error(`preview slide media must be an array: ${slideId}`);
    }
    for (const media of config.media ?? []) {
      if (!media || typeof media !== "object" || Array.isArray(media)) {
        throw new Error(`preview media item must be an object on ${slideId}`);
      }
      for (const key of Object.keys(media)) {
        if (!mediaAllowedKeys.has(key)) {
          throw new Error(`unsupported preview media key on ${slideId}: ${key}`);
        }
      }
      if (!["image", "video", "audio", "iframe"].includes(media.kind)) {
        throw new Error(`unsupported media kind on ${slideId}: ${media.kind}`);
      }
      if (typeof media.src !== "string" || !media.src.trim()) {
        throw new Error(`media src is required on ${slideId}`);
      }
    }
  }
}

export function mergeDeckWithCompanion(deck, companion) {
  if (!companion?.slides) {
    return deck;
  }
  const validIds = new Set(deck.slides.map((slide) => slide.slideId));
  for (const slideId of Object.keys(companion.slides)) {
    if (!validIds.has(slideId)) {
      throw new Error(`preview companion references unknown slide id: ${slideId}`);
    }
  }
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      const override = companion.slides?.[slide.slideId] ?? null;
      return {
        ...slide,
        layout: override?.layout ?? "bullet",
        eyebrow: override?.eyebrow ?? "",
        className: override?.className ?? "",
        media: override?.media ?? [],
        hasPreviewOverride: Boolean(override)
      };
    }),
    revealConfig: companion.revealConfig ?? {},
    theme: companion.theme ?? {}
  };
}

export async function materializeDeckArtifacts(deck, artifactDir, sourceDirectory) {
  const localAssetDir = path.join(artifactDir, "assets", "local");
  await ensureDirectory(localAssetDir);
  const slides = [];
  const artifacts = [];

  for (const slide of deck.slides) {
    const media = [];
    for (const descriptor of slide.media ?? []) {
      if (isRemoteAsset(descriptor.src)) {
        media.push({ ...descriptor, resolvedSrc: descriptor.src });
        continue;
      }
      let sourcePath = path.resolve(sourceDirectory, descriptor.src);
      try {
        await fs.access(sourcePath);
      } catch {
        sourcePath = path.resolve(repoRoot, descriptor.src);
      }
      const parsed = path.parse(sourcePath);
      const digest = createHash("sha1").update(sourcePath).digest("hex").slice(0, 8);
      const targetName = `${sanitizeIdentifier(parsed.name)}-${digest}${parsed.ext}`;
      const targetPath = path.join(localAssetDir, targetName);
      await ensureDirectory(path.dirname(targetPath));
      await fs.copyFile(sourcePath, targetPath);
      const relativePath = path.relative(artifactDir, targetPath).replaceAll(path.sep, "/");
      media.push({ ...descriptor, resolvedSrc: `./${relativePath}` });
      artifacts.push({
        kind: `preview.media.${descriptor.kind}`,
        relativePath: path.relative(repoRoot, targetPath).replaceAll(path.sep, "/"),
        mediaType: mediaTypeForPath(targetPath)
      });
    }
    slides.push({ ...slide, media });
  }

  return { slides, artifacts };
}

export async function copyRevealRuntime(artifactDir) {
  const revealRoot = path.join(repoRoot, "node_modules", "reveal.js");
  const distSource = path.join(revealRoot, "dist");
  const targetRoot = path.join(artifactDir, "vendor", "reveal");
  await ensureDirectory(targetRoot);
  await fs.cp(distSource, targetRoot, { recursive: true });
  return path.relative(artifactDir, targetRoot).replaceAll(path.sep, "/");
}

export function buildPreviewManifest(deck, materializedSlides, companionPath = null) {
  return {
    deckKey: deck.deckKey,
    title: deck.title,
    status: deck.status,
    summary: deck.summary,
    markdownPath: deck.markdownPath,
    companionPath,
    revealConfig: {
      controls: true,
      progress: true,
      center: false,
      hash: false,
      ...deck.revealConfig
    },
    theme: deck.theme ?? {},
    slides: materializedSlides.map((slide) => ({
      slideId: slide.slideId,
      title: slide.title,
      audienceGoal: slide.audienceGoal,
      bullets: slide.bullets,
      speakerNotes: slide.speakerNotes,
      visualGuidance: slide.visualGuidance,
      evidencePaths: slide.evidencePaths,
      hasPreviewOverride: slide.hasPreviewOverride,
      layout: slide.layout ?? "bullet",
      eyebrow: slide.eyebrow ?? "",
      className: slide.className ?? "",
      media: slide.media ?? []
    }))
  };
}

export function renderPreviewHtml(manifest, revealVendorPath) {
  const slidesHtml = manifest.slides.map((slide) => renderSlide(slide)).join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(manifest.title)}</title>
    <link rel="stylesheet" href="./${revealVendorPath}/reveal.css" />
    <link rel="stylesheet" href="./theme.css" />
  </head>
  <body>
    <div class="reveal">
      <div class="slides">
${slidesHtml}
      </div>
    </div>
    <script src="./${revealVendorPath}/reveal.js"></script>
    <script src="./init.js"></script>
  </body>
</html>`;
}

function renderSlide(slide) {
  const content = renderContentBlock(slide);
  const notes = slide.speakerNotes
    ? `<aside class="notes">${escapeHtml(slide.speakerNotes)}</aside>`
    : "";
  return `        <section data-slide-id="${escapeHtml(slide.slideId)}" class="preview-slide layout-${escapeHtml(slide.layout)} ${escapeHtml(slide.className || "")}">
          ${content}
          ${notes}
        </section>`;
}

function renderContentBlock(slide) {
  const eyebrow = slide.eyebrow ? `<div class="slide-eyebrow">${escapeHtml(slide.eyebrow)}</div>` : "";
  const title = `<h2>${escapeHtml(slide.title)}</h2>`;
  const audience = slide.audienceGoal ? `<p class="slide-audience">${escapeHtml(slide.audienceGoal)}</p>` : "";
  const bullets = slide.bullets?.length
    ? `<ul class="slide-bullets">${slide.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const evidence = slide.evidencePaths?.length
    ? `<div class="slide-evidence"><span>Evidence</span><ul>${slide.evidencePaths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
    : "";
  const guidance = slide.visualGuidance
    ? `<p class="slide-guidance">${escapeHtml(slide.visualGuidance)}</p>`
    : "";
  const media = renderMedia(slide.media ?? []);
  const copyBlock = `<div class="slide-copy">${eyebrow}${title}${audience}${bullets}${guidance}${evidence}</div>`;

  if (slide.layout === "media-right") {
    return `<div class="slide-layout split">${copyBlock}<div class="slide-media">${media}</div></div>`;
  }
  if (slide.layout === "media-grid") {
    return `<div class="slide-layout stack">${copyBlock}<div class="slide-media grid">${media}</div></div>`;
  }
  if (slide.layout === "hero") {
    return `<div class="slide-layout stack hero">${copyBlock}<div class="slide-media hero">${media}</div></div>`;
  }
  return `<div class="slide-layout stack">${copyBlock}${media ? `<div class="slide-media">${media}</div>` : ""}</div>`;
}

function renderMedia(items) {
  if (!items.length) {
    return "";
  }
  return items.map((item) => renderMediaItem(item)).join("");
}

function renderMediaItem(item) {
  const caption = item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : "";
  if (item.kind === "image") {
    return `<figure class="media-card"><img src="${escapeAttribute(item.resolvedSrc)}" alt="${escapeAttribute(item.alt ?? item.title ?? "")}" loading="lazy" />${caption}</figure>`;
  }
  if (item.kind === "video") {
    return `<figure class="media-card"><video src="${escapeAttribute(item.resolvedSrc)}" ${renderBooleanAttribute("controls", item.controls, true)} ${renderBooleanAttribute("muted", item.muted, false)} ${renderBooleanAttribute("loop", item.loop, false)} ${renderBooleanAttribute("autoplay", item.autoplay, false)} playsinline preload="metadata" ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ""}></video>${caption}</figure>`;
  }
  if (item.kind === "audio") {
    return `<figure class="media-card"><audio src="${escapeAttribute(item.resolvedSrc)}" ${renderBooleanAttribute("controls", item.controls, true)} preload="metadata"></audio>${caption}</figure>`;
  }
  return `<figure class="media-card media-embed"><iframe src="${escapeAttribute(item.resolvedSrc)}" title="${escapeAttribute(item.title ?? item.caption ?? "Embedded preview")}" loading="lazy" allow="${escapeAttribute(item.allow ?? "fullscreen; autoplay")}" referrerpolicy="no-referrer"></iframe>${caption}</figure>`;
}

function renderBooleanAttribute(name, value, fallback) {
  const resolved = value === undefined ? fallback : Boolean(value);
  return resolved ? name : "";
}

export function renderPreviewTheme(manifest) {
  const accent = manifest.theme?.accentColor ?? "#155b47";
  const background = manifest.theme?.backgroundColor ?? "#f2f5f3";
  const text = manifest.theme?.textColor ?? "#102024";
  return `:root {
  --preview-accent: ${accent};
  --preview-background: ${background};
  --preview-text: ${text};
}

html, body {
  margin: 0;
  min-height: 100%;
  background: radial-gradient(circle at top, #ffffff 0%, var(--preview-background) 60%);
  color: var(--preview-text);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}

.reveal {
  font-size: 24px;
}

.reveal .slides {
  text-align: left;
}

.preview-slide {
  height: 100%;
}

.slide-layout {
  display: grid;
  gap: 2rem;
  min-height: 100%;
}

.slide-layout.split {
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  align-items: start;
}

.slide-layout.stack {
  grid-template-columns: minmax(0, 1fr);
}

.slide-layout.hero {
  gap: 1.25rem;
}

.slide-copy {
  display: grid;
  gap: 0.85rem;
}

.slide-eyebrow {
  color: var(--preview-accent);
  font-size: 0.75em;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.slide-audience,
.slide-guidance {
  margin: 0;
  color: rgba(16, 32, 36, 0.72);
}

.slide-bullets,
.slide-evidence ul {
  margin: 0;
  padding-left: 1.2rem;
}

.slide-media {
  display: grid;
  gap: 1rem;
}

.slide-media.grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.media-card {
  margin: 0;
  padding: 0.75rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(16, 32, 36, 0.12);
  box-shadow: 0 18px 50px rgba(16, 32, 36, 0.08);
}

.media-card img,
.media-card video,
.media-card iframe {
  display: block;
  width: 100%;
  border: 0;
  border-radius: 12px;
  background: #dfe7e3;
}

.media-card iframe {
  min-height: 280px;
}

.media-card audio {
  width: 100%;
}

.slide-evidence span {
  display: inline-block;
  margin-bottom: 0.35rem;
  font-size: 0.72em;
  font-weight: 700;
  color: var(--preview-accent);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.media-card figcaption {
  margin-top: 0.55rem;
  font-size: 0.6em;
  color: rgba(16, 32, 36, 0.68);
}
`;
}

export function renderPreviewInit(manifest) {
  return `const deck = new Reveal(${JSON.stringify(manifest.revealConfig, null, 2)});
deck.initialize();`;
}

export function mediaTypeForPath(assetPath) {
  const lower = assetPath.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (lower.endsWith(".webm")) {
    return "video/webm";
  }
  if (lower.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (lower.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (lower.endsWith(".wav")) {
    return "audio/wav";
  }
  if (lower.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (lower.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (lower.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

function sanitizeIdentifier(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
