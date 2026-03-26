#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const protoRoot = path.join(repoRoot, "contracts", "proto");
const tsOutDir = path.join(repoRoot, "packages", "domain", "src", "generated");
const pythonOutDir = path.join(repoRoot, "generated", "python", "clartk_contracts");
const rustOutDir = path.join(repoRoot, "generated", "rust", "clartk-generated-contracts");

const checkOnly = process.argv.includes("--check");

const scalarTsTypes = {
  string: "string",
  bool: "boolean",
  double: "number",
  float: "number",
  int32: "number",
  int64: "number",
  uint32: "number",
  uint64: "number"
};

const scalarPythonTypes = {
  string: "str",
  bool: "bool",
  double: "float",
  float: "float",
  int32: "int",
  int64: "int",
  uint32: "int",
  uint64: "int"
};

const scalarRustTypes = {
  string: "String",
  bool: "bool",
  double: "f64",
  float: "f32",
  int32: "i32",
  int64: "i64",
  uint32: "u32",
  uint64: "u64"
};

const protoFiles = [
  "clartk/agent/v1/memory.proto",
  "clartk/agent/v1/preferences.proto",
  "clartk/gnss/v1/gnss.proto",
  "clartk/runtime/v1/auth.proto",
  "clartk/runtime/v1/preferences.proto"
];

function stripComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
}

function parseProto(text) {
  const lines = stripComments(text);
  const packageName = lines
    .find((line) => line.startsWith("package "))
    ?.match(/^package\s+([a-zA-Z0-9_.]+)\s*;/)?.[1];

  if (!packageName) {
    throw new Error("missing package declaration");
  }

  const enums = [];
  const messages = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const enumMatch = line.match(/^enum\s+([A-Za-z0-9_]+)\s*\{$/);
    if (enumMatch) {
      const values = [];
      for (index += 1; index < lines.length; index += 1) {
        const bodyLine = lines[index];
        if (bodyLine === "}") {
          break;
        }
        const valueMatch = bodyLine.match(/^([A-Z0-9_]+)\s*=\s*(\d+)\s*;$/);
        if (!valueMatch) {
          throw new Error(`unable to parse enum value: ${bodyLine}`);
        }
        values.push({
          name: valueMatch[1],
          number: Number(valueMatch[2])
        });
      }
      enums.push({
        name: enumMatch[1],
        values
      });
      continue;
    }

    const messageMatch = line.match(/^message\s+([A-Za-z0-9_]+)\s*\{$/);
    if (messageMatch) {
      const fields = [];
      for (index += 1; index < lines.length; index += 1) {
        const bodyLine = lines[index];
        if (bodyLine === "}") {
          break;
        }

        const mapMatch = bodyLine.match(
          /^map<\s*([A-Za-z0-9_.]+)\s*,\s*([A-Za-z0-9_.]+)\s*>\s+([A-Za-z0-9_]+)\s*=\s*(\d+)\s*;$/
        );
        if (mapMatch) {
          fields.push({
            kind: "map",
            keyType: mapMatch[1],
            valueType: mapMatch[2],
            name: mapMatch[3]
          });
          continue;
        }

        const repeatedMatch = bodyLine.match(
          /^repeated\s+([A-Za-z0-9_.]+)\s+([A-Za-z0-9_]+)\s*=\s*(\d+)\s*;$/
        );
        if (repeatedMatch) {
          fields.push({
            kind: "repeated",
            type: repeatedMatch[1],
            name: repeatedMatch[2]
          });
          continue;
        }

        const scalarMatch = bodyLine.match(/^([A-Za-z0-9_.]+)\s+([A-Za-z0-9_]+)\s*=\s*(\d+)\s*;$/);
        if (!scalarMatch) {
          throw new Error(`unable to parse message field: ${bodyLine}`);
        }
        fields.push({
          kind: "scalar",
          type: scalarMatch[1],
          name: scalarMatch[2]
        });
      }
      messages.push({
        name: messageMatch[1],
        fields
      });
    }
  }

  return {
    packageName,
    enums,
    messages
  };
}

function mergeDefinitions(definitions) {
  const merged = new Map();

  for (const definition of definitions) {
    const existing = merged.get(definition.packageName);
    if (!existing) {
      merged.set(definition.packageName, {
        packageName: definition.packageName,
        enums: [...definition.enums],
        messages: [...definition.messages]
      });
      continue;
    }

    existing.enums.push(...definition.enums);
    existing.messages.push(...definition.messages);
  }

  return [...merged.values()];
}

function snakeToCamel(value) {
  return value.replace(/_([a-z0-9])/g, (_match, char) => char.toUpperCase());
}

function screamingSnakeToPascal(value) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function resolveTsType(typeName) {
  return scalarTsTypes[typeName] ?? typeName;
}

function resolvePythonType(typeName) {
  return scalarPythonTypes[typeName] ?? typeName;
}

function resolveRustType(typeName) {
  return scalarRustTypes[typeName] ?? typeName;
}

function renderTsModule(definition) {
  const output = [
    "// This file is generated by scripts/generate-contracts.mjs.",
    `export const PACKAGE = "${definition.packageName}" as const;`,
    ""
  ];

  for (const enumDef of definition.enums) {
    output.push(`export const ${enumDef.name} = {`);
    for (const value of enumDef.values) {
      output.push(`  ${value.name}: ${value.number},`);
    }
    output.push(`} as const;`);
    output.push(
      `export type ${enumDef.name} = (typeof ${enumDef.name})[keyof typeof ${enumDef.name}];`
    );
    output.push("");
  }

  for (const message of definition.messages) {
    output.push(`export interface ${message.name} {`);
    for (const field of message.fields) {
      if (field.kind === "map") {
        output.push(
          `  ${snakeToCamel(field.name)}: Record<${resolveTsType(field.keyType)}, ${resolveTsType(field.valueType)}>;`
        );
      } else if (field.kind === "repeated") {
        output.push(`  ${snakeToCamel(field.name)}: ${resolveTsType(field.type)}[];`);
      } else {
        output.push(`  ${snakeToCamel(field.name)}: ${resolveTsType(field.type)};`);
      }
    }
    output.push("}");
    output.push("");
  }

  return output.join("\n").trimEnd() + "\n";
}

function renderGeneratedTsIndex(definitions) {
  const lines = ["// This file is generated by scripts/generate-contracts.mjs."];
  for (const definition of definitions) {
    const packageParts = definition.packageName.split(".");
    const moduleAlias = `${packageParts[1]}${packageParts[2].toUpperCase()}`;
    const fileName = `${packageParts[1]}-${packageParts[2]}.js`;
    lines.push(`export * as ${moduleAlias} from "./${fileName}";`);
  }
  return lines.join("\n") + "\n";
}

function renderPythonModule(definition) {
  const needsField = definition.messages.some((message) =>
    message.fields.some((field) => field.kind === "repeated" || field.kind === "map")
  );
  const needsDict = definition.messages.some((message) =>
    message.fields.some((field) => field.kind === "map")
  );
  const needsList = definition.messages.some((message) =>
    message.fields.some((field) => field.kind === "repeated")
  );

  const lines = [
    "# This file is generated by scripts/generate-contracts.mjs.",
    "from __future__ import annotations",
    ""
  ];

  if (needsField) {
    lines.push("from dataclasses import dataclass, field");
  } else {
    lines.push("from dataclasses import dataclass");
  }
  lines.push("from enum import IntEnum");
  if (needsDict || needsList) {
    const imports = [];
    if (needsDict) {
      imports.push("Dict");
    }
    if (needsList) {
      imports.push("List");
    }
    lines.push(`from typing import ${imports.join(", ")}`);
  }
  lines.push("");

  for (const enumDef of definition.enums) {
    lines.push(`class ${enumDef.name}(IntEnum):`);
    for (const value of enumDef.values) {
      lines.push(`    ${value.name} = ${value.number}`);
    }
    lines.push("");
  }

  for (const message of definition.messages) {
    lines.push("@dataclass(slots=True, kw_only=True)");
    lines.push(`class ${message.name}:`);
    if (message.fields.length === 0) {
      lines.push("    pass");
      lines.push("");
      continue;
    }

    for (const field of message.fields) {
      if (field.kind === "map") {
        lines.push(
          `    ${field.name}: Dict[${resolvePythonType(field.keyType)}, ${resolvePythonType(field.valueType)}] = field(default_factory=dict)`
        );
      } else if (field.kind === "repeated") {
        lines.push(
          `    ${field.name}: List[${resolvePythonType(field.type)}] = field(default_factory=list)`
        );
      } else {
        lines.push(`    ${field.name}: ${resolvePythonType(field.type)}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function renderPythonInit(definitions) {
  const lines = [
    "# This file is generated by scripts/generate-contracts.mjs.",
    "from . import agent_v1, gnss_v1, runtime_v1",
    "",
    "__all__ = [",
    '    "agent_v1",',
    '    "gnss_v1",',
    '    "runtime_v1",',
    "]",
    ""
  ];
  return lines.join("\n");
}

function renderRustModule(definition) {
  const needsBTreeMap = definition.messages.some((message) =>
    message.fields.some((field) => field.kind === "map")
  );
  const lines = ["// This file is generated by scripts/generate-contracts.mjs."];
  if (needsBTreeMap) {
    lines.push("use std::collections::BTreeMap;");
  }
  lines.push("");

  for (const enumDef of definition.enums) {
    lines.push("#[derive(Debug, Clone, Copy, PartialEq, Eq)]");
    lines.push("#[repr(i32)]");
    lines.push(`pub enum ${enumDef.name} {`);
    for (const value of enumDef.values) {
      lines.push(`    ${screamingSnakeToPascal(value.name)} = ${value.number},`);
    }
    lines.push("}");
    lines.push("");
  }

  for (const message of definition.messages) {
    lines.push("#[derive(Debug, Clone, PartialEq)]");
    lines.push(`pub struct ${message.name} {`);
    for (const field of message.fields) {
      if (field.kind === "map") {
        lines.push(
          `    pub ${field.name}: BTreeMap<${resolveRustType(field.keyType)}, ${resolveRustType(field.valueType)}>,`
        );
      } else if (field.kind === "repeated") {
        lines.push(`    pub ${field.name}: Vec<${resolveRustType(field.type)}>,`);
      } else {
        lines.push(`    pub ${field.name}: ${resolveRustType(field.type)},`);
      }
    }
    lines.push("}");
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function renderRustLib(definitions) {
  return [
    "// This file is generated by scripts/generate-contracts.mjs.",
    "pub mod agent_v1;",
    "pub mod gnss_v1;",
    "pub mod runtime_v1;",
    ""
  ].join("\n");
}

function renderRustCargoToml() {
  return [
    "[package]",
    'name = "clartk-generated-contracts"',
    'version = "0.1.0"',
    'edition = "2024"',
    "",
    "[lib]",
    'path = "src/lib.rs"',
    "",
    "[workspace]",
    ""
  ].join("\n");
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeFileChecked(filePath, content) {
  await ensureParentDir(filePath);
  let current = null;
  try {
    current = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }

  if (current === content) {
    return false;
  }

  if (checkOnly) {
    throw new Error(`generated file is out of date: ${path.relative(repoRoot, filePath)}`);
  }

  await fs.writeFile(filePath, content, "utf8");
  return true;
}

async function main() {
  const parsedDefinitions = [];

  for (const protoFile of protoFiles) {
    const fullPath = path.join(protoRoot, protoFile);
    const source = await fs.readFile(fullPath, "utf8");
    parsedDefinitions.push(parseProto(source));
  }

  const definitions = mergeDefinitions(parsedDefinitions);
  const byPackage = Object.fromEntries(
    definitions.map((definition) => [definition.packageName, definition])
  );

  const tsFiles = [
    {
      filePath: path.join(tsOutDir, "agent-v1.ts"),
      content: renderTsModule(byPackage["clartk.agent.v1"])
    },
    {
      filePath: path.join(tsOutDir, "gnss-v1.ts"),
      content: renderTsModule(byPackage["clartk.gnss.v1"])
    },
    {
      filePath: path.join(tsOutDir, "runtime-v1.ts"),
      content: renderTsModule(byPackage["clartk.runtime.v1"])
    },
    {
      filePath: path.join(tsOutDir, "index.ts"),
      content: renderGeneratedTsIndex(definitions)
    }
  ];

  const pythonFiles = [
    {
      filePath: path.join(pythonOutDir, "agent_v1.py"),
      content: renderPythonModule(byPackage["clartk.agent.v1"])
    },
    {
      filePath: path.join(pythonOutDir, "gnss_v1.py"),
      content: renderPythonModule(byPackage["clartk.gnss.v1"])
    },
    {
      filePath: path.join(pythonOutDir, "runtime_v1.py"),
      content: renderPythonModule(byPackage["clartk.runtime.v1"])
    },
    {
      filePath: path.join(pythonOutDir, "__init__.py"),
      content: renderPythonInit(definitions)
    }
  ];

  const rustFiles = [
    {
      filePath: path.join(rustOutDir, "Cargo.toml"),
      content: renderRustCargoToml()
    },
    {
      filePath: path.join(rustOutDir, "src", "agent_v1.rs"),
      content: renderRustModule(byPackage["clartk.agent.v1"])
    },
    {
      filePath: path.join(rustOutDir, "src", "gnss_v1.rs"),
      content: renderRustModule(byPackage["clartk.gnss.v1"])
    },
    {
      filePath: path.join(rustOutDir, "src", "runtime_v1.rs"),
      content: renderRustModule(byPackage["clartk.runtime.v1"])
    },
    {
      filePath: path.join(rustOutDir, "src", "lib.rs"),
      content: renderRustLib(definitions)
    }
  ];

  const changedFiles = [];
  for (const output of [...tsFiles, ...pythonFiles, ...rustFiles]) {
    const changed = await writeFileChecked(output.filePath, output.content);
    if (changed) {
      changedFiles.push(path.relative(repoRoot, output.filePath));
    }
  }

  if (!checkOnly) {
    for (const filePath of changedFiles) {
      console.log(`updated ${filePath}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
