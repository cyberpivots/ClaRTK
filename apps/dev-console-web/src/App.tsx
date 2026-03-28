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
  ResourceCollection,
  SkillCatalogResponse,
  SourceDocumentRecord,
  UiReviewBaselineCollection,
  UiReviewFindingCollection,
  UiReviewRun,
  UiReviewRunCollection,
  WorkspaceOverview
} from "@clartk/domain";
import { AppFrame, Panel, StatusPill } from "@clartk/ui-web";

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
    eyebrow: "Themes",
    description: "Compact production screen samples for deployment reviews."
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
  reviewRuns: UiReviewRunCollection | null;
  selectedReviewRunId: number | null;
  selectedReviewRun: UiReviewRun | null;
  reviewFindings: UiReviewFindingCollection | null;
  reviewBaselines: UiReviewBaselineCollection | null;
  selectedPanel: PanelKey;
  detailDepth: "compact" | "expanded";
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
    reviewRuns: null,
    selectedReviewRunId: null,
    selectedReviewRun: null,
    reviewFindings: null,
    reviewBaselines: null,
    selectedPanel: "preview",
    detailDepth: "expanded",
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
  const consoleLoadInFlight = React.useRef(false);

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
    consoleLoadInFlight.current = true;
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
      ...(resetNotice ? { notice: null } : {})
    }));
    try {
      const warnings: string[] = [];
      const previousState = state;
      const primaryResults = await Promise.allSettled([
        devConsoleApi.getWorkspaceOverview(),
        devConsoleApi.listTasks(),
        devConsoleApi.listRuns(),
        devConsoleApi.listUiReviewRuns({ surface: "dev-console-web", limit: 12 }),
        devConsoleApi.listUiReviewBaselines({ surface: "dev-console-web", limit: 24 }),
        devConsoleApi.listDocsCatalog(),
        devConsoleApi.listSkills()
      ]);
      const secondaryResults = await Promise.allSettled([
        devConsoleApi.listSourceDocuments(),
        devConsoleApi.listClaims(),
        devConsoleApi.listEvaluations(),
        devConsoleApi.getDevProfile()
      ]);

      const overview = resolveSettledResult(
        primaryResults[0],
        previousState.overview,
        "workspace overview",
        warnings
      );
      const tasks = resolveSettledResult(primaryResults[1], previousState.tasks, "coordination tasks", warnings);
      const runs = resolveSettledResult(primaryResults[2], previousState.runs, "coordination runs", warnings);
      const reviewRuns = resolveSettledResult(
        primaryResults[3],
        previousState.reviewRuns,
        "ui review runs",
        warnings
      );
      const reviewBaselines = resolveSettledResult(
        primaryResults[4],
        previousState.reviewBaselines,
        "ui review baselines",
        warnings
      );
      const docs = resolveSettledResult(primaryResults[5], previousState.docs, "docs catalog", warnings);
      const skills = resolveSettledResult(primaryResults[6], previousState.skills, "skills catalog", warnings);
      const sourceDocuments = resolveSettledResult(
        secondaryResults[0],
        previousState.sourceDocuments,
        "source documents",
        warnings
      );
      const claims = resolveSettledResult(secondaryResults[1], previousState.claims, "claims", warnings);
      const evaluations = resolveSettledResult(
        secondaryResults[2],
        previousState.evaluations,
        "evaluations",
        warnings
      );
      const devProfile = resolveSettledResult(
        secondaryResults[3],
        previousState.devProfile,
        "dev profile",
        warnings
      );

      const nextRunId = selectedRunId ?? runs?.items[0]?.agentRunId ?? null;
      let runDetail = nextRunId === null ? null : previousState.runDetail;
      if (nextRunId !== null) {
        try {
          runDetail = await devConsoleApi.getRun(nextRunId);
        } catch {
          warnings.push("run detail");
        }
      }

      const nextReviewRunId =
        previousState.selectedReviewRunId ?? reviewRuns?.runs[0]?.uiReviewRunId ?? null;
      let selectedReviewRun = nextReviewRunId === null ? null : previousState.selectedReviewRun;
      let reviewFindings = previousState.reviewFindings;
      if (nextReviewRunId !== null) {
        try {
          selectedReviewRun = await devConsoleApi.getUiReviewRun(nextReviewRunId);
        } catch {
          warnings.push("ui review detail");
        }
        try {
          reviewFindings = await devConsoleApi.listUiReviewFindings({
            uiReviewRunId: nextReviewRunId,
            limit: 200
          });
        } catch {
          warnings.push("ui review findings");
        }
      }

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
        runDetail,
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
        runs,
        selectedRunId: nextRunId,
        notice: nextNotice,
        loading: false
      }));
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

  let selectedPanelContent: React.ReactNode = null;
  if (state.selectedPanel === "preview") {
    selectedPanelContent = (
      <PreviewPanel
        overview={state.overview}
        tasks={state.tasks}
        docs={state.docs}
        skills={state.skills}
        claims={state.claims}
        evaluations={state.evaluations}
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
    <Panel title="Session" eyebrow="Access">
      {state.me ? (
        <div style={{ display: "grid", gap: tokens.space.md }}>
          <div style={{ display: "flex", gap: tokens.space.md, alignItems: "center", flexWrap: "wrap" }}>
            <StatusPill status={isAdmin ? "ok" : "degraded"}>
              {state.me.account.role}
            </StatusPill>
            <strong>{state.me.account.displayName}</strong>
            <span>{state.me.account.email}</span>
            <button onClick={() => void handleLogout()}>Sign out</button>
          </div>
          {!isAdmin ? <p>Development console access is limited to admin accounts.</p> : null}
        </div>
      ) : (
        <form onSubmit={handleAuthSubmit} style={{ display: "grid", gap: tokens.space.md, maxWidth: 420 }}>
          <div style={{ display: "flex", gap: tokens.space.sm }}>
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
      subtitle="Admin-only development console for compact workspace review, production screen previews, and bounded coordination."
    >
      {isAdmin ? (
        <div className="console-shell">
          <aside className="console-sidebar">
            {sessionPanel}
            {state.notice ? <Message tone="ok">{state.notice}</Message> : null}
            {state.error ? <Message tone="error">{state.error}</Message> : null}

            <Panel title="Console Surface" eyebrow="Navigation" accent="muted">
              <div className="console-nav">
                {panelDefinitions.map((panel) => (
                  <button
                    key={panel.key}
                    className={`console-nav-button${state.selectedPanel === panel.key ? " is-active" : ""}`}
                    onClick={() => setState((current) => ({ ...current, selectedPanel: panel.key }))}
                  >
                    <span className="console-nav-title">{panel.label}</span>
                    <span className="console-nav-description">{panel.description}</span>
                  </button>
                ))}
              </div>
              <div className="console-toolbar">
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
            </Panel>

            <Panel title="Current Focus" eyebrow={activePanel.eyebrow} accent="muted">
              <div className="console-focus-grid">
                <InfoCard label="Panel" value={activePanel.label} detail={activePanel.description} />
                <InfoCard
                  label="Depth"
                  value={state.detailDepth}
                  detail={
                    state.detailDepth === "compact"
                      ? "Summaries trimmed for faster scanning."
                      : "Expanded payloads and longer lists."
                  }
                />
                <InfoCard
                  label="Workspace"
                  value={state.overview?.status ?? (state.loading ? "loading" : "unknown")}
                  detail={
                    totalServiceCount
                      ? `${healthyServiceCount}/${totalServiceCount} services healthy`
                      : "Refresh to load current service health."
                  }
                />
                <InfoCard
                  label="Selected run"
                  value={selectedRunLabel}
                  detail={state.runDetail?.run.taskSlug ?? "Choose a run from coordination."}
                />
              </div>
            </Panel>
          </aside>

          <div className="console-main">
            {selectedPanelContent}
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

function PreviewPanel(props: {
  overview: WorkspaceOverview | null;
  tasks: AgentTaskCollection | null;
  docs: DocsCatalogResponse | null;
  skills: SkillCatalogResponse | null;
  claims: ResourceCollection<KnowledgeClaimRecord> | null;
  evaluations: ResourceCollection<EvaluationResultRecord> | null;
}) {
  const totalServices = props.overview?.services.length ?? 0;
  const healthyServices = props.overview?.services.filter((service) => service.status === "ok").length ?? 0;
  const attentionQueues = props.tasks?.queues.filter((queue) => queue.failedCount > 0).length ?? 0;
  const queuedTasks = props.tasks?.queues.reduce((total, queue) => total + queue.queuedCount, 0) ?? 0;
  const latestBackup = props.overview?.backup?.latestBackupKind ?? "pending";
  const docCount = props.docs?.items.length ?? 0;
  const skillCount = props.skills?.items.length ?? 0;
  const claimCount = props.claims?.items.length ?? 0;
  const evaluationCount = props.evaluations?.items.length ?? 0;

  return (
    <Panel title="Production Deployment Screen Preview" eyebrow="Proposed">
      <div className="preview-overview">
        <div>
          <h3 style={{ margin: 0, marginBottom: tokens.space.sm }}>Compact review-first surface</h3>
          <p style={{ margin: 0, color: tokens.color.muted }}>
            These samples reuse the runtime dashboard visual language, but compress the first screen into
            denser cards so deployment reviews need less vertical travel.
          </p>
        </div>
        <div className="preview-chip-row">
          <StatusPill status={totalServices > 0 && healthyServices === totalServices ? "ok" : "neutral"}>
            {totalServices ? `${healthyServices}/${totalServices} services healthy` : "service health pending"}
          </StatusPill>
          <StatusPill status={attentionQueues > 0 ? "degraded" : "ok"}>
            {attentionQueues > 0 ? `${attentionQueues} queue alerts` : `${queuedTasks} queued tasks`}
          </StatusPill>
          <StatusPill status={docCount > 0 ? "ok" : "neutral"}>
            {docCount} docs · {skillCount} skills
          </StatusPill>
        </div>
      </div>

      <div className="preview-grid">
        <PreviewCard
          tone="forest"
          label="Theme 01"
          title="Mission Control"
          description="Desktop-first launch surface for cutovers, health review, and fast escalation."
          span="wide"
        >
          <div className="preview-toolbar">
            <span className="preview-pill">Deployment</span>
            <span className="preview-pill preview-pill-strong">Status ribbon</span>
            <span className="preview-pill">Map + queue split</span>
          </div>
          <div className="preview-stat-grid">
            <PreviewMetric label="Services" value={totalServices ? `${healthyServices}/${totalServices}` : "0/0"} />
            <PreviewMetric label="Queue alerts" value={String(attentionQueues)} />
            <PreviewMetric label="Backup" value={latestBackup} />
          </div>
          <div className="preview-split">
            <div className="preview-map">
              <div className="preview-map-badge">Regional coverage</div>
              <div className="preview-map-grid">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="preview-stack">
              <PreviewListRow label="Runtime API" value={serviceStatusLabel(props.overview, "runtime-api")} />
              <PreviewListRow label="Gateway" value={serviceStatusLabel(props.overview, "gateway")} />
              <PreviewListRow label="Queued tasks" value={String(queuedTasks)} />
              <PreviewListRow label="Newest evidence" value={`${claimCount} claims`} />
            </div>
          </div>
        </PreviewCard>

        <PreviewCard
          tone="sand"
          label="Theme 02"
          title="Field Tablet"
          description="Tight operator workflow for tripod setup, link checks, and fix confirmation."
        >
          <div className="preview-toolbar">
            <span className="preview-pill">Touch targets</span>
            <span className="preview-pill">One-handed scan</span>
          </div>
          <div className="preview-stat-grid preview-stat-grid-tight">
            <PreviewMetric label="Fix target" value="2 cm" />
            <PreviewMetric label="Base link" value="42 ms" />
          </div>
          <div className="preview-checklist">
            <PreviewChecklistItem title="Sky view verified" detail="satellite mask + compass" />
            <PreviewChecklistItem title="Correction link stable" detail="latency and packet-loss band" />
            <PreviewChecklistItem title="Start survey" detail="single primary action above fold" />
          </div>
          <div className="preview-bars">
            <span style={{ height: 34 }} />
            <span style={{ height: 58 }} />
            <span style={{ height: 78 }} />
            <span style={{ height: 50 }} />
            <span style={{ height: 68 }} />
          </div>
        </PreviewCard>

        <PreviewCard
          tone="ink"
          label="Theme 03"
          title="Evidence Board"
          description="Approval-oriented surface for deployment sign-off, docs review, and supervised choices."
        >
          <div className="preview-toolbar">
            <span className="preview-pill">Docs</span>
            <span className="preview-pill preview-pill-strong">Approvals</span>
            <span className="preview-pill">Knowledge</span>
          </div>
          <div className="preview-ledger">
            <PreviewListRow label="Cataloged docs" value={String(docCount)} />
            <PreviewListRow label="Verified skills" value={String(skillCount)} />
            <PreviewListRow label="Claims" value={String(claimCount)} />
            <PreviewListRow label="Evaluations" value={String(evaluationCount)} />
          </div>
          <div className="preview-note">
            Show deployment rationale, supporting artifacts, and approval shortcuts on one screen instead of
            stacking long review panes.
          </div>
        </PreviewCard>
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
  return (
    <div style={{ display: "grid", gap: tokens.space.lg }}>
      <Panel title="Safe Controls" eyebrow="Actions">
        <div style={{ display: "grid", gap: tokens.space.md }}>
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

      <Panel title="Queues" eyebrow="Coordination">
        {props.tasks ? (
          <div style={{ display: "grid", gap: tokens.space.sm }}>
            {props.tasks.queues.map((queue) => (
              <div key={queue.queueName} style={rowStyle}>
                <div>
                  <strong>{queue.queueName}</strong>
                  <div style={{ color: tokens.color.muted }}>
                    queued {queue.queuedCount} · leased {queue.leasedCount} · failed {queue.failedCount}
                  </div>
                </div>
                <StatusPill status={queue.failedCount > 0 ? "degraded" : "ok"}>
                  {queue.failedCount > 0 ? "attention" : "healthy"}
                </StatusPill>
              </div>
            ))}
          </div>
        ) : props.loading ? <p>Loading tasks…</p> : null}
      </Panel>

      <div style={splitGridStyle}>
        <Panel title="Recent Tasks" eyebrow="Queue History">
          {props.tasks ? (
            <div style={{ display: "grid", gap: tokens.space.sm }}>
              {props.tasks.items.slice(0, 12).map((task) => (
                <div key={task.agentTaskId} style={rowStyle}>
                  <div>
                    <strong>{task.taskKind}</strong>
                    <div style={{ color: tokens.color.muted }}>
                      #{task.agentTaskId} · {task.status} · attempts {task.attemptCount}/{task.maxAttempts}
                    </div>
                  </div>
                  <StatusPill status={task.status === "failed" ? "degraded" : "neutral"}>
                    {task.status}
                  </StatusPill>
                </div>
              ))}
            </div>
          ) : props.loading ? <p>Loading task history…</p> : null}
        </Panel>

        <Panel title="Run Detail" eyebrow="Timeline">
          {props.runDetail ? (
            <div style={{ display: "grid", gap: tokens.space.md }}>
              <div style={rowStyle}>
                <div>
                  <strong>{props.runDetail.run.taskSlug}</strong>
                  <div style={{ color: tokens.color.muted }}>
                    run #{props.runDetail.run.agentRunId} · {props.runDetail.run.agentName}
                  </div>
                </div>
                <StatusPill status={props.runDetail.run.status === "succeeded" ? "ok" : props.runDetail.run.status === "failed" ? "degraded" : "neutral"}>
                  {props.runDetail.run.status}
                </StatusPill>
              </div>
              {props.runDetail.task ? (
                <div style={{ display: "flex", gap: tokens.space.sm, flexWrap: "wrap" }}>
                  <button onClick={() => void props.onRetrySelectedTask()}>Retry selected task</button>
                  <span style={{ color: tokens.color.muted }}>
                    task #{props.runDetail.task.agentTaskId} · {props.runDetail.task.queueName}
                  </span>
                </div>
              ) : null}
              <div style={{ display: "grid", gap: tokens.space.sm }}>
                {props.runDetail.events.slice(0, 8).map((event) => (
                  <div key={event.agentEventId} style={eventStyle}>
                    <strong>{event.eventType}</strong>
                    <pre style={preStyle}>{JSON.stringify(event.payload, null, 2)}</pre>
                  </div>
                ))}
                {props.runDetail.artifacts.slice(0, 6).map((artifact) => (
                  <div key={artifact.artifactId} style={eventStyle}>
                    <strong>{artifact.artifactKind}</strong>
                    <div>{artifact.uri}</div>
                    <pre style={preStyle}>{JSON.stringify(artifact.metadata, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          ) : props.loading ? <p>Loading run detail…</p> : <p>No agent runs available.</p>}
        </Panel>
      </div>

      <Panel title="Recent Runs" eyebrow="Selection">
        {props.runs?.items.length ? (
          <div style={{ display: "grid", gap: tokens.space.sm }}>
            {props.runs.items.slice(0, 8).map((run) => (
              <button key={`run-link-${run.agentRunId}`} onClick={() => void props.onSelectRun(run.agentRunId)}>
                Inspect run #{run.agentRunId} · {run.taskSlug}
              </button>
            ))}
          </div>
        ) : <p>Use the queue and safe controls above to seed new runs.</p>}
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

  return (
    <div style={{ display: "grid", gap: tokens.space.lg }}>
      <Panel title="Review Automation" eyebrow="Local Only">
        <div style={{ display: "grid", gap: tokens.space.md }}>
          <div style={{ display: "flex", gap: tokens.space.sm, flexWrap: "wrap" }}>
            <button onClick={() => void props.onStartReview()}>Start new UI review</button>
            <button
              onClick={() => void props.onPromoteBaseline()}
              disabled={!props.selectedReviewRun || captureSteps.length === 0}
            >
              Promote selected run baselines
            </button>
          </div>
          <div style={gridStyle}>
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

      <div style={splitGridStyle}>
        <Panel title="Recent Review Runs" eyebrow="Selection">
          {runs.length ? (
            <div style={{ display: "grid", gap: tokens.space.sm }}>
              {runs.map((run) => (
                <button key={run.uiReviewRunId} onClick={() => void props.onSelectReviewRun(run.uiReviewRunId)}>
                  Inspect review #{run.uiReviewRunId} · {run.status}
                </button>
              ))}
            </div>
          ) : props.loading ? (
            <p>Loading UI review runs…</p>
          ) : (
            <p>No UI review runs yet.</p>
          )}
        </Panel>

        <Panel title="Selected Review Run" eyebrow="Status">
          {props.selectedReviewRun ? (
            <div style={{ display: "grid", gap: tokens.space.md }}>
              <div style={rowStyle}>
                <div>
                  <strong>
                    Review #{props.selectedReviewRun.uiReviewRunId} · {props.selectedReviewRun.surface}
                  </strong>
                  <div style={{ color: tokens.color.muted }}>
                    {props.selectedReviewRun.browser} · {props.selectedReviewRun.baseUrl}
                  </div>
                </div>
                <StatusPill status={statusToneForReviewRun(props.selectedReviewRun.status)}>
                  {props.selectedReviewRun.status}
                </StatusPill>
              </div>
              <pre style={preStyle}>
                {JSON.stringify(
                  {
                    viewport: props.selectedReviewRun.viewportJson,
                    manifest: props.selectedReviewRun.manifestJson,
                    captureSummary: summarizeReviewSummary(props.selectedReviewRun.captureSummaryJson),
                    analysisSummary: summarizeReviewSummary(props.selectedReviewRun.analysisSummaryJson)
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          ) : props.loading ? (
            <p>Loading selected UI review run…</p>
          ) : (
            <p>Select a review run to inspect its evidence and findings.</p>
          )}
        </Panel>
      </div>

      <div style={splitGridStyle}>
        <Panel title="Findings" eyebrow="Deterministic Analysis">
          {findings.length ? (
            <div style={{ display: "grid", gap: tokens.space.md }}>
              {findings.map((finding) => (
                <div key={finding.uiReviewFindingId} style={eventStyle}>
                  <div style={rowStyle}>
                    <div>
                      <strong>{finding.title}</strong>
                      <div style={{ color: tokens.color.muted }}>
                        {finding.category} · {finding.severity}
                        {finding.scenarioName ? ` · ${finding.scenarioName}` : ""}
                      </div>
                    </div>
                    <StatusPill status={statusToneForFinding(finding.severity)}>
                      {finding.status}
                    </StatusPill>
                  </div>
                  <p style={{ marginBottom: tokens.space.sm }}>{finding.summary}</p>
                  {finding.fixDraftJson && Object.keys(finding.fixDraftJson).length ? (
                    <pre style={preStyle}>{JSON.stringify(finding.fixDraftJson, null, 2)}</pre>
                  ) : null}
                  <div style={{ display: "flex", gap: tokens.space.sm, flexWrap: "wrap", marginTop: tokens.space.sm }}>
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
            <p>Loading UI review findings…</p>
          ) : (
            <p>No findings recorded for the selected run.</p>
          )}
        </Panel>

        <Panel title="Approved Baselines" eyebrow="Reference Images">
          {baselines.length ? (
            <div style={{ display: "grid", gap: tokens.space.md }}>
              {baselines.slice(0, baselineLimit).map((baseline) => (
                <div key={baseline.uiReviewBaselineId} style={eventStyle}>
                  <strong>
                    {baseline.scenarioName} · {baseline.checkpointName}
                  </strong>
                  <div style={{ color: tokens.color.muted }}>
                    {baseline.browser} · {baseline.viewportKey}
                  </div>
                  <ReviewImagePreview relativePath={baseline.relativePath} alt={`${baseline.scenarioName} baseline`} />
                </div>
              ))}
            </div>
          ) : props.loading ? (
            <p>Loading baselines…</p>
          ) : (
            <p>No approved baselines yet.</p>
          )}
        </Panel>
      </div>

      <Panel title="Checkpoint Screenshots" eyebrow="Capture Evidence">
        {captureSteps.length ? (
          <div style={splitGridStyle}>
            {captureSteps.slice(0, screenshotLimit).map((step, index) => (
              <div key={`${step.scenarioName ?? "step"}-${index}`} style={eventStyle}>
                <strong>
                  {step.scenarioName ?? "scenario"} · {step.checkpointName ?? "loaded"}
                </strong>
                <div style={{ color: tokens.color.muted }}>
                  {Array.isArray(step.expectedTexts) ? `${step.expectedTexts.length} expected markers` : "stable checkpoint"}
                </div>
                <ReviewImagePreview
                  relativePath={step.screenshot?.relativePath ?? null}
                  alt={`${step.scenarioName ?? "scenario"} screenshot`}
                />
              </div>
            ))}
          </div>
        ) : props.loading ? (
          <p>Loading review capture evidence…</p>
        ) : (
          <p>No checkpoint screenshots captured yet.</p>
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
    <div style={{ display: "grid", gap: tokens.space.lg }}>
      <Panel title="Knowledge Stores" eyebrow="Dev Memory">
        <div style={gridStyle}>
          <InfoCard label="Source documents" value={String(props.sourceDocuments?.items.length ?? 0)} />
          <InfoCard label="Claims" value={String(props.claims?.items.length ?? 0)} />
          <InfoCard label="Evaluations" value={String(props.evaluations?.items.length ?? 0)} />
        </div>
      </Panel>
      <Panel title="Recent Documents" eyebrow="Source">
        <ListBlock
          items={(props.sourceDocuments?.items ?? []).slice(0, props.detailDepth === "compact" ? 4 : 8).map((item) => ({
            title: item.title ?? item.uri,
            subtitle: item.sourceKind,
            body: props.detailDepth === "expanded" ? item.body : undefined
          }))}
        />
      </Panel>
      <Panel title="Recent Claims" eyebrow="Assertions">
        <ListBlock
          items={(props.claims?.items ?? []).slice(0, props.detailDepth === "compact" ? 4 : 8).map((item) => ({
            title: item.summary,
            subtitle: item.status,
            body: item.tags.length ? JSON.stringify(item.tags) : undefined
          }))}
        />
      </Panel>
      <Panel title="Recent Evaluations" eyebrow="Scores">
        <ListBlock
          items={(props.evaluations?.items ?? []).slice(0, props.detailDepth === "compact" ? 4 : 8).map((item) => ({
            title: item.subject,
            subtitle: item.outcome,
            body: props.detailDepth === "expanded" ? JSON.stringify(item.detail, null, 2) : undefined
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
    <div style={splitGridStyle}>
      <div style={{ display: "grid", gap: tokens.space.lg }}>
        <Panel title="Presentations" eyebrow="R&D">
          <ListBlock
            items={presentationDocs.slice(0, presentationLimit).map((item) => ({
              title: item.title,
              subtitle: `${item.path}${item.tags.includes("canva") ? " · Canva brief" : ""}`,
              body: item.summary
            }))}
          />
        </Panel>
        <Panel title="Documentation Catalog" eyebrow="Filesystem">
          <ListBlock
            items={otherDocs.slice(0, docsLimit).map((item) => ({
              title: item.title,
              subtitle: `${item.kind} · ${item.path}`,
              body: item.summary
            }))}
          />
        </Panel>
      </div>
      <Panel title="Skills Catalog" eyebrow="Verified">
        <ListBlock
          items={(props.skills?.items ?? []).slice(0, props.detailDepth === "compact" ? 8 : 16).map((item) => ({
            title: item.name,
            subtitle: `${item.source} · ${item.path}`,
            body: item.description
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
    <div style={{ display: "grid", gap: tokens.space.lg }}>
      <Panel title="Runtime Profile Summary" eyebrow="Authoritative">
        {props.me ? <pre style={preStyle}>{JSON.stringify(props.me.profile.defaults, null, 2)}</pre> : null}
      </Panel>
      <Panel title="Development Preference Scorecard" eyebrow="Derived">
        {props.devProfile?.score ? (
          <pre style={preStyle}>{JSON.stringify(props.devProfile.score.scorecard, null, 2)}</pre>
        ) : (
          <p>No derived dev-console scorecard yet.</p>
        )}
      </Panel>
      <Panel title="Supervision Shortcuts" eyebrow="Labels">
        <div style={{ display: "flex", gap: tokens.space.sm, flexWrap: "wrap" }}>
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
      <div style={splitGridStyle}>
        <Panel title="Recent Signals" eyebrow="Observed">
          <ListBlock
            items={(props.devProfile?.recentSignals ?? []).slice(0, 10).map((signal) => ({
              title: signal.signalKind,
              subtitle: `${signal.surface}${signal.panelKey ? ` · ${signal.panelKey}` : ""}`,
              body: JSON.stringify(signal.payload)
            }))}
          />
        </Panel>
        <Panel title="Recent Decisions" eyebrow="Supervised">
          <ListBlock
            items={(props.devProfile?.recentDecisions ?? []).slice(0, 10).map((decision) => ({
              title: `${decision.decisionKind} · ${decision.subjectKey}`,
              subtitle: decision.subjectKind,
              body: JSON.stringify(decision.payload)
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

function PreviewCard(props: {
  tone: "forest" | "sand" | "ink";
  label: string;
  title: string;
  description: string;
  span?: "wide";
  children: React.ReactNode;
}) {
  return (
    <article className={`preview-card preview-card-${props.tone}${props.span === "wide" ? " preview-card-wide" : ""}`}>
      <div style={{ display: "grid", gap: tokens.space.xs }}>
        <span className="preview-card-label">{props.label}</span>
        <h3 style={{ margin: 0 }}>{props.title}</h3>
        <p style={{ margin: 0, color: "inherit", opacity: 0.82 }}>{props.description}</p>
      </div>
      <div className="preview-screen">{props.children}</div>
    </article>
  );
}

function PreviewMetric(props: { label: string; value: string }) {
  return (
    <div className="preview-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PreviewListRow(props: { label: string; value: string }) {
  return (
    <div className="preview-list-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PreviewChecklistItem(props: { title: string; detail: string }) {
  return (
    <div className="preview-checklist-item">
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
    </div>
  );
}

function ActionRow(props: {
  label: string;
  taskKind: string;
  onEnqueue: (taskKind: string) => void;
  onSupervision: (decisionKind: "accepted" | "rejected" | "overridden", subjectKey: string, chosenValue?: string) => void;
}) {
  return (
    <div style={rowStyle}>
      <div>
        <strong>{props.label}</strong>
        <div style={{ color: tokens.color.muted }}>{props.taskKind}</div>
      </div>
      <div style={{ display: "flex", gap: tokens.space.sm, flexWrap: "wrap" }}>
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
    <div
      style={{
        background: tokens.color.panelAlt,
        border: `1px solid ${tokens.color.line}`,
        borderRadius: tokens.radius.md,
        padding: tokens.space.md
      }}
    >
      <div style={{ color: tokens.color.muted, fontSize: 12, textTransform: "uppercase" }}>{props.label}</div>
      <strong style={{ display: "block", marginTop: tokens.space.xs }}>{props.value}</strong>
      {props.detail ? <div style={{ marginTop: tokens.space.sm, color: tokens.color.muted }}>{props.detail}</div> : null}
    </div>
  );
}

function ListBlock(props: { items: Array<{ title: string; subtitle?: string; body?: string }> }) {
  return props.items.length ? (
    <div style={{ display: "grid", gap: tokens.space.sm }}>
      {props.items.map((item, index) => (
        <div key={`${item.title}-${index}`} style={eventStyle}>
          <strong>{item.title}</strong>
          {item.subtitle ? <div style={{ color: tokens.color.muted }}>{item.subtitle}</div> : null}
          {item.body ? <pre style={preStyle}>{item.body}</pre> : null}
        </div>
      ))}
    </div>
  ) : (
    <p>No items available.</p>
  );
}

function Message(props: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: tokens.space.md,
        borderRadius: tokens.radius.md,
        border: `1px solid ${props.tone === "ok" ? tokens.color.line : "#f2c2bd"}`,
        background: props.tone === "ok" ? "#edf6f3" : "#fff3f1",
        color: props.tone === "ok" ? tokens.color.accentStrong : tokens.color.alert
      }}
    >
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

function serviceStatusLabel(overview: WorkspaceOverview | null, serviceName: string) {
  return overview?.services.find((service) => service.service === serviceName)?.status ?? "pending";
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: `${tokens.space.sm}px ${tokens.space.md}px`,
  borderRadius: tokens.radius.sm,
  border: `1px solid ${tokens.color.line}`,
  marginTop: tokens.space.xs
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: tokens.space.md,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};

const splitGridStyle: React.CSSProperties = {
  display: "grid",
  gap: tokens.space.lg,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))"
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: tokens.space.md,
  paddingBottom: tokens.space.sm,
  borderBottom: `1px solid ${tokens.color.line}`
};

const preStyle: React.CSSProperties = {
  margin: 0,
  marginTop: tokens.space.sm,
  padding: tokens.space.sm,
  background: "#f8fbfa",
  borderRadius: tokens.radius.sm,
  overflowX: "auto",
  whiteSpace: "pre-wrap"
};

const eventStyle: React.CSSProperties = {
  padding: tokens.space.md,
  borderRadius: tokens.radius.md,
  background: "#f8fbfa",
  border: `1px solid ${tokens.color.line}`
};

const activeButtonStyle: React.CSSProperties = {
  background: tokens.color.accentStrong,
  color: "#ffffff",
  borderColor: tokens.color.accentStrong
};
