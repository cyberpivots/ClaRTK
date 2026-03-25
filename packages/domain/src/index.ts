export const PROTO_ROOT = "contracts/proto" as const;
export const DOMAIN_VERSION = "0.1.0" as const;

export type DeviceId = string;
export type TimestampIsoString = string;

export interface GeneratedTypesPending {
  note: "Generate TS types from contracts/proto before using domain messages in production.";
}

