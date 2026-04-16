#!/usr/bin/env bash
#
# Kill all local FideliOS dev processes across every worktree, including:
#   - the Node server (`fidelios run` / `pnpm dev*`)
#   - embedded PostgreSQL children (ports 54331, 5432, ...)
#   - plugin worker processes (fidelios-plugin-*/dist/worker.js)
#   - stale lock / pid files (~/.fidelios/instances/default/db/postmaster.pid)
#   - anything still bound to the FideliOS port range (3100-3110, 5173, 54331)
#
# Usage:
#   scripts/kill-dev.sh        # kill everything
#   scripts/kill-dev.sh --dry  # preview what would be killed
#

set -uo pipefail
# Note: `set -e` removed — we want to continue past individual kill failures.

DRY_RUN=false
if [[ "${1:-}" == "--dry" || "${1:-}" == "--dry-run" || "${1:-}" == "-n" ]]; then
  DRY_RUN=true
fi

INSTANCES_ROOT="${FIDELIOS_HOME:-$HOME/.fidelios}/instances"

# Collect PIDs matching FideliOS-related processes. We include postgres explicitly
# because embedded-postgres spawns a detached child that survives a parent kill.
pids=()
lines=()

match_patterns=(
  # Node in any worktree directory (main fidelios, fidelios-plugin-*, fidelios-*)
  '/fidelios(-[^/ ]+)?/.*node'
  # Embedded PostgreSQL binaries (spawned by embedded-postgres npm package)
  '@embedded-postgres/.*/postgres'
  # Plugin worker scripts
  'fidelios.*plugin.*worker'
  'fidelios-plugin-.*/dist/worker'
  # FideliOS CLI run command itself
  'fidelios run'
)

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  pid=$(echo "$line" | awk '{print $2}')
  [[ -z "$pid" ]] && continue
  # Deduplicate (a process may match multiple patterns)
  for existing in "${pids[@]:-}"; do
    [[ "$existing" == "$pid" ]] && continue 2
  done
  pids+=("$pid")
  lines+=("$line")
done < <(
  for pattern in "${match_patterns[@]}"; do
    ps auxwww | grep -E "$pattern" | grep -v grep || true
  done
)

if [[ ${#pids[@]} -eq 0 ]]; then
  echo "No FideliOS processes found."
else
  echo "Found ${#pids[@]} FideliOS process(es):"
  echo ""
  for i in "${!pids[@]}"; do
    line="${lines[$i]}"
    pid=$(echo "$line" | awk '{print $2}')
    start=$(echo "$line" | awk '{print $9}')
    cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')
    cmd=$(echo "$cmd" | sed "s|$HOME/||g")
    printf "  PID %-7s  started %-10s  %s\n" "$pid" "$start" "$cmd"
  done
  echo ""

  if [[ "$DRY_RUN" == true ]]; then
    echo "Dry run — re-run without --dry to kill these processes and clean lock files."
    exit 0
  fi

  echo "Sending SIGTERM..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null && echo "  SIGTERM -> $pid" || echo "  $pid already gone"
  done

  # Give processes a moment to exit, then SIGKILL any stragglers
  sleep 2
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "  $pid still alive, sending SIGKILL..."
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
fi

# Sweep anything still listening on FideliOS ports (server, UI dev, embedded pg).
# This catches orphaned workers whose command line didn't match the patterns above.
if [[ "$DRY_RUN" != true ]]; then
  echo ""
  echo "Sweeping ports 3100-3110, 5173, 54331..."
  port_pids=$(lsof -ti:3100,3101,3102,3103,3104,3105,3106,3107,3108,3109,3110,5173,54331 2>/dev/null || true)
  if [[ -n "$port_pids" ]]; then
    for pid in $port_pids; do
      kill -9 "$pid" 2>/dev/null && echo "  killed $pid (port sweep)" || true
    done
  fi

  # Remove stale lock files that block the next `fidelios run`.
  if [[ -d "$INSTANCES_ROOT" ]]; then
    shopt -s nullglob
    for instance_dir in "$INSTANCES_ROOT"/*/; do
      stale_pid="$instance_dir/db/postmaster.pid"
      if [[ -f "$stale_pid" ]]; then
        rm -f "$stale_pid"
        echo "  removed stale postmaster.pid: $stale_pid"
      fi
      stale_lock="$instance_dir/.lock"
      if [[ -f "$stale_lock" ]]; then
        rm -f "$stale_lock"
        echo "  removed stale lock: $stale_lock"
      fi
    done
    shopt -u nullglob
  fi
fi

echo "Done."
