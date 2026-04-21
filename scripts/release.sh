#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./release-lib.sh
. "$REPO_ROOT/scripts/release-lib.sh"
CLI_DIR="$REPO_ROOT/cli"

bump="patch"
dry_run=false
skip_verify=false
print_version_only=false
tag_name=""

cleanup_on_exit=false

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release.sh [--bump patch|minor|major] [--dry-run] [--skip-verify] [--print-version]

Examples:
  ./scripts/release.sh                    # publish 0.0.x (patch bump)
  ./scripts/release.sh --bump minor       # publish 0.x.0
  ./scripts/release.sh --bump major       # publish x.0.0
  ./scripts/release.sh --dry-run          # preview without publishing

Notes:
  - Versions follow semver: MAJOR.MINOR.PATCH (e.g. 0.0.4, 0.1.0, 1.0.0).
  - Default bump is patch. Use --bump minor or --bump major as needed.
  - Release notes must exist at releases/vX.Y.Z.md before publishing.
  - The script rewrites versions temporarily and restores the working tree on
    exit. Tags always point at the original source commit, not a generated
    release commit.
EOF
}

restore_publish_artifacts() {
  if [ -f "$CLI_DIR/package.dev.json" ]; then
    mv "$CLI_DIR/package.dev.json" "$CLI_DIR/package.json"
  fi

  rm -f "$CLI_DIR/README.md"
  rm -rf "$REPO_ROOT/server/ui-dist"

  for pkg_dir in server packages/adapters/claude-local packages/adapters/codex-local; do
    rm -rf "$REPO_ROOT/$pkg_dir/skills"
  done

  rm -rf "$REPO_ROOT/server/packages"
}

cleanup_release_state() {
  restore_publish_artifacts

  tracked_changes="$(git -C "$REPO_ROOT" diff --name-only; git -C "$REPO_ROOT" diff --cached --name-only)"
  if [ -n "$tracked_changes" ]; then
    printf '%s\n' "$tracked_changes" | sort -u | while IFS= read -r path; do
      [ -z "$path" ] && continue
      git -C "$REPO_ROOT" checkout -q HEAD -- "$path" || true
    done
  fi

  untracked_changes="$(git -C "$REPO_ROOT" ls-files --others --exclude-standard)"
  if [ -n "$untracked_changes" ]; then
    printf '%s\n' "$untracked_changes" | while IFS= read -r path; do
      [ -z "$path" ] && continue
      if [ -d "$REPO_ROOT/$path" ]; then
        rm -rf "$REPO_ROOT/$path"
      else
        rm -f "$REPO_ROOT/$path"
      fi
    done
  fi
}

set_cleanup_trap() {
  cleanup_on_exit=true
  trap cleanup_release_state EXIT
}

while [ $# -gt 0 ]; do
  case "$1" in
    # Accept "stable" for backward compat but ignore it
    stable) ;;
    # Silently ignore "canary" — it's a no-op now
    canary)
      release_fail "canary releases have been removed. Use './scripts/release.sh --bump patch' for regular releases."
      ;;
    --bump)
      shift
      [ $# -gt 0 ] || release_fail "--bump requires patch, minor, or major."
      case "$1" in
        patch|minor|major) bump="$1" ;;
        *) release_fail "--bump must be patch, minor, or major (got: $1)." ;;
      esac
      ;;
    --dry-run) dry_run=true ;;
    --skip-verify) skip_verify=true ;;
    --print-version) print_version_only=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      release_fail "unexpected argument: $1"
      ;;
  esac
  shift
done

PUBLISH_REMOTE="$(resolve_release_remote)"
fetch_release_remote "$PUBLISH_REMOTE"

CURRENT_BRANCH="$(git_current_branch)"
CURRENT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
LAST_STABLE_TAG="$(get_last_stable_tag)"
CURRENT_STABLE_VERSION="$(get_current_stable_version)"

PUBLIC_PACKAGE_INFO="$(list_public_package_info)"
PUBLIC_PACKAGE_NAMES=()
while IFS= read -r package_name; do
  [ -n "$package_name" ] || continue
  PUBLIC_PACKAGE_NAMES+=("$package_name")
done < <(printf '%s\n' "$PUBLIC_PACKAGE_INFO" | cut -f2)

[ -n "$PUBLIC_PACKAGE_INFO" ] || release_fail "no public packages were found in the workspace."

TARGET_VERSION="$(next_stable_version "$bump")"
tag_name="$(stable_tag_name "$TARGET_VERSION")"

if [ "$print_version_only" = true ]; then
  printf '%s\n' "$TARGET_VERSION"
  exit 0
fi

NOTES_FILE="$(release_notes_file "$TARGET_VERSION")"

require_clean_worktree
require_npm_publish_auth "$dry_run"

if [ ! -f "$NOTES_FILE" ]; then
  release_fail "release notes file is required at $NOTES_FILE before publishing."
fi

if git_local_tag_exists "$tag_name" || git_remote_tag_exists "$tag_name" "$PUBLISH_REMOTE"; then
  release_fail "git tag $tag_name already exists locally or on $PUBLISH_REMOTE."
fi

while IFS= read -r package_name; do
  [ -z "$package_name" ] && continue
  if npm_package_version_exists "$package_name" "$TARGET_VERSION"; then
    release_fail "npm version ${package_name}@${TARGET_VERSION} already exists."
  fi
done <<< "$(printf '%s\n' "${PUBLIC_PACKAGE_NAMES[@]}")"

release_info ""
release_info "==> Release plan"
release_info "  Remote: $PUBLISH_REMOTE"
release_info "  Bump: $bump"
release_info "  Current branch: ${CURRENT_BRANCH:-<detached>}"
release_info "  Source commit: $CURRENT_SHA"
release_info "  Last stable tag: ${LAST_STABLE_TAG:-<none>}"
release_info "  Current version: $CURRENT_STABLE_VERSION"
release_info "  New version: $TARGET_VERSION"
release_info "  Git tag: $tag_name"
release_info "  Release notes: $NOTES_FILE"

set_cleanup_trap

if [ "$skip_verify" = false ]; then
  release_info ""
  release_info "==> Step 1/7: Verification gate..."
  cd "$REPO_ROOT"
  pnpm -r typecheck
  pnpm test:run
  pnpm build
else
  release_info ""
  release_info "==> Step 1/7: Verification gate skipped (--skip-verify)"
fi

release_info ""
release_info "==> Step 2/7: Building workspace artifacts..."
cd "$REPO_ROOT"
pnpm build
bash "$REPO_ROOT/scripts/prepare-server-ui-dist.sh"
for pkg_dir in server packages/adapters/claude-local packages/adapters/codex-local; do
  rm -rf "$REPO_ROOT/$pkg_dir/skills"
  cp -r "$REPO_ROOT/skills" "$REPO_ROOT/$pkg_dir/skills"
done
# Bundle plugin examples into server package so they are available in npm tarball
rm -rf "$REPO_ROOT/server/packages/plugins/examples"
mkdir -p "$REPO_ROOT/server/packages/plugins"
cp -r "$REPO_ROOT/packages/plugins/examples" "$REPO_ROOT/server/packages/plugins/examples"
# The copy above brings each example's local node_modules/@fideliosai/* along.
# Those nested package.json files still carry the workspace-dev `exports`
# pointing at `./src/*.ts`. npm normally rewrites `exports` via `publishConfig`
# at publish time, but since we are copying directly we have to simulate that
# step here — otherwise Node 24+ crashes with
# ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING when a user activates a plugin.
node "$REPO_ROOT/scripts/sanitize-bundled-plugin-deps.mjs" \
  "$REPO_ROOT/server/packages/plugins/examples"
release_info "  ✓ Workspace build complete (including bundled plugin examples)"

release_info ""
release_info "==> Step 3/7: Rewriting workspace versions..."
set_public_package_version "$TARGET_VERSION"
release_info "  ✓ Versioned workspace to $TARGET_VERSION"

release_info ""
release_info "==> Step 4/7: Building publishable CLI bundle..."
"$REPO_ROOT/scripts/build-npm.sh" --skip-checks --skip-typecheck
release_info "  ✓ CLI bundle ready"

VERSIONED_PACKAGE_INFO="$(list_public_package_info)"
VERSION_IN_CLI_PACKAGE="$(node -e "console.log(require('$CLI_DIR/package.json').version)")"
if [ "$VERSION_IN_CLI_PACKAGE" != "$TARGET_VERSION" ]; then
  release_fail "versioning drift detected. Expected $TARGET_VERSION but found $VERSION_IN_CLI_PACKAGE."
fi

release_info ""
if [ "$dry_run" = true ]; then
  release_info "==> Step 5/7: Previewing publish payloads (--dry-run)..."
  while IFS=$'\t' read -r pkg_dir _pkg_name _pkg_version; do
    [ -z "$pkg_dir" ] && continue
    release_info "  --- $pkg_dir ---"
    cd "$REPO_ROOT/$pkg_dir"
    pnpm publish --dry-run --no-git-checks --tag latest 2>&1 | tail -3
  done <<< "$VERSIONED_PACKAGE_INFO"
  release_info "  [dry-run] Would create git tag $tag_name on $CURRENT_SHA"
else
  release_info "==> Step 5/7: Publishing packages to npm..."
  while IFS=$'\t' read -r pkg_dir pkg_name pkg_version; do
    [ -z "$pkg_dir" ] && continue
    release_info "  Publishing $pkg_name@$pkg_version"
    cd "$REPO_ROOT/$pkg_dir"
    pnpm publish --no-git-checks --tag latest --access public
  done <<< "$VERSIONED_PACKAGE_INFO"
  release_info "  ✓ Published all packages"
fi

release_info ""
if [ "$dry_run" = true ]; then
  release_info "==> Step 6/7: Skipping npm verification in dry-run mode..."
else
  release_info "==> Step 6/7: Confirming npm package availability..."
  VERIFY_ATTEMPTS="${NPM_PUBLISH_VERIFY_ATTEMPTS:-12}"
  VERIFY_DELAY_SECONDS="${NPM_PUBLISH_VERIFY_DELAY_SECONDS:-5}"
  MISSING_PUBLISHED_PACKAGES=""

  while IFS=$'\t' read -r _pkg_dir pkg_name pkg_version; do
    [ -z "$pkg_name" ] && continue
    release_info "  Checking $pkg_name@$pkg_version"
    if wait_for_npm_package_version "$pkg_name" "$pkg_version" "$VERIFY_ATTEMPTS" "$VERIFY_DELAY_SECONDS"; then
      release_info "    ✓ Found on npm"
      continue
    fi

    if [ -n "$MISSING_PUBLISHED_PACKAGES" ]; then
      MISSING_PUBLISHED_PACKAGES="${MISSING_PUBLISHED_PACKAGES}, "
    fi
    MISSING_PUBLISHED_PACKAGES="${MISSING_PUBLISHED_PACKAGES}${pkg_name}@${pkg_version}"
  done <<< "$VERSIONED_PACKAGE_INFO"

  [ -z "$MISSING_PUBLISHED_PACKAGES" ] || release_fail "publish completed but npm never exposed: $MISSING_PUBLISHED_PACKAGES"

  release_info "  ✓ Verified all versioned packages are available on npm"
fi

release_info ""
if [ "$dry_run" = true ]; then
  release_info "==> Step 7/7: Dry run complete..."
else
  release_info "==> Step 7/7: Creating git tag..."
  git -C "$REPO_ROOT" tag "$tag_name" "$CURRENT_SHA"
  release_info "  ✓ Created tag $tag_name on $CURRENT_SHA"
fi

release_info ""
if [ "$dry_run" = true ]; then
  release_info "Dry run complete for ${TARGET_VERSION}."
else
  release_info "Published ${TARGET_VERSION}."

  release_info ""
  release_info "==> Pushing tag and creating GitHub Release..."
  git -C "$REPO_ROOT" push "${PUBLISH_REMOTE}" "refs/tags/${tag_name}" 2>&1 || true
  "$REPO_ROOT/scripts/create-github-release.sh" "$TARGET_VERSION" 2>&1 || {
    release_info "  ⚠ GitHub Release failed locally — the GitHub Action will handle it on tag push."
  }
fi
