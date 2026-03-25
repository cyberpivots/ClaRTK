import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ApiClient } from "@clartk/api-client";
import { tokens } from "@clartk/design-tokens";
import { ScreenTitle } from "@clartk/ui-web";
const api = new ApiClient({ baseUrl: "http://localhost:3000" });
export function App() {
    return (_jsxs("main", { style: {
            maxWidth: 920,
            margin: "0 auto",
            padding: tokens.space.xl,
            color: tokens.color.ink
        }, children: [_jsx(ScreenTitle, { title: "ClaRTK Operator Dashboard", subtitle: "Browser control surface for device health, RTK status, and fixture-driven protocol validation." }), _jsxs("section", { className: "panel", children: [_jsx("h2", { children: "API Endpoint" }), _jsx("code", { children: api.url("/health") })] })] }));
}
