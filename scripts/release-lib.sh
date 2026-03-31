#!/usr/bin/env bash

if [ -z "${REPO_ROOT:-}" ]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

release_info() {
  echo "$@"
}

release_warn() {
  echo "Warning: $*" >&2
}

release_fail() {
  echo "Error: $*" >&2
  exit 1
}

git_remote_exists() {
  git -C "$REPO_ROOT" remote get-url "$1" >/dev/null 2>&1
}

github_repo_from_remote() {
  local remote_url

  remote_url="$(git -C "$REPO_ROOT" remote get-url "$1" 2>/dev/null || true)"
  [ -n "$remote_url" ] || return 1

  remote_url="${remote_url%.git}"
  remote_url="${remote_url#ssh://}"

  node - "$remote_url" <<'NODE'
const remoteUrl = process.argv[2];

const patterns = [
  /^https?:\/\/github\.com\/([^/]+\/[^/]+)$/,
  /^git@github\.com:([^/]+\/[^/]+)$/,
  /^[^:]+:([^/]+\/[^/]+)$/
];

for (const pattern of patterns) {
  const match = remoteUrl.match(pattern);
  if (!match) continue;
  process.stdout.write(match[1]);
  process.exit(0);
}

process.exit(1);
NODE
}

resolve_release_remote() {
  local remote="${RELEASE_REMOTE:-${PUBLISH_REMOTE:-}}"

  if [ -n "$remote" ]; then
    git_remote_exists "$remote" || release_fail "git remote '$remote' does not exist."
    printf '%s\n' "$remote"
    return
  fi

  if git_remote_exists public-gh; then
    printf 'public-gh\n'
    return
  fi

  if git_remote_exists public; then
    printf 'public\n'
    return
  fi

  if git_remote_exists origin; then
    printf 'origin\n'
    return
  fi

  release_fail "no git remote found. Configure RELEASE_REMOTE or PUBLISH_REMOTE."
}

fetch_release_remote() {
  git -C "$REPO_ROOT" fetch "$1" --prune --tags
}

git_current_branch() {
  git -C "$REPO_ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null || true
}

git_local_tag_exists() {
  git -C "$REPO_ROOT" show-ref --verify --quiet "refs/tags/$1"
}

git_remote_tag_exists() {
  git -C "$REPO_ROOT" ls-remote --exit-code --tags "$2" "refs/tags/$1" >/dev/null 2>&1
}

get_last_stable_tag() {
  git -C "$REPO_ROOT" tag --list 'v*' --sort=-version:refname | head -1
}

get_current_stable_version() {
  local tag
  tag="$(get_last_stable_tag)"
  if [ -z "$tag" ]; then
    printf '0.0.0\n'
  else
    printf '%s\n' "${tag#v}"
  fi
}

# Bump a semver string: bump_semver <version> <patch|minor|major>
bump_semver() {
  node - "$1" "$2" <<'NODE'
const [, , ver, bump] = process.argv;
const parts = ver.split(".").map(Number);
if (parts.length !== 3 || parts.some(isNaN)) {
  process.stderr.write(`invalid semver: ${ver}\n`); process.exit(1);
}
if (bump === "major") { parts[0]++; parts[1] = 0; parts[2] = 0; }
else if (bump === "minor") { parts[1]++; parts[2] = 0; }
else { parts[2]++; }
process.stdout.write(parts.join("."));
NODE
}

next_stable_version() {
  local bump="${1:-patch}"

  node - "$bump" "$REPO_ROOT" <<'NODE'
const [, , bump, repoRoot] = process.argv;
const { execSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");

// Read current version from root package.json as baseline
const rootPkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
let base = rootPkg.version || "0.0.0";
// Strip any pre-release suffix to get clean semver
base = base.replace(/-.*$/, "");

// Also check latest published stable tag from git
try {
  const tags = execSync("git tag --list 'v[0-9]*' --sort=-version:refname", {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], cwd: repoRoot,
  }).trim().split("\n").filter(Boolean);
  if (tags.length > 0) {
    const tagVer = tags[0].replace(/^v/, "").replace(/-.*$/, "");
    // Use whichever is higher
    const a = base.split(".").map(Number);
    const b = tagVer.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if ((b[i] || 0) > (a[i] || 0)) { base = tagVer; break; }
      if ((a[i] || 0) > (b[i] || 0)) break;
    }
  }
} catch {}

const parts = base.split(".").map(Number);
if (bump === "major") { parts[0]++; parts[1] = 0; parts[2] = 0; }
else if (bump === "minor") { parts[1]++; parts[2] = 0; }
else { parts[2]++; }

process.stdout.write(parts.join("."));
NODE
}

release_notes_file() {
  printf '%s/releases/v%s.md\n' "$REPO_ROOT" "$1"
}

stable_tag_name() {
  printf 'v%s\n' "$1"
}

npm_package_version_exists() {
  local package_name="$1"
  local version="$2"
  local resolved

  resolved="$(npm view "${package_name}@${version}" version 2>/dev/null || true)"
  [ "$resolved" = "$version" ]
}

wait_for_npm_package_version() {
  local package_name="$1"
  local version="$2"
  local attempts="${3:-12}"
  local delay_seconds="${4:-5}"
  local attempt=1

  while [ "$attempt" -le "$attempts" ]; do
    if npm_package_version_exists "$package_name" "$version"; then
      return 0
    fi

    if [ "$attempt" -lt "$attempts" ]; then
      sleep "$delay_seconds"
    fi
    attempt=$((attempt + 1))
  done

  return 1
}

require_clean_worktree() {
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
    release_fail "working tree is not clean. Commit, stash, or remove changes before releasing."
  fi
}

require_on_master_branch() {
  local current_branch
  current_branch="$(git_current_branch)"
  if [ "$current_branch" != "master" ] && [ "$current_branch" != "main" ]; then
    release_fail "this release step must run from branch main (or master), but current branch is ${current_branch:-<detached>}."
  fi
}

require_npm_publish_auth() {
  local dry_run="$1"

  if [ "$dry_run" = true ]; then
    return
  fi

  if npm whoami >/dev/null 2>&1; then
    release_info "  ✓ Logged in to npm as $(npm whoami)"
    return
  fi

  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    release_info "  ✓ npm publish auth will be provided by GitHub Actions trusted publishing"
    return
  fi

  release_fail "npm publish auth is not available. Use 'npm login' locally or run from GitHub Actions with trusted publishing."
}

list_public_package_info() {
  node "$REPO_ROOT/scripts/release-package-map.mjs" list
}

set_public_package_version() {
  node "$REPO_ROOT/scripts/release-package-map.mjs" set-version "$1"
}
