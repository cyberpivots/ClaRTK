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

