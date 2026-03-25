import React from "react";
import { Text } from "react-native";
import { tokens } from "@clartk/design-tokens";

export function NativeSectionTitle(props: { title: string }) {
  return <Text style={{ fontSize: 24, color: tokens.color.ink }}>{props.title}</Text>;
}

