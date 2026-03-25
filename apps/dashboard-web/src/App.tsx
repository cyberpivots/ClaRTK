import React from "react";
import { ApiClient } from "@clartk/api-client";
import type {
  ResourceCollection,
  RuntimeApiHealth,
  RuntimeDevice,
  RuntimePositionEvent,
  RuntimeRtkSolution,
  RuntimeSavedView
} from "@clartk/domain";
import { tokens } from "@clartk/design-tokens";
import { ScreenTitle } from "@clartk/ui-web";

const api = new ApiClient({
  baseUrl: import.meta.env.VITE_CLARTK_API_BASE_URL ?? "http://localhost:3000"
});

interface DashboardState {
  health: RuntimeApiHealth | null;
  devices: ResourceCollection<RuntimeDevice> | null;
  positions: ResourceCollection<RuntimePositionEvent> | null;
  solutions: ResourceCollection<RuntimeRtkSolution> | null;
  views: ResourceCollection<RuntimeSavedView> | null;
  error: string | null;
}

export function App() {
  const [state, setState] = React.useState<DashboardState>({
    health: null,
    devices: null,
    positions: null,
    solutions: null,
    views: null,
    error: null
  });

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [health, devices, positions, solutions, views] = await Promise.all([
          api.getHealth(),
          api.listDevices(),
          api.listPositions(),
          api.listSolutions(),
          api.listSavedViews()
        ]);

        if (!cancelled) {
          setState({
            health,
            devices,
            positions,
            solutions,
            views,
            error: null
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : "Unable to load API state."
          }));
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: tokens.space.xl,
        color: tokens.color.ink
      }}
    >
      <ScreenTitle
        title="ClaRTK Operator Dashboard"
        subtitle="Local-first operator surface for runtime API health, direct gateway writes, and provisional service boundaries."
      />
      <section className="panel">
        <h2>Runtime API</h2>
        <p>
          Base URL: <code>{api.url("/")}</code>
        </p>
        <p>
          Health: <code>{api.healthUrl()}</code>
        </p>
        <p>
          Status: <strong>{state.health?.status ?? "loading"}</strong>
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
        {state.error ? <p style={{ color: "#8c2f39" }}>{state.error}</p> : null}
      </section>
      <section className="panel">
        <h2>Runtime Collections</h2>
        <p>
          Devices: <strong>{state.devices?.items.length ?? 0}</strong> ({state.devices?.source ?? "loading"})
        </p>
        <p>
          Positions: <strong>{state.positions?.items.length ?? 0}</strong> ({state.positions?.source ?? "loading"})
        </p>
        <p>
          Solutions: <strong>{state.solutions?.items.length ?? 0}</strong> ({state.solutions?.source ?? "loading"})
        </p>
        <p>
          Saved views: <strong>{state.views?.items.length ?? 0}</strong> ({state.views?.source ?? "loading"})
        </p>
      </section>
      <section className="panel">
        <h2>Provisional Resources</h2>
        {api.provisionalResourceUrls().map((url) => (
          <p key={url}>
            <code>{url}</code>
          </p>
        ))}
      </section>
    </main>
  );
}
