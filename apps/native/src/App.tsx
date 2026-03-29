import React from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { ApiClient } from "@clartk/api-client";
import type {
  HardwareDeploymentRun,
  HardwareDeploymentRunDetail,
  InventoryBuild,
  RuntimeApiHealth
} from "@clartk/domain";
import { tokens } from "@clartk/design-tokens";
import { NativeSectionTitle } from "@clartk/ui-native";

interface NativeConnectionState {
  baseUrl: string;
  bearerToken: string;
}

interface NativeHardwareState {
  health: RuntimeApiHealth | null;
  builds: InventoryBuild[];
  deployments: HardwareDeploymentRun[];
  selectedDeployment: HardwareDeploymentRunDetail | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

export function App() {
  const [connection, setConnection] = React.useState<NativeConnectionState>({
    baseUrl: defaultNativeApiBaseUrl(),
    bearerToken: ""
  });
  const [state, setState] = React.useState<NativeHardwareState>({
    health: null,
    builds: [],
    deployments: [],
    selectedDeployment: null,
    status: "idle",
    error: null
  });

  React.useEffect(() => {
    void refreshHardware();
  }, []);

  async function refreshHardware(selectedDeploymentRunId?: number) {
    setState((current) => ({
      ...current,
      status: "loading",
      error: null
    }));

    try {
      const client = createNativeApiClient(connection);
      const health = await client.getHealth();
      if (!connection.bearerToken.trim()) {
        setState({
          health,
          builds: [],
          deployments: [],
          selectedDeployment: null,
          status: "ready",
          error: "Add a dev bearer token to load protected hardware deployment data."
        });
        return;
      }

      const [builds, deployments, selectedDeployment] = await Promise.all([
        client.listRuntimeHardwareBuilds({ limit: 6 }).then((response) => response.builds),
        client.listRuntimeHardwareDeployments({ limit: 6 }).then((response) => response.runs),
        selectedDeploymentRunId === undefined
          ? Promise.resolve(null)
          : client.getRuntimeHardwareDeployment(selectedDeploymentRunId)
      ]);
      setState({
        health,
        builds,
        deployments,
        selectedDeployment,
        status: "ready",
        error: null
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "Unable to load hardware deployment state."
      }));
    }
  }

  const selectedBuild =
    state.selectedDeployment === null
      ? null
      : state.builds.find((build) => build.buildId === state.selectedDeployment?.run.buildId) ?? null;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.panel}>
          <NativeSectionTitle title="ClaRTK Native" />
          <Text style={styles.body}>
            Unified RN shell for iOS, Android, and Windows operator workflows.
          </Text>
          <Text style={styles.meta}>
            Runtime API: {state.health?.status ?? state.status} at {connection.baseUrl}
          </Text>
          <Text style={styles.meta}>
            Deployment visibility is read-only here. Bench execution stays in the dev console flow,
            and native uses a dev bearer token instead of cookie auth.
          </Text>
          <TextInput
            style={styles.input}
            value={connection.baseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) =>
              setConnection((current) => ({
                ...current,
                baseUrl: value
              }))
            }
            placeholder="Runtime API base URL"
            placeholderTextColor={tokens.color.muted}
          />
          <TextInput
            style={styles.input}
            value={connection.bearerToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            onChangeText={(value) =>
              setConnection((current) => ({
                ...current,
                bearerToken: value
              }))
            }
            placeholder="Dev bearer token"
            placeholderTextColor={tokens.color.muted}
          />
          <Pressable style={styles.button} onPress={() => void refreshHardware()}>
            <Text style={styles.buttonLabel}>Refresh hardware status</Text>
          </Pressable>
          {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
        </View>

        <View style={styles.panel}>
          <NativeSectionTitle title="Recent Builds" />
          {state.builds.length ? (
            state.builds.map((build) => (
              <View key={build.buildId} style={styles.card}>
                <Text style={styles.cardTitle}>{build.buildName}</Text>
                <Text style={styles.meta}>
                  {build.buildKind} · {build.status}
                </Text>
                <Text style={styles.meta}>
                  Deployment run: {String(build.latestDeploymentRunId ?? "none")}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.body}>No runtime-visible builds yet.</Text>
          )}
        </View>

        <View style={styles.panel}>
          <NativeSectionTitle title="Deployment History" />
          {state.deployments.length ? (
            state.deployments.map((run) => (
              <View key={run.deploymentRunId} style={styles.card}>
                <Text style={styles.cardTitle}>{run.hardwareFamily}</Text>
                <Text style={styles.meta}>
                  {run.deploymentKind} · {run.status}
                </Text>
                <Text style={styles.meta}>Bench host: {run.benchHost ?? "unassigned"}</Text>
                <Pressable
                  style={styles.buttonSecondary}
                  onPress={() => void refreshHardware(run.deploymentRunId)}
                >
                  <Text style={styles.buttonSecondaryLabel}>Inspect run {run.deploymentRunId}</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.body}>No deployment runs yet.</Text>
          )}
        </View>

        <View style={styles.panel}>
          <NativeSectionTitle title="Selected Deployment" />
          {state.selectedDeployment ? (
            <>
              <Text style={styles.body}>
                Run {state.selectedDeployment.run.deploymentRunId} for build{" "}
                {state.selectedDeployment.run.buildId}
              </Text>
              <Text style={styles.meta}>
                Steps: {state.selectedDeployment.steps.length} · Probes:{" "}
                {state.selectedDeployment.probes.length} · Tools:{" "}
                {state.selectedDeployment.toolStatuses.length}
              </Text>
              {selectedBuild ? (
                <Text style={styles.summary}>
                  {JSON.stringify(selectedBuild.deploymentSummaryJson, null, 2)}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.body}>
              Select a deployment run to inspect its read-only summary.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.bg
  },
  scrollContent: {
    paddingBottom: tokens.space.xl
  },
  panel: {
    margin: tokens.space.lg,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.panel
  },
  body: {
    marginTop: tokens.space.md,
    color: tokens.color.ink
  },
  meta: {
    marginTop: tokens.space.sm,
    color: tokens.color.muted
  },
  input: {
    marginTop: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.bg,
    color: tokens.color.ink,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm
  },
  card: {
    marginTop: tokens.space.md,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.panelAlt
  },
  cardTitle: {
    color: tokens.color.ink,
    fontWeight: "700"
  },
  button: {
    marginTop: tokens.space.md,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    backgroundColor: tokens.color.accent
  },
  buttonLabel: {
    color: tokens.color.bg,
    fontWeight: "700"
  },
  buttonSecondary: {
    marginTop: tokens.space.sm,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    backgroundColor: tokens.color.bg
  },
  buttonSecondaryLabel: {
    color: tokens.color.ink,
    fontWeight: "600"
  },
  summary: {
    marginTop: tokens.space.md,
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: "#163038",
    color: "#f2f9f8",
    fontFamily: "monospace"
  },
  error: {
    marginTop: tokens.space.md,
    color: "#8c2f39"
  }
});

function defaultNativeApiBaseUrl(): string {
  if (Platform.OS === "android") {
    return "http://10.0.2.2:3000";
  }
  return "http://127.0.0.1:3000";
}

function createNativeApiClient(connection: NativeConnectionState): ApiClient {
  return new ApiClient({
    baseUrl: connection.baseUrl,
    fetchFn: (input, init) => {
      const headers = new Headers(init?.headers);
      if (connection.bearerToken.trim()) {
        headers.set("Authorization", `Bearer ${connection.bearerToken.trim()}`);
      }
      return fetch(input, {
        ...init,
        headers
      });
    }
  });
}
