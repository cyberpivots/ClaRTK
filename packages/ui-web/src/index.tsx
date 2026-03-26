import React from "react";
import { tokens } from "@clartk/design-tokens";

export function ScreenTitle(props: { title: string; subtitle?: string }) {
  return (
    <header style={{ marginBottom: tokens.space.lg }}>
      <h1 style={{ margin: 0, color: tokens.color.ink }}>{props.title}</h1>
      {props.subtitle ? (
        <p style={{ marginTop: tokens.space.sm, color: "#4d6a70" }}>{props.subtitle}</p>
      ) : null}
    </header>
  );
}

export function AppFrame(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: tokens.space.xl,
        background:
          `radial-gradient(circle at top left, ${tokens.color.bgAccent}, transparent 32%), ` +
          `linear-gradient(180deg, ${tokens.color.bg}, #f9fbfb 65%)`,
        color: tokens.color.ink
      }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <ScreenTitle title={props.title} subtitle={props.subtitle} />
        {props.children}
      </div>
    </main>
  );
}

export function Panel(props: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  accent?: "default" | "muted";
}) {
  return (
    <section
      style={{
        background: props.accent === "muted" ? tokens.color.panelAlt : tokens.color.panel,
        border: `1px solid ${tokens.color.line}`,
        borderRadius: tokens.radius.lg,
        boxShadow: tokens.shadow.card,
        padding: tokens.space.lg
      }}
    >
      {props.eyebrow ? (
        <p
          style={{
            margin: 0,
            marginBottom: tokens.space.sm,
            color: tokens.color.muted,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: 12
          }}
        >
          {props.eyebrow}
        </p>
      ) : null}
      <h2 style={{ marginTop: 0, marginBottom: tokens.space.md }}>{props.title}</h2>
      {props.children}
    </section>
  );
}

export function StatusPill(props: {
  status: "ok" | "degraded" | "neutral";
  children: React.ReactNode;
}) {
  const palette =
    props.status === "ok"
      ? {
          background: "#e7f6f0",
          color: tokens.color.accentStrong
        }
      : props.status === "degraded"
        ? {
            background: "#fff1ee",
            color: tokens.color.alert
          }
        : {
            background: "#eef4f3",
            color: tokens.color.muted
          };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: tokens.space.xs,
        borderRadius: 999,
        padding: `${tokens.space.xs}px ${tokens.space.sm}px`,
        background: palette.background,
        color: palette.color,
        fontSize: 12,
        fontWeight: 700
      }}
    >
      {props.children}
    </span>
  );
}
