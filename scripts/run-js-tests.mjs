import { readdir } from "node:fs/promises";

const dirs = ["apps", "packages", "services"];
for (const dir of dirs) {
  try {
    await readdir(dir);
  } catch (error) {
    console.error(`missing expected workspace directory: ${dir}`);
    process.exit(1);
  }
}

console.log("javascript workspace smoke test passed");

