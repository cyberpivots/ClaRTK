import React from "react";
import { ApiClient } from "@clartk/api-client";
import type {
  Account,
  AuthRole,
  AuthenticatedMe,
  HardwareDeploymentRunCollection,
  EffectiveOperatorProfile,
  HardwareDeploymentRun,
  HardwareDeploymentRunDetail,
  InventoryBuild,
  InventoryBuildCollection,
  JsonObject,
  MyViewsResponse,
  PreferenceSuggestion,
  PreferenceSuggestionCollection,
  ProfileDefaults,
  ResourceCollection,
  RuntimeApiHealth,
  RuntimeDevice,
  RuntimePositionEvent,
  RuntimeRtkSolution,
  RuntimeSavedView,
  SuggestionReviewOutcome,
  ViewOverride
} from "@clartk/domain";
import { createDefaultProfileDefaults } from "@clartk/domain";
import { tokens } from "@clartk/design-tokens";
import { ScreenTitle } from "@clartk/ui-web";

function browserBaseUrl(defaultPort: number): string {
  if (typeof window === "undefined") {
    return `http://localhost:${defaultPort}`;
  }
  return `${window.location.protocol}//${window.location.hostname}:${defaultPort}`;
}

const api = new ApiClient({
  baseUrl: import.meta.env.VITE_CLARTK_API_BASE_URL ?? browserBaseUrl(3000)
});

interface DashboardState {
  authStatus: "loading" | "signed_out" | "signed_in";
  health: RuntimeApiHealth | null;
  me: AuthenticatedMe | null;
  effectiveProfile: EffectiveOperatorProfile | null;
  views: MyViewsResponse | null;
  suggestions: PreferenceSuggestionCollection | null;
  devices: ResourceCollection<RuntimeDevice> | null;
  positions: ResourceCollection<RuntimePositionEvent> | null;
  solutions: ResourceCollection<RuntimeRtkSolution> | null;
  hardwareBuilds: InventoryBuild[] | null;
  hardwareDeployments: HardwareDeploymentRun[] | null;
  selectedDeployment: HardwareDeploymentRunDetail | null;
  accounts: ResourceCollection<Account> | null;
  selectedSuggestionAccountId: string | null;
  selectedViewId: number | null;
  selectedDeploymentRunId: number | null;
  issuedBearerToken: string | null;
  notice: string | null;
  error: string | null;
}

interface LoginFormState {
  email: string;
  password: string;
}

interface BootstrapFormState extends LoginFormState {
  displayName: string;
}

interface AccountFormState extends BootstrapFormState {
  role: AuthRole;
}

interface ViewDraftState {
  savedViewId: number | null;
  name: string;
  contextKey: string;
  layoutText: string;
  overridePayloadText: string;
}

export function App() {
  const [state, setState] = React.useState<DashboardState>({
    authStatus: "loading",
    health: null,
    me: null,
    effectiveProfile: null,
    views: null,
    suggestions: null,
    devices: null,
    positions: null,
    solutions: null,
    hardwareBuilds: null,
    hardwareDeployments: null,
    selectedDeployment: null,
    accounts: null,
    selectedSuggestionAccountId: null,
    selectedViewId: null,
    selectedDeploymentRunId: null,
    issuedBearerToken: null,
    notice: null,
    error: null
  });
  const [loginForm, setLoginForm] = React.useState<LoginFormState>({
    email: "admin@clartk.local",
    password: "clartk-admin"
  });
  const [bootstrapForm, setBootstrapForm] = React.useState<BootstrapFormState>({
    email: "admin@clartk.local",
    password: "clartk-admin",
    displayName: "ClaRTK Admin"
  });
  const [accountForm, setAccountForm] = React.useState<AccountFormState>({
    email: "",
    password: "",
    displayName: "",
    role: "operator"
  });
  const [profileDraft, setProfileDraft] = React.useState<ProfileDefaults>(createDefaultProfileDefaults());
  const [viewDraft, setViewDraft] = React.useState<ViewDraftState>(emptyViewDraft());

  React.useEffect(() => {
    void refreshDashboard();
  }, []);

  async function refreshDashboard(
    targetAccountId = state.selectedSuggestionAccountId,
    selectedViewId = state.selectedViewId,
    selectedDeploymentRunId = state.selectedDeploymentRunId
  ) {
    try {
      const health = await api.getHealth();

      try {
        const me = await api.getMe();
        const effectiveProfile = await api.getProfile(selectedViewId ?? undefined);
        const suggestionAccountId = pickSuggestionAccountId(me, targetAccountId);
        const requests: [
          Promise<MyViewsResponse>,
          Promise<PreferenceSuggestionCollection>,
          Promise<ResourceCollection<RuntimeDevice>>,
          Promise<ResourceCollection<RuntimePositionEvent>>,
          Promise<ResourceCollection<RuntimeRtkSolution>>,
          Promise<InventoryBuild[]>,
          Promise<HardwareDeploymentRun[]>,
          Promise<HardwareDeploymentRunDetail | null>,
          Promise<ResourceCollection<Account>> | Promise<null>
        ] = [
          api.listMyViews(),
          api.listSuggestions(suggestionAccountId ?? undefined),
          api.listDevices(),
          api.listPositions(),
          api.listSolutions(),
          listDashboardHardwareBuilds(),
          listDashboardHardwareDeployments(),
          selectedDeploymentRunId === null
            ? Promise.resolve(null)
            : getDashboardHardwareDeployment(selectedDeploymentRunId),
          me.account.role === "admin" ? api.listAccounts() : Promise.resolve(null)
        ];
        const [
          views,
          suggestions,
          devices,
          positions,
          solutions,
          hardwareBuilds,
          hardwareDeployments,
          selectedDeployment,
          accounts
        ] = await Promise.all(requests);

        setProfileDraft(effectiveProfile.profile.defaults);
        setState((current) => ({
          ...current,
          authStatus: "signed_in",
          health,
          me,
          effectiveProfile,
          views,
          suggestions,
          devices,
          positions,
          solutions,
          hardwareBuilds,
          hardwareDeployments,
          selectedDeployment,
          accounts,
          selectedSuggestionAccountId: suggestionAccountId,
          selectedViewId,
          selectedDeploymentRunId,
          error: null
        }));
      } catch (error) {
        if (isUnauthorized(error)) {
          setState((current) => ({
            ...current,
            authStatus: "signed_out",
            health,
            me: null,
            effectiveProfile: null,
            views: null,
            suggestions: null,
            devices: null,
            positions: null,
            solutions: null,
            hardwareBuilds: null,
            hardwareDeployments: null,
            selectedDeployment: null,
            accounts: null,
            selectedSuggestionAccountId: null,
            selectedViewId: null,
            selectedDeploymentRunId: null,
            issuedBearerToken: null,
            error: null
          }));
          setProfileDraft(createDefaultProfileDefaults());
          setViewDraft(emptyViewDraft());
          return;
        }

        throw error;
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleBootstrap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.bootstrapLocalAccount(bootstrapForm);
      setState((current) => ({
        ...current,
        notice: "Bootstrap account created."
      }));
      await refreshDashboard(null, null);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.login(loginForm);
      setState((current) => ({
        ...current,
        notice: "Signed in."
      }));
      await refreshDashboard(null, null);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
      setState((current) => ({
        ...current,
        notice: "Signed out."
      }));
      await refreshDashboard(null, null);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleCreateApiToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const label = String(formData.get("label") ?? "").trim();
    if (!label) {
      setState((current) => ({
        ...current,
        error: "Token label is required."
      }));
      return;
    }

    try {
      const token = await api.createApiToken(label);
      setState((current) => ({
        ...current,
        issuedBearerToken: token.bearerToken,
        notice: `Issued bearer token "${token.apiToken.label}".`
      }));
      event.currentTarget.reset();
      await refreshDashboard();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleRevokeToken(tokenId: string) {
    try {
      await api.revokeApiToken(tokenId);
      setState((current) => ({
        ...current,
        notice: `Revoked token ${tokenId}.`
      }));
      await refreshDashboard();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleProfileSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.patchProfile(profileDraft as unknown as JsonObject);
      setState((current) => ({
        ...current,
        notice: "Saved operator profile defaults."
      }));
      await refreshDashboard();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleUseSharedTemplate(view: RuntimeSavedView) {
    try {
      await api.recordPreferenceObservation({
        eventKind: "view_template_selected",
        signature: `shared-view:${view.savedViewId}`,
        suggestionKind: "view_override",
        candidatePatch: {
          defaultViewSelection: {
            savedViewId: view.savedViewId,
            contextKey: view.contextKey ?? null
          }
        },
        payload: {
          savedViewId: view.savedViewId,
          name: view.name
        },
        basedOnProfileVersion: state.effectiveProfile?.profile.version
      });
      setState((current) => ({
        ...current,
        notice: `Recorded template selection for "${view.name}".`
      }));
      await refreshDashboard(state.selectedSuggestionAccountId, view.savedViewId);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleViewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const layout = parseJsonObject(viewDraft.layoutText, "layout");
      const overridePayload = parseJsonObject(viewDraft.overridePayloadText, "override payload");
      if (viewDraft.savedViewId === null) {
        await api.createViewOverride({
          name: viewDraft.name,
          contextKey: viewDraft.contextKey || null,
          layout,
          overridePayload
        });
        setState((current) => ({
          ...current,
          notice: `Created view override "${viewDraft.name}".`
        }));
      } else {
        await api.updateViewOverride(viewDraft.savedViewId, {
          name: viewDraft.name,
          contextKey: viewDraft.contextKey || null,
          layout,
          overridePayload
        });
        setState((current) => ({
          ...current,
          notice: `Updated view override "${viewDraft.name}".`
        }));
      }

      setViewDraft(emptyViewDraft());
      await refreshDashboard();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleReviewSuggestion(
    suggestionId: number,
    outcome: SuggestionReviewOutcome
  ) {
    try {
      await api.reviewSuggestion(
        suggestionId,
        outcome,
        undefined,
        state.selectedSuggestionAccountId ?? undefined
      );
      setState((current) => ({
        ...current,
        notice: `${outcome === "approved" ? "Approved" : "Rejected"} suggestion ${suggestionId}.`
      }));
      await refreshDashboard();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handlePublishSuggestion(suggestionId: number) {
    try {
      await api.publishSuggestion(suggestionId, state.selectedSuggestionAccountId ?? undefined);
      setState((current) => ({
        ...current,
        notice: `Published suggestion ${suggestionId}.`
      }));
      await refreshDashboard();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  async function handleAdminAccountCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.createAccount(accountForm);
      setAccountForm({
        email: "",
        password: "",
        displayName: "",
        role: "operator"
      });
      setState((current) => ({
        ...current,
        notice: `Created ${accountForm.role} account ${accountForm.email}.`
      }));
      await refreshDashboard();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: formatError(error)
      }));
    }
  }

  function beginViewEdit(view: ViewOverride) {
    setViewDraft({
      savedViewId: view.savedViewId,
      name: view.name,
      contextKey: view.contextKey ?? "",
      layoutText: JSON.stringify(view.layout, null, 2),
      overridePayloadText: JSON.stringify(view.overridePayload, null, 2)
    });
  }

  const currentAccount = state.me?.account ?? null;
  const selectedSuggestionAccount = state.accounts?.items.find(
    (account) => account.accountId === state.selectedSuggestionAccountId
  );
  const selectedHardwareBuild =
    state.selectedDeployment === null
      ? null
      : state.hardwareBuilds?.find(
          (build) => build.buildId === state.selectedDeployment?.run.buildId
        ) ?? null;

  return (
    <main
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: tokens.space.xl,
        color: tokens.color.ink
      }}
    >
      <ScreenTitle
        title="ClaRTK Operator Dashboard"
        subtitle="Account-scoped profile defaults live in runtime. Suggestions are reviewed in dev-memory and published back only through runtime API actions."
      />

      <section className="panel">
        <h2>Runtime API</h2>
        <p>
          Base URL: <code>{api.url("/")}</code>
        </p>
        <p>
          Health: <strong>{state.health?.status ?? "loading"}</strong>
        </p>
        <p>
          Auth state: <strong>{state.authStatus}</strong>
        </p>
        <p>
          Runtime DB configured: <strong>{String(state.health?.runtimeDatabaseConfigured ?? false)}</strong>
        </p>
        <p>
          Gateway diagnostics: <code>{state.health?.gatewayDiagnosticsBaseUrl ?? "http://localhost:3200"}</code>
        </p>
        <p>
          Agent memory: <code>{state.health?.agentMemoryBaseUrl ?? "http://localhost:3100"}</code>
        </p>
        {state.notice ? <p style={{ color: "#215b36" }}>{state.notice}</p> : null}
        {state.error ? <p style={{ color: "#8c2f39" }}>{state.error}</p> : null}
      </section>

      {state.authStatus !== "signed_in" ? (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: tokens.space.lg
          }}
        >
          <form className="panel" onSubmit={handleBootstrap}>
            <h2>Bootstrap First Admin</h2>
            <LabeledInput
              label="Display name"
              value={bootstrapForm.displayName}
              onChange={(value) =>
                setBootstrapForm((current) => ({ ...current, displayName: value }))
              }
            />
            <LabeledInput
              label="Email"
              type="email"
              value={bootstrapForm.email}
              onChange={(value) => setBootstrapForm((current) => ({ ...current, email: value }))}
            />
            <LabeledInput
              label="Password"
              type="password"
              value={bootstrapForm.password}
              onChange={(value) =>
                setBootstrapForm((current) => ({ ...current, password: value }))
              }
            />
            <button type="submit">Create admin</button>
          </form>

          <form className="panel" onSubmit={handleLogin}>
            <h2>Sign In</h2>
            <LabeledInput
              label="Email"
              type="email"
              value={loginForm.email}
              onChange={(value) => setLoginForm((current) => ({ ...current, email: value }))}
            />
            <LabeledInput
              label="Password"
              type="password"
              value={loginForm.password}
              onChange={(value) => setLoginForm((current) => ({ ...current, password: value }))}
            />
            <button type="submit">Sign in</button>
          </form>
        </section>
      ) : null}

      {state.authStatus === "signed_in" && currentAccount ? (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: tokens.space.lg,
              marginTop: tokens.space.lg
            }}
          >
            <section className="panel">
              <h2>Current Account</h2>
              <p>
                <strong>{currentAccount.displayName}</strong> ({currentAccount.role})
              </p>
              <p>
                <code>{currentAccount.email}</code>
              </p>
              <p>
                Profile version: <strong>{state.effectiveProfile?.profile.version ?? "n/a"}</strong>
              </p>
              <p>
                Active view:{" "}
                <strong>{state.effectiveProfile?.appliedViewOverride?.name ?? "global defaults"}</strong>
              </p>
              <button type="button" onClick={() => void handleLogout()}>
                Sign out
              </button>
            </section>

            <form className="panel" onSubmit={handleCreateApiToken}>
              <h2>Bearer Tokens</h2>
              <LabeledInput label="Token label" name="label" defaultValue="dashboard-tooling" />
              <button type="submit">Issue token</button>
              {state.issuedBearerToken ? (
                <p>
                  Issued token:
                  <br />
                  <code style={{ wordBreak: "break-all" }}>{state.issuedBearerToken}</code>
                </p>
              ) : null}
              {(state.me?.apiTokens ?? []).map((token) => (
                <p key={token.tokenId}>
                  <code>{token.label}</code> created {token.createdAt}
                  <br />
                  <button type="button" onClick={() => void handleRevokeToken(token.tokenId)}>
                    Revoke {token.tokenId}
                  </button>
                </p>
              ))}
            </form>

            <section className="panel">
              <h2>Runtime Collections</h2>
              <p>
                Devices: <strong>{state.devices?.items.length ?? 0}</strong> (
                {state.devices?.source ?? "loading"})
              </p>
              <p>
                Positions: <strong>{state.positions?.items.length ?? 0}</strong> (
                {state.positions?.source ?? "loading"})
              </p>
              <p>
                Solutions: <strong>{state.solutions?.items.length ?? 0}</strong> (
                {state.solutions?.source ?? "loading"})
              </p>
              <p>
                Shared templates: <strong>{state.views?.sharedTemplates.length ?? 0}</strong>
              </p>
              <p>
                Account overrides: <strong>{state.views?.overrides.length ?? 0}</strong>
              </p>
              <p>
                Hardware builds: <strong>{state.hardwareBuilds?.length ?? 0}</strong>
              </p>
              <p>
                Deployment runs: <strong>{state.hardwareDeployments?.length ?? 0}</strong>
              </p>
            </section>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: tokens.space.lg,
              marginTop: tokens.space.lg
            }}
          >
            <section className="panel">
              <h2>Hardware Deployment History</h2>
              <p>
                Read-only runtime surface for bench deployment state. Write actions stay in the dev
                console lane.
              </p>
              {(state.hardwareDeployments ?? []).map((run) => (
                <article key={run.deploymentRunId} style={cardStyle()}>
                  <p>
                    <strong>{run.hardwareFamily}</strong> {run.deploymentKind}
                  </p>
                  <p>
                    Build <code>{run.buildId}</code> on{" "}
                    <code>{run.benchHost ?? "unassigned-bench"}</code>
                  </p>
                  <p>
                    Status: <strong>{run.status}</strong>
                  </p>
                  <p>
                    Updated <code>{run.updatedAt}</code>
                  </p>
                  <button
                    type="button"
                    onClick={() => void refreshDashboard(
                      state.selectedSuggestionAccountId,
                      state.selectedViewId,
                      run.deploymentRunId
                    )}
                  >
                    Inspect deployment
                  </button>
                </article>
              ))}
              {!state.hardwareDeployments?.length ? <p>No deployment runs available.</p> : null}
            </section>

            <section className="panel">
              <h2>Deployment Detail</h2>
              {state.selectedDeployment ? (
                <>
                  <p>
                    Run <code>{state.selectedDeployment.run.deploymentRunId}</code> for build{" "}
                    <code>{state.selectedDeployment.run.buildId}</code>
                  </p>
                  <p>
                    Target unit:{" "}
                    <code>{String(state.selectedDeployment.run.targetUnitId ?? "unassigned")}</code>
                  </p>
                  <p>
                    Bench host: <code>{state.selectedDeployment.run.benchHost ?? "unassigned"}</code>
                  </p>
                  <p>
                    Status: <strong>{state.selectedDeployment.run.status}</strong>
                  </p>
                  {selectedHardwareBuild ? (
                    <div style={detailBlockStyle()}>
                      <p>
                        <strong>{selectedHardwareBuild.buildName}</strong> ({selectedHardwareBuild.buildKind})
                      </p>
                      <p>
                        Runtime publish state: <strong>{selectedHardwareBuild.status}</strong>
                      </p>
                      <pre style={consoleBlockStyle()}>
                        {JSON.stringify(selectedHardwareBuild.deploymentSummaryJson, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  <div style={detailBlockStyle()}>
                    <h3 style={subheadingStyle}>Steps</h3>
                    {state.selectedDeployment.steps.map((step) => (
                      <p key={step.deploymentStepId}>
                        <strong>{step.sequenceIndex + 1}.</strong> {step.displayLabel}{" "}
                        <code>{step.executionMode}</code> <strong>{step.status}</strong>
                      </p>
                    ))}
                  </div>
                  <div style={detailBlockStyle()}>
                    <h3 style={subheadingStyle}>Bench Probes</h3>
                    {state.selectedDeployment.probes.length ? (
                      state.selectedDeployment.probes.map((probe) => (
                        <p key={probe.hostProbeId}>
                          <code>{probe.probeKind}</code> <strong>{probe.status}</strong>
                        </p>
                      ))
                    ) : (
                      <p>No host probes recorded.</p>
                    )}
                  </div>
                  <div style={detailBlockStyle()}>
                    <h3 style={subheadingStyle}>Tool Status</h3>
                    {state.selectedDeployment.toolStatuses.length ? (
                      state.selectedDeployment.toolStatuses.map((tool) => (
                        <p key={tool.hardwareToolStatusId}>
                          <code>{tool.toolName}</code> <strong>{tool.status}</strong>{" "}
                          {tool.version ? <span>({tool.version})</span> : null}
                        </p>
                      ))
                    ) : (
                      <p>No tool checks recorded.</p>
                    )}
                  </div>
                </>
              ) : (
                <p>Select a deployment run to inspect bench state, step progression, and summary JSON.</p>
              )}
            </section>
          </section>

          <form className="panel" onSubmit={handleProfileSave} style={{ marginTop: tokens.space.lg }}>
            <h2>Operator Profile Defaults</h2>
            <div style={gridStyle()}>
              <SelectField
                label="Distance units"
                value={profileDraft.units.distance}
                onChange={(value) =>
                  setProfileDraft((current) => ({
                    ...current,
                    units: { ...current.units, distance: value as "metric" | "imperial" }
                  }))
                }
                options={[
                  { value: "metric", label: "Metric" },
                  { value: "imperial", label: "Imperial" }
                ]}
              />
              <SelectField
                label="Coordinate format"
                value={profileDraft.units.coordinateFormat}
                onChange={(value) =>
                  setProfileDraft((current) => ({
                    ...current,
                    units: { ...current.units, coordinateFormat: value as "decimal" | "dms" }
                  }))
                }
                options={[
                  { value: "decimal", label: "Decimal" },
                  { value: "dms", label: "DMS" }
                ]}
              />
              <LabeledInput
                label="Telemetry window (minutes)"
                type="number"
                value={String(profileDraft.telemetry.defaultWindowMinutes)}
                onChange={(value) =>
                  setProfileDraft((current) => ({
                    ...current,
                    telemetry: {
                      defaultWindowMinutes: Number.parseInt(value || "30", 10) || 30
                    }
                  }))
                }
              />
              <LabeledInput
                label="Hardware filter"
                value={profileDraft.devices.defaultHardwareFilter}
                onChange={(value) =>
                  setProfileDraft((current) => ({
                    ...current,
                    devices: { ...current.devices, defaultHardwareFilter: value }
                  }))
                }
              />
              <SelectField
                label="Device sort"
                value={profileDraft.devices.sortBy}
                onChange={(value) =>
                  setProfileDraft((current) => ({
                    ...current,
                    devices: {
                      ...current.devices,
                      sortBy: value as "recent" | "hardware_family" | "external_id"
                    }
                  }))
                }
                options={[
                  { value: "recent", label: "Recent" },
                  { value: "hardware_family", label: "Hardware family" },
                  { value: "external_id", label: "External ID" }
                ]}
              />
              <LabeledInput
                label="Pinned device IDs"
                value={profileDraft.devices.pinnedDeviceIds.join(", ")}
                onChange={(value) =>
                  setProfileDraft((current) => ({
                    ...current,
                    devices: { ...current.devices, pinnedDeviceIds: splitCommaList(value) }
                  }))
                }
              />
              <LabeledInput
                label="Pinned groups"
                value={profileDraft.devices.pinnedGroups.join(", ")}
                onChange={(value) =>
                  setProfileDraft((current) => ({
                    ...current,
                    devices: { ...current.devices, pinnedGroups: splitCommaList(value) }
                  }))
                }
              />
              <LabeledInput
                label="Map layers"
                value={profileDraft.map.defaultLayerNames.join(", ")}
                onChange={(value) =>
                  setProfileDraft((current) => ({
                    ...current,
                    map: { defaultLayerNames: splitCommaList(value) }
                  }))
                }
              />
            </div>
            <div style={{ display: "flex", gap: tokens.space.md, flexWrap: "wrap" }}>
              <ToggleField
                label="Notify on solver status"
                checked={profileDraft.notifications.solverStatus}
                onChange={(checked) =>
                  setProfileDraft((current) => ({
                    ...current,
                    notifications: { ...current.notifications, solverStatus: checked }
                  }))
                }
              />
              <ToggleField
                label="Notify on device offline"
                checked={profileDraft.notifications.deviceOffline}
                onChange={(checked) =>
                  setProfileDraft((current) => ({
                    ...current,
                    notifications: { ...current.notifications, deviceOffline: checked }
                  }))
                }
              />
            </div>
            <p>
              Default saved view ID:{" "}
              <code>{String(profileDraft.defaultViewSelection.savedViewId ?? "none")}</code>
            </p>
            <button type="submit">Save profile defaults</button>
          </form>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: tokens.space.lg,
              marginTop: tokens.space.lg
            }}
          >
            <section className="panel">
              <h2>Shared View Templates</h2>
              {(state.views?.sharedTemplates ?? []).map((view) => (
                <article key={view.savedViewId} style={cardStyle()}>
                  <p>
                    <strong>{view.name}</strong>
                  </p>
                  <p>
                    ID <code>{view.savedViewId}</code>
                  </p>
                  <button type="button" onClick={() => void handleUseSharedTemplate(view)}>
                    Record selection and apply
                  </button>
                </article>
              ))}
            </section>

            <section className="panel">
              <h2>Account View Overrides</h2>
              {(state.views?.overrides ?? []).map((view) => (
                <article key={view.savedViewId} style={cardStyle()}>
                  <p>
                    <strong>{view.name}</strong>
                  </p>
                  <p>
                    Context: <code>{view.contextKey ?? "none"}</code>
                  </p>
                  <button type="button" onClick={() => beginViewEdit(view)}>
                    Edit override
                  </button>
                </article>
              ))}
            </section>
          </section>

          <form className="panel" onSubmit={handleViewSubmit} style={{ marginTop: tokens.space.lg }}>
            <h2>{viewDraft.savedViewId === null ? "Create View Override" : "Update View Override"}</h2>
            <div style={gridStyle()}>
              <LabeledInput
                label="Name"
                value={viewDraft.name}
                onChange={(value) => setViewDraft((current) => ({ ...current, name: value }))}
              />
              <LabeledInput
                label="Context key"
                value={viewDraft.contextKey}
                onChange={(value) => setViewDraft((current) => ({ ...current, contextKey: value }))}
              />
            </div>
            <LabeledTextArea
              label="Layout JSON"
              value={viewDraft.layoutText}
              onChange={(value) => setViewDraft((current) => ({ ...current, layoutText: value }))}
            />
            <LabeledTextArea
              label="Override payload JSON"
              value={viewDraft.overridePayloadText}
              onChange={(value) =>
                setViewDraft((current) => ({ ...current, overridePayloadText: value }))
              }
            />
            <div style={{ display: "flex", gap: tokens.space.md, flexWrap: "wrap" }}>
              <button type="submit">
                {viewDraft.savedViewId === null ? "Create override" : "Update override"}
              </button>
              {viewDraft.savedViewId !== null ? (
                <button type="button" onClick={() => setViewDraft(emptyViewDraft())}>
                  Clear edit
                </button>
              ) : null}
            </div>
          </form>

          <section className="panel" style={{ marginTop: tokens.space.lg }}>
            <h2>Preference Suggestions</h2>
            {state.me?.account.role === "admin" && state.accounts ? (
              <label style={fieldLabelStyle}>
                Review account
                <select
                  value={state.selectedSuggestionAccountId ?? state.me.account.accountId}
                  onChange={(event) => {
                    const nextAccountId = event.target.value;
                    setState((current) => ({
                      ...current,
                      selectedSuggestionAccountId: nextAccountId
                    }));
                    void refreshDashboard(nextAccountId, state.selectedViewId);
                  }}
                  style={fieldInputStyle}
                >
                  {state.accounts.items.map((account) => (
                    <option key={account.accountId} value={account.accountId}>
                      {account.displayName} ({account.role})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p>
              Reviewing suggestions for{" "}
              <strong>{selectedSuggestionAccount?.displayName ?? state.me?.account.displayName}</strong>
            </p>
            {(state.suggestions?.items ?? []).map((suggestion) => (
              <SuggestionCard
                key={suggestion.preferenceSuggestionId}
                suggestion={suggestion}
                onApprove={() =>
                  void handleReviewSuggestion(suggestion.preferenceSuggestionId, "approved")
                }
                onReject={() =>
                  void handleReviewSuggestion(suggestion.preferenceSuggestionId, "rejected")
                }
                onPublish={() => void handlePublishSuggestion(suggestion.preferenceSuggestionId)}
              />
            ))}
            {!state.suggestions?.items.length ? <p>No suggestions staged.</p> : null}
          </section>

          {state.me?.account.role === "admin" ? (
            <form className="panel" onSubmit={handleAdminAccountCreate} style={{ marginTop: tokens.space.lg }}>
              <h2>Admin Account Provisioning</h2>
              <div style={gridStyle()}>
                <LabeledInput
                  label="Display name"
                  value={accountForm.displayName}
                  onChange={(value) =>
                    setAccountForm((current) => ({ ...current, displayName: value }))
                  }
                />
                <LabeledInput
                  label="Email"
                  type="email"
                  value={accountForm.email}
                  onChange={(value) => setAccountForm((current) => ({ ...current, email: value }))}
                />
                <LabeledInput
                  label="Password"
                  type="password"
                  value={accountForm.password}
                  onChange={(value) =>
                    setAccountForm((current) => ({ ...current, password: value }))
                  }
                />
                <SelectField
                  label="Role"
                  value={accountForm.role}
                  onChange={(value) =>
                    setAccountForm((current) => ({
                      ...current,
                      role: value as AuthRole
                    }))
                  }
                  options={[
                    { value: "operator", label: "Operator" },
                    { value: "admin", label: "Admin" }
                  ]}
                />
              </div>
              <button type="submit">Create account</button>
            </form>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function pickSuggestionAccountId(me: AuthenticatedMe, selectedAccountId: string | null): string | null {
  if (selectedAccountId) {
    return selectedAccountId;
  }
  return me.account.accountId;
}

function emptyViewDraft(): ViewDraftState {
  return {
    savedViewId: null,
    name: "",
    contextKey: "",
    layoutText: JSON.stringify(
      {
        viewport: {
          center: [-105.27, 40.01],
          zoom: 12
        }
      },
      null,
      2
    ),
    overridePayloadText: JSON.stringify(
      {
        map: {
          defaultLayerNames: ["rtk-track", "device-health"]
        }
      },
      null,
      2
    )
  };
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseJsonObject(value: string, label: string): JsonObject {
  if (!value.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Invalid ${label} JSON.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed as JsonObject;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && error.message.includes(": 401");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected dashboard error.";
}

async function listDashboardHardwareBuilds(): Promise<InventoryBuild[]> {
  const response = await fetchDashboardJson<InventoryBuildCollection>("/v1/hardware/builds?limit=8");
  return response.builds;
}

async function listDashboardHardwareDeployments(): Promise<HardwareDeploymentRun[]> {
  const response = await fetchDashboardJson<HardwareDeploymentRunCollection>(
    "/v1/hardware/deployments?limit=8"
  );
  return response.runs;
}

async function getDashboardHardwareDeployment(
  deploymentRunId: number
): Promise<HardwareDeploymentRunDetail> {
  return fetchDashboardJson<HardwareDeploymentRunDetail>(
    `/v1/hardware/deployments/${deploymentRunId}`
  );
}

async function fetchDashboardJson<T>(path: string): Promise<T> {
  const response = await fetch(api.url(path), {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(`request failed for ${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}

function gridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: tokens.space.md
  };
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid #d9e6e3",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    background: "#f6fbfa"
  };
}

function detailBlockStyle(): React.CSSProperties {
  return {
    borderTop: "1px solid #d9e6e3",
    marginTop: 16,
    paddingTop: 16
  };
}

function consoleBlockStyle(): React.CSSProperties {
  return {
    overflowX: "auto",
    background: "#163038",
    color: "#f2f9f8",
    borderRadius: 12,
    padding: 12
  };
}

const subheadingStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 12
};

const fieldLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginBottom: 14,
  fontWeight: 600
};

const fieldInputStyle: React.CSSProperties = {
  border: "1px solid #b8cdc8",
  borderRadius: 10,
  padding: "10px 12px",
  font: "inherit"
};

function LabeledInput(props: {
  label: string;
  type?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label style={fieldLabelStyle}>
      {props.label}
      <input
        style={fieldInputStyle}
        type={props.type ?? "text"}
        name={props.name}
        value={props.value}
        defaultValue={props.defaultValue}
        onChange={props.onChange ? (event) => props.onChange?.(event.target.value) : undefined}
      />
    </label>
  );
}

function LabeledTextArea(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={fieldLabelStyle}>
      {props.label}
      <textarea
        style={{ ...fieldInputStyle, minHeight: 140, fontFamily: "monospace" }}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={fieldLabelStyle}>
      {props.label}
      <select
        style={fieldInputStyle}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{ ...fieldLabelStyle, display: "flex", alignItems: "center", gap: 10 }}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      {props.label}
    </label>
  );
}

function SuggestionCard(props: {
  suggestion: PreferenceSuggestion;
  onApprove: () => void;
  onReject: () => void;
  onPublish: () => void;
}) {
  return (
    <article style={cardStyle()}>
      <p>
        <strong>{props.suggestion.suggestionKind}</strong> #{props.suggestion.preferenceSuggestionId}
      </p>
      <p>Status: <strong>{props.suggestion.status}</strong></p>
      <p>{props.suggestion.rationale}</p>
      <p>
        Based on profile version:{" "}
        <code>{String(props.suggestion.basedOnProfileVersion ?? "unknown")}</code>
      </p>
      <pre
        style={consoleBlockStyle()}
      >
        {JSON.stringify(props.suggestion.candidatePatch, null, 2)}
      </pre>
      <p>Reviews: {props.suggestion.reviews.length}</p>
      <div style={{ display: "flex", gap: tokens.space.md, flexWrap: "wrap" }}>
        {props.suggestion.status === "proposed" ? (
          <>
            <button type="button" onClick={props.onApprove}>
              Approve
            </button>
            <button type="button" onClick={props.onReject}>
              Reject
            </button>
          </>
        ) : null}
        {props.suggestion.status === "approved" ? (
          <button type="button" onClick={props.onPublish}>
            Publish to runtime
          </button>
        ) : null}
      </div>
    </article>
  );
}
