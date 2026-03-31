import fs from "node:fs";
import { fideliosConfigSchema, type FideliOSConfig } from "@fidelios/shared";
import { resolveFideliOSConfigPath } from "./paths.js";

export function readConfigFile(): FideliOSConfig | null {
  const configPath = resolveFideliOSConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return fideliosConfigSchema.parse(raw);
  } catch {
    return null;
  }
}
