import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { tokens } from "@clartk/design-tokens";
import { NativeSectionTitle } from "@clartk/ui-native";

export function App() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.panel}>
        <NativeSectionTitle title="ClaRTK Native" />
        <Text style={styles.body}>
          Unified RN shell for iOS, Android, and Windows operator workflows.
        </Text>
      </View>
    </SafeAreaView>
  );
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

