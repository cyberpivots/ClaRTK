import { jsx as _jsx } from "react/jsx-runtime";
import { Text } from "react-native";
import { tokens } from "@clartk/design-tokens";
export function NativeSectionTitle(props) {
    return _jsx(Text, { style: { fontSize: 24, color: tokens.color.ink }, children: props.title });
}
