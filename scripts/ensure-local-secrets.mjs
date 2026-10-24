import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const file = new URL("../.dev.vars", import.meta.url);
let contents = "";
try {
  contents = await readFile(file, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let changed = false;
for (const name of [
  "FUJI_MFA_KEY",
  "FUJI_BACKUP_KEY",
  "FUJI_OPERATIONS_TOKEN",
]) {
  if (!new RegExp(`^${name}=`, "m").test(contents)) {
    contents += `\n${name}=${randomBytes(32).toString("hex")}\n`;
    changed = true;
  }
}
if (changed) await writeFile(file, contents, { mode: 0o600 });
