import fs from "fs";
import path from "path";
import { paths } from "./config.js";

function ensureDataDir() {
  if (!fs.existsSync(paths.dataDir)) fs.mkdirSync(paths.dataDir, { recursive: true });
}

export function dataPath(filename) {
  return path.join(paths.dataDir, filename);
}

export function readJson(file, fallback = {}) {
  ensureDataDir();
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
