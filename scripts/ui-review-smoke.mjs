import path from "node:path";

import {
  DEFAULT_BASELINE_ROOT,
  DEFAULT_UI_REVIEW_ROOT,
  captureDevConsoleReview,
  analyzeDevConsoleReview
} from "./ui-review-lib.mjs";

const smokeDir = path.join(DEFAULT_UI_REVIEW_ROOT, "manual-smoke", String(Date.now()));

const capture = await captureDevConsoleReview({
  artifactDir: smokeDir,
  baseUrl: process.env.CLARTK_UI_REVIEW_BASE_URL ?? "http://127.0.0.1:5180",
  email: process.env.CLARTK_BOOTSTRAP_ADMIN_EMAIL ?? "admin@clartk.local",
  password: process.env.CLARTK_BOOTSTRAP_ADMIN_PASSWORD ?? "clartk-admin",
  recordVideo: true
});

const analysis = await analyzeDevConsoleReview({
  summaryPath: capture.summaryPath,
  baselineRoot: DEFAULT_BASELINE_ROOT
});

console.log(
  JSON.stringify(
    {
      artifactDir: capture.artifactDir,
      captureStatus: capture.summary.status,
      findingCount: analysis.analysisSummary.findings.length,
      outcome: analysis.analysisSummary.status
    },
    null,
    2
  )
);
