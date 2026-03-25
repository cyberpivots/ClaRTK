import React from "react";
import { ApiClient } from "@clartk/api-client";
import { tokens } from "@clartk/design-tokens";
import { ScreenTitle } from "@clartk/ui-web";

const api = new ApiClient({ baseUrl: "http://localhost:3000" });

export function App() {
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
        subtitle="Browser control surface for device health, RTK status, and fixture-driven protocol validation."
      />
      <section className="panel">
        <h2>API Endpoint</h2>
        <code>{api.url("/health")}</code>
      </section>
    </main>
  );
}

