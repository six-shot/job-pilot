import { promises as fs } from "fs";
import path from "path";
import type { StoredTailor } from "./types";

// Files from the single-user version, kept in ./data on this computer.
// The browser imports them once; ./data is never deployed, so hosted this returns nothing.
const DATA_DIR = path.join(process.cwd(), "data");

export async function readLocalFiles() {
  let text = "";
  try {
    text = await fs.readFile(path.join(DATA_DIR, "resume.md"), "utf8");
  } catch {
    return { text, tailored: [] };
  }
  const tailored: StoredTailor[] = [];
  try {
    const dir = path.join(DATA_DIR, "tailored");
    for (const file of await fs.readdir(dir)) {
      if (!file.endsWith(".json")) continue;
      tailored.push(JSON.parse(await fs.readFile(path.join(dir, file), "utf8")));
    }
  } catch {
    // no tailored CVs saved
  }
  return { text, tailored };
}
