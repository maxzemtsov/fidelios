#!/usr/bin/env node
/**
 * Sanitise nested node_modules inside bundled plugin examples so they
 * look like a real npm-published package tree — not a dev workspace.
 *
 * Why: the release script does `cp -r packages/plugins/examples
 * server/packages/plugins/examples` to ship the example plugins inside
 * the @fideliosai/server tarball. The copy brings along each example's
 * local node_modules/@fideliosai/*, but those copies keep their
 * workspace-dev package.json where the top-level `exports` points at
 * `./src/index.ts`.
 *
 * npm normally rewrites the package.json using `publishConfig` at
 * publish time — turning `"exports": "./src/index.ts"` into
 * `"exports": "./dist/index.js"`. When we copy directly we skip that
 * step, so the bundled tree exposes raw TypeScript.
 *
 * On Node.js 24+, `import`-ing a `.ts` file from under node_modules
 * throws ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING — which is what
 * broke Telegram Gateway plugin activation on a user's Mac running
 * Node 24.14.1.
 *
 * This script walks the bundled tree and, for every nested
 * `@fideliosai/<name>/package.json` it finds, merges the package's own
 * `publishConfig` (exports, main, types, bin, ...) into the top-level
 * and removes the `publishConfig` block. It also deletes `src/`
 * directories it finds in the bundled dependency packages — they're
 * only ever consumed through the `dist/` exports and dropping them
 * shrinks the tarball.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const PUBLISH_CONFIG_FIELDS_TO_HOIST = [
  "main",
  "module",
  "types",
  "typings",
  "exports",
  "bin",
  "browser",
];

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findPluginExampleRoots(startDir) {
  const entries = await fs.readdir(startDir, { withFileTypes: true });
  const roots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(startDir, entry.name);
    if (await pathExists(path.join(full, "package.json"))) {
      roots.push(full);
    }
  }
  return roots;
}

async function findNestedFideliosPackageJsons(pluginRoot) {
  const fideliosNmRoot = path.join(pluginRoot, "node_modules", "@fideliosai");
  if (!(await pathExists(fideliosNmRoot))) return [];

  const out = [];
  async function walk(dir) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (await pathExists(pkgJsonPath)) {
      out.push({ dir, pkgJsonPath });
    }
    const nestedFidelios = path.join(dir, "node_modules", "@fideliosai");
    if (await pathExists(nestedFidelios)) {
      for (const entry of await fs.readdir(nestedFidelios, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        await walk(path.join(nestedFidelios, entry.name));
      }
    }
  }

  for (const entry of await fs.readdir(fideliosNmRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    await walk(path.join(fideliosNmRoot, entry.name));
  }

  return out;
}

/**
 * Hoist publishConfig fields into the top-level so the on-disk layout
 * matches what consumers would have seen if the package were installed
 * from npm instead of copied from a workspace.
 *
 * @returns true when the file was modified.
 */
async function hoistPublishConfig(pkgJsonPath) {
  const raw = await fs.readFile(pkgJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  const publishConfig = pkg.publishConfig;
  if (!publishConfig || typeof publishConfig !== "object") return false;

  let changed = false;
  for (const field of PUBLISH_CONFIG_FIELDS_TO_HOIST) {
    if (publishConfig[field] === undefined) continue;
    pkg[field] = publishConfig[field];
    changed = true;
  }

  if (changed) {
    delete pkg.publishConfig;
    await fs.writeFile(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return changed;
}

async function removeSrcDir(pkgDir) {
  const srcDir = path.join(pkgDir, "src");
  if (!(await pathExists(srcDir))) return false;
  await fs.rm(srcDir, { recursive: true, force: true });
  return true;
}

async function main() {
  const bundleRoot = process.argv[2];
  if (!bundleRoot) {
    console.error("Usage: sanitize-bundled-plugin-deps.mjs <bundle-root>");
    process.exit(2);
  }
  const absRoot = path.resolve(bundleRoot);
  if (!(await pathExists(absRoot))) {
    console.error(`Bundle root does not exist: ${absRoot}`);
    process.exit(2);
  }

  const pluginRoots = await findPluginExampleRoots(absRoot);
  if (pluginRoots.length === 0) {
    console.log(`[sanitize] No plugin example roots under ${absRoot}`);
    return;
  }

  let totalHoisted = 0;
  let totalSrcRemoved = 0;

  for (const pluginRoot of pluginRoots) {
    const nestedPkgs = await findNestedFideliosPackageJsons(pluginRoot);
    for (const { dir, pkgJsonPath } of nestedPkgs) {
      const hoisted = await hoistPublishConfig(pkgJsonPath);
      const srcRemoved = await removeSrcDir(dir);
      if (hoisted) totalHoisted += 1;
      if (srcRemoved) totalSrcRemoved += 1;
    }
  }

  console.log(
    `[sanitize] Hoisted publishConfig in ${totalHoisted} package.json file(s); removed ${totalSrcRemoved} src/ dir(s) under ${absRoot}.`,
  );
}

main().catch((err) => {
  console.error("[sanitize] failed:", err);
  process.exit(1);
});
