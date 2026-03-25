import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { tokens } from "@clartk/design-tokens";
export function ScreenTitle(props) {
    return (_jsxs("header", { style: { marginBottom: tokens.space.lg }, children: [_jsx("h1", { style: { margin: 0, color: tokens.color.ink }, children: props.title }), props.subtitle ? (_jsx("p", { style: { marginTop: tokens.space.sm, color: "#4d6a70" }, children: props.subtitle })) : null] }));
}
