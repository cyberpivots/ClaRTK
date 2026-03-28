import React from "react";
import { ApiClient, DevConsoleClient } from "@clartk/api-client";
import { tokens } from "@clartk/design-tokens";
import type {
  AgentRunCollection,
  AgentRunDetail,
  AgentTaskCollection,
  AuthenticatedMe,
  DevPreferenceProfile,
  DocsCatalogResponse,
  EvaluationResultRecord,
  KnowledgeClaimRecord,
  PresentationDeckSourceCollection,
  PreviewFeedbackCollection,
  PreviewRun,
  PreviewRunCollection,
  ResourceCollection,
  SkillCatalogResponse,
  SourceDocumentRecord,
  UiReviewBaselineCollection,
  UiReviewFindingCollection,
  UiReviewRun,
  UiReviewRunCollection,
  WorkspaceOverview
} from "@clartk/domain";

type HudDensity = "compact" | "comfortable";
type MotionMode = "reduced" | "standard";

function browserBaseUrl(defaultPort: number): string {
  if (typeof window === "undefined") {
    return `http://localhost:${defaultPort}`;
  }
  return `${window.location.protocol}//${window.location.hostname}:${defaultPort}`;
}

const runtimeApi = new ApiClient({
  baseUrl: import.meta.env.VITE_CLARTK_API_BASE_URL ?? browserBaseUrl(3000)
});
const devConsoleApi = new DevConsoleClient({
  baseUrl: import.meta.env.VITE_CLARTK_DEV_CONSOLE_API_BASE_URL ?? browserBaseUrl(3300)
});

type PanelKey =
  | "preview"
  | "overview"
  | "coordination"
  | "review"
  | "knowledge"
  | "docs"
  | "preferences";

const panelDefinitions: Array<{
  key: PanelKey;
  label: string;
  eyebrow: string;
  description: string;
}> = [
  {
    key: "preview",
    label: "Preview",
    eyebrow: "Decks",
    description: "Slide-style HTML previews with media, run history, and human review."
  },
  {
    key: "overview",
    label: "Overview",
    eyebrow: "Health",
    description: "Environment status, resolved endpoints, and backups."
  },
  {
    key: "coordination",
    label: "Coordination",
    eyebrow: "Queues",
    description: "Task queues, safe control actions, and run inspection."
  },
  {
    key: "review",
    label: "Review",
    eyebrow: "Evidence",
    description: "Playwright capture, deterministic analysis, and baseline supervision."
  },
  {
    key: "knowledge",
    label: "Knowledge",
    eyebrow: "Dev Memory",
    description: "Source documents, claims, and evaluation review."
  },
  {
    key: "docs",
    label: "Docs",
    eyebrow: "Filesystem",
    description: "Documentation and skill catalog snapshots."
  },
  {
    key: "preferences",
    label: "Preferences",
    eyebrow: "Signals",
    description: "Supervised decisions and derived scorecards."
  }
];

interface ConsoleState {
  me: AuthenticatedMe | null;
  overview: WorkspaceOverview | null;
  tasks: AgentTaskCollection | null;
  runs: AgentRunCollection | null;
  runDetail: AgentRunDetail | null;
  sourceDocuments: ResourceCollection<SourceDocumentRecord> | null;
  claims: ResourceCollection<KnowledgeClaimRecord> | null;
  evaluations: ResourceCollection<EvaluationResultRecord> | null;
  docs: DocsCatalogResponse | null;
  skills: SkillCatalogResponse | null;
  devProfile: DevPreferenceProfile | null;
  previewDecks: PresentationDeckSourceCollection | null;
  previewRuns: PreviewRunCollection | null;
  selectedPreviewRunId: number | null;
  selectedPreviewRun: PreviewRun | null;
  previewFeedback: PreviewFeedbackCollection | null;
  reviewRuns: UiReviewRunCollection | null;
  selectedReviewRunId: number | null;
  selectedReviewRun: UiReviewRun | null;
  reviewFindings: UiReviewFindingCollection | null;
  reviewBaselines: UiReviewBaselineCollection | null;
  selectedPanel: PanelKey;
  detailDepth: "compact" | "expanded";
  hudDensity: HudDensity;
  motionMode: MotionMode;
  selectedRunId: number | null;
  notice: string | null;
  error: string | null;
  loading: boolean;
}

export function App() {
  const [state, setState] = React.useState<ConsoleState>({
    me: null,
    overview: null,
    tasks: null,
    runs: null,
    runDetail: null,
    sourceDocuments: null,
    claims: null,
    evaluations: null,
    docs: null,
    skills: null,
    devProfile: null,
    previewDecks: null,
    previewRuns: null,
    selectedPreviewRunId: null,
    selectedPreviewRun: null,
    previewFeedback: null,
    reviewRuns: null,
    selectedReviewRunId: null,
    selectedReviewRun: null,
    reviewFindings: null,
    reviewBaselines: null,
    selectedPanel: "preview",
    detailDepth: "expanded",
    hudDensity: "compact",
    motionMode: "reduced",
    selectedRunId: null,
    notice: null,
    error: null,
    loading: true
  });
  const [loginForm, setLoginForm] = React.useState({
    email: "admin@clartk.local",
    password: "clartk-admin",
    displayName: "ClaRTK Admin"
  });
  const [authMode, setAuthMode] = React.useState<"login" | "bootstrap">("login");
  const lastPanelSignal = React.useRef<PanelKey | null>(null);
  const lastDetailSignal = React.useRef<"compact" | "expanded" | null>(null);
  const lastHudDensitySignal = React.useRef<HudDensity | null>(null);
  const lastMotionModeSignal = React.useRef<MotionMode | null>(null);
  const consoleLoadInFlight = React.useRef(false);
  const consoleLoadToken = React.useRef(0);
  const stateRef = React.useRef(state);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    void loadSession();
  }, []);

  React.useEffect(() => {
    if (!state.me || state.me.account.role !== "admin") {
      return;
    }
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void loadConsoleData(state.selectedRunId ?? undefined, false);
    }, 30000);
    return () => window.clearInterval(interval);
  }, [state.me, state.selectedRunId]);

  React.useEffect(() => {
    if (!state.me || state.me.account.role !== "admin" || state.loading || !state.devProfile) {
      return;
    }
    if (lastPanelSignal.current === state.selectedPanel) {
      return;
    }
    lastPanelSignal.current = state.selectedPanel;
    void devConsoleApi.createDevPreferenceSignal({
      signalKind: "landing_panel_selected",
      panelKey: state.selectedPanel,
      payload: { value: state.selectedPanel }
    }).then((signal) => {
      setState((current) => ({
        ...current,
        devProfile: current.devProfile
          ? {
              ...current.devProfile,
              recentSignals: [signal, ...current.devProfile.recentSignals].slice(0, 20)
            }
          : current.devProfile
      }));
    }).catch(() => {});
  }, [state.me, state.selectedPanel, state.loading, state.devProfile]);

  React.useEffect(() => {
    if (!state.me || state.me.account.role !== "admin" || state.loading || !state.devProfile) {
      return;
    }
    if (lastDetailSignal.current === state.detailDepth) {
      return;
    }
    lastDetailSignal.current = state.detailDepth;
    void devConsoleApi.createDevPreferenceSignal({
      signalKind: "detail_depth_selected",
      payload: { detailDepth: state.detailDepth, value: state.detailDepth }
    }).then((signal) => {
      setState((current) => ({
        ...current,
        devProfile: current.devProfile
          ? {
              ...current.devProfile,
              recentSignals: [signal, ...current.devProfile.recentSignals].slice(0, 20)
            }
          : current.devProfile
      }));
    }).catch(() => {});
  }, [state.me, state.detailDepth, state.loading, state.devProfile]);

  React.useEffect(() => {
    if (!state.me || state.me.account.role !== "admin" || state.loading || !state.devProfile) {
      return;
    }
    if (lastHudDensitySignal.current === state.hudDensity) {
      return;
    }
    lastHudDensitySignal.current = state.hudDensity;
    void devConsoleApi.createDevPreferenceSignal({
      signalKind: "hud_density_selected",
      payload: { density: state.hudDensity, value: state.hudDensity }
    }).then((signal) => {
      setState((current) => ({
        ...current,
        devProfile: current.devProfile
          ? {
              ...current.devProfile,
              recentSignals: [signal, ...current.devProfile.recentSignals].slice(0, 20)
            }
          : current.devProfile
      }));
    }).catch(() => {});
  }, [state.me, state.hudDensity, state.loading, state.devProfile]);

  React.useEffect(() => {
    if (!state.me || state.me.account.role !== "admin" || state.loading || !state.devProfile) {
      return;
    }
    if (lastMotionModeSignal.current === state.motionMode) {
      return;
    }
    lastMotionModeSignal.current = state.motionMode;
    void devConsoleApi.createDevPreferenceSignal({
      signalKind: "motion_mode_selected",
      payload: { motionMode: state.motionMode, value: state.motionMode }
    }).then((signal) => {
      setState((current) => ({
        ...current,
        devProfile: current.devProfile
          ? {
              ...current.devProfile,
              recentSignals: [signal, ...current.devProfile.recentSignals].slice(0, 20)
            }
          : current.devProfile
      }));
    }).catch(() => {});
  }, [state.me, state.motionMode, state.loading, state.devProfile]);

  React.useEffect(() => {
    const scorecard = asRecord(state.devProfile?.score?.scorecard);
    const preferredHudDensity = parseScorecardChoice(scorecard?.preferredHudDensity, [
      "compact",
      "comfortable"
    ]);
    const preferredMotionMode = parseScorecardChoice(scorecard?.preferredMotionMode, [
      "reduced",
      "standard"
    ]);
    if (!preferredHudDensity && !preferredMotionMode) {
      return;
    }
    setState((current) => {
      const nextHudDensity =
        current.hudDensity === "compact" && preferredHudDensity
          ? preferredHudDensity
          : current.hudDensity;
      const nextMotionMode =
        current.motionMode === "reduced" && preferredMotionMode
          ? preferredMotionMode
          : current.motionMode;
      if (
        nextHudDensity === current.hudDensity &&
        nextMotionMode === current.motionMode
      ) {
        return current;
      }
      return {
        ...current,
        hudDensity: nextHudDensity,
        motionMode: nextMotionMode
      };
    });
  }, [state.devProfile]);

  async function loadSession() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const sessionState = await runtimeApi.getSessionState();
      if (!sessionState.authenticated || !sessionState.me) {
        setState((current) => ({
          ...current,
          me: null,
          loading: false
        }));
        return;
      }
      setState((current) => ({ ...current, me: sessionState.me }));
      if (sessionState.me.account.role === "admin") {
        await loadConsoleData(undefined, true);
      } else {
        setState((current) => ({ ...current, loading: false }));
      }
    } catch {
      setState((current) => ({
        ...current,
        me: null,
        loading: false
      }));
    }
  }

  async function loadConsoleData(selectedRunId?: number, resetNotice = false) {
    if (consoleLoadInFlight.current) {
      return;
    }
    const loadToken = ++consoleLoadToken.current;
    consoleLoadInFlight.current = true;
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
      ...(resetNotice ? { notice: null } : {})
    }));
    try {
      const warnings: string[] = [];
      const previousState = stateRef.current;
      const primaryResults = await Promise.allSettled([
        devConsoleApi.getWorkspaceOverview(),
        devConsoleApi.listTasks(),
        devConsoleApi.listRuns(),
        devConsoleApi.listPreviewDecks()
      ]);
      if (consoleLoadToken.current !== loadToken) {
        return;
      }

      const overview = resolveSettledResult(
        primaryResults[0],
        previousState.overview,
        "workspace overview",
        warnings
      );
      const tasks = resolveSettledResult(primaryResults[1], previousState.tasks, "coordination tasks", warnings);
      const runs = resolveSettledResult(primaryResults[2], previousState.runs, "coordination runs", warnings);
      const previewDecks = resolveSettledResult(
        primaryResults[3],
        previousState.previewDecks,
        "preview decks",
        warnings
      );

      const nextRunId = selectedRunId ?? previousState.selectedRunId ?? runs?.items[0]?.agentRunId ?? null;
      const nextNotice =
        warnings.length > 0
          ? `Some sections are temporarily unavailable: ${warnings.join(", ")}.`
          : resetNotice
            ? null
            : previousState.notice;
      setState((current) => ({
        ...current,
        overview,
        tasks,
        previewDecks,
        runs,
        selectedRunId: nextRunId,
        notice: nextNotice,
        loading: false
      }));

      void loadRunDetailData(loadToken, nextRunId);
      void loadPreviewRunData(loadToken);
      void loadSupplementalConsoleData(loadToken);
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      consoleLoadInFlight.current = false;
    }
  }

  async function loadRunDetailData(loadToken: number, nextRunId: number | null) {
    const previousState = stateRef.current;
    const warnings: string[] = [];
    const detailResults = await Promise.allSettled([
      nextRunId === null ? Promise.resolve(previousState.runDetail) : devConsoleApi.getRun(nextRunId)
    ]);
    if (consoleLoadToken.current !== loadToken) {
      return;
    }

    const runDetail = resolveSettledResult(detailResults[0], previousState.runDetail, "run detail", warnings);

    setState((current) => ({
      ...current,
      runDetail,
      notice:
        warnings.length > 0
          ? `Some sections are temporarily unavailable: ${warnings.join(", ")}.`
          : current.notice
    }));
  }

  async function loadPreviewRunData(loadToken: number) {
    const previousState = stateRef.current;
    const warnings: string[] = [];
    const previewRunsResult = await Promise.allSettled([
      devConsoleApi.listPreviewRuns({ limit: 12 })
    ]);
    if (consoleLoadToken.current !== loadToken) {
      return;
    }

    const previewRuns = resolveSettledResult(
      previewRunsResult[0],
      previousState.previewRuns,
      "preview runs",
      warnings
    );
    const nextPreviewRunId =
      previousState.selectedPreviewRunId ?? previewRuns?.runs[0]?.previewRunId ?? null;
    const selectedPreviewRunSummary =
      nextPreviewRunId === null
        ? null
        : previewRuns?.runs.find((run) => run.previewRunId === nextPreviewRunId) ?? null;

    setState((current) => ({
      ...current,
      previewRuns,
      selectedPreviewRunId: nextPreviewRunId,
      selectedPreviewRun: selectedPreviewRunSummary ?? current.selectedPreviewRun,
      notice:
        warnings.length > 0
          ? `Some sections are temporarily unavailable: ${warnings.join(", ")}.`
          : current.notice
    }));

    const detailResults = await Promise.allSettled([
      nextPreviewRunId === null
        ? Promise.resolve(stateRef.current.selectedPreviewRun)
        : devConsoleApi.getPreviewRun(nextPreviewRunId),
      nextPreviewRunId === null
        ? Promise.resolve(stateRef.current.previewFeedback)
        : devConsoleApi.listPreviewFeedback({
            previewRunId: nextPreviewRunId,
            limit: 200
          })
    ]);
    if (consoleLoadToken.current !== loadToken) {
      return;
    }

    const selectedPreviewRun = resolveSettledResult(
      detailResults[0],
      stateRef.current.selectedPreviewRun,
      "preview run detail",
      warnings
    );
    const previewFeedback = resolveSettledResult(
      detailResults[1],
      stateRef.current.previewFeedback,
      "preview feedback",
      warnings
    );

    setState((current) => ({
      ...current,
      selectedPreviewRun,
      previewFeedback,
      notice:
        warnings.length > 0
          ? `Some sections are temporarily unavailable: ${warnings.join(", ")}.`
          : current.notice
    }));
  }

  async function loadSupplementalConsoleData(loadToken: number) {
    const previousState = stateRef.current;
    const warnings: string[] = [];
    const secondaryResults = await Promise.allSettled([
      devConsoleApi.listUiReviewRuns({ surface: "dev-console-web", limit: 12 }),
      devConsoleApi.listUiReviewBaselines({ surface: "dev-console-web", limit: 24 }),
      devConsoleApi.listDocsCatalog(),
      devConsoleApi.listSkills(),
      devConsoleApi.listSourceDocuments(),
      devConsoleApi.listClaims(),
      devConsoleApi.listEvaluations(),
      devConsoleApi.getDevProfile()
    ]);
    if (consoleLoadToken.current !== loadToken) {
      return;
    }

    const reviewRuns = resolveSettledResult(
      secondaryResults[0],
      previousState.reviewRuns,
      "ui review runs",
      warnings
    );
    const reviewBaselines = resolveSettledResult(
      secondaryResults[1],
      previousState.reviewBaselines,
      "ui review baselines",
      warnings
    );
    const docs = resolveSettledResult(secondaryResults[2], previousState.docs, "docs catalog", warnings);
    const skills = resolveSettledResult(secondaryResults[3], previousState.skills, "skills catalog", warnings);
    const sourceDocuments = resolveSettledResult(
      secondaryResults[4],
      previousState.sourceDocuments,
      "source documents",
      warnings
    );
    const claims = resolveSettledResult(secondaryResults[5], previousState.claims, "claims", warnings);
    const evaluations = resolveSettledResult(
      secondaryResults[6],
      previousState.evaluations,
      "evaluations",
      warnings
    );
    const devProfile = resolveSettledResult(
      secondaryResults[7],
      previousState.devProfile,
      "dev profile",
      warnings
    );

    const nextReviewRunId =
      previousState.selectedReviewRunId ?? reviewRuns?.runs[0]?.uiReviewRunId ?? null;
    const reviewDetailResults = await Promise.allSettled([
      nextReviewRunId === null
        ? Promise.resolve(previousState.selectedReviewRun)
        : devConsoleApi.getUiReviewRun(nextReviewRunId),
      nextReviewRunId === null
        ? Promise.resolve(previousState.reviewFindings)
        : devConsoleApi.listUiReviewFindings({
            uiReviewRunId: nextReviewRunId,
            limit: 200
          })
    ]);
    if (consoleLoadToken.current !== loadToken) {
      return;
    }

    const selectedReviewRun = resolveSettledResult(
      reviewDetailResults[0],
      previousState.selectedReviewRun,
      "ui review detail",
      warnings
    );
    const reviewFindings = resolveSettledResult(
      reviewDetailResults[1],
      previousState.reviewFindings,
      "ui review findings",
      warnings
    );

    setState((current) => ({
      ...current,
      sourceDocuments,
      claims,
      evaluations,
      docs,
      skills,
      devProfile,
      reviewRuns,
      selectedReviewRunId: nextReviewRunId,
      selectedReviewRun,
      reviewFindings,
      reviewBaselines,
      notice:
        warnings.length > 0
          ? `Some sections are temporarily unavailable: ${warnings.join(", ")}.`
          : current.notice
    }));
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState((current) => ({ ...current, error: null }));
    try {
      if (authMode === "bootstrap") {
        await runtimeApi.bootstrapLocalAccount(loginForm);
      } else {
        await runtimeApi.login({
          email: loginForm.email,
          password: loginForm.password
        });
      }
      await loadSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState((current) => ({
        ...current,
        error:
          authMode === "login" && message.includes("invalid email or password")
            ? "Sign-in failed. Use the current runtime admin password for this database, or switch to bootstrap only if auth.account is empty."
            : message
      }));
    }
  }

  async function handleLogout() {
    await runtimeApi.logout();
    setState((current) => ({
      ...current,
      me: null,
      overview: null,
      tasks: null,
      runs: null,
      runDetail: null,
      sourceDocuments: null,
      claims: null,
      evaluations: null,
      docs: null,
      skills: null,
      devProfile: null,
      previewDecks: null,
      previewRuns: null,
      selectedPreviewRunId: null,
      selectedPreviewRun: null,
      previewFeedback: null,
      reviewRuns: null,
      selectedReviewRunId: null,
      selectedReviewRun: null,
      reviewFindings: null,
      reviewBaselines: null,
      notice: "Signed out.",
      error: null
    }));
  }

  async function handleEnqueue(taskKind: string) {
    try {
      await devConsoleApi.enqueueTask({ taskKind });
      await loadConsoleData(state.selectedRunId ?? undefined);
      setState((current) => ({
        ...current,
        notice: `Enqueued ${taskKind}.`
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleRetrySelectedTask() {
    const task = state.runDetail?.task;
    if (!task) {
      return;
    }
    try {
      await devConsoleApi.retryTask(task.agentTaskId, "retried from development interface");
      await loadConsoleData(state.selectedRunId ?? undefined);
      setState((current) => ({
        ...current,
        notice: `Retried task ${task.agentTaskId}.`
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleSupervision(
    decisionKind: "accepted" | "rejected" | "overridden",
    subjectKey: string,
    chosenValue?: string
  ) {
    try {
      const profile = await devConsoleApi.createDevPreferenceDecision({
        decisionKind,
        subjectKind: "recommended_action",
        subjectKey,
        chosenValue,
        payload: {
          selectedPanel: state.selectedPanel,
          detailDepth: state.detailDepth
        }
      });
      setState((current) => ({
        ...current,
        devProfile: profile,
        notice: `${decisionKind} recommendation ${subjectKey}.`
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handlePreviewStart(deckKey: string) {
    try {
      const run = await devConsoleApi.startPreviewRun({
        deckKey,
        viewportJson: { width: 1440, height: 900 }
      });
      await loadConsoleData(state.selectedRunId ?? undefined);
      setState((current) => ({
        ...current,
        selectedPreviewRunId: run.previewRunId,
        selectedPreviewRun: run,
        previewFeedback: { items: [], source: "dev-memory", total: 0 },
        notice: `Started preview run #${run.previewRunId} for ${deckKey}.`
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handlePreviewRunSelection(previewRunId: number) {
    try {
      const [run, feedback] = await Promise.all([
        devConsoleApi.getPreviewRun(previewRunId),
        devConsoleApi.listPreviewFeedback({ previewRunId, limit: 200 })
      ]);
      setState((current) => ({
        ...current,
        selectedPreviewRunId: previewRunId,
        selectedPreviewRun: run,
        previewFeedback: feedback
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handlePreviewFeedbackSubmit(
    previewRunId: number,
    feedbackKind: string,
    comment: string,
    slideId?: string | null
  ) {
    try {
      await devConsoleApi.createPreviewFeedback({
        previewRunId,
        feedbackKind,
        comment,
        slideId,
        payload: {
          selectedPanel: state.selectedPanel,
          detailDepth: state.detailDepth
        }
      });
      await handlePreviewRunSelection(previewRunId);
      setState((current) => ({
        ...current,
        notice: `${feedbackKind} recorded for preview run #${previewRunId}.`
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handlePreviewSubpaneChange(mode: "conversation" | "deck") {
    if (!state.me || state.me.account.role !== "admin" || state.loading || !state.devProfile) {
      return;
    }
    try {
      const signal = await devConsoleApi.createDevPreferenceSignal({
        signalKind: "preview_subpane_selected",
        panelKey: "preview",
        payload: { subpane: mode, value: mode }
      });
      setState((current) => ({
        ...current,
        devProfile: current.devProfile
          ? {
              ...current.devProfile,
              recentSignals: [signal, ...current.devProfile.recentSignals].slice(0, 20)
            }
          : current.devProfile
      }));
    } catch {
      // preference learning stays best-effort
    }
  }

  async function handleRunSelection(agentRunId: number) {
    try {
      const detail = await devConsoleApi.getRun(agentRunId);
      setState((current) => ({
        ...current,
        runDetail: detail,
        selectedRunId: agentRunId
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleUiReviewStart() {
    try {
      const run = await devConsoleApi.startUiReview({
        surface: "dev-console-web",
        scenarioSet: "default",
        baseUrl: window.location.origin,
        viewportJson: { width: 1440, height: 900 },
        manifestJson: {
          initiatedFromPanel: state.selectedPanel,
          detailDepth: state.detailDepth
        }
      });
      await loadConsoleData(state.selectedRunId ?? undefined);
      setState((current) => ({
        ...current,
        selectedPanel: "review",
        selectedReviewRunId: run.uiReviewRunId,
        selectedReviewRun: run,
        reviewFindings: { findings: [], source: "dev-memory", total: 0 },
        notice: `Started UI review run #${run.uiReviewRunId}.`
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleUiReviewSelection(uiReviewRunId: number) {
    try {
      const [run, findings] = await Promise.all([
        devConsoleApi.getUiReviewRun(uiReviewRunId),
        devConsoleApi.listUiReviewFindings({ uiReviewRunId, limit: 200 })
      ]);
      setState((current) => ({
        ...current,
        selectedReviewRunId: uiReviewRunId,
        selectedReviewRun: run,
        reviewFindings: findings
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleUiReviewFindingReview(findingId: number, status: "accepted" | "rejected") {
    try {
      await devConsoleApi.reviewUiFinding({
        findingId,
        status,
        reviewPayload: {
          selectedPanel: state.selectedPanel,
          detailDepth: state.detailDepth
        }
      });
      if (state.selectedReviewRunId !== null) {
        await handleUiReviewSelection(state.selectedReviewRunId);
      }
      setState((current) => ({
        ...current,
        notice: `${status} UI review finding #${findingId}.`
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function handleUiReviewPromoteBaseline() {
    if (state.selectedReviewRunId === null) {
      return;
    }
    try {
      const run = await devConsoleApi.promoteUiReviewBaseline({
        uiReviewRunId: state.selectedReviewRunId
      });
      await loadConsoleData(state.selectedRunId ?? undefined);
      setState((current) => ({
        ...current,
        selectedReviewRunId: run.uiReviewRunId,
        notice: `Queued baseline promotion for UI review run #${run.uiReviewRunId}.`
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  const isAdmin = state.me?.account.role === "admin";
  const activePanel =
    panelDefinitions.find((panel) => panel.key === state.selectedPanel) ?? panelDefinitions[0];
  const healthyServiceCount = state.overview?.services.filter((service) => service.status === "ok").length ?? 0;
  const totalServiceCount = state.overview?.services.length ?? 0;
  const selectedRunLabel = state.runDetail?.run
    ? `#${state.runDetail.run.agentRunId}`
    : state.runs?.items[0]
      ? `#${state.runs.items[0].agentRunId}`
      : "none";
  const panelMetrics: Record<PanelKey, string> = {
    preview: `${state.previewRuns?.runs.length ?? 0} runs`,
    overview: `${healthyServiceCount}/${totalServiceCount || 0} healthy`,
    coordination: `${state.tasks?.items.length ?? 0} tasks`,
    review: `${state.reviewRuns?.runs.length ?? 0} reviews`,
    knowledge: `${state.claims?.items.length ?? 0} claims`,
    docs: `${state.docs?.items.length ?? 0} docs`,
    preferences: `${state.devProfile?.recentSignals.length ?? 0} signals`
  };

  let selectedPanelContent: React.ReactNode = null;
  if (state.selectedPanel === "preview") {
    selectedPanelContent = (
      <PreviewPanel
        previewDecks={state.previewDecks}
        previewRuns={state.previewRuns}
        selectedPreviewRunId={state.selectedPreviewRunId}
        selectedPreviewRun={state.selectedPreviewRun}
        previewFeedback={state.previewFeedback}
        loading={state.loading}
        onStartPreview={handlePreviewStart}
        onSelectPreviewRun={handlePreviewRunSelection}
        onSubmitFeedback={handlePreviewFeedbackSubmit}
        onStageModeChange={handlePreviewSubpaneChange}
      />
    );
  } else if (state.selectedPanel === "overview") {
    selectedPanelContent = <OverviewPanel overview={state.overview} loading={state.loading} />;
  } else if (state.selectedPanel === "coordination") {
    selectedPanelContent = (
      <CoordinationPanel
        tasks={state.tasks}
        runs={state.runs}
        runDetail={state.runDetail}
        loading={state.loading}
        onSelectRun={handleRunSelection}
        onRetrySelectedTask={handleRetrySelectedTask}
        onEnqueue={handleEnqueue}
        onSupervision={handleSupervision}
      />
    );
  } else if (state.selectedPanel === "review") {
    selectedPanelContent = (
      <ReviewPanel
        reviewRuns={state.reviewRuns}
        selectedReviewRun={state.selectedReviewRun}
        reviewFindings={state.reviewFindings}
        reviewBaselines={state.reviewBaselines}
        detailDepth={state.detailDepth}
        loading={state.loading}
        onStartReview={handleUiReviewStart}
        onSelectReviewRun={handleUiReviewSelection}
        onReviewFinding={handleUiReviewFindingReview}
        onPromoteBaseline={handleUiReviewPromoteBaseline}
      />
    );
  } else if (state.selectedPanel === "knowledge") {
    selectedPanelContent = (
      <KnowledgePanel
        sourceDocuments={state.sourceDocuments}
        claims={state.claims}
        evaluations={state.evaluations}
        detailDepth={state.detailDepth}
      />
    );
  } else if (state.selectedPanel === "docs") {
    selectedPanelContent = (
      <DocsPanel docs={state.docs} skills={state.skills} detailDepth={state.detailDepth} />
    );
  } else if (state.selectedPanel === "preferences") {
    selectedPanelContent = (
      <PreferencesPanel
        me={state.me}
        devProfile={state.devProfile}
        onSupervision={handleSupervision}
      />
    );
  }

  const sessionPanel = (
    <Panel title="Operator Session" eyebrow="Access" accent="muted">
      {state.me ? (
        <div className="hud-session-stack">
          <div className="hud-session-row">
            <StatusPill status={isAdmin ? "ok" : "degraded"}>
              {state.me.account.role}
            </StatusPill>
            <strong>{state.me.account.displayName}</strong>
            <span className="hud-muted">{state.me.account.email}</span>
            <button onClick={() => void handleLogout()}>Sign out</button>
          </div>
          {!isAdmin ? <p>Development console access is limited to admin accounts.</p> : null}
        </div>
      ) : (
        <form onSubmit={handleAuthSubmit} className="hud-auth-form">
          <div className="hud-auth-toggle">
            <button type="button" onClick={() => setAuthMode("login")}>
              Login
            </button>
            <button type="button" onClick={() => setAuthMode("bootstrap")}>
              Bootstrap
            </button>
          </div>
          <label>
            Email
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={loginForm.email}
              onChange={(event) =>
                setLoginForm((current) => ({ ...current, email: event.target.value }))
              }
              style={inputStyle}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={authMode === "bootstrap" ? "new-password" : "current-password"}
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((current) => ({ ...current, password: event.target.value }))
              }
              style={inputStyle}
            />
          </label>
          {authMode === "bootstrap" ? (
            <label>
              Display name
              <input
                name="displayName"
                autoComplete="name"
                value={loginForm.displayName}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, displayName: event.target.value }))
                }
                style={inputStyle}
              />
            </label>
          ) : null}
          <button type="submit">{authMode === "bootstrap" ? "Create admin" : "Sign in"}</button>
        </form>
      )}
    </Panel>
  );

  return (
    <AppFrame
      title="ClaRTK Development Interface"
      subtitle="Military-ops HUD for preview runs, supervised review, and bounded development coordination."
      density={state.hudDensity}
      motionMode={state.motionMode}
    >
      {isAdmin ? (
        <div className="console-shell">
          <div className="telemetry-strip">
            <div className="telemetry-group">
              <TelemetryChip label="Workspace" value={state.overview?.status ?? (state.loading ? "loading" : "unknown")} />
              <TelemetryChip label="Services" value={`${healthyServiceCount}/${totalServiceCount || 0}`} />
              <TelemetryChip label="Preview" value={state.selectedPreviewRun ? `#${state.selectedPreviewRun.previewRunId}` : "idle"} />
              <TelemetryChip label="Review" value={state.selectedReviewRun ? `#${state.selectedReviewRun.uiReviewRunId}` : "idle"} />
              <TelemetryChip label="Queue" value={selectedRunLabel} />
            </div>
            <div className="telemetry-controls">
              <label className="console-inline-field">
                <span>Density</span>
                <select
                  value={state.hudDensity}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      hudDensity: event.target.value as HudDensity
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="compact">compact</option>
                  <option value="comfortable">comfortable</option>
                </select>
              </label>
              <label className="console-inline-field">
                <span>Motion</span>
                <select
                  value={state.motionMode}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      motionMode: event.target.value as MotionMode
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="reduced">reduced</option>
                  <option value="standard">standard</option>
                </select>
              </label>
              <label className="console-inline-field">
                <span>Detail depth</span>
                <select
                  value={state.detailDepth}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      detailDepth: event.target.value as "compact" | "expanded"
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="compact">compact</option>
                  <option value="expanded">expanded</option>
                </select>
              </label>
              <button onClick={() => void loadConsoleData(state.selectedRunId ?? undefined)}>
                Refresh
              </button>
            </div>
          </div>

          {state.notice ? <Message tone="ok">{state.notice}</Message> : null}
          {state.error ? <Message tone="error">{state.error}</Message> : null}

          <div className="console-grid">
            <aside className="command-rail">
              <Panel title="Console Surface" eyebrow="Command Rail" accent="muted">
                <div className="console-nav">
                  {panelDefinitions.map((panel) => (
                    <button
                      key={panel.key}
                      className={`console-nav-button${state.selectedPanel === panel.key ? " is-active" : ""}`}
                      onClick={() => setState((current) => ({ ...current, selectedPanel: panel.key }))}
                    >
                      <span className="console-nav-title">{panel.label}</span>
                      <span className="console-nav-description">{panel.description}</span>
                      <span className="console-nav-metric">{panelMetrics[panel.key]}</span>
                    </button>
                  ))}
                </div>
              </Panel>
              {sessionPanel}
            </aside>

            <main className="console-main">
              {selectedPanelContent}
            </main>

            <aside className="context-rail">
              <Panel title="Current Focus" eyebrow={activePanel.eyebrow} accent="muted">
                <div className="console-focus-grid">
                  <InfoCard label="Panel" value={activePanel.label} detail={activePanel.description} />
                  <InfoCard
                    label="Density"
                    value={state.hudDensity}
                    detail={
                      state.hudDensity === "compact"
                        ? "High-density telemetry and tighter cards."
                        : "More breathing room for longer inspection."
                    }
                  />
                  <InfoCard
                    label="Motion"
                    value={state.motionMode}
                    detail={
                      state.motionMode === "reduced"
                        ? "State changes stay restrained."
                        : "Ambient transitions enabled."
                    }
                  />
                  <InfoCard
                    label="Selected run"
                    value={selectedRunLabel}
                    detail={state.runDetail?.run.taskSlug ?? "Choose a run from coordination."}
                  />
                  <InfoCard
                    label="Preview stage"
                    value={state.selectedPreviewRun?.status ?? "idle"}
                    detail={state.selectedPreviewRun?.deckKey ?? "Select a deck to inspect render output."}
                  />
                  <InfoCard
                    label="Review lane"
                    value={state.selectedReviewRun?.status ?? "idle"}
                    detail={
                      state.reviewFindings?.findings.length
                        ? `${state.reviewFindings.findings.length} findings loaded`
                        : "No findings loaded."
                    }
                  />
                </div>
              </Panel>
              <Panel title="Mission Brief" eyebrow="Ops Context" accent="muted">
                <div className="detail-stack">
                  <div className="detail-card">
                    <div className="section-heading">
                      <h4>Primary objective</h4>
                      <p>Preview remains the dominant surface for usable HTML review artifacts.</p>
                    </div>
                    <p className="detail-copy">
                      Use this HUD to render concepts, inspect slide-linked evidence, and keep
                      human approvals attached to the same development run.
                    </p>
                  </div>
                  <div className="detail-card">
                    <FactGrid
                      entries={[
                        { label: "Deck sources", value: String(state.previewDecks?.items.length ?? 0) },
                        { label: "Preview runs", value: String(state.previewRuns?.runs.length ?? 0) },
                        { label: "Review baselines", value: String(state.reviewBaselines?.baselines.length ?? 0) },
                        { label: "Preference signals", value: String(state.devProfile?.recentSignals.length ?? 0) }
                      ]}
                    />
                  </div>
                </div>
              </Panel>
            </aside>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: tokens.space.lg, maxWidth: 480 }}>
          {sessionPanel}
          {state.notice ? <Message tone="ok">{state.notice}</Message> : null}
          {state.error ? <Message tone="error">{state.error}</Message> : null}
        </div>
      )}
    </AppFrame>
  );
}

function resolveSettledResult<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  label: string,
  warnings: string[]
): T {
  if (result.status === "fulfilled") {
    return result.value;
  }

  warnings.push(label);
  return fallback;
}

function AppFrame(props: {
  title: string;
  subtitle: string;
  density: HudDensity;
  motionMode: MotionMode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`hud-frame hud-density-${props.density} hud-motion-${props.motionMode}`}
    >
      <header className="hud-hero">
        <div className="hud-hero-copy">
          <span className="hud-kicker">ClaRTK // Development Interface</span>
          <h1>{props.title}</h1>
          <p>{props.subtitle}</p>
        </div>
      </header>
      <div className="hud-body">{props.children}</div>
    </div>
  );
}

function Panel(props: {
  title: string;
  eyebrow: string;
  accent?: "muted" | "default";
  children: React.ReactNode;
}) {
  return (
    <section className={`hud-panel${props.accent === "muted" ? " hud-panel-muted" : ""}`}>
      <header className="hud-panel-header">
        <span className="hud-panel-eyebrow">{props.eyebrow}</span>
        <h2>{props.title}</h2>
      </header>
      <div className="hud-panel-body">{props.children}</div>
    </section>
  );
}

function StatusPill(props: {
  status: "ok" | "neutral" | "degraded";
  children: React.ReactNode;
}) {
  return (
    <span className={`hud-status-pill hud-status-${props.status}`}>{props.children}</span>
  );
}

function TelemetryChip(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="telemetry-chip">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PreviewPanel(props: {
  previewDecks: PresentationDeckSourceCollection | null;
  previewRuns: PreviewRunCollection | null;
  selectedPreviewRunId: number | null;
  selectedPreviewRun: PreviewRun | null;
  previewFeedback: PreviewFeedbackCollection | null;
  loading: boolean;
  onStartPreview: (deckKey: string) => void;
  onSelectPreviewRun: (previewRunId: number) => void;
  onSubmitFeedback: (
    previewRunId: number,
    feedbackKind: string,
    comment: string,
    slideId?: string | null
  ) => void;
  onStageModeChange: (mode: "conversation" | "deck") => void;
}) {
  const decks = props.previewDecks?.items ?? [];
  const runs = props.previewRuns?.runs ?? [];
  const selectedRun =
    props.selectedPreviewRun ??
    (props.selectedPreviewRunId === null
      ? null
      : runs.find((run) => run.previewRunId === props.selectedPreviewRunId) ?? null);
  const feedbackItems = props.previewFeedback?.items ?? [];
  const manifest = parsePreviewManifest(selectedRun);
  const previewAnalysis = summarizePreviewAnalysis(selectedRun);
  const slides = manifest?.slides ?? [];
  const [selectedDeckKey, setSelectedDeckKey] = React.useState("");
  const [focusedSlideId, setFocusedSlideId] = React.useState<string | null>(null);
  const [feedbackSlideId, setFeedbackSlideId] = React.useState("");
  const [feedbackComment, setFeedbackComment] = React.useState("");
  const [stageMode, setStageMode] = React.useState<"conversation" | "deck">("conversation");
  const lastStageModeSignal = React.useRef<"conversation" | "deck" | null>(null);
  const deckSignature = decks.map((deck) => deck.deckKey).join("|");
  const slideSignature = slides.map((slide) => slide.slideId).join("|");
  const selectedDeck = decks.find((deck) => deck.deckKey === selectedDeckKey) ?? decks[0] ?? null;
  const selectedSlide =
    slides.find((slide) => slide.slideId === focusedSlideId) ?? slides[0] ?? null;
  const previewHtmlPath = extractPreviewHtmlPath(selectedRun);
  const previewUrl = previewHtmlPath ? devConsoleApi.previewAssetUrl(previewHtmlPath) : null;
  const selectedPreviewDeckKey = selectedRun?.deckKey ?? null;
  const runFeedbackItems = feedbackItems.filter((item) => !item.slideId);
  const slideFeedbackItems = selectedSlide
    ? feedbackItems.filter((item) => item.slideId === selectedSlide.slideId)
    : [];
  const communicationItems =
    selectedSlide && slideFeedbackItems.length
      ? [...slideFeedbackItems, ...runFeedbackItems]
      : runFeedbackItems.length
        ? runFeedbackItems
        : slideFeedbackItems;
  const communicationSummary = summarizePreviewFeedback(communicationItems);

  React.useEffect(() => {
    setSelectedDeckKey((current) => {
      if (current && decks.some((deck) => deck.deckKey === current)) {
        return current;
      }
      if (
        selectedPreviewDeckKey &&
        decks.some((deck) => deck.deckKey === selectedPreviewDeckKey)
      ) {
        return selectedPreviewDeckKey;
      }
      return decks[0]?.deckKey ?? "";
    });
  }, [deckSignature, selectedPreviewDeckKey, decks]);

  React.useEffect(() => {
    setFocusedSlideId((current) => {
      if (current && slides.some((slide) => slide.slideId === current)) {
        return current;
      }
      return slides[0]?.slideId ?? null;
    });
  }, [selectedRun?.previewRunId, slideSignature, slides]);

  React.useEffect(() => {
    setFeedbackSlideId("");
    setFeedbackComment("");
    setStageMode("conversation");
  }, [selectedRun?.previewRunId]);

  React.useEffect(() => {
    if (lastStageModeSignal.current === stageMode) {
      return;
    }
    lastStageModeSignal.current = stageMode;
    void props.onStageModeChange(stageMode);
  }, [props.onStageModeChange, stageMode]);

  function submitFeedback(feedbackKind: string) {
    if (!selectedRun) {
      return;
    }
    void props.onSubmitFeedback(
      selectedRun.previewRunId,
      feedbackKind,
      feedbackComment.trim(),
      feedbackSlideId || null
    );
    setFeedbackComment("");
  }

  return (
    <Panel title="Preview Workspace" eyebrow="Decks">
      <div className="preview-summary-row">
        <InfoCard
          label="Decks"
          value={String(decks.length)}
          detail={selectedDeck?.deckKey ?? "Choose a deck source to start a preview run."}
        />
        <InfoCard
          label="Runs"
          value={String(runs.length)}
          detail={
            selectedRun
              ? `Selected #${selectedRun.previewRunId} · ${selectedRun.status}`
              : "No preview run selected."
          }
        />
        <InfoCard
          label="Slides"
          value={String(slides.length)}
          detail={
            previewAnalysis.slideCount
              ? `${previewAnalysis.slideCount} analyzed screenshots`
              : "Manifest only"
          }
        />
      </div>

      <div className="preview-workspace">
        <aside className="preview-sidebar">
          <section className="preview-section">
            <div className="preview-section-header">
              <div>
                <h3>Deck Sources</h3>
                <p>Markdown and preview companion files are cataloged before render.</p>
              </div>
              <button
                onClick={() => void props.onStartPreview(selectedDeckKey)}
                disabled={!selectedDeckKey}
              >
                Start preview run
              </button>
            </div>
            <div className="preview-list">
              {decks.length ? (
                decks.map((deck) => (
                  <button
                    key={deck.deckKey}
                    className={`preview-list-item${selectedDeckKey === deck.deckKey ? " is-active" : ""}`}
                    onClick={() => setSelectedDeckKey(deck.deckKey)}
                  >
                    <span className="preview-list-title">{deck.title}</span>
                    <span className="preview-list-subtitle">{deck.deckKey}</span>
                    <span className="preview-list-meta">
                      {deck.slideCount} slides · {deck.hasPreviewCompanion ? "companion ready" : "markdown only"}
                    </span>
                  </button>
                ))
              ) : (
                <p className="preview-empty-state">
                  {props.loading ? "Loading preview decks…" : "No preview decks found."}
                </p>
              )}
            </div>
          </section>

          <section className="preview-section">
            <div className="preview-section-header">
              <div>
                <h3>Preview Runs</h3>
                <p>Render and analysis history from the dev plane.</p>
              </div>
            </div>
            <div className="preview-list">
              {runs.length ? (
                runs.map((run) => (
                  <button
                    key={run.previewRunId}
                    className={`preview-list-item${selectedRun?.previewRunId === run.previewRunId ? " is-active" : ""}`}
                    onClick={() => void props.onSelectPreviewRun(run.previewRunId)}
                  >
                    <div className="preview-run-heading">
                      <span className="preview-list-title">Run #{run.previewRunId}</span>
                      <StatusPill status={statusToneForPreviewRun(run.status)}>{run.status}</StatusPill>
                    </div>
                    <span className="preview-list-subtitle">{run.deckKey}</span>
                    <span className="preview-list-meta">Updated {formatTimestamp(run.updatedAt)}</span>
                  </button>
                ))
              ) : (
                <p className="preview-empty-state">
                  {props.loading ? "Loading preview runs…" : "No preview runs recorded yet."}
                </p>
              )}
            </div>
          </section>
        </aside>

        <section className="preview-stage-column">
          <div className="preview-stage-toolbar">
            <div>
              <h3>{selectedRun?.title ?? "Select a preview run"}</h3>
              <p>
                {selectedRun
                  ? `${selectedRun.deckKey} · ${selectedRun.browser} · ${formatViewport(selectedRun.viewportJson)}`
                  : "Open a generated HTML deck here after starting or selecting a run."}
              </p>
            </div>
            {selectedRun ? (
              <div className="preview-stage-actions">
                <div className="preview-chip-row">
                  <StatusPill status={statusToneForPreviewRun(selectedRun.status)}>
                    {selectedRun.status}
                  </StatusPill>
                  <StatusPill status={previewAnalysis.hasWarnings ? "neutral" : "ok"}>
                    {previewAnalysis.hasWarnings ? "analysis warnings" : "analysis clean"}
                  </StatusPill>
                </div>
                <div className="preview-stage-toggle">
                  <button
                    className={stageMode === "conversation" ? "is-active" : ""}
                    onClick={() => setStageMode("conversation")}
                  >
                    Slide review
                  </button>
                  <button
                    className={stageMode === "deck" ? "is-active" : ""}
                    onClick={() => setStageMode("deck")}
                    disabled={!previewUrl}
                  >
                    Full deck
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="preview-stage-frame">
            {selectedRun && stageMode === "conversation" ? (
              <SlideConversationStage
                run={selectedRun}
                selectedSlide={selectedSlide}
                slides={slides}
                communicationItems={communicationItems}
                communicationSummary={communicationSummary}
                previewUrl={previewUrl}
                onSelectSlide={setFocusedSlideId}
              />
            ) : previewUrl ? (
              <iframe
                key={previewUrl}
                title={selectedRun?.title ?? "Preview run"}
                src={previewUrl}
                sandbox="allow-scripts allow-popups allow-presentation"
                className="preview-iframe"
              />
            ) : selectedDeck ? (
              <DeckSourcePreview deck={selectedDeck} />
            ) : (
              <PreviewEmptyState loading={props.loading} />
            )}
          </div>

          <div className="preview-stage-footer">
            <div className="preview-paths">
              <span>Markdown: {manifest?.markdownPath ?? selectedRun?.markdownPath ?? "n/a"}</span>
              <span>Companion: {manifest?.companionPath ?? selectedRun?.companionPath ?? "none"}</span>
              <span>HTML: {previewHtmlPath ?? "not rendered yet"}</span>
            </div>
            {previewUrl ? (
              <a href={previewUrl} target="_blank" rel="noreferrer">
                Open preview artifact
              </a>
            ) : null}
          </div>

          {previewAnalysis.hasWarnings ? (
            <div className="preview-warning-block">
              {previewAnalysis.warnings.length ? <p>{previewAnalysis.warnings.join(" ")}</p> : null}
              {previewAnalysis.consoleErrors.length ? (
                <p>Console errors: {previewAnalysis.consoleErrors.join(" | ")}</p>
              ) : null}
              {previewAnalysis.requestFailures.length ? (
                <p>Request failures: {previewAnalysis.requestFailures.join(" | ")}</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="preview-inspector">
          <section className="preview-section">
            <div className="preview-section-header">
              <div>
                <h3>Slides</h3>
                <p>Slide navigation and source data come from `manifestJson`.</p>
              </div>
            </div>
            <div className="preview-slide-list">
              {slides.length ? (
                slides.map((slide, index) => (
                  <button
                    key={slide.slideId}
                    className={`preview-slide-button${selectedSlide?.slideId === slide.slideId ? " is-active" : ""}`}
                    onClick={() => setFocusedSlideId(slide.slideId)}
                  >
                    <span className="preview-slide-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="preview-slide-copy">
                      <strong>{slide.title}</strong>
                      <span>{slide.slideId}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="preview-empty-state">
                  {selectedRun ? "No slide manifest data available yet." : "Select a preview run to inspect slides."}
                </p>
              )}
            </div>
          </section>

          <section className="preview-section">
            <div className="preview-section-header">
              <div>
                <h3>Slide Source</h3>
                <p>{selectedSlide ? selectedSlide.slideId : "No slide selected."}</p>
              </div>
            </div>
            {selectedSlide ? (
              <div className="preview-slide-detail">
                <div className="preview-detail-group">
                  <span className="preview-detail-label">Audience goal</span>
                  <p>{selectedSlide.audienceGoal || "Not specified."}</p>
                </div>
                <div className="preview-detail-group">
                  <span className="preview-detail-label">Visual guidance</span>
                  <p>{selectedSlide.visualGuidance || "Not specified."}</p>
                </div>
                <div className="preview-detail-group">
                  <span className="preview-detail-label">Bullets</span>
                  {selectedSlide.bullets.length ? (
                    <ul className="preview-detail-list">
                      {selectedSlide.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No bullets captured.</p>
                  )}
                </div>
                <div className="preview-detail-group">
                  <span className="preview-detail-label">Media</span>
                  {selectedSlide.media.length ? (
                    <ul className="preview-detail-list">
                      {selectedSlide.media.map((media, index) => (
                        <li key={`${media.kind}-${media.source ?? index}`}>
                          {media.kind}
                          {media.source ? ` · ${media.source}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No media declared.</p>
                  )}
                </div>
                <div className="preview-detail-group">
                  <span className="preview-detail-label">Evidence paths</span>
                  {selectedSlide.evidencePaths.length ? (
                    <ul className="preview-detail-list">
                      {selectedSlide.evidencePaths.map((evidencePath) => (
                        <li key={evidencePath}>{evidencePath}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No evidence references listed.</p>
                  )}
                </div>
                <div className="preview-detail-group">
                  <span className="preview-detail-label">Speaker notes</span>
                  <p>{selectedSlide.speakerNotes || "No speaker notes."}</p>
                </div>
                {selectedSlide.screenshotPath ? (
                  <a
                    href={devConsoleApi.previewAssetUrl(selectedSlide.screenshotPath)}
                    target="_blank"
                    rel="noreferrer"
                    className="preview-screenshot-link"
                  >
                    <img
                      src={devConsoleApi.previewAssetUrl(selectedSlide.screenshotPath)}
                      alt={`${selectedSlide.title} screenshot`}
                      className="preview-screenshot"
                    />
                    <span>{selectedSlide.screenshotPath}</span>
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="preview-empty-state">No slide detail available.</p>
            )}
          </section>

          <section className="preview-section">
            <div className="preview-section-header">
              <div>
                <h3>Communication Thread</h3>
                <p>Run-level decisions and slide-specific review stay in one supervised thread.</p>
              </div>
            </div>
            {selectedRun ? (
              <div className="preview-feedback-form">
                <label className="preview-field">
                  <span>Feedback scope</span>
                  <select
                    value={feedbackSlideId}
                    onChange={(event) => setFeedbackSlideId(event.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Entire run</option>
                    {slides.map((slide) => (
                      <option key={slide.slideId} value={slide.slideId}>
                        {slide.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="preview-field">
                  <span>Comment</span>
                  <textarea
                    value={feedbackComment}
                    onChange={(event) => setFeedbackComment(event.target.value)}
                    rows={4}
                    style={inputStyle}
                    placeholder="What should change, what was accepted, or what evidence is missing?"
                  />
                </label>
                <div className="preview-feedback-actions">
                  <button onClick={() => submitFeedback("comment")}>Comment</button>
                  <button onClick={() => submitFeedback("requested_changes")}>Request changes</button>
                  <button onClick={() => submitFeedback("approved")}>Approve</button>
                  <button onClick={() => submitFeedback("rejected")}>Reject</button>
                </div>
              </div>
            ) : (
              <p className="preview-empty-state">Select a preview run before leaving feedback.</p>
            )}

            {communicationItems.length ? (
              <div className="preview-feedback-summary">
                <StatusPill status="neutral">
                  {selectedSlide ? `${slideFeedbackItems.length} slide-scoped` : "run-scoped"}
                </StatusPill>
                <StatusPill status="ok">{communicationSummary.approvedCount} approved</StatusPill>
                <StatusPill status="neutral">
                  {communicationSummary.requestedChangesCount} requested changes
                </StatusPill>
                <StatusPill status="degraded">{communicationSummary.rejectedCount} rejected</StatusPill>
              </div>
            ) : null}

            <div className="preview-feedback-list">
              {feedbackItems.length ? (
                feedbackItems.map((item) => (
                  <div key={item.previewFeedbackId} className="preview-feedback-item">
                    <div className="preview-run-heading">
                      <strong>{item.feedbackKind}</strong>
                      <span>{formatTimestamp(item.createdAt)}</span>
                    </div>
                    <div className="preview-feedback-target">
                      {item.slideId ? `Slide ${item.slideId}` : "Entire run"}
                    </div>
                    <p>{item.comment || "No comment provided."}</p>
                  </div>
                ))
              ) : (
                <p className="preview-empty-state">
                  {selectedRun ? "No feedback recorded for this run yet." : "Feedback history appears once a run is selected."}
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </Panel>
  );
}

function OverviewPanel(props: { overview: WorkspaceOverview | null; loading: boolean }) {
  return (
    <Panel title="Workspace Overview" eyebrow="Health">
      {props.loading && !props.overview ? <p>Loading workspace status…</p> : null}
      {props.overview ? (
        <div style={{ display: "grid", gap: tokens.space.lg }}>
          <div style={gridStyle}>
            <InfoCard
              label="PostgreSQL"
              value={`${props.overview.postgres.host}:${props.overview.postgres.port}`}
              detail={props.overview.postgres.source}
            />
            <InfoCard
              label="Reachability"
              value={props.overview.postgres.reachable ? "reachable" : "unreachable"}
              detail={props.overview.status}
            />
            <InfoCard
              label="Latest backup"
              value={props.overview.backup?.latestBackupKind ?? "none"}
              detail={props.overview.backup?.latestBackupDir ?? "no local backup found"}
            />
          </div>
          <div style={{ display: "grid", gap: tokens.space.sm }}>
            {props.overview.services.map((service) => (
              <div key={service.service} style={rowStyle}>
                <div>
                  <strong>{service.service}</strong>
                  <div style={{ color: tokens.color.muted }}>{service.url}</div>
                </div>
                <StatusPill status={service.status}>{service.status}</StatusPill>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function CoordinationPanel(props: {
  tasks: AgentTaskCollection | null;
  runs: AgentRunCollection | null;
  runDetail: AgentRunDetail | null;
  loading: boolean;
  onSelectRun: (agentRunId: number) => void;
  onRetrySelectedTask: () => void;
  onEnqueue: (taskKind: string) => void;
  onSupervision: (decisionKind: "accepted" | "rejected" | "overridden", subjectKey: string, chosenValue?: string) => void;
}) {
  const queues = props.tasks?.queues ?? [];
  const tasks = props.tasks?.items.slice(0, 12) ?? [];
  const runs = props.runs?.items.slice(0, 8) ?? [];
  const selectedTask = props.runDetail?.task ?? null;

  return (
    <div className="surface-stack">
      <Panel title="Safe Controls" eyebrow="Actions">
        <div className="card-list">
          <ActionRow
            label="Refresh embeddings"
            taskKind="memory.run_embeddings"
            onEnqueue={props.onEnqueue}
            onSupervision={props.onSupervision}
          />
          <ActionRow
            label="Refresh evaluations"
            taskKind="memory.run_evaluations"
            onEnqueue={props.onEnqueue}
            onSupervision={props.onSupervision}
          />
          <ActionRow
            label="Refresh doc catalog summary"
            taskKind="catalog.refresh_doc_catalog"
            onEnqueue={props.onEnqueue}
            onSupervision={props.onSupervision}
          />
          <ActionRow
            label="Refresh skill catalog summary"
            taskKind="catalog.refresh_skill_catalog"
            onEnqueue={props.onEnqueue}
            onSupervision={props.onSupervision}
          />
        </div>
      </Panel>

      <Panel title="Queue Lanes" eyebrow="Coordination">
        {queues.length ? (
          <div className="queue-grid">
            {queues.map((queue) => (
              <div key={queue.queueName} className={`queue-card${queue.failedCount > 0 ? " is-danger" : ""}`}>
                <div className="record-header">
                  <div className="queue-title">
                    <strong>{queue.queueName}</strong>
                    <p className="record-subtitle">
                      {queue.succeededCount} succeeded overall
                    </p>
                  </div>
                  <StatusPill status={queue.failedCount > 0 ? "degraded" : queue.queuedCount > 0 || queue.leasedCount > 0 ? "neutral" : "ok"}>
                    {queue.failedCount > 0 ? "attention" : queue.queuedCount > 0 || queue.leasedCount > 0 ? "active" : "clear"}
                  </StatusPill>
                </div>
                <div className="queue-meta">
                  <span className="token-chip">queued {queue.queuedCount}</span>
                  <span className="token-chip">leased {queue.leasedCount}</span>
                  <span className="token-chip">failed {queue.failedCount}</span>
                </div>
              </div>
            ))}
          </div>
        ) : props.loading ? <p className="empty-copy">Loading queue lanes…</p> : <p className="empty-copy">No queue data available.</p>}
      </Panel>

      <div className="surface-split">
        <Panel title="Recent Tasks" eyebrow="Queue History">
          {tasks.length ? (
            <div className="card-list">
              {tasks.map((task) => (
                <div
                  key={task.agentTaskId}
                  className={`record-card${task.status === "failed" ? " is-danger" : task.status === "queued" || task.status === "leased" ? " is-warning" : ""}`}
                >
                  <div className="record-header">
                    <div className="record-title">
                      <strong>{task.taskKind}</strong>
                      <p className="record-subtitle">
                        Task #{task.agentTaskId} in {task.queueName}
                      </p>
                    </div>
                    <StatusPill status={task.status === "succeeded" ? "ok" : task.status === "failed" ? "degraded" : "neutral"}>
                      {task.status}
                    </StatusPill>
                  </div>
                  <div className="record-meta">
                    <span className="token-chip">
                      attempts {task.attemptCount}/{task.maxAttempts}
                    </span>
                    <span className="token-chip">updated {formatTimestamp(task.updatedAt)}</span>
                    {task.completedAt ? <span className="token-chip">completed {formatTimestamp(task.completedAt)}</span> : null}
                  </div>
                  {task.lastError ? <p className="record-copy">{task.lastError}</p> : null}
                </div>
              ))}
            </div>
          ) : props.loading ? <p className="empty-copy">Loading task history…</p> : <p className="empty-copy">No recent tasks available.</p>}
        </Panel>

        <Panel title="Run Detail" eyebrow="Timeline">
          {props.runDetail ? (
            <div className="surface-stack">
              <div className={`record-card${props.runDetail.run.status === "failed" ? " is-danger" : ""}`}>
                <div className="record-header">
                  <div className="record-title">
                    <strong>{props.runDetail.run.taskSlug}</strong>
                    <p className="record-subtitle">
                      Run #{props.runDetail.run.agentRunId} by {props.runDetail.run.agentName}
                    </p>
                  </div>
                  <StatusPill status={props.runDetail.run.status === "succeeded" ? "ok" : props.runDetail.run.status === "failed" ? "degraded" : "neutral"}>
                    {props.runDetail.run.status}
                  </StatusPill>
                </div>
                <FactGrid
                  entries={[
                    { label: "Started", value: formatTimestamp(props.runDetail.run.startedAt) },
                    { label: "Finished", value: props.runDetail.run.finishedAt ? formatTimestamp(props.runDetail.run.finishedAt) : "Still running" },
                    { label: "Task queue", value: selectedTask?.queueName ?? "Detached from task row" },
                    { label: "Attempts", value: selectedTask ? `${selectedTask.attemptCount}/${selectedTask.maxAttempts}` : "n/a" }
                  ]}
                />
                {selectedTask ? (
                  <div className="action-strip">
                    <button onClick={() => void props.onRetrySelectedTask()}>Retry selected task</button>
                    <span className="token-chip">Task #{selectedTask.agentTaskId}</span>
                    <span className="token-chip">{selectedTask.status}</span>
                  </div>
                ) : null}
                {selectedTask?.lastError ? (
                  <div className="detail-card is-danger">
                    <div className="section-heading">
                      <h4>Latest failure detail</h4>
                    </div>
                    <p className="detail-copy">{selectedTask.lastError}</p>
                  </div>
                ) : null}
              </div>

              <div className="surface-split">
                <div className="detail-stack">
                  <div className="section-heading">
                    <h3>Execution timeline</h3>
                    <p>Recent event payloads are summarized by field instead of raw JSON.</p>
                  </div>
                  <div className="timeline-list">
                    {props.runDetail.events.slice(0, 8).map((event) => (
                      <div key={event.agentEventId} className="timeline-item">
                        <div className="record-header">
                          <div className="record-title">
                            <strong>{event.eventType}</strong>
                            <p className="record-subtitle">{formatTimestamp(event.createdAt)}</p>
                          </div>
                        </div>
                        <StructuredValue value={event.payload} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="detail-stack">
                  <div className="section-heading">
                    <h3>Artifacts</h3>
                    <p>Captured outputs and metadata linked from the dev plane.</p>
                  </div>
                  <div className="artifact-list">
                    {props.runDetail.artifacts.length ? (
                      props.runDetail.artifacts.slice(0, 6).map((artifact) => (
                        <div key={artifact.artifactId} className="artifact-card">
                          <div className="record-header">
                            <div className="record-title">
                              <strong>{artifact.artifactKind}</strong>
                              <p className="record-subtitle">Artifact #{artifact.artifactId}</p>
                            </div>
                          </div>
                          <ResourceLink uri={artifact.uri} />
                          {artifact.metadata && Object.keys(artifact.metadata).length ? (
                            <StructuredValue value={artifact.metadata} />
                          ) : (
                            <p className="empty-copy">No artifact metadata recorded.</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="empty-copy">No artifacts linked to this run.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : props.loading ? <p className="empty-copy">Loading run detail…</p> : <p className="empty-copy">No agent runs available yet.</p>}
        </Panel>
      </div>

      <Panel title="Recent Runs" eyebrow="Selection">
        {runs.length ? (
          <div className="card-list">
            {runs.map((run) => (
              <button
                key={`run-link-${run.agentRunId}`}
                className="selection-button"
                onClick={() => void props.onSelectRun(run.agentRunId)}
              >
                <strong>
                  #{run.agentRunId} · {run.taskSlug}
                </strong>
                <span className="console-nav-description">
                  {run.agentName} · started {formatTimestamp(run.startedAt)}
                  {run.finishedAt ? ` · finished ${formatTimestamp(run.finishedAt)}` : ""}
                </span>
                <StatusPill status={run.status === "succeeded" ? "ok" : run.status === "failed" ? "degraded" : "neutral"}>
                  {run.status}
                </StatusPill>
              </button>
            ))}
          </div>
        ) : <p className="empty-copy">Use the queue and safe controls above to seed new runs.</p>}
      </Panel>
    </div>
  );
}

function ReviewPanel(props: {
  reviewRuns: UiReviewRunCollection | null;
  selectedReviewRun: UiReviewRun | null;
  reviewFindings: UiReviewFindingCollection | null;
  reviewBaselines: UiReviewBaselineCollection | null;
  detailDepth: "compact" | "expanded";
  loading: boolean;
  onStartReview: () => void;
  onSelectReviewRun: (uiReviewRunId: number) => void;
  onReviewFinding: (findingId: number, status: "accepted" | "rejected") => void;
  onPromoteBaseline: () => void;
}) {
  const runs = props.reviewRuns?.runs ?? [];
  const findings = props.reviewFindings?.findings ?? [];
  const baselines = props.reviewBaselines?.baselines ?? [];
  const proposedFindings = findings.filter((finding) => finding.status === "proposed").length;
  const captureSteps = extractCaptureSteps(props.selectedReviewRun);
  const screenshotLimit = props.detailDepth === "compact" ? 3 : 6;
  const baselineLimit = props.detailDepth === "compact" ? 4 : 8;
  const selectedRun = props.selectedReviewRun;
  const captureSummary = summarizeReviewSummary(selectedRun?.captureSummaryJson ?? {});
  const analysisSummary = summarizeReviewSummary(selectedRun?.analysisSummaryJson ?? {});

  return (
    <div className="surface-stack">
      <Panel title="Review Automation" eyebrow="Local Only">
        <div className="detail-stack">
          <div className="action-strip">
            <button onClick={() => void props.onStartReview()}>Start new UI review</button>
            <button
              onClick={() => void props.onPromoteBaseline()}
              disabled={!props.selectedReviewRun || captureSteps.length === 0}
            >
              Promote selected run baselines
            </button>
          </div>
          <div className="summary-grid">
            <InfoCard
              label="Runs"
              value={String(runs.length)}
              detail={props.selectedReviewRun ? `selected #${props.selectedReviewRun.uiReviewRunId}` : "No review run selected."}
            />
            <InfoCard
              label="Findings"
              value={String(findings.length)}
              detail={`${proposedFindings} awaiting supervised review`}
            />
            <InfoCard
              label="Baselines"
              value={String(baselines.length)}
              detail="Approved screenshot references stored under .clartk/dev/ui-review."
            />
          </div>
        </div>
      </Panel>

      <div className="surface-split">
        <Panel title="Recent Review Runs" eyebrow="Selection">
          {runs.length ? (
            <div className="card-list">
              {runs.map((run) => (
                <button
                  key={run.uiReviewRunId}
                  className="selection-button"
                  onClick={() => void props.onSelectReviewRun(run.uiReviewRunId)}
                >
                  <strong>Review #{run.uiReviewRunId}</strong>
                  <span className="console-nav-description">
                    {run.surface} · {run.browser} · {formatTimestamp(run.updatedAt)}
                  </span>
                  <StatusPill status={statusToneForReviewRun(run.status)}>{run.status}</StatusPill>
                </button>
              ))}
            </div>
          ) : props.loading ? (
            <p className="empty-copy">Loading UI review runs…</p>
          ) : (
            <p className="empty-copy">No UI review runs yet.</p>
          )}
        </Panel>

        <Panel title="Selected Review Run" eyebrow="Status">
          {selectedRun ? (
            <div className="detail-stack">
              <div className={`record-card${selectedRun.status === "failed" ? " is-danger" : ""}`}>
                <div className="record-header">
                  <div className="record-title">
                    <strong>
                      Review #{selectedRun.uiReviewRunId} · {selectedRun.surface}
                    </strong>
                    <p className="record-subtitle">
                      {selectedRun.browser} · {selectedRun.baseUrl}
                    </p>
                  </div>
                  <StatusPill status={statusToneForReviewRun(selectedRun.status)}>
                    {selectedRun.status}
                  </StatusPill>
                </div>
                <FactGrid
                  entries={[
                    { label: "Viewport", value: formatViewport(selectedRun.viewportJson) },
                    { label: "Capture steps", value: String(captureSummary.stepCount ?? 0) },
                    { label: "Artifacts", value: String(captureSummary.artifactCount ?? 0) },
                    { label: "Threshold", value: analysisSummary.threshold ? String(analysisSummary.threshold) : "default" },
                    { label: "Capture completed", value: captureSummary.completedAt ? formatTimestamp(String(captureSummary.completedAt)) : "pending" },
                    { label: "Analysis completed", value: analysisSummary.completedAt ? formatTimestamp(String(analysisSummary.completedAt)) : "pending" }
                  ]}
                />
              </div>
              <div className="surface-split">
                <div className="detail-card">
                  <div className="section-heading">
                    <h4>Review manifest</h4>
                    <p>Run context and initiation parameters.</p>
                  </div>
                  <StructuredValue value={selectedRun.manifestJson} />
                </div>
                <div className="detail-card">
                  <div className="section-heading">
                    <h4>Capture summary</h4>
                    <p>Derived from the capture and analyzer stages.</p>
                  </div>
                  <StructuredValue
                    value={{
                      capture: captureSummary,
                      analysis: analysisSummary
                    }}
                  />
                </div>
              </div>
            </div>
          ) : props.loading ? (
            <p className="empty-copy">Loading selected UI review run…</p>
          ) : (
            <p className="empty-copy">Select a review run to inspect its evidence and findings.</p>
          )}
        </Panel>
      </div>

      <div className="surface-split">
        <Panel title="Findings" eyebrow="Deterministic Analysis">
          {findings.length ? (
            <div className="card-list">
              {findings.map((finding) => (
                <div
                  key={finding.uiReviewFindingId}
                  className={`record-card${finding.severity === "critical" || finding.severity === "error" ? " is-danger" : finding.severity === "warning" ? " is-warning" : ""}`}
                >
                  <div className="record-header">
                    <div className="record-title">
                      <strong>{finding.title}</strong>
                      <p className="record-subtitle">
                        {finding.category} · {finding.severity}
                        {finding.scenarioName ? ` · ${finding.scenarioName}` : ""}
                      </p>
                    </div>
                    <StatusPill status={statusToneForFinding(finding.severity)}>
                      {finding.status}
                    </StatusPill>
                  </div>
                  <p className="record-copy">{finding.summary}</p>
                  <FactGrid
                    entries={[
                      { label: "Scenario", value: finding.scenarioName ?? "Not scoped" },
                      { label: "Checkpoint", value: finding.checkpointName ?? "Not scoped" },
                      { label: "Created", value: formatTimestamp(finding.createdAt) }
                    ]}
                  />
                  {finding.fixDraftJson && Object.keys(finding.fixDraftJson).length ? (
                    <FindingFixDraft value={finding.fixDraftJson} />
                  ) : null}
                  <div className="action-strip">
                    <button onClick={() => void props.onReviewFinding(finding.uiReviewFindingId, "accepted")}>
                      Accept
                    </button>
                    <button onClick={() => void props.onReviewFinding(finding.uiReviewFindingId, "rejected")}>
                      Reject
                    </button>
                  </div>
                  <ReviewEvidenceRow finding={finding} />
                </div>
              ))}
            </div>
          ) : props.loading ? (
            <p className="empty-copy">Loading UI review findings…</p>
          ) : (
            <p className="empty-copy">No findings recorded for the selected run.</p>
          )}
        </Panel>

        <Panel title="Approved Baselines" eyebrow="Reference Images">
          {baselines.length ? (
            <div className="card-list">
              {baselines.slice(0, baselineLimit).map((baseline) => (
                <div key={baseline.uiReviewBaselineId} className="record-card">
                  <div className="record-title">
                    <strong>
                      {baseline.scenarioName} · {baseline.checkpointName}
                    </strong>
                    <p className="record-subtitle">
                      {baseline.browser} · {baseline.viewportKey}
                    </p>
                  </div>
                  <ReviewImagePreview relativePath={baseline.relativePath} alt={`${baseline.scenarioName} baseline`} />
                </div>
              ))}
            </div>
          ) : props.loading ? (
            <p className="empty-copy">Loading baselines…</p>
          ) : (
            <p className="empty-copy">No approved baselines yet.</p>
          )}
        </Panel>
      </div>

      <Panel title="Checkpoint Screenshots" eyebrow="Capture Evidence">
        {captureSteps.length ? (
          <div className="surface-split">
            {captureSteps.slice(0, screenshotLimit).map((step, index) => (
              <div key={`${step.scenarioName ?? "step"}-${index}`} className="record-card">
                <div className="record-title">
                  <strong>
                    {step.scenarioName ?? "scenario"} · {step.checkpointName ?? "loaded"}
                  </strong>
                  <p className="record-subtitle">
                    {Array.isArray(step.expectedTexts) && step.expectedTexts.length
                      ? `${step.expectedTexts.length} expected markers`
                      : "stable checkpoint"}
                  </p>
                </div>
                {step.expectedTexts.length ? <PillList values={step.expectedTexts} /> : null}
                <ReviewImagePreview
                  relativePath={step.screenshot?.relativePath ?? null}
                  alt={`${step.scenarioName ?? "scenario"} screenshot`}
                />
              </div>
            ))}
          </div>
        ) : props.loading ? (
          <p className="empty-copy">Loading review capture evidence…</p>
        ) : (
          <p className="empty-copy">No checkpoint screenshots captured yet.</p>
        )}
      </Panel>
    </div>
  );
}

function KnowledgePanel(props: {
  sourceDocuments: ResourceCollection<SourceDocumentRecord> | null;
  claims: ResourceCollection<KnowledgeClaimRecord> | null;
  evaluations: ResourceCollection<EvaluationResultRecord> | null;
  detailDepth: "compact" | "expanded";
}) {
  return (
    <div className="surface-stack">
      <Panel title="Knowledge Stores" eyebrow="Dev Memory">
        <div className="summary-grid">
          <InfoCard label="Source documents" value={String(props.sourceDocuments?.items.length ?? 0)} />
          <InfoCard label="Claims" value={String(props.claims?.items.length ?? 0)} />
          <InfoCard label="Evaluations" value={String(props.evaluations?.items.length ?? 0)} />
        </div>
      </Panel>
      <Panel title="Recent Documents" eyebrow="Source">
        <ListBlock
          items={(props.sourceDocuments?.items ?? []).slice(0, props.detailDepth === "compact" ? 4 : 8).map((item) => ({
            title: item.title ?? item.uri,
            subtitle: `${item.sourceKind} · ${item.uri}`,
            body: (
              <p className="detail-copy">
                {summarizeText(item.body, props.detailDepth === "expanded" ? 320 : 180)}
              </p>
            )
          }))}
        />
      </Panel>
      <Panel title="Recent Claims" eyebrow="Assertions">
        <ListBlock
          items={(props.claims?.items ?? []).slice(0, props.detailDepth === "compact" ? 4 : 8).map((item) => ({
            title: item.summary,
            subtitle: item.status,
            body: item.tags.length ? (
              <PillList values={item.tags.map((tag) => String(tag))} />
            ) : (
              <p className="empty-copy">No tags recorded.</p>
            )
          }))}
        />
      </Panel>
      <Panel title="Recent Evaluations" eyebrow="Scores">
        <ListBlock
          items={(props.evaluations?.items ?? []).slice(0, props.detailDepth === "compact" ? 4 : 8).map((item) => ({
            title: item.subject,
            subtitle: item.outcome,
            body:
              props.detailDepth === "expanded" ? (
                <StructuredValue value={item.detail} />
              ) : (
                <p className="detail-copy">{summarizeUnknownValue(item.detail)}</p>
              )
          }))}
        />
      </Panel>
    </div>
  );
}

function DocsPanel(props: {
  docs: DocsCatalogResponse | null;
  skills: SkillCatalogResponse | null;
  detailDepth: "compact" | "expanded";
}) {
  const allDocs = props.docs?.items ?? [];
  const presentationDocs = allDocs.filter((item) => item.kind === "presentation");
  const otherDocs = allDocs.filter((item) => item.kind !== "presentation");
  const presentationLimit = props.detailDepth === "compact" ? 4 : 8;
  const docsLimit = props.detailDepth === "compact" ? 8 : 16;

  return (
    <div className="surface-split">
      <div className="surface-stack">
        <Panel title="Presentations" eyebrow="R&D">
          <ListBlock
            items={presentationDocs.slice(0, presentationLimit).map((item) => ({
              title: item.title,
              subtitle: `${item.path}${item.tags.includes("canva") ? " · Canva brief" : ""}`,
              body: <p className="detail-copy">{item.summary}</p>
            }))}
          />
        </Panel>
        <Panel title="Documentation Catalog" eyebrow="Filesystem">
          <ListBlock
            items={otherDocs.slice(0, docsLimit).map((item) => ({
              title: item.title,
              subtitle: `${item.kind} · ${item.path}`,
              body: <p className="detail-copy">{item.summary}</p>
            }))}
          />
        </Panel>
      </div>
      <Panel title="Skills Catalog" eyebrow="Verified">
        <ListBlock
          items={(props.skills?.items ?? []).slice(0, props.detailDepth === "compact" ? 8 : 16).map((item) => ({
            title: item.name,
            subtitle: `${item.source} · ${item.path}`,
            body: <p className="detail-copy">{item.description}</p>
          }))}
        />
      </Panel>
    </div>
  );
}

function PreferencesPanel(props: {
  me: AuthenticatedMe | null;
  devProfile: DevPreferenceProfile | null;
  onSupervision: (decisionKind: "accepted" | "rejected" | "overridden", subjectKey: string, chosenValue?: string) => void;
}) {
  return (
    <div className="surface-stack">
      <Panel title="Runtime Profile Summary" eyebrow="Authoritative">
        {props.me ? (
          <StructuredValue value={props.me.profile.defaults} emptyLabel="No runtime profile defaults recorded." />
        ) : (
          <p className="empty-copy">No authenticated runtime profile available.</p>
        )}
      </Panel>
      <Panel title="Development Preference Scorecard" eyebrow="Derived">
        {props.devProfile?.score ? (
          <div className="surface-stack">
            <FactGrid
              entries={[
                { label: "Runtime account", value: props.devProfile.score.runtimeAccountId },
                { label: "Signals used", value: String(props.devProfile.score.computedFromSignalCount) },
                { label: "Updated", value: formatTimestamp(props.devProfile.score.updatedAt) }
              ]}
            />
            <StructuredValue value={props.devProfile.score.scorecard} emptyLabel="No derived scorecard detail." />
          </div>
        ) : (
          <p className="empty-copy">No derived dev-console scorecard yet.</p>
        )}
      </Panel>
      <Panel title="Supervision Shortcuts" eyebrow="Labels">
        <div className="action-strip">
          <button onClick={() => void props.onSupervision("accepted", "catalog.refresh_doc_catalog", "catalog.refresh_doc_catalog")}>
            Accept doc refresh recommendation
          </button>
          <button onClick={() => void props.onSupervision("rejected", "catalog.refresh_skill_catalog", "catalog.refresh_skill_catalog")}>
            Reject skill refresh recommendation
          </button>
          <button onClick={() => void props.onSupervision("overridden", "memory.run_embeddings", "memory.run_evaluations")}>
            Override toward evaluations
          </button>
        </div>
      </Panel>
      <div className="surface-split">
        <Panel title="Recent Signals" eyebrow="Observed">
          <ListBlock
            items={(props.devProfile?.recentSignals ?? []).slice(0, 10).map((signal) => ({
              title: signal.signalKind,
              subtitle: `${signal.surface}${signal.panelKey ? ` · ${signal.panelKey}` : ""}`,
              body: <StructuredValue value={signal.payload} emptyLabel="No signal payload." />
            }))}
          />
        </Panel>
        <Panel title="Recent Decisions" eyebrow="Supervised">
          <ListBlock
            items={(props.devProfile?.recentDecisions ?? []).slice(0, 10).map((decision) => ({
              title: `${decision.decisionKind} · ${decision.subjectKey}`,
              subtitle: decision.subjectKind,
              body: <StructuredValue value={decision.payload} emptyLabel="No decision payload." />
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}

function ReviewEvidenceRow(props: { finding: UiReviewFindingCollection["findings"][number] }) {
  const descriptors = extractEvidenceDescriptors(props.finding.evidenceJson);
  if (!descriptors.length) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: tokens.space.sm, marginTop: tokens.space.md }}>
      {descriptors.slice(0, 3).map((descriptor, index) => (
        <div key={`${descriptor.relativePath}-${index}`}>
          <div style={{ color: tokens.color.muted, marginBottom: tokens.space.xs }}>{descriptor.label}</div>
          <ReviewImagePreview relativePath={descriptor.relativePath} alt={descriptor.label} />
        </div>
      ))}
    </div>
  );
}

function ReviewImagePreview(props: { relativePath: string | null; alt: string }) {
  if (!props.relativePath) {
    return <p style={{ marginTop: tokens.space.sm }}>No image artifact linked.</p>;
  }
  return (
    <a
      href={devConsoleApi.uiReviewAssetUrl(props.relativePath)}
      target="_blank"
      rel="noreferrer"
      style={{ display: "grid", gap: tokens.space.sm, marginTop: tokens.space.sm }}
    >
      <img
        src={devConsoleApi.uiReviewAssetUrl(props.relativePath)}
        alt={props.alt}
        style={{
          width: "100%",
          borderRadius: tokens.radius.md,
          border: `1px solid ${tokens.color.line}`,
          background: "#ffffff"
        }}
      />
      <span style={{ color: tokens.color.muted, fontSize: 12 }}>{props.relativePath}</span>
    </a>
  );
}

function ActionRow(props: {
  label: string;
  taskKind: string;
  onEnqueue: (taskKind: string) => void;
  onSupervision: (decisionKind: "accepted" | "rejected" | "overridden", subjectKey: string, chosenValue?: string) => void;
}) {
  return (
    <div className="record-card">
      <div className="record-header">
        <div className="record-title">
        <strong>{props.label}</strong>
          <p className="record-subtitle">{props.taskKind}</p>
        </div>
      </div>
      <div className="action-strip">
        <button onClick={() => void props.onEnqueue(props.taskKind)}>Enqueue</button>
        <button onClick={() => void props.onSupervision("accepted", props.taskKind, props.taskKind)}>
          Accept
        </button>
        <button onClick={() => void props.onSupervision("rejected", props.taskKind, props.taskKind)}>
          Reject
        </button>
        <button onClick={() => void props.onSupervision("overridden", props.taskKind, "manual_override")}>
          Override
        </button>
      </div>
    </div>
  );
}

function InfoCard(props: { label: string; value: string; detail?: string }) {
  return (
    <div className="hud-info-card">
      <div className="hud-info-label">{props.label}</div>
      <strong className="hud-info-value">{props.value}</strong>
      {props.detail ? <div className="hud-info-detail">{props.detail}</div> : null}
    </div>
  );
}

function DeckSourcePreview(props: {
  deck: PresentationDeckSourceCollection["items"][number];
}) {
  return (
    <div className="deck-preview-card">
      <div className="deck-preview-header">
        <span className="deck-preview-eyebrow">Source deck preview</span>
        <h4>{props.deck.title}</h4>
        <p>{props.deck.summary || "No summary captured for this deck source yet."}</p>
      </div>
      <div className="deck-preview-facts">
        <div className="deck-preview-fact">
          <span>Slides</span>
          <strong>{props.deck.slideCount}</strong>
        </div>
        <div className="deck-preview-fact">
          <span>Companion</span>
          <strong>{props.deck.hasPreviewCompanion ? "Ready" : "Not yet"}</strong>
        </div>
        <div className="deck-preview-fact">
          <span>Updated</span>
          <strong>{formatTimestamp(props.deck.updatedAt)}</strong>
        </div>
      </div>
      <div className="deck-preview-surface">
        <div className="deck-preview-slide deck-preview-slide-primary">
          <span className="deck-preview-slide-index">01</span>
          <strong>{props.deck.title}</strong>
          <p>{props.deck.summary || "Start a preview run to inspect rendered slide content."}</p>
        </div>
        <div className="deck-preview-slide deck-preview-slide-secondary">
          <span className="deck-preview-slide-index">02</span>
          <strong>Source of truth</strong>
          <p>{props.deck.markdownPath}</p>
        </div>
        <div className="deck-preview-slide deck-preview-slide-secondary">
          <span className="deck-preview-slide-index">03</span>
          <strong>Companion</strong>
          <p>{props.deck.companionPath ?? "Markdown-only source at the moment."}</p>
        </div>
      </div>
      {props.deck.tags.length ? <PillList values={props.deck.tags} /> : null}
    </div>
  );
}

function PreviewEmptyState(props: { loading: boolean }) {
  return (
    <div className="preview-placeholder">
      <div className="preview-placeholder-copy">
        <span className="deck-preview-eyebrow">Preview stage</span>
        <h4>{props.loading ? "Loading preview workspace" : "No preview selected yet"}</h4>
        <p>
          {props.loading
            ? "ClaRTK is still loading deck sources and prior preview runs from the dev plane."
            : "Select a deck source or a previous run to populate this stage with rendered slides, evidence, and source-linked notes."}
        </p>
      </div>
      <div className="preview-placeholder-grid">
        <div className="preview-placeholder-card">
          <strong>Choose a source</strong>
          <p>Deck metadata, slide counts, and companion availability appear in the left column.</p>
        </div>
        <div className="preview-placeholder-card">
          <strong>Render a run</strong>
          <p>Start a preview run to generate HTML, screenshots, and run-level analysis artifacts.</p>
        </div>
        <div className="preview-placeholder-card">
          <strong>Review the result</strong>
          <p>Rendered HTML opens here, while slide notes and feedback stay visible in the inspector.</p>
        </div>
      </div>
    </div>
  );
}

function SlideConversationStage(props: {
  run: PreviewRun;
  selectedSlide: PreviewManifestSlide | null;
  slides: PreviewManifestSlide[];
  communicationItems: PreviewFeedbackCollection["items"];
  communicationSummary: ReturnType<typeof summarizePreviewFeedback>;
  previewUrl: string | null;
  onSelectSlide: (slideId: string) => void;
}) {
  const selectedSlide = props.selectedSlide;
  const screenshotUrl = selectedSlide?.screenshotPath
    ? devConsoleApi.previewAssetUrl(selectedSlide.screenshotPath)
    : null;

  return (
    <div className="slide-review-stage">
      <div className="slide-review-media">
        {screenshotUrl ? (
          <a href={screenshotUrl} target="_blank" rel="noreferrer" className="slide-review-hero-link">
            <img
              src={screenshotUrl}
              alt={selectedSlide?.title ?? "Slide screenshot"}
              className="slide-review-hero"
            />
          </a>
        ) : (
          <div className="slide-review-empty">
            <span className="deck-preview-eyebrow">Conversation view</span>
            <h4>{selectedSlide ? selectedSlide.title : props.run.title}</h4>
            <p>
              {selectedSlide
                ? "This slide does not have a captured screenshot yet. Use the source notes and thread context to guide the next revision."
                : "Open a slide from the rail or use the full-deck view when rendered HTML is the better communication surface."}
            </p>
          </div>
        )}
        {props.slides.length ? (
          <div className="slide-review-rail">
            {props.slides.slice(0, 12).map((slide, index) => (
              <button
                key={slide.slideId}
                className={`slide-review-rail-item${selectedSlide?.slideId === slide.slideId ? " is-active" : ""}`}
                onClick={() => props.onSelectSlide(slide.slideId)}
              >
                <span className="slide-review-rail-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="slide-review-rail-copy">
                  <strong>{slide.title}</strong>
                  <span>{slide.slideId}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="slide-review-panel">
        <div className="section-heading">
          <h4>Interactive review context</h4>
          <p>Human and agent communication anchored to the currently selected deck or slide.</p>
        </div>
        <FactGrid
          entries={[
            { label: "Run", value: `#${props.run.previewRunId}` },
            { label: "Current scope", value: selectedSlide?.slideId ?? "Entire run" },
            { label: "Messages", value: String(props.communicationSummary.totalCount) },
            { label: "Comments", value: String(props.communicationSummary.commentCount) },
            { label: "Requested changes", value: String(props.communicationSummary.requestedChangesCount) },
            { label: "Approvals", value: String(props.communicationSummary.approvedCount) }
          ]}
        />
        {props.previewUrl ? (
          <a href={props.previewUrl} target="_blank" rel="noreferrer" className="artifact-link">
            Open rendered deck artifact
          </a>
        ) : null}
        {selectedSlide ? (
          <div className="detail-stack">
            <div className="detail-card">
              <div className="section-heading">
                <h4>Slide briefing</h4>
                <p>{selectedSlide.title}</p>
              </div>
              <StructuredValue
                value={{
                  audienceGoal: selectedSlide.audienceGoal || "Not specified",
                  visualGuidance: selectedSlide.visualGuidance || "Not specified",
                  speakerNotes: selectedSlide.speakerNotes || "Not specified"
                }}
              />
            </div>
            <div className="detail-card">
              <div className="section-heading">
                <h4>Slide payload</h4>
                <p>Bullets, media, and evidence paths that should survive revision.</p>
              </div>
              <StructuredValue
                value={{
                  bullets: selectedSlide.bullets,
                  media: selectedSlide.media.map((media) =>
                    media.source ? `${media.kind}: ${media.source}` : media.kind
                  ),
                  evidencePaths: selectedSlide.evidencePaths
                }}
              />
            </div>
          </div>
        ) : (
          <div className="detail-card">
            <div className="section-heading">
              <h4>Run communication surface</h4>
              <p>No slide metadata is selected yet.</p>
            </div>
            <p className="detail-copy">
              Use this stage for run-level decisions, then switch to a specific slide when manifest
              or screenshot evidence is available.
            </p>
          </div>
        )}
        <div className="detail-card">
          <div className="section-heading">
            <h4>Recent communication</h4>
            <p>The newest supervised feedback for this scope appears first.</p>
          </div>
          <ListBlock
            items={props.communicationItems.slice(0, 4).map((item) => ({
              title: item.feedbackKind,
              subtitle: `${item.slideId ?? "Entire run"} · ${formatTimestamp(item.createdAt)}`,
              body: <p className="detail-copy">{item.comment || "No comment provided."}</p>
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function FactGrid(props: { entries: Array<{ label: string; value: React.ReactNode }> }) {
  const visibleEntries = props.entries.filter((entry) => entry.value !== undefined && entry.value !== null);
  if (!visibleEntries.length) {
    return <p className="empty-copy">No structured facts available.</p>;
  }

  return (
    <div className="structured-grid">
      {visibleEntries.map((entry, index) => (
        <div key={`${entry.label}-${index}`} className="structured-item">
          <span className="structured-label">{entry.label}</span>
          <div className="structured-inline">{entry.value}</div>
        </div>
      ))}
    </div>
  );
}

function PillList(props: { values: string[] }) {
  if (!props.values.length) {
    return <p className="empty-copy">No values recorded.</p>;
  }

  return (
    <div className="token-list">
      {props.values.map((value) => (
        <span key={value} className="token-chip">
          {value}
        </span>
      ))}
    </div>
  );
}

function StructuredValue(props: {
  value: unknown;
  depth?: number;
  emptyLabel?: string;
}) {
  const { value, depth = 0, emptyLabel = "No detail available." } = props;

  if (value === null || value === undefined || value === "") {
    return <p className="structured-empty">{emptyLabel}</p>;
  }

  if (typeof value === "string") {
    return <p className="detail-copy">{value}</p>;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return <p className="detail-copy">{String(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return <p className="structured-empty">{emptyLabel}</p>;
    }

    if (value.every((item) => item === null || item === undefined || typeof item !== "object")) {
      return <PillList values={value.map((item) => String(item))} />;
    }

    return (
      <div className="structured-stack">
        {value.slice(0, 6).map((item, index) => (
          <div key={`structured-${index}`} className="structured-card">
            {shouldRenderInline(item, depth + 1) ? (
              <div className="structured-inline">{summarizeUnknownValue(item)}</div>
            ) : (
              <StructuredValue value={item} depth={depth + 1} emptyLabel="No nested detail." />
            )}
          </div>
        ))}
        {value.length > 6 ? (
          <p className="structured-empty">{value.length - 6} more items not shown.</p>
        ) : null}
      </div>
    );
  }

  const record = asRecord(value);
  if (!record) {
    return <p className="detail-copy">{String(value)}</p>;
  }

  const entries = Object.entries(record).filter(([, item]) => item !== undefined);
  if (!entries.length) {
    return <p className="structured-empty">{emptyLabel}</p>;
  }

  const visibleEntries = entries.slice(0, depth === 0 ? 8 : 6);
  return (
    <div className="structured-grid">
      {visibleEntries.map(([key, item]) => (
        <div key={key} className="structured-item">
          <span className="structured-label">{humanizeKey(key)}</span>
          {shouldRenderInline(item, depth + 1) ? (
            <div className="structured-inline">{summarizeUnknownValue(item)}</div>
          ) : (
            <StructuredValue value={item} depth={depth + 1} emptyLabel="Not set." />
          )}
        </div>
      ))}
      {entries.length > visibleEntries.length ? (
        <div className="structured-item">
          <span className="structured-label">Additional fields</span>
          <p className="structured-empty">{entries.length - visibleEntries.length} more not shown.</p>
        </div>
      ) : null}
    </div>
  );
}

function FindingFixDraft(props: { value: Record<string, unknown> }) {
  const regressionClass = pickString(props.value, [
    "regressionClass",
    "suspectedRegressionClass",
    "regression_type"
  ]);
  const affectedPaths = pickStringArray(props.value, [
    "likelyAffectedPaths",
    "affectedPaths",
    "pathHints",
    "candidatePaths"
  ]);
  const validationSteps = pickStringArray(props.value, [
    "requiredValidation",
    "validationSteps",
    "validation",
    "checks"
  ]);
  const evidencePaths = pickStringArray(props.value, [
    "evidencePaths",
    "evidenceLinks",
    "artifactPaths"
  ]);

  return (
    <div className="detail-card">
      <div className="section-heading">
        <h4>Draft remediation brief</h4>
        <p>Structured proposal generated from the local analyzer.</p>
      </div>
      <FactGrid
        entries={[
          { label: "Regression class", value: regressionClass ?? "Not classified" },
          { label: "Affected paths", value: affectedPaths.length ? `${affectedPaths.length} path hints` : "No path hints" },
          { label: "Validation steps", value: validationSteps.length ? `${validationSteps.length} checks` : "No validation plan" }
        ]}
      />
      {affectedPaths.length ? <PillList values={affectedPaths} /> : null}
      {validationSteps.length ? <PillList values={validationSteps} /> : null}
      {evidencePaths.length ? (
        <div className="detail-stack">
          <div className="section-heading">
            <h4>Evidence references</h4>
          </div>
          <PillList values={evidencePaths} />
        </div>
      ) : null}
      <StructuredValue value={props.value} depth={1} emptyLabel="No additional draft detail." />
    </div>
  );
}

function ResourceLink(props: { uri: string }) {
  const href = resolveArtifactHref(props.uri);
  if (href) {
    return (
      <a className="artifact-link" href={href} target="_blank" rel="noreferrer">
        {props.uri}
      </a>
    );
  }

  return <p className="detail-copy">{props.uri}</p>;
}

function ListBlock(props: { items: Array<{ title: string; subtitle?: string; body?: React.ReactNode }> }) {
  return props.items.length ? (
    <div className="list-block">
      {props.items.map((item, index) => (
        <div key={`${item.title}-${index}`} className="list-block-item">
          <strong>{item.title}</strong>
          {item.subtitle ? <div className="list-block-subtitle">{item.subtitle}</div> : null}
          {item.body ? <div className="list-block-body">{item.body}</div> : null}
        </div>
      ))}
    </div>
  ) : (
    <p className="empty-copy">No items available.</p>
  );
}

function Message(props: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div className={`hud-message hud-message-${props.tone}`}>
      {props.children}
    </div>
  );
}

function statusToneForReviewRun(status: string): "ok" | "neutral" | "degraded" {
  if (status === "baseline_promoted" || status === "ready_for_review") {
    return "ok";
  }
  if (status === "failed") {
    return "degraded";
  }
  return "neutral";
}

function statusToneForFinding(severity: string): "ok" | "neutral" | "degraded" {
  if (severity === "critical" || severity === "error") {
    return "degraded";
  }
  if (severity === "warning") {
    return "neutral";
  }
  return "ok";
}

function summarizeReviewSummary(summary: Record<string, unknown>): Record<string, unknown> {
  return {
    status: summary.status,
    stepCount: Array.isArray(summary.steps) ? summary.steps.length : 0,
    artifactCount: Array.isArray(summary.artifacts) ? summary.artifacts.length : 0,
    threshold: summary.threshold,
    completedAt: summary.completedAt
  };
}

function extractCaptureSteps(run: UiReviewRun | null): Array<{
  scenarioName: string | null;
  checkpointName: string | null;
  expectedTexts: string[];
  screenshot: { relativePath: string | null };
}> {
  const rawSteps = run?.captureSummaryJson.steps;
  if (!Array.isArray(rawSteps)) {
    return [];
  }

  return rawSteps.flatMap((step) => {
    if (typeof step !== "object" || step === null || Array.isArray(step)) {
      return [];
    }
    const stepRecord = step as Record<string, unknown>;
    const screenshot =
      typeof stepRecord.screenshot === "object" &&
      stepRecord.screenshot !== null &&
      !Array.isArray(stepRecord.screenshot)
        ? (stepRecord.screenshot as Record<string, unknown>)
          : {};
      const expectedTexts = Array.isArray(stepRecord.expectedTexts)
        ? stepRecord.expectedTexts.filter((value: unknown): value is string => typeof value === "string")
        : [];
      return [{
        scenarioName: typeof stepRecord.scenarioName === "string" ? stepRecord.scenarioName : null,
        checkpointName: typeof stepRecord.checkpointName === "string" ? stepRecord.checkpointName : null,
        expectedTexts,
        screenshot: {
          relativePath: typeof screenshot.relativePath === "string" ? screenshot.relativePath : null
        }
      }];
    });
}

function extractEvidenceDescriptors(evidenceJson: Record<string, unknown>): Array<{
  label: string;
  relativePath: string;
}> {
  const descriptors: Array<{ label: string; relativePath: string }> = [];
  for (const [label, value] of Object.entries(evidenceJson)) {
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const descriptor = value as Record<string, unknown>;
    if (typeof descriptor.relativePath !== "string" || !descriptor.relativePath.endsWith(".png")) {
      continue;
    }
    descriptors.push({ label, relativePath: descriptor.relativePath });
  }
  return descriptors;
}

function statusToneForPreviewRun(status: string): "ok" | "neutral" | "degraded" {
  if (status === "ready_for_review" || status === "rendered") {
    return "ok";
  }
  if (status === "failed" || status === "cancelled") {
    return "degraded";
  }
  return "neutral";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return date.toLocaleString();
}

function formatViewport(viewportJson: Record<string, unknown>): string {
  const width = typeof viewportJson.width === "number" ? viewportJson.width : null;
  const height = typeof viewportJson.height === "number" ? viewportJson.height : null;
  if (width && height) {
    return `${width}x${height}`;
  }
  return "viewport unavailable";
}

function extractPreviewHtmlPath(run: PreviewRun | null): string | null {
  const summary = asRecord(run?.renderSummaryJson ?? null);
  return typeof summary?.htmlPath === "string" ? summary.htmlPath : null;
}

function summarizePreviewAnalysis(run: PreviewRun | null): {
  hasWarnings: boolean;
  warnings: string[];
  consoleErrors: string[];
  requestFailures: string[];
  slideCount: number;
  screenshotsBySlideId: Map<string, string>;
} {
  const summary = asRecord(run?.analysisSummaryJson ?? null);
  const warnings = asStringArray(summary?.warnings);
  const consoleErrors = asStringArray(summary?.consoleErrors);
  const requestFailures = Array.isArray(summary?.requestFailures)
    ? summary.requestFailures.map((failure) => JSON.stringify(failure))
    : [];
  const slides = Array.isArray(summary?.slides) ? summary.slides : [];
  const screenshotsBySlideId = new Map<string, string>();

  for (const slide of slides) {
    const slideRecord = asRecord(slide);
    if (!slideRecord) {
      continue;
    }
    if (typeof slideRecord.slideId !== "string" || typeof slideRecord.screenshotPath !== "string") {
      continue;
    }
    screenshotsBySlideId.set(slideRecord.slideId, slideRecord.screenshotPath);
  }

  return {
    hasWarnings:
      warnings.length > 0 ||
      consoleErrors.length > 0 ||
      requestFailures.length > 0 ||
      summary?.status === "warning",
    warnings,
    consoleErrors,
    requestFailures,
    slideCount: screenshotsBySlideId.size,
    screenshotsBySlideId
  };
}

function summarizePreviewFeedback(items: PreviewFeedbackCollection["items"]) {
  return items.reduce(
    (summary, item) => {
      summary.totalCount += 1;
      if (item.feedbackKind === "approved") {
        summary.approvedCount += 1;
      } else if (item.feedbackKind === "requested_changes") {
        summary.requestedChangesCount += 1;
      } else if (item.feedbackKind === "rejected") {
        summary.rejectedCount += 1;
      } else {
        summary.commentCount += 1;
      }
      return summary;
    },
    {
      totalCount: 0,
      commentCount: 0,
      requestedChangesCount: 0,
      approvedCount: 0,
      rejectedCount: 0
    }
  );
}

interface PreviewManifestSlide {
  slideId: string;
  title: string;
  audienceGoal: string;
  bullets: string[];
  speakerNotes: string;
  visualGuidance: string;
  evidencePaths: string[];
  media: Array<{ kind: string; source: string | null }>;
  screenshotPath: string | null;
}

interface PreviewManifestData {
  markdownPath: string;
  companionPath: string | null;
  slides: PreviewManifestSlide[];
}

function parsePreviewManifest(run: PreviewRun | null): PreviewManifestData | null {
  const renderSummary = asRecord(run?.renderSummaryJson ?? null);
  const manifest =
    asRecord(renderSummary?.manifest) ??
    asRecord(run?.manifestJson ?? null);
  if (!manifest) {
    return null;
  }
  const previewAnalysis = summarizePreviewAnalysis(run);
  const slides = Array.isArray(manifest.slides)
    ? manifest.slides.flatMap((slide) => {
        const slideRecord = asRecord(slide);
        if (!slideRecord || typeof slideRecord.slideId !== "string") {
          return [];
        }

        const media = Array.isArray(slideRecord.media)
          ? slideRecord.media.flatMap((entry) => {
              const mediaRecord = asRecord(entry);
              if (!mediaRecord) {
                return [];
              }
              return [{
                kind: typeof mediaRecord.kind === "string" ? mediaRecord.kind : "media",
                source:
                  typeof mediaRecord.relativePath === "string"
                    ? mediaRecord.relativePath
                    : typeof mediaRecord.url === "string"
                      ? mediaRecord.url
                      : null
              }];
            })
          : [];

        return [{
          slideId: slideRecord.slideId,
          title: typeof slideRecord.title === "string" ? slideRecord.title : slideRecord.slideId,
          audienceGoal: typeof slideRecord.audienceGoal === "string" ? slideRecord.audienceGoal : "",
          bullets: asStringArray(slideRecord.bullets),
          speakerNotes: typeof slideRecord.speakerNotes === "string" ? slideRecord.speakerNotes : "",
          visualGuidance: typeof slideRecord.visualGuidance === "string" ? slideRecord.visualGuidance : "",
          evidencePaths: asStringArray(slideRecord.evidencePaths),
          media,
          screenshotPath: previewAnalysis.screenshotsBySlideId.get(slideRecord.slideId) ?? null
        }];
      })
    : [];

  const knownSlideIds = new Set(slides.map((slide) => slide.slideId));
  for (const [slideId, screenshotPath] of previewAnalysis.screenshotsBySlideId.entries()) {
    if (knownSlideIds.has(slideId)) {
      continue;
    }
    slides.push({
      slideId,
      title: humanizeKey(slideId),
      audienceGoal: "",
      bullets: [],
      speakerNotes: "",
      visualGuidance: "",
      evidencePaths: [],
      media: [],
      screenshotPath
    });
  }

  return {
    markdownPath:
      typeof manifest.markdownPath === "string"
        ? manifest.markdownPath
        : typeof renderSummary?.markdownPath === "string"
          ? renderSummary.markdownPath
          : "",
    companionPath:
      typeof manifest.companionPath === "string"
        ? manifest.companionPath
        : typeof renderSummary?.companionPath === "string"
          ? renderSummary.companionPath
          : null,
    slides
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseScorecardChoice<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): T | null {
  const record = asRecord(value);
  const candidate = record?.value;
  if (typeof candidate !== "string") {
    return null;
  }
  return allowedValues.includes(candidate as T) ? (candidate as T) : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function humanizeKey(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._/-]+/g, " ")
    .trim();
  if (!normalized) {
    return "Field";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function summarizeText(value: string | null | undefined, limit = 220): string {
  const source = (value ?? "").trim();
  if (!source) {
    return "No detail available.";
  }
  if (source.length <= limit) {
    return source;
  }
  return `${source.slice(0, limit).trimEnd()}...`;
}

function summarizeUnknownValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return "None";
    }
    if (value.every((item) => item === null || item === undefined || typeof item !== "object")) {
      return value.map((item) => String(item)).join(", ");
    }
    return `${value.length} items`;
  }
  const record = asRecord(value);
  if (record) {
    const entryCount = Object.keys(record).length;
    return entryCount === 0 ? "No fields" : `${entryCount} fields`;
  }
  return String(value);
}

function shouldRenderInline(value: unknown, depth: number): boolean {
  if (value === null || value === undefined || typeof value !== "object") {
    return true;
  }
  if (Array.isArray(value)) {
    return depth >= 2 || value.every((item) => item === null || item === undefined || typeof item !== "object");
  }
  return depth >= 2;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    const items = asStringArray(value);
    if (items.length) {
      return items;
    }
  }
  return [];
}

function resolveArtifactHref(uri: string): string | null {
  if (/^https?:\/\//.test(uri)) {
    return uri;
  }

  const normalized = uri.replace(/^\/mnt\/h\/ClaRTK\//, "");
  if (normalized.startsWith(".clartk/dev/ui-review/")) {
    return devConsoleApi.uiReviewAssetUrl(normalized);
  }
  if (normalized.startsWith(".clartk/dev/presentation-preview/")) {
    return devConsoleApi.previewAssetUrl(normalized);
  }
  return null;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: `${tokens.space.sm}px ${tokens.space.md}px`,
  borderRadius: tokens.radius.sm,
  border: "1px solid rgba(148, 164, 121, 0.28)",
  background: "rgba(10, 17, 18, 0.86)",
  color: "#e7f1dd",
  marginTop: tokens.space.xs
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: tokens.space.md,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: tokens.space.md,
  paddingBottom: tokens.space.sm,
  borderBottom: `1px solid ${tokens.color.line}`
};
