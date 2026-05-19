# FideliOS CI/CD & Delivery Pipeline

How a change travels from an idea to running in production — the GitHub Actions
gate, the branch/PR/review workflow, the merge slot, the release, and the
deploy. This is the consolidated reference; the runbook detail lives in
`OPERATIONS.md` and `doc/RELEASE-AUTOMATION-SETUP.md`.

FideliOS is a pnpm monorepo (`cli/`, `server/`, `ui/`, `packages/*`). Two kinds
of contributor drive the pipeline, both through the same GitHub repo:

- **FideliOS engineer agents** — LLM agents on the `claude_local` / `codex_local`
  adapters (Claude Code / Codex CLI instances). They pick up issues, branch,
  open PRs, and merge, following the workflow in §3.
- **The human operator** — oversees, gives the release approval, runs the
  deploy (§5–6).

## 1. The change lifecycle

```
issue ─▶ checkout ─▶ feature/{ISSUE-ID} ─▶ work ─▶ gh pr create ──┐
                                                                  │
   ┌──────────────────────────────────────────────────────────────┘
   ▼
  CI gate ......  policy + verify + e2e   (required — GitHub-enforced)
  review gate ..  code_reviewer agent     (workflow convention)
   │
   ▼  both green
  acquire merge slot ─▶ rebase on main ─▶ gh pr merge --squash ─▶ release slot
   │
   ▼  (when the operator decides to ship)
  scripts/release.sh ─▶ npm publish + git tag + GitHub Release
   │
   ▼
  npm i -g fidelios@latest + restart launchd ─▶ production
```

## 2. CI gate — GitHub Actions on a pull request

Every PR to `main` triggers `.github/workflows/pr.yml`. Three jobs; **all three
are required status checks** under `main` branch protection. Runner
`ubuntu-latest`, Node 24, pnpm 9.15.4.

| Job | Needs | What it does | ~Time |
|---|---|---|---|
| `policy` | — | Blocks manual `pnpm-lock.yaml` edits; validates the Dockerfile `deps` stage; validates dependency resolution | ~15 s |
| `verify` | `policy` | `pnpm install --frozen-lockfile` → `pnpm -r typecheck` → `pnpm test:run` → `pnpm build` | 3–4 min |
| `e2e` | `policy` | Playwright (Chromium) against a `local_trusted` server, `FIDELIOS_E2E_SKIP_LLM=true` | ~2 min |

`docs-preview.yml` also runs when a PR touches `docs/**` (`mintlify validate`) —
**informational, not required.**

`main` branch protection: required checks `policy` + `verify` + `e2e`;
**0 required GitHub reviews**; `strict: false` (a PR need not be up to date with
`main` to merge); force-push and deletion blocked; `enforce_admins: false`.

## 3. Branch & merge workflow

Codified in the repo-root `AGENTS.md` §11 and the agent `HEARTBEAT.md`. One
issue → one branch → one PR → independent review → merge.

1. **Pick up the issue** — `POST /api/issues/{id}/checkout` (atomic; never retry
   a 409). An issue `blocked_by` an open dependency cannot be checked out.
2. **Branch** — `git checkout main && git pull && git checkout -b
   feature/{ISSUE-ID}`. **Never commit to `main`.**
3. **Work, then PR** — verify locally (`pnpm -r typecheck && pnpm test:run &&
   pnpm build`), then `gh pr create --base main`.
4. **Review gate** — open a FideliOS issue `Review PR #<n>: <title>`, assign it
   to the company's `code_reviewer` agent, @-mention it to wake it. The
   reviewer's `approve` is the gate — **green CI is necessary but not
   sufficient.** This gate is a workflow convention enforced through agent
   instructions, not by GitHub branch protection.
5. **Merge** — through the merge slot (§4): acquire → rebase onto `main` →
   confirm CI green → `gh pr merge --squash` → release the slot.

## 4. The merge slot

Parallel engineers in one company must not merge into the trunk simultaneously
— two PRs each CI-green against an *older* trunk can land together and break it.
FideliOS gives every company one **merge slot** (the `merge_locks` table; the
FideliOS-native equivalent of a GitHub merge queue, shipped in v0.0.52).

- `POST /api/companies/:companyId/merge-lock` — acquire, non-blocking: returns
  `{"acquired":true}` or `{"acquired":false,"heldBy":{...}}`. On `false`, wait
  ~20 s and retry.
- `DELETE /api/companies/:companyId/merge-lock` — release. Always release, even
  if the merge failed.
- `GET /api/companies/:companyId/merge-lock` — current holder.

The holder is an agent run; the slot auto-expires after 30 min, and a reaper on
the heartbeat scheduler frees a slot whose holder run is terminal. **The slot is
advisory** — agent-cooperative, not GitHub-enforced; a direct `gh pr merge` that
skips it is not blocked.

## 5. Release — `scripts/release.sh`

`scripts/release.sh --bump patch` publishes `fidelios` and every `@fideliosai/*`
package to npm. **Requires explicit human approval** — never run by an agent
unprompted.

Preconditions: clean worktree; npm auth; the next version's notes file
`releases/vX.Y.Z.md` must already exist; the tag and npm version must not exist
yet. The next version is the bump of `max(root package.json version, highest
v* git tag)` — **git tags are the source of truth for numbering.**

Steps: ① verification gate (`typecheck` → `test:run` → `build`; skippable with
`--skip-verify`) → ② build artifacts + bundle skills/plugins → ③ rewrite every
public `package.json` version + the CLI `.version()` → ④ esbuild the CLI bundle
→ ⑤ `pnpm publish --tag latest` each package → ⑥ poll `npm view` until npm
exposes each version (24 × 8 s) → ⑦ `git tag vX.Y.Z` on the source commit, push
the tag, `gh release create`. An `EXIT` trap restores the working tree.

`.github/workflows/release.yml` mirrors this as a `workflow_dispatch` job in CI
(OIDC trusted publishing).

## 6. Deploy to production

**Manual — no workflow connects a published release to the host.** On the
production host (see `OPERATIONS.md` for the exact runbook):

```
npm install -g fidelios@latest
fidelios-restart            # restart the launchd service nl.fidelios.server
```

Production runs under macOS `launchd` (`nl.fidelios.server`, port 3100, service
mode `release`, `KeepAlive`). On boot the server applies any pending
embedded-Postgres migrations automatically. Confirm the deploy with
`curl localhost:3100/api/health` and check `version`.

## 7. Other workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `docker.yml` | push to `main` + `v*` tags | Multi-arch image to `ghcr.io` — `nightly` (main tip), `latest` (released tag), version tags. Concurrency-cancels on rapid pushes. **Not a required check.** |
| `refresh-lockfile.yml` | push to `main` | Bot regenerates `pnpm-lock.yaml`, force-pushes `chore/refresh-lockfile`, opens an auto-merge PR |
| `publish-github-packages.yml` | `v*` tags | Publishes `@fideliosai/*` to GitHub Packages |
| `release.yml` | `workflow_dispatch` | CI-side mirror of `release.sh` |
| `release-smoke.yml`, `e2e.yml` | `workflow_dispatch` | On-demand release smoke / e2e |

## 8. Conventions & rules

- **Never commit to `main`.** Every change goes through a branch
  (`feature/{ISSUE-ID}`, `chore/…`, `fix/…`, `docs/…`) and a PR.
- **`pnpm-lock.yaml` is bot-owned.** The `policy` job rejects a PR that edits it
  by hand; the `refresh-lockfile` bot is the only writer.
- **Releases need explicit human approval.**
- **Squash merge** — every PR lands as one squash commit `… (#NN)`.
- npm publish is one-way — a bad release is fixed by publishing the next patch,
  never `npm unpublish`.

## 9. Known gaps & gotchas

- **Version-numbering trap** — the next version is derived from the last git
  *tag*. A `releases/vX.Y.Z.md` notes file that exists without a release behind
  it does not shift the number, but it misleads anyone who assumes the notes
  file defines the next version. (This caused an off-by-one once — merge-lock
  shipped as v0.0.52, not v0.0.53.)
- **The review gate and the merge slot are advisory** — both are agent-workflow
  conventions, not GitHub branch protection. With `strict: false` and 0 required
  reviews, a PR can merge on green CI alone, against a stale `main`, with no
  review. The conventions hold only as long as agents and operators follow them.
- **Docker is not a required check** — a broken image can land on `main`
  silently; rapid pushes concurrency-cancel in-flight `nightly` builds.
- **Deploy is fully manual** — nothing links a published npm release to the
  launchd host; a released-but-not-deployed state is invisible until someone
  compares `/api/health` `version` against `npm view fidelios version`.
- **The lockfile bot is the single writer** — if the `refresh-lockfile` PR
  creation or auto-merge fails, downstream PRs fail with
  `ERR_PNPM_OUTDATED_LOCKFILE` until someone manually pushes / PRs
  `chore/refresh-lockfile`.
