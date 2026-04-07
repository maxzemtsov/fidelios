#!/usr/bin/env bash
# Install pgvector extension into FideliOS embedded PostgreSQL.
#
# The embedded-postgres npm package ships PostgreSQL 18 without pgvector.
# This script builds pgvector from source using Homebrew's pg@18 headers,
# then copies the extension files into every @embedded-postgres/darwin-arm64
# installation found in the project tree (node_modules + global npm).
#
# Prerequisites: Homebrew, git, clang (Xcode CLT)
# Usage: ./scripts/install-pgvector.sh

set -euo pipefail

PGVECTOR_BRANCH="v0.8.0"  # bump when a stable PG-18-compatible release exists
BUILD_DIR="/tmp/pgvector-build-$$"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT

echo "==> Ensuring postgresql@18 is installed (for headers)..."
if ! brew list postgresql@18 &>/dev/null; then
  brew install postgresql@18
fi

PG_CONFIG="$(brew --prefix postgresql@18)/bin/pg_config"
if [[ ! -x "$PG_CONFIG" ]]; then
  echo "ERROR: pg_config not found at $PG_CONFIG" >&2
  exit 1
fi

echo "==> Building pgvector from source (main branch for PG 18 compat)..."
git clone --depth 1 https://github.com/pgvector/pgvector.git "$BUILD_DIR" 2>/dev/null
cd "$BUILD_DIR"
make PG_CONFIG="$PG_CONFIG" -j"$(sysctl -n hw.ncpu)" 2>&1 | tail -3

VECTOR_DYLIB="$BUILD_DIR/vector.dylib"
VECTOR_CONTROL="$BUILD_DIR/vector.control"

if [[ ! -f "$VECTOR_DYLIB" ]]; then
  echo "ERROR: vector.dylib not found after build" >&2
  exit 1
fi

echo "==> Installing pgvector into embedded-postgres installations..."

installed=0
while IFS= read -r -d '' native_dir; do
  lib_dir="$native_dir/lib/postgresql"
  share_dir="$native_dir/share/postgresql/extension"

  if [[ -d "$lib_dir" && -d "$share_dir" ]]; then
    cp "$VECTOR_DYLIB" "$lib_dir/vector.dylib"
    cp "$VECTOR_CONTROL" "$share_dir/vector.control"
    for sql_file in "$BUILD_DIR"/sql/vector--*.sql "$BUILD_DIR"/sql/vector.sql; do
      [[ -f "$sql_file" ]] && cp "$sql_file" "$share_dir/"
    done
    echo "    Installed into: $native_dir"
    installed=$((installed + 1))
  fi
done < <(find "$REPO_ROOT/node_modules" /opt/homebrew/lib/node_modules/fidelios/node_modules -path "*/@embedded-postgres/darwin-arm64/native" -type d -print0 2>/dev/null || true)

if [[ $installed -eq 0 ]]; then
  echo "WARNING: No @embedded-postgres/darwin-arm64 installations found." >&2
  echo "         pgvector was built but not installed anywhere." >&2
  exit 1
fi

echo "==> Done. pgvector installed into $installed location(s)."
echo "    Run 'CREATE EXTENSION IF NOT EXISTS vector;' in your database to enable it."
