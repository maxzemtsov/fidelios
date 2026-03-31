#!/bin/bash
set -euo pipefail

# FideliOS Rebrand Script
# Renames Paperclip → FideliOS across the codebase
# Run from repo root: bash scripts/rebrand.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== FideliOS Rebrand Script ==="
echo "Working in: $REPO_ROOT"
echo ""

# Files to process (exclude node_modules, .git, dist, binary files, lockfile)
FIND_ARGS=(-type f \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/dist/*' \
  -not -path '*/.next/*' \
  -not -path '*/pnpm-lock.yaml' \
  -not -path '*/scripts/rebrand.sh' \
  -not -name '*.png' -not -name '*.jpg' -not -name '*.ico' \
  -not -name '*.woff' -not -name '*.woff2' -not -name '*.ttf' \
  -not -name '*.eot' -not -name '*.svg')

# Portable sed in-place (macOS vs GNU)
sedi() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

# Phase 1: GitHub URLs (most specific)
echo "[1/10] GitHub URLs..."
find . "${FIND_ARGS[@]}" -exec grep -l 'paperclipai/paperclip' {} \; 2>/dev/null | while read -r f; do
  sedi 's|github\.com/paperclipai/paperclip|github.com/fideliosai/fidelios|g' "$f"
  sedi 's|paperclipai/paperclip|fideliosai/fidelios|g' "$f"
done

# Phase 2: NPM scope
echo "[2/10] NPM scope @paperclipai/ → @fidelios/..."
find . "${FIND_ARGS[@]}" -exec grep -l '@paperclipai/' {} \; 2>/dev/null | while read -r f; do
  sedi 's/@paperclipai\//@fidelios\//g' "$f"
done

# Phase 3: NPM binary name (standalone "paperclipai")
echo "[3/10] NPM binary name..."
find . "${FIND_ARGS[@]}" -exec grep -l 'paperclipai' {} \; 2>/dev/null | while read -r f; do
  sedi 's/paperclipai/fidelios/g' "$f"
done

# Phase 4: Environment variable prefix
echo "[4/10] PAPERCLIP_ → FIDELIOS_ env vars..."
find . "${FIND_ARGS[@]}" -exec grep -l 'PAPERCLIP_' {} \; 2>/dev/null | while read -r f; do
  sedi 's/PAPERCLIP_/FIDELIOS_/g' "$f"
done

# Phase 5: Home directory path
echo "[5/10] ~/.paperclip/ → ~/.fidelios/ paths..."
find . "${FIND_ARGS[@]}" -exec grep -l '\.paperclip' {} \; 2>/dev/null | while read -r f; do
  sedi 's/\.paperclip/\.fidelios/g' "$f"
done

# Phase 6: Plugin paths (e.g. paperclip-plugin-telegram)
echo "[6/10] paperclip-plugin- → fidelios-plugin-..."
find . "${FIND_ARGS[@]}" -exec grep -l 'paperclip-plugin-' {} \; 2>/dev/null | while read -r f; do
  sedi 's/paperclip-plugin-/fidelios-plugin-/g' "$f"
done

# Phase 7: Brand name "Paperclip AI" → "FideliOS"
echo "[7/10] Brand names..."
find . "${FIND_ARGS[@]}" -exec grep -l 'Paperclip AI' {} \; 2>/dev/null | while read -r f; do
  sedi 's/Paperclip AI/FideliOS/g' "$f"
done
find . "${FIND_ARGS[@]}" -exec grep -l 'Paperclip HQ' {} \; 2>/dev/null | while read -r f; do
  sedi 's/Paperclip HQ/FideliOS HQ/g' "$f"
done

# Phase 8: "Paperclip" (capitalized brand) → "FideliOS"
echo "[8/10] Paperclip → FideliOS..."
find . "${FIND_ARGS[@]}" -exec grep -l 'Paperclip' {} \; 2>/dev/null | while read -r f; do
  sedi 's/Paperclip/FideliOS/g' "$f"
done

# Phase 9: Remaining lowercase "paperclip" → "fidelios"
# This handles: db name, db user, db password, variable names, paths, etc.
echo "[9/10] paperclip → fidelios (lowercase)..."
find . "${FIND_ARGS[@]}" -exec grep -l 'paperclip' {} \; 2>/dev/null | while read -r f; do
  sedi 's/paperclip/fidelios/g' "$f"
done

# Phase 10: Fix any double-replacements or known issues
echo "[10/10] Post-processing fixes..."

# Fix "hermes-fidelios-adapter" back to original (external dependency)
find . "${FIND_ARGS[@]}" -exec grep -l 'hermes-fidelios-adapter' {} \; 2>/dev/null | while read -r f; do
  sedi 's/hermes-fidelios-adapter/hermes-paperclip-adapter/g' "$f"
done

# Fix embedded-postgres package paths in postmaster.opts references
# (these reference actual npm package names that shouldn't change)

echo ""
echo "=== Rebrand complete ==="
echo "Review changes with: git diff --stat"
echo "Build with: pnpm install && pnpm build"
