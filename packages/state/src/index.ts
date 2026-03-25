import type { DeviceId, TimestampIsoString } from "@clartk/domain";

export type TaskStatus = "pending" | "in_progress" | "blocked" | "done";

export interface DeviceHealth {
  deviceId: DeviceId;
  observedAt: TimestampIsoString;
  status: "ok" | "warn" | "error";
}

export const emptyHealth: DeviceHealth[] = [];

