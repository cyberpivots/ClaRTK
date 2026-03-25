import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { tokens } from "@clartk/design-tokens";
import { NativeSectionTitle } from "@clartk/ui-native";
export function App() {
    return (_jsx(SafeAreaView, { style: styles.root, children: _jsxs(View, { style: styles.panel, children: [_jsx(NativeSectionTitle, { title: "ClaRTK Native" }), _jsx(Text, { style: styles.body, children: "Unified RN shell for iOS, Android, and Windows operator workflows." })] }) }));
}
const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: tokens.color.bg
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
    }
});
