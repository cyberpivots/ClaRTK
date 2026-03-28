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
  JsonObject,
  JsonValue,
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
type LauncherDrawerKey = "status" | "quick-controls" | "filters" | "comms" | "profile";

function browserBaseUrl(defaultPort: number): string {
  if (typeof window === "undefined") {
    return `http://localhost:${defaultPort}`;
  }
  return `${window.location.protocol}//${window.location.hostname}:${defaultPort}`;
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === "object" && value !== null) {
    return toJsonObject(value as Record<string, unknown>) ?? {};
  }
  return String(value);
}

function toJsonObject(value?: Record<string, unknown>): JsonObject | undefined {
  if (!value) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, toJsonValue(item)])
  ) as JsonObject;
}

const runtimeApi = new ApiClient({
  baseUrl: import.meta.env.VITE_CLARTK_API_BASE_URL ?? browserBaseUrl(3000)
});
const devConsoleApi = new DevConsoleClient({
  baseUrl: import.meta.env.VITE_CLARTK_DEV_CONSOLE_API_BASE_URL ?? browserBaseUrl(3300)
});

type PanelKey =
  | "preview"
  | "coordination"
  | "review"
  | "preferences"
  | "index";

type SurfacePageOrigin = "button" | "arrow" | "marker" | "auto";

const EMPTY_PREVIEW_FEEDBACK: PreviewFeedbackCollection = {
  items: [],
  source: "dev-memory",
  total: 0
};

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
    key: "preferences",
    label: "Preferences",
    eyebrow: "Signals",
    description: "Supervised decisions and derived scorecards."
  },
  {
    key: "index",
    label: "Index",
    eyebrow: "Archive",
    description: "Workspace overview, knowledge review, and documentation catalogs."
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
  const [activeLauncher, setActiveLauncher] = React.useState<LauncherDrawerKey | null>("status");
  const lastPanelSignal = React.useRef<PanelKey | null>(null);
  const lastDetailSignal = React.useRef<"compact" | "expanded" | null>(null);
  const lastHudDensitySignal = React.useRef<HudDensity | null>(null);
  const lastMotionModeSignal = React.useRef<MotionMode | null>(null);
  const consoleLoadInFlight = React.useRef(false);
  const primaryHydrationRetryScheduled = React.useRef(false);
  const previewHydrationRetryScheduled = React.useRef(false);
  const postSessionRefreshScheduled = React.useRef(false);
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

  async function recordPreferenceSignal(
    signalKind: string,
    options: {
      surface?: string;
      panelKey?: string | null;
      payload?: Record<string, unknown>;
    } = {}
  ) {
    if (!stateRef.current.me || stateRef.current.me.account.role !== "admin") {
      return null;
    }
    try {
      const signal = await devConsoleApi.createDevPreferenceSignal({
        signalKind,
        surface: options.surface,
        panelKey: options.panelKey,
        payload: toJsonObject(options.payload)
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
      return signal;
    } catch {
      return null;
    }
  }

  async function recordPreferenceDecision(payload: {
    decisionKind: "accepted" | "rejected" | "overridden";
    subjectKind: string;
    subjectKey: string;
    chosenValue?: string | null;
    panelKey?: PanelKey;
    questionnaireKey?: string;
    questionKey?: string;
    optionKey?: string;
  }) {
    if (!stateRef.current.me || stateRef.current.me.account.role !== "admin") {
      return;
    }
    try {
      const profile = await devConsoleApi.createDevPreferenceDecision({
        decisionKind: payload.decisionKind,
        subjectKind: payload.subjectKind,
        subjectKey: payload.subjectKey,
        chosenValue: payload.chosenValue,
        payload: toJsonObject({
          panelKey: payload.panelKey,
          questionnaireKey: payload.questionnaireKey,
          questionKey: payload.questionKey,
          optionKey: payload.optionKey
        })
      });
      setState((current) => ({
        ...current,
        devProfile: profile
      }));
    } catch {
      // Keep the current profile on decision write failure.
    }
  }

  async function handleSurfacePageSignal(
    panelKey: PanelKey,
    pageKey: string,
    origin: SurfacePageOrigin
  ) {
    await recordPreferenceSignal("surface_carousel_page_selected", {
      panelKey,
      payload: {
        panelKey,
        pageKey,
        origin
      }
    });
  }

  async function handleSurfaceCardSignal(panelKey: PanelKey, cardKey: string) {
    await recordPreferenceSignal("surface_card_selected", {
      panelKey,
      payload: {
        panelKey,
        cardKey
      }
    });
  }

  async function handleQuestionnaireEvent(
    panelKey: PanelKey,
    questionnaireKey: string,
    questionKey: string | null,
    optionKey: string | null,
    eventKind: "started" | "answered" | "completed"
  ) {
    const signalKind =
      eventKind === "started"
        ? "questionnaire_started"
        : eventKind === "answered"
          ? "questionnaire_step_answered"
          : "questionnaire_completed";
    await recordPreferenceSignal(signalKind, {
      panelKey,
      payload: {
        panelKey,
        questionnaireKey,
        questionnaireSurface: "separate_screen",
        questionKey,
        optionKey,
        completionState: eventKind === "completed" ? "completed" : undefined
      }
    });
    if (eventKind === "answered" && questionKey && optionKey) {
      await recordPreferenceDecision({
        decisionKind: "accepted",
        subjectKind: "questionnaire_answer",
        subjectKey: questionKey,
        chosenValue: optionKey,
        panelKey,
        questionnaireKey,
        questionKey,
        optionKey
      });
    }
  }

  async function handleLauncherToggle(drawerKey: LauncherDrawerKey) {
    setActiveLauncher((current) => (current === drawerKey ? null : drawerKey));
    if (activeLauncher !== drawerKey) {
      await recordPreferenceSignal("telemetry_drawer_opened", {
        payload: {
          drawerKey
        }
      });
    }
  }

  async function loadSession() {
    primaryHydrationRetryScheduled.current = false;
    previewHydrationRetryScheduled.current = false;
    postSessionRefreshScheduled.current = false;
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
        if (!postSessionRefreshScheduled.current) {
          postSessionRefreshScheduled.current = true;
          window.setTimeout(() => {
            if (stateRef.current.me?.account.role === "admin") {
              void loadConsoleData(stateRef.current.selectedRunId ?? undefined);
            }
          }, 1000);
        }
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
      void loadPreviewDeckData(loadToken);
      void loadPreviewRunData(loadToken);
      void loadSupplementalConsoleData(loadToken);
      const primaryResults = await Promise.allSettled([
        devConsoleApi.getWorkspaceOverview(),
        devConsoleApi.listTasks(),
        devConsoleApi.listRuns()
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
        runs,
        selectedRunId: nextRunId,
        notice: nextNotice,
        loading: false
      }));

      void loadRunDetailData(loadToken, nextRunId);
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

  async function loadPreviewDeckData(loadToken: number) {
    const previousState = stateRef.current;
    const warnings: string[] = [];
    const previewDecksResult = await Promise.allSettled([devConsoleApi.listPreviewDecks()]);
    if (consoleLoadToken.current !== loadToken) {
      return;
    }

    const previewDecks = resolveSettledResult(
      previewDecksResult[0],
      previousState.previewDecks,
      "preview decks",
      warnings
    );

    setState((current) => ({
      ...current,
      previewDecks,
      notice:
        warnings.length > 0
          ? `Some sections are temporarily unavailable: ${warnings.join(", ")}.`
          : current.notice
    }));

    if (
      previewDecks?.items.length === 0 &&
      previousState.previewDecks === null &&
      !primaryHydrationRetryScheduled.current
    ) {
      primaryHydrationRetryScheduled.current = true;
      window.setTimeout(() => {
        if (consoleLoadToken.current === loadToken) {
          void loadPreviewDeckData(loadToken);
        }
      }, 750);
    } else if ((previewDecks?.items.length ?? 0) > 0) {
      primaryHydrationRetryScheduled.current = false;
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

    if (
      (previewRuns?.runs.length ?? 0) === 0 &&
      previousState.previewRuns === null &&
      !previewHydrationRetryScheduled.current
    ) {
      previewHydrationRetryScheduled.current = true;
      setState((current) => ({
        ...current,
        previewRuns: null
      }));
      window.setTimeout(() => {
        if (consoleLoadToken.current === loadToken) {
          void loadPreviewRunData(loadToken);
        }
      }, 750);
      return;
    }
    if ((previewRuns?.runs.length ?? 0) > 0) {
      previewHydrationRetryScheduled.current = false;
    }

    const selectedPreviewRunSummary = pickPreferredPreviewRun(
      previewRuns,
      previousState.selectedPreviewRunId
    );
    const nextPreviewRunId = selectedPreviewRunSummary?.previewRunId ?? null;

    setState((current) => ({
      ...current,
      previewRuns,
      selectedPreviewRunId: nextPreviewRunId,
      selectedPreviewRun: selectedPreviewRunSummary ?? current.selectedPreviewRun,
      previewFeedback:
        nextPreviewRunId === null
          ? EMPTY_PREVIEW_FEEDBACK
          : nextPreviewRunId === current.selectedPreviewRunId && current.previewFeedback
            ? current.previewFeedback
            : EMPTY_PREVIEW_FEEDBACK,
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
      stateRef.current.previewFeedback ?? EMPTY_PREVIEW_FEEDBACK,
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
    const selectedReviewRunSummary =
      nextReviewRunId === null
        ? null
        : reviewRuns?.runs.find((run) => run.uiReviewRunId === nextReviewRunId) ?? null;
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
      selectedReviewRun: selectedReviewRunSummary ?? current.selectedReviewRun,
      reviewBaselines,
      notice:
        warnings.length > 0
          ? `Some sections are temporarily unavailable: ${warnings.join(", ")}.`
          : current.notice
    }));

    const reviewDetailResults = await Promise.allSettled([
      nextReviewRunId === null
        ? Promise.resolve(selectedReviewRunSummary ?? previousState.selectedReviewRun)
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
      selectedReviewRun,
      reviewFindings,
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
    primaryHydrationRetryScheduled.current = false;
    previewHydrationRetryScheduled.current = false;
    postSessionRefreshScheduled.current = false;
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
      const selectedPreviewRunSummary =
        stateRef.current.previewRuns?.runs.find((run) => run.previewRunId === previewRunId) ?? null;
      setState((current) => ({
        ...current,
        selectedPreviewRunId: previewRunId,
        selectedPreviewRun: selectedPreviewRunSummary ?? current.selectedPreviewRun,
        previewFeedback:
          current.selectedPreviewRunId === previewRunId && current.previewFeedback
            ? current.previewFeedback
            : EMPTY_PREVIEW_FEEDBACK
      }));
      const detailResults = await Promise.allSettled([
        devConsoleApi.getPreviewRun(previewRunId),
        devConsoleApi.listPreviewFeedback({ previewRunId, limit: 200 })
      ]);
      setState((current) => ({
        ...current,
        selectedPreviewRun:
          detailResults[0].status === "fulfilled"
            ? detailResults[0].value
            : selectedPreviewRunSummary ?? current.selectedPreviewRun,
        previewFeedback:
          detailResults[1].status === "fulfilled"
            ? detailResults[1].value
            : current.previewFeedback ?? EMPTY_PREVIEW_FEEDBACK
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  const handlePreviewHydration = React.useCallback(async () => {
    try {
      const previewRuns = await devConsoleApi.listPreviewRuns({ limit: 12 });
      const selectedPreviewRunSummary = pickPreferredPreviewRun(
        previewRuns,
        stateRef.current.selectedPreviewRunId
      );
      const nextPreviewRunId = selectedPreviewRunSummary?.previewRunId ?? null;
      setState((current) => ({
        ...current,
        previewRuns,
        selectedPreviewRunId: nextPreviewRunId,
        selectedPreviewRun: selectedPreviewRunSummary ?? current.selectedPreviewRun,
        previewFeedback:
          nextPreviewRunId === null
            ? EMPTY_PREVIEW_FEEDBACK
            : nextPreviewRunId === current.selectedPreviewRunId && current.previewFeedback
              ? current.previewFeedback
              : EMPTY_PREVIEW_FEEDBACK
      }));
      if (nextPreviewRunId === null) {
        return;
      }

      const detailResults = await Promise.allSettled([
        devConsoleApi.getPreviewRun(nextPreviewRunId),
        devConsoleApi.listPreviewFeedback({
          previewRunId: nextPreviewRunId,
          limit: 200
        })
      ]);
      const selectedPreviewRun =
        detailResults[0].status === "fulfilled"
          ? detailResults[0].value
          : selectedPreviewRunSummary;
      const previewFeedback =
        detailResults[1].status === "fulfilled"
          ? detailResults[1].value
          : stateRef.current.previewFeedback ?? EMPTY_PREVIEW_FEEDBACK;
      setState((current) => ({
        ...current,
        selectedPreviewRun: selectedPreviewRun ?? current.selectedPreviewRun,
        previewFeedback
      }));
    } catch {
      // Keep current preview state on hydration failure.
    }
  }, []);

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
  const queueSummary = summarizeQueueHealth(state.tasks?.queues ?? []);
  const learningStats = summarizeLearningStats(state.devProfile);
  const panelMetrics: Record<PanelKey, string> = {
    preview: `${state.previewRuns?.runs.length ?? 0} runs`,
    coordination: `${state.tasks?.items.length ?? 0} tasks`,
    review: `${state.reviewRuns?.runs.length ?? 0} reviews`,
    preferences: `${state.devProfile?.recentSignals.length ?? 0} signals`,
    index: `${healthyServiceCount}/${totalServiceCount || 0} ready`
  };

  let selectedPanelContent: React.ReactNode = null;
  if (state.selectedPanel === "preview") {
    selectedPanelContent = (
      <PreviewSurface
        previewDecks={state.previewDecks}
        previewRuns={state.previewRuns}
        selectedPreviewRunId={state.selectedPreviewRunId}
        selectedPreviewRun={state.selectedPreviewRun}
        previewFeedback={state.previewFeedback}
        loading={state.loading}
        onStartPreview={handlePreviewStart}
        onSelectPreviewRun={handlePreviewRunSelection}
        onSubmitFeedback={handlePreviewFeedbackSubmit}
        onHydratePreviewState={handlePreviewHydration}
        onStageModeChange={handlePreviewSubpaneChange}
        onSurfacePageChange={handleSurfacePageSignal}
        onSurfaceCardSignal={handleSurfaceCardSignal}
        onQuestionnaireEvent={handleQuestionnaireEvent}
      />
    );
  } else if (state.selectedPanel === "coordination") {
    selectedPanelContent = (
      <CoordinationSurface
        tasks={state.tasks}
        runs={state.runs}
        runDetail={state.runDetail}
        loading={state.loading}
        onSelectRun={handleRunSelection}
        onRetrySelectedTask={handleRetrySelectedTask}
        onEnqueue={handleEnqueue}
        onSupervision={handleSupervision}
        onSurfacePageChange={handleSurfacePageSignal}
        onSurfaceCardSignal={handleSurfaceCardSignal}
        onQuestionnaireEvent={handleQuestionnaireEvent}
      />
    );
  } else if (state.selectedPanel === "review") {
    selectedPanelContent = (
      <ReviewSurface
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
        onSurfacePageChange={handleSurfacePageSignal}
        onSurfaceCardSignal={handleSurfaceCardSignal}
        onQuestionnaireEvent={handleQuestionnaireEvent}
      />
    );
  } else if (state.selectedPanel === "preferences") {
    selectedPanelContent = (
      <PreferencesSurface
        me={state.me}
        devProfile={state.devProfile}
        onSupervision={handleSupervision}
        onSurfacePageChange={handleSurfacePageSignal}
        onQuestionnaireEvent={handleQuestionnaireEvent}
      />
    );
  } else if (state.selectedPanel === "index") {
    selectedPanelContent = (
      <IndexSurface
        overview={state.overview}
        loading={state.loading}
        sourceDocuments={state.sourceDocuments}
        claims={state.claims}
        evaluations={state.evaluations}
        docs={state.docs}
        skills={state.skills}
        detailDepth={state.detailDepth}
        onSurfacePageChange={handleSurfacePageSignal}
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

  let launcherDrawerContent: React.ReactNode = null;
  if (activeLauncher === "status") {
    launcherDrawerContent = (
      <div className="hud-launcher-drawer-grid">
        <TelemetryChip
          label="Workspace"
          value={state.overview?.status ?? (state.loading ? "loading" : "unknown")}
        />
        <TelemetryChip label="Services" value={`${healthyServiceCount}/${totalServiceCount || 0}`} />
        <TelemetryChip
          label="Preview"
          value={state.selectedPreviewRun ? `#${state.selectedPreviewRun.previewRunId}` : "idle"}
        />
        <TelemetryChip
          label="Review"
          value={state.selectedReviewRun ? `#${state.selectedReviewRun.uiReviewRunId}` : "idle"}
        />
        <TelemetryChip label="Queue" value={selectedRunLabel} />
      </div>
    );
  } else if (activeLauncher === "quick-controls") {
    launcherDrawerContent = (
      <div className="hud-launcher-drawer-grid hud-launcher-controls">
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
    );
  } else if (activeLauncher === "filters") {
    launcherDrawerContent = (
      <FactGrid
        entries={[
          { label: "Active panel", value: activePanel.label },
          { label: "Selected run", value: selectedRunLabel },
          { label: "Queue failures", value: String(queueSummary.failedCount) },
          { label: "Signals", value: String(learningStats.signalCount) },
          {
            label: "Archive records",
            value: String(
              (state.docs?.items.length ?? 0) +
                (state.claims?.items.length ?? 0) +
                (state.sourceDocuments?.items.length ?? 0)
            )
          }
        ]}
      />
    );
  } else if (activeLauncher === "comms") {
    launcherDrawerContent = (
      <div className="detail-stack">
        <div className="detail-card">
          <div className="section-heading">
            <h4>Supervised flow</h4>
            <p>Use the `Questions` page in the active surface for structured answers.</p>
          </div>
          <p className="detail-copy">
            Each answer is written as a signal plus a supervised decision inside the development
            preference plane.
          </p>
        </div>
        <div className="detail-card">
          <div className="section-heading">
            <h4>Recent supervised decisions</h4>
          </div>
          <ListBlock
            emptyLabel="No supervised decisions yet."
            items={(state.devProfile?.recentDecisions ?? []).slice(0, 4).map((decision) => ({
              title: `${decision.decisionKind} · ${decision.subjectKey}`,
              subtitle: decision.subjectKind,
              body: (
                <p className="detail-copy">
                  {decision.chosenValue ?? "No chosen value"} · {formatTimestamp(decision.createdAt)}
                </p>
              )
            }))}
          />
        </div>
      </div>
    );
  } else if (activeLauncher === "profile") {
    launcherDrawerContent = sessionPanel;
  }

  return (
    <AppFrame
      title="ClaRTK Development Interface"
      subtitle="Military-ops HUD for preview runs, supervised review, and bounded development coordination."
      density={state.hudDensity}
      motionMode={state.motionMode}
    >
      {isAdmin ? (
        <div className="console-shell">
          <div className="hud-launcher">
            <div className="hud-launcher-brand">
              <span className="hud-kicker">ClaRTK // Development Interface</span>
              <strong>{activePanel.label}</strong>
              <p>{activePanel.description}</p>
            </div>
            <div className="hud-launcher-actions">
              <LauncherButton
                label="Status"
                icon="status"
                active={activeLauncher === "status"}
                onClick={() => void handleLauncherToggle("status")}
              />
              <LauncherButton
                label="Quick Controls"
                icon="controls"
                active={activeLauncher === "quick-controls"}
                onClick={() => void handleLauncherToggle("quick-controls")}
              />
              <LauncherButton
                label="Filters"
                icon="filters"
                active={activeLauncher === "filters"}
                onClick={() => void handleLauncherToggle("filters")}
              />
              <LauncherButton
                label="Comms"
                icon="comms"
                active={activeLauncher === "comms"}
                onClick={() => void handleLauncherToggle("comms")}
              />
              <LauncherButton
                label="Profile"
                icon="profile"
                active={activeLauncher === "profile"}
                onClick={() => void handleLauncherToggle("profile")}
              />
            </div>
          </div>
          {launcherDrawerContent ? (
            <div className="hud-launcher-drawer">{launcherDrawerContent}</div>
          ) : null}

          {state.notice ? <Message tone="ok">{state.notice}</Message> : null}
          {state.error ? <Message tone="error">{state.error}</Message> : null}

          <div className="console-grid">
            <aside className="command-rail">
              <Panel title="Surface Ring" eyebrow="Command Rail" accent="muted">
                <div className="console-nav console-nav-icons">
                  {panelDefinitions.map((panel) => (
                    <IconNavButton
                      key={panel.key}
                      panelKey={panel.key}
                      label={panel.label}
                      detail={panelMetrics[panel.key]}
                      active={state.selectedPanel === panel.key}
                      onClick={() =>
                        setState((current) => ({ ...current, selectedPanel: panel.key }))
                      }
                    />
                  ))}
                </div>
              </Panel>
              <Panel title="Telemetry" eyebrow="Derived" accent="muted">
                <div className="detail-stack">
                  <StatusRing
                    label="Run health"
                    values={[
                      { label: "preview", value: state.previewRuns?.runs.length ?? 0, tone: "ok" },
                      { label: "review", value: state.reviewRuns?.runs.length ?? 0, tone: "neutral" },
                      { label: "failed queues", value: queueSummary.failedCount, tone: "degraded" }
                    ]}
                  />
                  <SparkBars
                    label="Learning pulse"
                    values={learningStats.sparkValues}
                    captions={["signals", "decisions", "accepted", "rejected", "overridden"]}
                  />
                </div>
              </Panel>
            </aside>

            <main className="console-main">
              {selectedPanelContent}
            </main>

            <aside className="context-rail">
              <Panel title="Current Focus" eyebrow={activePanel.eyebrow} accent="muted">
                <div className="console-focus-grid">
                  <InfoCard label="Panel" value={activePanel.label} detail={activePanel.description} />
                  <InfoCard label="Density" value={state.hudDensity} detail={`${state.motionMode} motion`} />
                  <InfoCard label="Selected run" value={selectedRunLabel} detail={state.runDetail?.run.taskSlug ?? "No coordination run selected."} />
                  <InfoCard label="Preview" value={state.selectedPreviewRun?.status ?? "idle"} detail={state.selectedPreviewRun?.deckKey ?? "No preview run selected."} />
                  <InfoCard label="Review" value={state.selectedReviewRun?.status ?? "idle"} detail={state.reviewFindings?.findings.length ? `${state.reviewFindings.findings.length} findings loaded` : "No findings loaded."} />
                </div>
              </Panel>
              <Panel title="Mission Brief" eyebrow="Ops Context" accent="muted">
                <div className="detail-stack">
                  <div className="detail-card">
                    <div className="section-heading">
                      <h4>Carousel rule</h4>
                      <p>The main surface rotates page-sized trays instead of stacking long forms.</p>
                    </div>
                    <p className="detail-copy">
                      Preview stays stage-first. Questions live on separate surface pages. Long
                      evidence streams belong in bounded list panes, not in document scroll.
                    </p>
                  </div>
                  <div className="detail-card">
                    <QueuePulseBars queues={state.tasks?.queues ?? []} />
                  </div>
                  <div className="detail-card">
                    <VisualAlertStrip
                      items={collectVisualAlerts(state.selectedPreviewRun, state.selectedReviewRun)}
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
    <div className={`hud-frame hud-density-${props.density} hud-motion-${props.motionMode}`}>
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

type GlyphKey =
  | "status"
  | "controls"
  | "filters"
  | "comms"
  | "profile"
  | PanelKey;

interface SurfacePageDefinition {
  key: string;
  label: string;
  eyebrow: string;
  summary?: string;
  content: React.ReactNode;
}

interface QuestionnaireOption {
  key: string;
  label: string;
  description: string;
}

interface QuestionnaireStep {
  key: string;
  prompt: string;
  options: QuestionnaireOption[];
}

const SURFACE_QUESTIONNAIRES: Record<
  "preview" | "coordination" | "review" | "preferences",
  QuestionnaireStep[]
> = {
  preview: [
    {
      key: "outcome",
      prompt: "What outcome should this preview optimize first?",
      options: [
        { key: "clarity", label: "Concept Clarity", description: "Prioritize understanding of the proposal." },
        { key: "visual_impact", label: "Visual Impact", description: "Push the presentation and staging harder." },
        { key: "implementation_scope", label: "Implementation Scope", description: "Show concrete build intent and limits." }
      ]
    },
    {
      key: "priority",
      prompt: "Which revision priority should agents act on next?",
      options: [
        { key: "stage_layout", label: "Stage Layout", description: "Improve preview framing and page flow." },
        { key: "evidence_quality", label: "Evidence Quality", description: "Strengthen screenshots and source mapping." },
        { key: "feedback_capture", label: "Feedback Capture", description: "Refine the supervised review loop." }
      ]
    },
    {
      key: "next_action",
      prompt: "What should happen immediately after this review pass?",
      options: [
        { key: "approve_direction", label: "Approve Direction", description: "Continue with the current concept." },
        { key: "request_revision", label: "Request Revision", description: "Iterate this deck before further build-out." },
        { key: "pause_for_research", label: "Pause For Research", description: "Gather more verified evidence first." }
      ]
    }
  ],
  coordination: [
    {
      key: "queue_action",
      prompt: "Which coordination action is the best next move?",
      options: [
        { key: "retry_selected", label: "Retry Selected", description: "Re-run the currently selected task path." },
        { key: "enqueue_research", label: "Enqueue Research", description: "Queue more evidence gathering first." },
        { key: "stabilize_queue", label: "Stabilize Queue", description: "Reduce churn and clear failure backlog." }
      ]
    },
    {
      key: "owner_scope",
      prompt: "What ownership pattern should apply to the next change?",
      options: [
        { key: "single_owner", label: "Single Owner", description: "Keep one path owner for the next slice." },
        { key: "split_write_sets", label: "Split Write Sets", description: "Parallelize only disjoint path owners." },
        { key: "read_only_research", label: "Read-Only Research", description: "Hold code edits until research completes." }
      ]
    },
    {
      key: "urgency",
      prompt: "How urgent is the next coordination step?",
      options: [
        { key: "immediate", label: "Immediate", description: "Act on the next worker cycle." },
        { key: "normal", label: "Normal", description: "Handle in the standard queue cadence." },
        { key: "defer", label: "Defer", description: "Hold this until other evidence lands." }
      ]
    }
  ],
  review: [
    {
      key: "finding_disposition",
      prompt: "How should current review findings be treated?",
      options: [
        { key: "accept_findings", label: "Accept Findings", description: "Treat the deterministic findings as valid." },
        { key: "reject_findings", label: "Reject Findings", description: "Dismiss the current findings as non-actionable." },
        { key: "needs_more_evidence", label: "Need Evidence", description: "Capture more evidence before deciding." }
      ]
    },
    {
      key: "baseline_intent",
      prompt: "What baseline action should follow review?",
      options: [
        { key: "promote", label: "Promote", description: "Approve the current images as the new baseline." },
        { key: "hold", label: "Hold", description: "Keep current baselines and continue iterating." },
        { key: "rebuild", label: "Rebuild", description: "Capture a new run before deciding." }
      ]
    },
    {
      key: "next_action",
      prompt: "What should the review lane do next?",
      options: [
        { key: "generate_fix", label: "Generate Fix", description: "Turn findings into a remediation slice." },
        { key: "retest", label: "Retest", description: "Run capture/analyze again with the same target." },
        { key: "archive", label: "Archive", description: "Record the result and move on." }
      ]
    }
  ],
  preferences: [
    {
      key: "density",
      prompt: "Which HUD density serves this workspace best?",
      options: [
        { key: "compact", label: "Compact", description: "Maximize information density." },
        { key: "comfortable", label: "Comfortable", description: "Increase spacing for readability." }
      ]
    },
    {
      key: "motion",
      prompt: "Which motion mode should the HUD prefer?",
      options: [
        { key: "reduced", label: "Reduced Motion", description: "Prefer instant transitions and lower movement." },
        { key: "standard", label: "Standard Motion", description: "Allow restrained animated transitions." }
      ]
    },
    {
      key: "telemetry_mode",
      prompt: "How much telemetry should stay visible by default?",
      options: [
        { key: "minimal", label: "Minimal", description: "Show only essential mission signals." },
        { key: "balanced", label: "Balanced", description: "Mix high-signal telemetry with context." },
        { key: "verbose", label: "Verbose", description: "Keep dense instrumentation visible." }
      ]
    }
  ]
};

function Glyph(props: { icon: GlyphKey }) {
  const node =
    props.icon === "status" ? "S" :
    props.icon === "controls" ? "C" :
    props.icon === "filters" ? "F" :
    props.icon === "comms" ? "M" :
    props.icon === "profile" ? "P" :
    props.icon === "preview" ? "P" :
    props.icon === "coordination" ? "Q" :
    props.icon === "review" ? "R" :
    props.icon === "preferences" ? "T" :
    "I";
  return <span aria-hidden="true">{node}</span>;
}

function LauncherButton(props: {
  label: string;
  icon: GlyphKey;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`launcher-button hud-launcher-button${props.active ? " is-active" : ""}`}
      onClick={props.onClick}
      type="button"
    >
      <Glyph icon={props.icon} />
      <span>{props.label}</span>
    </button>
  );
}

function IconNavButton(props: {
  panelKey: PanelKey;
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`icon-nav-button${props.active ? " is-active" : ""}`}
      onClick={props.onClick}
      type="button"
    >
      <Glyph icon={props.panelKey} />
      <span className="icon-nav-copy">
        <strong>{props.label}</strong>
        <span>{props.detail}</span>
      </span>
    </button>
  );
}

function StatusRing(props:
  | { label: string; value: number; total: number }
  | { label: string; values: Array<{ label: string; value: number; tone: "ok" | "neutral" | "degraded" }> }
) {
  const totalValue = "values" in props ? props.values.reduce((sum, item) => sum + item.value, 0) : props.total;
  const currentValue = "values" in props ? Math.max(...props.values.map((item) => item.value), 0) : props.value;
  const safeTotal = Math.max(totalValue, 1);
  const ratio = Math.max(0, Math.min(1, currentValue / safeTotal));
  const circumference = 94;
  const dashOffset = circumference * (1 - ratio);
  return (
    <div className="status-ring">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="status-ring-base" cx="20" cy="20" r="15" />
        <circle
          className="status-ring-segment"
          cx="20"
          cy="20"
          r="15"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div>
        <strong>
          {"values" in props ? `${props.values.length} lanes` : `${props.value}/${props.total}`}
        </strong>
        <span>{props.label}</span>
      </div>
    </div>
  );
}

function SparkBars(props: { values: number[]; label?: string; captions?: string[] }) {
  const maxValue = Math.max(...props.values, 1);
  return (
    <div className="detail-stack">
      {props.label ? <span className="surface-shell-page-label">{props.label}</span> : null}
      <div className="spark-bars" aria-hidden="true">
        {props.values.map((value, index) => (
          <span
            key={`${value}-${index}`}
            title={props.captions?.[index]}
            style={{ height: `${Math.max(12, (value / maxValue) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function QueuePulseBars(props: {
  queues?: AgentTaskCollection["queues"];
  values?: number[];
}) {
  const entries =
    props.queues?.map((queue) => ({
      label: queue.queueName,
      value: queue.queuedCount + queue.leasedCount,
      tone: queue.failedCount > 0 ? "degraded" : queue.leasedCount > 0 ? "neutral" : "ok"
    })) ??
    (props.values ?? []).map((value, index) => ({
      label: `Lane ${index + 1}`,
      value,
      tone: value > 0 ? "neutral" : "ok"
    }));
  const maxValue = Math.max(...entries.map((entry) => entry.value), 1);
  if (!entries.length) {
    return <p className="empty-copy">No queue pulse data available.</p>;
  }
  return (
    <div className="queue-pulse-list">
      {entries.map((entry) => (
        <div key={entry.label} className="queue-pulse-row">
          <div className="queue-pulse-label">
            <strong>{entry.label}</strong>
            <span>{entry.value}</span>
          </div>
          <div className="queue-pulse-bar">
            <div
              className={`queue-pulse-fill tone-${entry.tone}`}
              style={{ width: `${Math.max(8, (entry.value / maxValue) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function QuestionnaireProgressMeter(props: { currentStep: number; totalSteps: number }) {
  const ratio = props.totalSteps > 0 ? (props.currentStep + 1) / props.totalSteps : 0;
  return (
    <div className="questionnaire-progress">
      <span>Step {Math.min(props.currentStep + 1, props.totalSteps)} / {props.totalSteps}</span>
      <div className="questionnaire-progress-track">
        <div className="questionnaire-progress-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function VisualAlertStrip(props: { items: string[] }) {
  if (!props.items.length) {
    return (
      <div className="visual-alert-strip">
        <StatusPill status="ok">No visual alerts</StatusPill>
      </div>
    );
  }
  return (
    <div className="visual-alert-strip">
      {props.items.slice(0, 4).map((item) => (
        <StatusPill key={item} status="neutral">{item}</StatusPill>
      ))}
    </div>
  );
}

function SurfaceCarousel(props: {
  panelKey: PanelKey;
  title: string;
  summary: string;
  pages: SurfacePageDefinition[];
  activePage: string;
  onPageChange: (pageKey: string, origin: SurfacePageOrigin) => void;
}) {
  const activeIndex = Math.max(0, props.pages.findIndex((page) => page.key === props.activePage));
  const activePage = props.pages[activeIndex] ?? props.pages[0];

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      const nextIndex =
        event.key === "ArrowRight"
          ? Math.min(props.pages.length - 1, activeIndex + 1)
          : Math.max(0, activeIndex - 1);
      if (nextIndex !== activeIndex) {
        props.onPageChange(props.pages[nextIndex].key, "arrow");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, props]);

  return (
    <section className="surface-carousel">
      <header className="surface-carousel-header">
        <div className="surface-shell-copy">
          <span className="surface-shell-page-label">{activePage?.eyebrow ?? props.title}</span>
          <h3>{props.title}</h3>
          <p>{activePage?.summary ?? props.summary}</p>
        </div>
        <div className="surface-carousel-controls">
          <button
            type="button"
            onClick={() => props.onPageChange(props.pages[Math.max(0, activeIndex - 1)].key, "arrow")}
            disabled={activeIndex === 0}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => props.onPageChange(props.pages[Math.min(props.pages.length - 1, activeIndex + 1)].key, "arrow")}
            disabled={activeIndex === props.pages.length - 1}
          >
            Next
          </button>
        </div>
      </header>
      <div className="surface-carousel-stage">
        <div className="surface-carousel-track" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
          {props.pages.map((page) => (
            <section key={page.key} className="surface-carousel-page" aria-hidden={page.key !== activePage?.key}>
              <div className="surface-carousel-page-inner">{page.content}</div>
            </section>
          ))}
        </div>
      </div>
      <div className="surface-carousel-markers">
        {props.pages.map((page) => (
          <button
            key={page.key}
            className={`surface-carousel-marker${page.key === activePage?.key ? " is-active" : ""}`}
            onClick={() => props.onPageChange(page.key, "marker")}
            type="button"
          >
            <strong>{page.label}</strong>
            <span>{page.eyebrow}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function QuestionnairePage(props: {
  panelKey: PanelKey;
  questionnaireKey: string;
  title: string;
  description: string;
  steps: QuestionnaireStep[];
  onEvent: (
    panelKey: PanelKey,
    questionnaireKey: string,
    questionKey: string | null,
    optionKey: string | null,
    eventKind: "started" | "answered" | "completed"
  ) => Promise<void>;
  onExit: () => void;
}) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const step = props.steps[stepIndex];
  const selectedOption = answers[step.key] ?? null;

  React.useEffect(() => {
    void props.onEvent(props.panelKey, props.questionnaireKey, null, null, "started");
  }, [props]);

  async function selectOption(optionKey: string) {
    setAnswers((current) => ({ ...current, [step.key]: optionKey }));
    await props.onEvent(props.panelKey, props.questionnaireKey, step.key, optionKey, "answered");
  }

  async function completeQuestionnaire() {
    await props.onEvent(props.panelKey, props.questionnaireKey, null, null, "completed");
    props.onExit();
  }

  return (
    <div className="questionnaire-shell">
      <div className="questionnaire-brief">
        <h3>{props.title}</h3>
        <p>{props.description}</p>
      </div>
      <div className="questionnaire-stage">
        <div className="questionnaire-card">
          <QuestionnaireProgressMeter currentStep={stepIndex} totalSteps={props.steps.length} />
          <div className="section-heading">
            <h4>{step.prompt}</h4>
            <p>Multiple choice only. One supervised answer per step.</p>
          </div>
          <div className="questionnaire-options">
            {step.options.map((option) => (
              <button
                key={option.key}
                className={`questionnaire-option${selectedOption === option.key ? " is-active" : ""}`}
                onClick={() => void selectOption(option.key)}
                type="button"
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
          <div className="action-strip">
            <button type="button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0}>
              Back
            </button>
            {stepIndex < props.steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIndex((current) => Math.min(props.steps.length - 1, current + 1))}
                disabled={!selectedOption}
              >
                Continue
              </button>
            ) : (
              <button type="button" onClick={() => void completeQuestionnaire()} disabled={!selectedOption}>
                Complete
              </button>
            )}
            <button type="button" onClick={props.onExit}>
              Return
            </button>
          </div>
        </div>
        <aside className="questionnaire-sidebar">
          <ListBlock
            items={props.steps.map((question, index) => ({
              title: `${String(index + 1).padStart(2, "0")} · ${question.key}`,
              subtitle: answers[question.key] ? `Answer: ${answers[question.key]}` : "Pending"
            }))}
          />
        </aside>
      </div>
    </div>
  );
}

function PreviewSurface(props: {
  previewDecks: PresentationDeckSourceCollection | null;
  previewRuns: PreviewRunCollection | null;
  selectedPreviewRunId: number | null;
  selectedPreviewRun: PreviewRun | null;
  previewFeedback: PreviewFeedbackCollection | null;
  loading: boolean;
  onStartPreview: (deckKey: string) => void;
  onSelectPreviewRun: (previewRunId: number) => void;
  onSubmitFeedback: (previewRunId: number, feedbackKind: string, comment: string, slideId?: string | null) => void;
  onHydratePreviewState: () => Promise<void>;
  onStageModeChange: (mode: "conversation" | "deck") => void;
  onSurfacePageChange: (panelKey: PanelKey, pageKey: string, origin: SurfacePageOrigin) => Promise<void>;
  onSurfaceCardSignal: (panelKey: PanelKey, cardKey: string) => Promise<void>;
  onQuestionnaireEvent: (
    panelKey: PanelKey,
    questionnaireKey: string,
    questionKey: string | null,
    optionKey: string | null,
    eventKind: "started" | "answered" | "completed"
  ) => Promise<void>;
}) {
  const [page, setPage] = React.useState("stage");
  const [returnPage, setReturnPage] = React.useState("stage");
  const [selectedDeckKey, setSelectedDeckKey] = React.useState("");
  const [selectedSlideId, setSelectedSlideId] = React.useState<string | null>(null);
  const [feedbackScope, setFeedbackScope] = React.useState("");
  const [feedbackComment, setFeedbackComment] = React.useState("");
  const [stageMode, setStageMode] = React.useState<"conversation" | "deck">("conversation");
  const previewDecksLoaded = props.previewDecks !== null;
  const previewRunsLoaded = props.previewRuns !== null;
  const decks = props.previewDecks?.items ?? [];
  const runs = props.previewRuns?.runs ?? [];
  const selectedRun = props.selectedPreviewRun ?? pickPreferredPreviewRun(props.previewRuns, props.selectedPreviewRunId);
  const manifest = parsePreviewManifest(selectedRun);
  const previewAnalysis = summarizePreviewAnalysis(selectedRun);
  const slides = manifest?.slides ?? [];
  const selectedDeck =
    decks.find((deck) => deck.deckKey === selectedDeckKey) ??
    decks.find((deck) => deck.deckKey === selectedRun?.deckKey) ??
    decks[0] ??
    null;
  const selectedSlide =
    slides.find((slide) => slide.slideId === selectedSlideId) ??
    slides[0] ??
    null;
  const previewHtmlPath = extractPreviewHtmlPath(selectedRun);
  const previewUrl = previewHtmlPath ? devConsoleApi.previewAssetUrl(previewHtmlPath) : null;
  const feedbackItems = props.previewFeedback?.items ?? [];
  const scopedFeedback = selectedSlide
    ? feedbackItems.filter((item) => !item.slideId || item.slideId === selectedSlide.slideId)
    : feedbackItems;
  const feedbackSummary = summarizePreviewFeedback(scopedFeedback);

  React.useEffect(() => {
    void props.onSurfacePageChange("preview", page, "auto");
  }, [page, props]);

  React.useEffect(() => {
    if (!selectedDeckKey && decks.length) {
      setSelectedDeckKey(selectedRun?.deckKey ?? decks[0].deckKey);
    }
  }, [decks, selectedDeckKey, selectedRun?.deckKey]);

  React.useEffect(() => {
    setSelectedSlideId(slides[0]?.slideId ?? null);
  }, [selectedRun?.previewRunId, slides]);

  React.useEffect(() => {
    void props.onStageModeChange(stageMode);
  }, [props, stageMode]);

  React.useEffect(() => {
    if (!previewDecksLoaded || previewRunsLoaded) {
      return;
    }
    void props.onHydratePreviewState();
  }, [previewDecksLoaded, previewRunsLoaded, props]);

  function changePage(pageKey: string, origin: SurfacePageOrigin) {
    if (pageKey === "questions") {
      setReturnPage(page);
    }
    setPage(pageKey);
    void props.onSurfacePageChange("preview", pageKey, origin);
  }

  function submitFeedback(feedbackKind: string) {
    if (!selectedRun) {
      return;
    }
    props.onSubmitFeedback(selectedRun.previewRunId, feedbackKind, feedbackComment.trim(), feedbackScope || null);
    setFeedbackComment("");
  }

  const pages: SurfacePageDefinition[] = [
    {
      key: "launch",
      label: "Launch",
      eyebrow: "Deck Sources",
      summary: "Start a render from source-verified deck inputs without burying the stage.",
      content: (
        <div className="surface-page-grid surface-page-grid-preview-launch">
          <Panel title="Deck Sources" eyebrow="Catalog">
            <ListBlock
              emptyLabel={previewDecksLoaded ? "No preview decks found." : "Loading preview decks…"}
              items={decks.map((deck) => ({
                title: deck.title,
                subtitle: `${deck.slideCount} slides · ${deck.deckKey}`,
                body: (
                  <div className="detail-stack">
                    <p className="detail-copy">{deck.summary || "No summary recorded."}</p>
                    <div className="action-strip">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeckKey(deck.deckKey);
                          void props.onSurfaceCardSignal("preview", `deck:${deck.deckKey}`);
                        }}
                      >
                        Select
                      </button>
                      <button type="button" onClick={() => props.onStartPreview(deck.deckKey)}>
                        Start preview
                      </button>
                    </div>
                  </div>
                )
              }))}
            />
          </Panel>
          <Panel title="Launch Summary" eyebrow="Readiness">
            <div className="detail-stack">
              <StatusRing value={runs.length} total={Math.max(runs.length, 1)} label="Preview runs" />
              <FactGrid
                entries={[
                  { label: "Selected deck", value: selectedDeck?.deckKey ?? "none" },
                  { label: "Companion", value: selectedDeck?.hasPreviewCompanion ? "present" : "markdown only" },
                  { label: "Latest run", value: selectedRun ? `#${selectedRun.previewRunId}` : "none" },
                  { label: "Slides", value: selectedDeck ? String(selectedDeck.slideCount) : "0" }
                ]}
              />
              {selectedDeck ? <DeckSourcePreview deck={selectedDeck} /> : <PreviewEmptyState loading={props.loading} />}
            </div>
          </Panel>
        </div>
      )
    },
    {
      key: "stage",
      label: "Stage",
      eyebrow: "Mission Surface",
      summary: "Keep the preview stage above the fold with run and slide context docked around it.",
      content: (
        <div className="surface-page-grid surface-page-grid-wide">
          <Panel title="Preview Stage" eyebrow="Renderable">
            <div className="detail-stack">
              <div className="action-strip">
                <button type="button" onClick={() => setStageMode("conversation")}>Slide Review</button>
                <button type="button" onClick={() => setStageMode("deck")} disabled={!previewUrl}>Full Deck</button>
                {selectedRun ? (
                  <button type="button" onClick={() => void props.onSelectPreviewRun(selectedRun.previewRunId)}>
                    Refresh selected run
                  </button>
                ) : null}
              </div>
              {selectedRun && stageMode === "conversation" ? (
                <SlideConversationStage
                  run={selectedRun}
                  selectedSlide={selectedSlide}
                  slides={slides}
                  communicationItems={scopedFeedback}
                  communicationSummary={feedbackSummary}
                  previewUrl={previewUrl}
                  onSelectSlide={(slideId) => {
                    setSelectedSlideId(slideId);
                    void props.onSurfaceCardSignal("preview", `slide:${slideId}`);
                  }}
                />
              ) : previewUrl ? (
                <iframe
                  className="preview-iframe"
                  key={previewUrl}
                  src={previewUrl}
                  title={selectedRun?.title ?? "Preview stage"}
                  sandbox="allow-scripts allow-popups allow-presentation"
                />
              ) : (
                <PreviewEmptyState loading={props.loading} />
              )}
            </div>
          </Panel>
          <Panel title="Run Rail" eyebrow="Recent">
            <ListBlock
              emptyLabel={previewRunsLoaded ? "No preview runs recorded yet." : "Loading preview runs…"}
              items={runs.slice(0, 10).map((run) => ({
                title: `Run #${run.previewRunId}`,
                subtitle: `${run.status} · ${run.deckKey}`,
                body: (
                  <div className="action-strip">
                    <button
                      type="button"
                      onClick={() => {
                        props.onSelectPreviewRun(run.previewRunId);
                        void props.onSurfaceCardSignal("preview", `run:${run.previewRunId}`);
                      }}
                    >
                      Inspect
                    </button>
                    <StatusPill status={statusToneForPreviewRun(run.status)}>{run.status}</StatusPill>
                  </div>
                )
              }))}
            />
          </Panel>
        </div>
      )
    },
    {
      key: "evidence",
      label: "Evidence",
      eyebrow: "Inspector",
      summary: "Source bullets, evidence, slide screenshots, and supervised feedback stay on one bounded page.",
      content: (
        <div className="surface-page-grid surface-page-grid-evidence">
          <Panel title="Slides" eyebrow="Manifest">
            <ListBlock
              emptyLabel={selectedRun ? "No slides found in the manifest." : "Select a preview run first."}
              items={slides.map((slide) => ({
                title: slide.title,
                subtitle: slide.slideId,
                body: (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSlideId(slide.slideId);
                      void props.onSurfaceCardSignal("preview", `slide:${slide.slideId}`);
                    }}
                  >
                    Focus slide
                  </button>
                )
              }))}
            />
          </Panel>
          <Panel title="Selected Slide" eyebrow="Source">
            {selectedSlide ? (
              <div className="detail-stack">
                <FactGrid
                  entries={[
                    { label: "Slide", value: selectedSlide.slideId },
                    { label: "Audience goal", value: selectedSlide.audienceGoal || "Not specified" },
                    { label: "Media", value: String(selectedSlide.media.length) },
                    { label: "Evidence", value: String(selectedSlide.evidencePaths.length) }
                  ]}
                />
                <StructuredValue
                  value={{
                    bullets: selectedSlide.bullets,
                    visualGuidance: selectedSlide.visualGuidance,
                    speakerNotes: selectedSlide.speakerNotes,
                    evidencePaths: selectedSlide.evidencePaths
                  }}
                />
              </div>
            ) : (
              <p className="empty-copy">No slide selected.</p>
            )}
          </Panel>
          <Panel title="Feedback Thread" eyebrow="Supervised">
            {selectedRun ? (
              <div className="detail-stack">
                <label className="preview-field">
                  <span>Scope</span>
                  <select value={feedbackScope} onChange={(event) => setFeedbackScope(event.target.value)} style={inputStyle}>
                    <option value="">Entire run</option>
                    {slides.map((slide) => (
                      <option key={slide.slideId} value={slide.slideId}>{slide.title}</option>
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
                    placeholder="Record the supervised review outcome."
                  />
                </label>
                <div className="action-strip">
                  <button type="button" onClick={() => submitFeedback("comment")}>Comment</button>
                  <button type="button" onClick={() => submitFeedback("requested_changes")}>Request Changes</button>
                  <button type="button" onClick={() => submitFeedback("approved")}>Approve</button>
                  <button type="button" onClick={() => submitFeedback("rejected")}>Reject</button>
                </div>
                <StatusRing value={feedbackSummary.approvedCount} total={Math.max(feedbackSummary.totalCount, 1)} label="Approval ratio" />
                <ListBlock
                  emptyLabel="No feedback recorded yet."
                  items={feedbackItems.slice(0, 8).map((item) => ({
                    title: item.feedbackKind,
                    subtitle: `${item.slideId ?? "Entire run"} · ${formatTimestamp(item.createdAt)}`,
                    body: <p className="detail-copy">{item.comment || "No comment provided."}</p>
                  }))}
                />
                <VisualAlertStrip items={previewAnalysis.warnings} />
              </div>
            ) : (
              <p className="empty-copy">Select a preview run before leaving feedback.</p>
            )}
          </Panel>
        </div>
      )
    },
    {
      key: "questions",
      label: "Questions",
      eyebrow: "Supervision",
      summary: "Chronological, multiple-choice supervision for the preview lane.",
      content: (
        <QuestionnairePage
          panelKey="preview"
          questionnaireKey="preview-console"
          title="Preview supervision"
          description="Confirm the desired outcome, the next priority, and the immediate follow-up action."
          steps={SURFACE_QUESTIONNAIRES.preview}
          onEvent={props.onQuestionnaireEvent}
          onExit={() => changePage(returnPage, "button")}
        />
      )
    }
  ];

  return (
    <SurfaceCarousel
      panelKey="preview"
      title="Preview"
      summary="Slide-style previews, run history, and evidence-first feedback."
      pages={pages}
      activePage={page}
      onPageChange={changePage}
    />
  );
}

function CoordinationSurface(props: {
  tasks: AgentTaskCollection | null;
  runs: AgentRunCollection | null;
  runDetail: AgentRunDetail | null;
  loading: boolean;
  onSelectRun: (agentRunId: number) => Promise<void>;
  onRetrySelectedTask: () => Promise<void>;
  onEnqueue: (taskKind: string) => Promise<void>;
  onSupervision: (decisionKind: "accepted" | "rejected" | "overridden", subjectKey: string, chosenValue?: string) => Promise<void>;
  onSurfacePageChange: (panelKey: PanelKey, pageKey: string, origin: SurfacePageOrigin) => Promise<void>;
  onSurfaceCardSignal: (panelKey: PanelKey, cardKey: string) => Promise<void>;
  onQuestionnaireEvent: (
    panelKey: PanelKey,
    questionnaireKey: string,
    questionKey: string | null,
    optionKey: string | null,
    eventKind: "started" | "answered" | "completed"
  ) => Promise<void>;
}) {
  const [page, setPage] = React.useState("controls");
  const [returnPage, setReturnPage] = React.useState("controls");
  const queues = props.tasks?.queues ?? [];
  const runs = props.runs?.items ?? [];
  const selectedRun = props.runDetail?.run ?? runs[0] ?? null;
  const queueSummary = summarizeQueueHealth(queues);

  React.useEffect(() => {
    void props.onSurfacePageChange("coordination", page, "auto");
  }, [page, props]);

  function changePage(pageKey: string, origin: SurfacePageOrigin) {
    if (pageKey === "questions") {
      setReturnPage(page);
    }
    setPage(pageKey);
    void props.onSurfacePageChange("coordination", pageKey, origin);
  }

  const pages: SurfacePageDefinition[] = [
    {
      key: "controls",
      label: "Controls",
      eyebrow: "Dispatch",
      summary: "Safe queue actions and retry controls stay on the first tray.",
      content: (
        <div className="surface-page-grid surface-page-grid-2">
          <Panel title="Quick Actions" eyebrow="Queue">
            <div className="surface-page-grid">
              {[
                ["catalog.refresh_docs_catalog", "Refresh docs catalog"],
                ["catalog.refresh_source_documents", "Refresh source documents"],
                ["memory.run_embeddings", "Run embeddings"],
                ["memory.run_evaluations", "Run evaluations"]
              ].map(([taskKind, label]) => (
                <ActionRow
                  key={taskKind}
                  label={label}
                  taskKind={taskKind}
                  onEnqueue={(value) => { void props.onEnqueue(value); }}
                  onSupervision={(decisionKind, subjectKey, chosenValue) => {
                    void props.onSupervision(decisionKind, subjectKey, chosenValue);
                  }}
                />
              ))}
            </div>
            <div className="action-strip">
              <button type="button" onClick={() => void props.onRetrySelectedTask()} disabled={!props.runDetail?.task}>
                Retry Selected Task
              </button>
            </div>
          </Panel>
          <Panel title="Queue Health" eyebrow="Telemetry">
            <FactGrid
              entries={[
                { label: "Queued", value: queueSummary.queuedCount },
                { label: "Leased", value: queueSummary.leasedCount },
                { label: "Failed", value: queueSummary.failedCount },
                { label: "State", value: queueSummary.statusLabel }
              ]}
            />
            <QueuePulseBars queues={queues} />
          </Panel>
        </div>
      )
    },
    {
      key: "queues",
      label: "Queues",
      eyebrow: "Backlog",
      summary: "Queue pressure and recent agent runs without long-form scroll.",
      content: (
        <div className="surface-page-grid surface-page-grid-2">
          <Panel title="Queue Snapshot" eyebrow="Current">
            <ListBlock
              emptyLabel={props.loading ? "Loading task queues…" : "No queue data available."}
              items={queues.map((queue) => ({
                title: queue.queueName,
                subtitle: `${queue.queuedCount} queued · ${queue.leasedCount} leased · ${queue.failedCount} failed`,
                body: <p className="detail-copy">{queue.recentTasks.length} recent tasks tracked.</p>
              }))}
            />
          </Panel>
          <Panel title="Recent Runs" eyebrow="Selection">
            <ListBlock
              emptyLabel={props.loading ? "Loading agent runs…" : "No agent runs recorded."}
              items={runs.slice(0, 12).map((run) => ({
                title: `#${run.agentRunId} · ${run.taskSlug}`,
                subtitle: `${run.status} · ${run.agentName}`,
                body: (
                  <button
                    type="button"
                    onClick={() => {
                      void props.onSelectRun(run.agentRunId);
                      void props.onSurfaceCardSignal("coordination", `run:${run.agentRunId}`);
                    }}
                  >
                    Inspect run
                  </button>
                )
              }))}
            />
          </Panel>
        </div>
      )
    },
    {
      key: "run-detail",
      label: "Run Detail",
      eyebrow: "Timeline",
      summary: "Selected run, task, events, and artifacts on one tray.",
      content: (
        <div className="surface-page-grid surface-page-grid-wide">
          <Panel title="Selected Run" eyebrow="Context">
            {selectedRun ? (
              <div className="detail-stack">
                <FactGrid
                  entries={[
                    { label: "Run", value: `#${selectedRun.agentRunId}` },
                    { label: "Task", value: selectedRun.taskSlug },
                    { label: "Status", value: selectedRun.status },
                    { label: "Agent", value: selectedRun.agentName }
                  ]}
                />
                <StructuredValue value={props.runDetail?.task ?? null} emptyLabel="No task detail loaded." />
              </div>
            ) : (
              <p className="empty-copy">No coordination run selected.</p>
            )}
          </Panel>
          <Panel title="Events And Artifacts" eyebrow="Evidence">
            <div className="surface-page-grid surface-page-grid-2">
              <ListBlock
                emptyLabel="No linked events."
                items={(props.runDetail?.events ?? []).slice(0, 8).map((event) => ({
                  title: event.eventType,
                  subtitle: formatTimestamp(event.createdAt),
                  body: <StructuredValue value={event.payload} emptyLabel="No event payload." />
                }))}
              />
              <ListBlock
                emptyLabel="No linked artifacts."
                items={(props.runDetail?.artifacts ?? []).slice(0, 8).map((artifact) => ({
                  title: artifact.artifactKind,
                  subtitle: artifact.uri,
                  body: <ResourceLink uri={artifact.uri} />
                }))}
              />
            </div>
          </Panel>
        </div>
      )
    },
    {
      key: "questions",
      label: "Questions",
      eyebrow: "Supervision",
      summary: "Chronological queue and ownership decisions.",
      content: (
        <QuestionnairePage
          panelKey="coordination"
          questionnaireKey="coordination-console"
          title="Coordination supervision"
          description="Confirm queue action, ownership scope, and urgency in order."
          steps={SURFACE_QUESTIONNAIRES.coordination}
          onEvent={props.onQuestionnaireEvent}
          onExit={() => changePage(returnPage, "button")}
        />
      )
    }
  ];

  return (
    <SurfaceCarousel
      panelKey="coordination"
      title="Coordination"
      summary="Agent queue health, safe controls, and selected run evidence."
      pages={pages}
      activePage={page}
      onPageChange={changePage}
    />
  );
}

function ReviewSurface(props: {
  reviewRuns: UiReviewRunCollection | null;
  selectedReviewRun: UiReviewRun | null;
  reviewFindings: UiReviewFindingCollection | null;
  reviewBaselines: UiReviewBaselineCollection | null;
  detailDepth: "compact" | "expanded";
  loading: boolean;
  onStartReview: () => Promise<void>;
  onSelectReviewRun: (uiReviewRunId: number) => Promise<void>;
  onReviewFinding: (findingId: number, status: "accepted" | "rejected") => Promise<void>;
  onPromoteBaseline: () => Promise<void>;
  onSurfacePageChange: (panelKey: PanelKey, pageKey: string, origin: SurfacePageOrigin) => Promise<void>;
  onSurfaceCardSignal: (panelKey: PanelKey, cardKey: string) => Promise<void>;
  onQuestionnaireEvent: (
    panelKey: PanelKey,
    questionnaireKey: string,
    questionKey: string | null,
    optionKey: string | null,
    eventKind: "started" | "answered" | "completed"
  ) => Promise<void>;
}) {
  const [page, setPage] = React.useState("runs");
  const [returnPage, setReturnPage] = React.useState("runs");
  const runs = props.reviewRuns?.runs ?? [];
  const findings = props.reviewFindings?.findings ?? [];
  const baselines = props.reviewBaselines?.baselines ?? [];
  const selectedRun = props.selectedReviewRun ?? runs[0] ?? null;
  const reviewSummary = selectedRun ? summarizeReviewSummary(selectedRun.analysisSummaryJson) : {};

  React.useEffect(() => {
    void props.onSurfacePageChange("review", page, "auto");
  }, [page, props]);

  function changePage(pageKey: string, origin: SurfacePageOrigin) {
    if (pageKey === "questions") {
      setReturnPage(page);
    }
    setPage(pageKey);
    void props.onSurfacePageChange("review", pageKey, origin);
  }

  const pages: SurfacePageDefinition[] = [
    {
      key: "runs",
      label: "Runs",
      eyebrow: "Capture",
      summary: "Start new review runs and inspect recent evidence captures.",
      content: (
        <div className="surface-page-grid surface-page-grid-2">
          <Panel title="Review Control" eyebrow="Dispatch">
            <div className="detail-stack">
              <button type="button" onClick={() => void props.onStartReview()}>Start UI review</button>
              <StatusRing value={runs.length} total={Math.max(runs.length, 1)} label="Stored runs" />
            </div>
          </Panel>
          <Panel title="Recent Runs" eyebrow="Selection">
            <ListBlock
              emptyLabel={props.loading ? "Loading review runs…" : "No review runs recorded yet."}
              items={runs.slice(0, 10).map((run) => ({
                title: `Review #${run.uiReviewRunId}`,
                subtitle: `${run.status} · ${formatTimestamp(run.updatedAt)}`,
                body: (
                  <button
                    type="button"
                    onClick={() => {
                      void props.onSelectReviewRun(run.uiReviewRunId);
                      void props.onSurfaceCardSignal("review", `run:${run.uiReviewRunId}`);
                    }}
                  >
                    Inspect review
                  </button>
                )
              }))}
            />
          </Panel>
        </div>
      )
    },
    {
      key: "findings",
      label: "Findings",
      eyebrow: "Deterministic",
      summary: "Deterministic findings remain the approval gate; ML stays advisory only.",
      content: (
        <div className="surface-page-grid surface-page-grid-wide">
          <Panel title="Finding Queue" eyebrow="Evidence">
            <ListBlock
              emptyLabel={props.loading ? "Loading findings…" : "No findings recorded."}
              items={findings.slice(0, 12).map((finding) => ({
                title: `${finding.title} · ${finding.severity}`,
                subtitle: `${finding.category}${finding.checkpointName ? ` · ${finding.checkpointName}` : ""}`,
                body: (
                  <div className="detail-stack">
                    <p className="detail-copy">{finding.summary}</p>
                    <div className="action-strip">
                      <button type="button" onClick={() => void props.onReviewFinding(finding.uiReviewFindingId, "accepted")}>Accept</button>
                      <button type="button" onClick={() => void props.onReviewFinding(finding.uiReviewFindingId, "rejected")}>Reject</button>
                    </div>
                  </div>
                )
              }))}
            />
          </Panel>
          <Panel title="Review Snapshot" eyebrow="Summary">
            {selectedRun ? (
              <div className="detail-stack">
                <FactGrid
                  entries={[
                    { label: "Run", value: `#${selectedRun.uiReviewRunId}` },
                    { label: "Status", value: selectedRun.status },
                    { label: "Scenario set", value: selectedRun.scenarioSet },
                    { label: "Viewport", value: formatViewport(selectedRun.viewportJson) }
                  ]}
                />
                <StructuredValue value={reviewSummary} emptyLabel="No analysis summary." />
                <VisualAlertStrip items={collectVisualAlerts(null, selectedRun)} />
              </div>
            ) : (
              <p className="empty-copy">Select a review run to inspect summary data.</p>
            )}
          </Panel>
        </div>
      )
    },
    {
      key: "evidence",
      label: "Evidence",
      eyebrow: "Artifacts",
      summary: "Baselines, screenshots, and analysis detail stay visible on one page.",
      content: (
        <div className="surface-page-grid surface-page-grid-2">
          <Panel title="Selected Run Evidence" eyebrow="Artifacts">
            {selectedRun ? (
              <div className="detail-stack">
                <StructuredValue
                  value={{
                    manifest: selectedRun.manifestJson,
                    capture: selectedRun.captureSummaryJson,
                    analysis: selectedRun.analysisSummaryJson
                  }}
                />
                <button type="button" onClick={() => void props.onPromoteBaseline()}>
                  Promote Baseline
                </button>
              </div>
            ) : (
              <p className="empty-copy">Select a review run first.</p>
            )}
          </Panel>
          <Panel title="Approved Baselines" eyebrow="Reference">
            <ListBlock
              emptyLabel={props.loading ? "Loading baselines…" : "No approved baselines yet."}
              items={baselines.slice(0, props.detailDepth === "compact" ? 6 : 10).map((baseline) => ({
                title: baseline.checkpointName,
                subtitle: `${baseline.browser} · ${baseline.viewportKey}`,
                body: <ReviewImagePreview relativePath={baseline.relativePath} alt={`${baseline.scenarioName} baseline`} />
              }))}
            />
          </Panel>
        </div>
      )
    },
    {
      key: "questions",
      label: "Questions",
      eyebrow: "Supervision",
      summary: "Chronological multiple-choice review decisions.",
      content: (
        <QuestionnairePage
          panelKey="review"
          questionnaireKey="review-console"
          title="Review supervision"
          description="Record finding disposition, baseline intent, and the next supervised action."
          steps={SURFACE_QUESTIONNAIRES.review}
          onEvent={props.onQuestionnaireEvent}
          onExit={() => changePage(returnPage, "button")}
        />
      )
    }
  ];

  return (
    <SurfaceCarousel
      panelKey="review"
      title="Review"
      summary="UI review runs, deterministic findings, and baseline evidence."
      pages={pages}
      activePage={page}
      onPageChange={changePage}
    />
  );
}

function PreferencesSurface(props: {
  me: AuthenticatedMe | null;
  devProfile: DevPreferenceProfile | null;
  onSupervision: (decisionKind: "accepted" | "rejected" | "overridden", subjectKey: string, chosenValue?: string) => Promise<void>;
  onSurfacePageChange: (panelKey: PanelKey, pageKey: string, origin: SurfacePageOrigin) => Promise<void>;
  onQuestionnaireEvent: (
    panelKey: PanelKey,
    questionnaireKey: string,
    questionKey: string | null,
    optionKey: string | null,
    eventKind: "started" | "answered" | "completed"
  ) => Promise<void>;
}) {
  const [page, setPage] = React.useState("runtime");
  const [returnPage, setReturnPage] = React.useState("runtime");
  const scorecard = asRecord(props.devProfile?.score?.scorecard ?? null);

  React.useEffect(() => {
    void props.onSurfacePageChange("preferences", page, "auto");
  }, [page, props]);

  function changePage(pageKey: string, origin: SurfacePageOrigin) {
    if (pageKey === "questions") {
      setReturnPage(page);
    }
    setPage(pageKey);
    void props.onSurfacePageChange("preferences", pageKey, origin);
  }

  const numericTrend = Object.values(scorecard ?? {}).flatMap((value) => typeof value === "number" ? [value] : []);
  const pages: SurfacePageDefinition[] = [
    {
      key: "runtime",
      label: "Runtime",
      eyebrow: "Defaults",
      summary: "Learned HUD defaults and manual override shortcuts.",
      content: (
        <div className="surface-page-grid surface-page-grid-2">
          <Panel title="Derived Defaults" eyebrow="Profile">
            <StructuredValue value={scorecard} emptyLabel="No derived scorecard yet." />
          </Panel>
          <Panel title="Manual Overrides" eyebrow="Supervised">
            <div className="surface-page-grid">
              <ActionRow
                label="Prefer Compact HUD"
                taskKind="hud_layout.compact"
                onEnqueue={() => {}}
                onSupervision={(decisionKind, subjectKey, chosenValue) => {
                  void props.onSupervision(decisionKind, subjectKey, chosenValue);
                }}
              />
              <ActionRow
                label="Prefer Reduced Motion"
                taskKind="hud_layout.reduced_motion"
                onEnqueue={() => {}}
                onSupervision={(decisionKind, subjectKey, chosenValue) => {
                  void props.onSupervision(decisionKind, subjectKey, chosenValue);
                }}
              />
            </div>
          </Panel>
        </div>
      )
    },
    {
      key: "scorecard",
      label: "Scorecard",
      eyebrow: "Telemetry",
      summary: "Derived preference telemetry and trend summaries from supervised signals only.",
      content: (
        <div className="surface-page-grid surface-page-grid-2">
          <Panel title="Scorecard" eyebrow="JSON">
            <StructuredValue value={scorecard} emptyLabel="No scorecard data." />
          </Panel>
          <Panel title="Trend" eyebrow="Signals">
            {numericTrend.length ? <SparkBars values={numericTrend.slice(0, 12)} /> : <p className="empty-copy">No numeric trend values yet.</p>}
            <StatusRing value={props.devProfile?.recentSignals.length ?? 0} total={Math.max(props.devProfile?.recentSignals.length ?? 0, 1)} label="Recent signals" />
          </Panel>
        </div>
      )
    },
    {
      key: "history",
      label: "History",
      eyebrow: "Audit",
      summary: "Recent signals and decisions remain readable without opening another surface.",
      content: (
        <div className="surface-page-grid surface-page-grid-2">
          <Panel title="Recent Signals" eyebrow="Observed">
            <ListBlock
              emptyLabel="No recent signals."
              items={(props.devProfile?.recentSignals ?? []).slice(0, 12).map((signal) => ({
                title: signal.signalKind,
                subtitle: `${signal.surface}${signal.panelKey ? ` · ${signal.panelKey}` : ""}`,
                body: <StructuredValue value={signal.payload} emptyLabel="No signal payload." />
              }))}
            />
          </Panel>
          <Panel title="Recent Decisions" eyebrow="Supervised">
            <ListBlock
              emptyLabel="No recent decisions."
              items={(props.devProfile?.recentDecisions ?? []).slice(0, 12).map((decision) => ({
                title: `${decision.decisionKind} · ${decision.subjectKey}`,
                subtitle: decision.subjectKind,
                body: <StructuredValue value={decision.payload} emptyLabel="No decision payload." />
              }))}
            />
          </Panel>
        </div>
      )
    },
    {
      key: "questions",
      label: "Questions",
      eyebrow: "Supervision",
      summary: "Chronological multiple-choice preference capture.",
      content: (
        <QuestionnairePage
          panelKey="preferences"
          questionnaireKey="preferences-console"
          title="Preference supervision"
          description="Select HUD density, motion mode, and telemetry visibility."
          steps={SURFACE_QUESTIONNAIRES.preferences}
          onEvent={props.onQuestionnaireEvent}
          onExit={() => changePage(returnPage, "button")}
        />
      )
    }
  ];

  return (
    <SurfaceCarousel
      panelKey="preferences"
      title="Preferences"
      summary="Learned defaults, derived scorecards, and supervised decisions."
      pages={pages}
      activePage={page}
      onPageChange={changePage}
    />
  );
}

function IndexSurface(props: {
  overview: WorkspaceOverview | null;
  loading: boolean;
  sourceDocuments: ResourceCollection<SourceDocumentRecord> | null;
  claims: ResourceCollection<KnowledgeClaimRecord> | null;
  evaluations: ResourceCollection<EvaluationResultRecord> | null;
  docs: DocsCatalogResponse | null;
  skills: SkillCatalogResponse | null;
  detailDepth: "compact" | "expanded";
  onSurfacePageChange: (panelKey: PanelKey, pageKey: string, origin: SurfacePageOrigin) => Promise<void>;
}) {
  const [page, setPage] = React.useState("overview");

  React.useEffect(() => {
    void props.onSurfacePageChange("index", page, "auto");
  }, [page, props]);

  function changePage(pageKey: string, origin: SurfacePageOrigin) {
    setPage(pageKey);
    void props.onSurfacePageChange("index", pageKey, origin);
  }

  const pages: SurfacePageDefinition[] = [
    {
      key: "overview",
      label: "Overview",
      eyebrow: "Workspace",
      summary: "Resolved endpoints, service health, and backup state in one archive page.",
      content: (
        <div className="surface-page-grid surface-page-grid-2">
          <Panel title="Workspace Status" eyebrow="Health">
            <FactGrid
              entries={[
                { label: "Status", value: props.overview?.status ?? "unknown" },
                { label: "Postgres host", value: props.overview?.postgres.host ?? "n/a" },
                { label: "Postgres port", value: props.overview?.postgres.port ?? "n/a" },
                { label: "Reachable", value: props.overview?.postgres.reachable ? "yes" : "no" }
              ]}
            />
          </Panel>
          <Panel title="Services" eyebrow="Telemetry">
            <ListBlock
              emptyLabel={props.loading ? "Loading workspace overview…" : "No services reported."}
              items={(props.overview?.services ?? []).map((service) => ({
                title: service.service,
                subtitle: `${service.status} · ${service.url}`,
                body: <StructuredValue value={service.detail} emptyLabel="No additional detail." />
              }))}
            />
          </Panel>
        </div>
      )
    },
    {
      key: "knowledge",
      label: "Knowledge",
      eyebrow: "Dev Memory",
      summary: "Source documents, claims, and evaluations stay in the archive surface.",
      content: <KnowledgePanel sourceDocuments={props.sourceDocuments} claims={props.claims} evaluations={props.evaluations} detailDepth={props.detailDepth} />
    },
    {
      key: "docs",
      label: "Docs",
      eyebrow: "Filesystem",
      summary: "Documentation and skill catalog without another rail button.",
      content: <DocsPanel docs={props.docs} skills={props.skills} detailDepth={props.detailDepth} />
    }
  ];

  return (
    <SurfaceCarousel
      panelKey="index"
      title="Index"
      summary="Workspace archive, knowledge plane, and docs catalog."
      pages={pages}
      activePage={page}
      onPageChange={changePage}
    />
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
  const sourceDocumentsLoaded = props.sourceDocuments !== null;
  const claimsLoaded = props.claims !== null;
  const evaluationsLoaded = props.evaluations !== null;
  return (
    <div className="surface-stack">
      <Panel title="Knowledge Stores" eyebrow="Dev Memory">
        <div className="summary-grid">
          <InfoCard label="Source documents" value={sourceDocumentsLoaded ? String(props.sourceDocuments?.items.length ?? 0) : "…"} />
          <InfoCard label="Claims" value={claimsLoaded ? String(props.claims?.items.length ?? 0) : "…"} />
          <InfoCard label="Evaluations" value={evaluationsLoaded ? String(props.evaluations?.items.length ?? 0) : "…"} />
        </div>
      </Panel>
      <Panel title="Recent Documents" eyebrow="Source">
        <ListBlock
          emptyLabel={sourceDocumentsLoaded ? "No items available." : "Loading source documents…"}
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
          emptyLabel={claimsLoaded ? "No items available." : "Loading claims…"}
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
          emptyLabel={evaluationsLoaded ? "No items available." : "Loading evaluations…"}
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
  const docsLoaded = props.docs !== null;
  const skillsLoaded = props.skills !== null;
  const presentationDocs = allDocs.filter((item) => item.kind === "presentation");
  const otherDocs = allDocs.filter((item) => item.kind !== "presentation");
  const presentationLimit = props.detailDepth === "compact" ? 4 : 8;
  const docsLimit = props.detailDepth === "compact" ? 8 : 16;

  return (
    <div className="surface-split">
      <div className="surface-stack">
        <Panel title="Presentations" eyebrow="R&D">
          <ListBlock
            emptyLabel={docsLoaded ? "No items available." : "Loading presentations…"}
            items={presentationDocs.slice(0, presentationLimit).map((item) => ({
              title: item.title,
              subtitle: `${item.path}${item.tags.includes("canva") ? " · Canva brief" : ""}`,
              body: <p className="detail-copy">{item.summary}</p>
            }))}
          />
        </Panel>
        <Panel title="Documentation Catalog" eyebrow="Filesystem">
          <ListBlock
            emptyLabel={docsLoaded ? "No items available." : "Loading documentation…"}
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
          emptyLabel={skillsLoaded ? "No items available." : "Loading skills…"}
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

function ListBlock(props: {
  items: Array<{ title: string; subtitle?: string; body?: React.ReactNode }>;
  emptyLabel?: string;
}) {
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
    <p className="empty-copy">{props.emptyLabel ?? "No items available."}</p>
  );
}

function summarizeQueueHealth(queues: AgentTaskCollection["queues"]) {
  const queuedCount = queues.reduce((sum, queue) => sum + queue.queuedCount, 0);
  const leasedCount = queues.reduce((sum, queue) => sum + queue.leasedCount, 0);
  const failedCount = queues.reduce((sum, queue) => sum + queue.failedCount, 0);
  const statusLabel =
    failedCount > 0 ? "attention" : queuedCount > 0 || leasedCount > 0 ? "active" : "clear";
  const detail = `${queuedCount} queued · ${leasedCount} leased · ${failedCount} failed`;
  return {
    queuedCount,
    leasedCount,
    failedCount,
    statusLabel,
    detail
  };
}

function summarizeLearningStats(profile: DevPreferenceProfile | null) {
  const signals = profile?.recentSignals ?? [];
  const decisions = profile?.recentDecisions ?? [];
  const acceptedCount = decisions.filter((item) => item.decisionKind === "accepted").length;
  const rejectedCount = decisions.filter((item) => item.decisionKind === "rejected").length;
  const overriddenCount = decisions.filter((item) => item.decisionKind === "overridden").length;
  return {
    signalCount: signals.length,
    decisionCount: decisions.length,
    acceptedCount,
    rejectedCount,
    overriddenCount,
    signalLabel: String(signals.length),
    decisionLabel: `${decisions.length} decisions`,
    sparkValues: [
      signals.length,
      decisions.length,
      acceptedCount,
      rejectedCount,
      overriddenCount
    ]
  };
}

function collectVisualAlerts(
  previewRun: PreviewRun | null,
  reviewRun: UiReviewRun | null
): string[] {
  const alerts: string[] = [];
  const previewSummary = asRecord(previewRun?.analysisSummaryJson ?? null);
  const reviewSummary = asRecord(reviewRun?.analysisSummaryJson ?? null);
  for (const warning of asStringArray(previewSummary?.warnings).slice(0, 2)) {
    alerts.push(`preview: ${warning}`);
  }
  for (const error of asStringArray(previewSummary?.consoleErrors).slice(0, 1)) {
    alerts.push(`preview console: ${error}`);
  }
  const reviewMl = asRecord(reviewSummary?.ml);
  if (typeof reviewMl?.status === "string" && reviewMl.status !== "ready") {
    alerts.push(`review ml: ${reviewMl.status}`);
  }
  if (!alerts.length && reviewRun?.status === "failed") {
    alerts.push("review: failed");
  }
  return alerts;
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

function pickPreferredPreviewRun(
  previewRuns: PreviewRunCollection | null,
  selectedPreviewRunId: number | null
): PreviewRun | null {
  const runs = previewRuns?.runs ?? [];
  if (selectedPreviewRunId !== null) {
    const selectedRun = runs.find((run) => run.previewRunId === selectedPreviewRunId);
    if (selectedRun) {
      return selectedRun;
    }
  }

  const renderedRun = runs.find((run) => {
    const manifest = asRecord(run.manifestJson ?? null);
    const renderSummary = asRecord(run.renderSummaryJson ?? null);
    return (
      typeof renderSummary?.htmlPath === "string" ||
      typeof manifest?.entryRelativePath === "string"
    );
  });
  if (renderedRun) {
    return renderedRun;
  }

  const activeRun = runs.find((run) => run.status !== "planned");
  if (activeRun) {
    return activeRun;
  }

  return runs[0] ?? null;
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
