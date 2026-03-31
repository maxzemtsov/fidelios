import path from "node:path";
import {
  expandHomePrefix,
  resolveDefaultConfigPath,
  resolveDefaultContextPath,
  resolveFideliOSInstanceId,
} from "./home.js";

export interface DataDirOptionLike {
  dataDir?: string;
  config?: string;
  context?: string;
  instance?: string;
}

export interface DataDirCommandSupport {
  hasConfigOption?: boolean;
  hasContextOption?: boolean;
}

export function applyDataDirOverride(
  options: DataDirOptionLike,
  support: DataDirCommandSupport = {},
): string | null {
  const rawDataDir = options.dataDir?.trim();
  if (!rawDataDir) return null;

  const resolvedDataDir = path.resolve(expandHomePrefix(rawDataDir));
  process.env.FIDELIOS_HOME = resolvedDataDir;

  if (support.hasConfigOption) {
    const hasConfigOverride = Boolean(options.config?.trim()) || Boolean(process.env.FIDELIOS_CONFIG?.trim());
    if (!hasConfigOverride) {
      const instanceId = resolveFideliOSInstanceId(options.instance);
      process.env.FIDELIOS_INSTANCE_ID = instanceId;
      process.env.FIDELIOS_CONFIG = resolveDefaultConfigPath(instanceId);
    }
  }

  if (support.hasContextOption) {
    const hasContextOverride = Boolean(options.context?.trim()) || Boolean(process.env.FIDELIOS_CONTEXT?.trim());
    if (!hasContextOverride) {
      process.env.FIDELIOS_CONTEXT = resolveDefaultContextPath();
    }
  }

  return resolvedDataDir;
}
