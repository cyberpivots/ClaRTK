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
  WorkspaceOverview
} from "@clartk/domain";
import { AppFrame, Panel, StatusPill } from "@clartk/ui-web";

const runtimeApi = new ApiClient({
  baseUrl: import.meta.env.VITE_CLARTK_API_BASE_URL ?? "http://localhost:3000"
});
const devConsoleApi = new DevConsoleClient({
  baseUrl: import.meta.env.VITE_CLARTK_DEV_CONSOLE_API_BASE_URL ?? "http://localhost:3300"
});

type PanelKey = "overview" | "coordination" | "knowledge" | "docs" | "preferences";

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
    selectedPanel: "overview",
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

  React.useEffect(() => {
    void loadSession();
  }, []);

  React.useEffect(() => {
    if (!state.me || state.me.account.role !== "admin") {
      return;
    }
    const interval = window.setInterval(() => {
      void loadConsoleData(state.selectedRunId ?? undefined, false);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [state.me, state.selectedRunId]);

  React.useEffect(() => {
    if (!state.me || state.me.account.role !== "admin") {
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
  }, [state.me, state.selectedPanel]);

  React.useEffect(() => {
    if (!state.me || state.me.account.role !== "admin") {
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
  }, [state.me, state.detailDepth]);

  async function loadSession() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const me = await runtimeApi.getMe();
      setState((current) => ({ ...current, me }));
      if (me.account.role === "admin") {
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
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
      ...(resetNotice ? { notice: null } : {})
    }));
    try {
      const [
        overview,
        tasks,
        runs,
        sourceDocuments,
        claims,
        evaluations,
        docs,
        skills,
        devProfile
      ] = await Promise.all([
        devConsoleApi.getWorkspaceOverview(),
        devConsoleApi.listTasks(),
        devConsoleApi.listRuns(),
        devConsoleApi.listSourceDocuments(),
        devConsoleApi.listClaims(),
        devConsoleApi.listEvaluations(),
        devConsoleApi.listDocsCatalog(),
        devConsoleApi.listSkills(),
        devConsoleApi.getDevProfile()
      ]);
      const nextRunId = selectedRunId ?? runs.items[0]?.agentRunId ?? null;
      const runDetail = nextRunId === null ? null : await devConsoleApi.getRun(nextRunId);
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
        runs,
        selectedRunId: nextRunId,
        loading: false
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      }));
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

  const isAdmin = state.me?.account.role === "admin";

  return (
    <AppFrame
      title="ClaRTK Development Interface"
      subtitle="Admin-only development console for workspace health, agent coordination, knowledge review, and supervised preference signals."
    >
      <div style={{ display: "grid", gap: tokens.space.lg }}>
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

        {state.notice ? <Message tone="ok">{state.notice}</Message> : null}
        {state.error ? <Message tone="error">{state.error}</Message> : null}

        {isAdmin ? (
          <>
            <Panel title="View State" eyebrow="Signals" accent="muted">
              <div style={{ display: "flex", gap: tokens.space.sm, flexWrap: "wrap", alignItems: "center" }}>
                {(["overview", "coordination", "knowledge", "docs", "preferences"] as PanelKey[]).map((panel) => (
                  <button
                    key={panel}
                    onClick={() => setState((current) => ({ ...current, selectedPanel: panel }))}
                    style={state.selectedPanel === panel ? activeButtonStyle : undefined}
                  >
                    {panel}
                  </button>
                ))}
                <label style={{ display: "inline-flex", alignItems: "center", gap: tokens.space.sm }}>
                  Detail depth
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

            {state.selectedPanel === "overview" ? (
              <OverviewPanel overview={state.overview} loading={state.loading} />
            ) : null}

            {state.selectedPanel === "coordination" ? (
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
            ) : null}

            {state.selectedPanel === "knowledge" ? (
              <KnowledgePanel
                sourceDocuments={state.sourceDocuments}
                claims={state.claims}
                evaluations={state.evaluations}
                detailDepth={state.detailDepth}
              />
            ) : null}

            {state.selectedPanel === "docs" ? (
              <DocsPanel docs={state.docs} skills={state.skills} detailDepth={state.detailDepth} />
            ) : null}

            {state.selectedPanel === "preferences" ? (
              <PreferencesPanel
                me={state.me}
                devProfile={state.devProfile}
                onSupervision={handleSupervision}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </AppFrame>
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

      <div style={{ display: "grid", gap: tokens.space.lg, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
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
  return (
    <div style={{ display: "grid", gap: tokens.space.lg, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
      <Panel title="Documentation Catalog" eyebrow="Filesystem">
        <ListBlock
          items={(props.docs?.items ?? []).slice(0, props.detailDepth === "compact" ? 8 : 16).map((item) => ({
            title: item.title,
            subtitle: `${item.kind} · ${item.path}`,
            body: item.summary
          }))}
        />
      </Panel>
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
      <div style={{ display: "grid", gap: tokens.space.lg, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
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
