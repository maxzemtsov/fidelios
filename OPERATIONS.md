# FideliOS Operations Guide

## Quick Reference

| Action | Command |
|--------|---------|
| Start production server | `fidelios-start` |
| Stop production server | `fidelios-stop` |
| Restart production server | `fidelios-restart` |
| Check if running | `fidelios-status` |
| Start dev server (one-time) | `cd ~/fidelios && pnpm dev:once` |
| Start dev server (watch) | `cd ~/fidelios && pnpm dev` |
| Kill ALL FideliOS processes | `fidelios-killall` |
| Release new version | `cd ~/fidelios && bash scripts/release.sh` |
| View logs | `tail -f ~/.fidelios/instances/default/fidelios.log` |

All commands above are shell aliases defined in `~/.zshrc` (see Setup section).

---

## 1. Two Modes: Production vs Development

### Production Mode (`fidelios run`)

- Runs the **published npm package** (currently v0.0.19)
- Stable, no file-watching, no hot-reload
- Uses pre-built UI assets
- Survives terminal close (via launchd)
- **Use this for daily work with agents**

### Development Mode (`pnpm dev` / `pnpm dev:once`)

- Runs from **source code** in `~/fidelios`
- Hot-reload: UI changes appear instantly, server restarts on code changes
- `pnpm dev` = watch mode (auto-restart on file changes)
- `pnpm dev:once` = single run (no watch, manual restart)
- **Use this when editing FideliOS source code**

### Rule: Only ONE mode at a time on port 3100

Before switching modes, always kill the other one first:

```bash
# Switching from production to dev:
fidelios-stop
cd ~/fidelios && pnpm dev:once

# Switching from dev to production:
# Press Ctrl+C in dev terminal, then:
fidelios-start
```

---

## 2. Production Server Management

### Start / Stop / Restart

```bash
fidelios-start      # Start production server (background, survives terminal close)
fidelios-stop       # Stop production server
fidelios-restart    # Stop + Start (graceful restart)
fidelios-status     # Check if running, show PID and uptime
```

### View Logs

```bash
# Live log stream
tail -f ~/.fidelios/instances/default/fidelios.log

# Last 100 lines
tail -100 ~/.fidelios/instances/default/fidelios.log

# Search for errors
grep -i error ~/.fidelios/instances/default/fidelios.log | tail -20
```

### How It Works

Production uses macOS `launchd` (like a system service). The config lives at:
`~/Library/LaunchAgents/nl.fidelios.server.plist`

launchd ensures:
- Server starts on port 3100
- Restarts automatically if it crashes
- Survives terminal close and logout
- Logs go to `~/.fidelios/instances/default/fidelios.log`

---

## 3. Development Mode

### Quick Dev Session

```bash
cd ~/fidelios
pnpm dev:once          # Start once, no file watching
# Open http://localhost:3100
# Press Ctrl+C to stop
```

### Full Dev Session (with hot-reload)

```bash
cd ~/fidelios
pnpm dev               # Watches files, auto-restarts on changes
# Open http://localhost:3100
# Edit code → server/UI auto-reloads
# Press Ctrl+C to stop
```

### Dev Troubleshooting

**Port busy?**
```bash
fidelios-killall       # Nuclear option: kills ALL FideliOS processes
pnpm dev:once          # Then start fresh
```

**Zombie processes after closing terminal?**
```bash
fidelios-killall       # Same fix
```

**Database migration needed?**
```bash
cd ~/fidelios
pnpm db:migrate        # Apply pending migrations
```

---

## 4. Git Workflow

### Daily Development Cycle

```bash
cd ~/fidelios

# 1. Check current state
git status
git log --oneline -5

# 2. Make changes to code...

# 3. Stage and commit
git add <files>
git commit -m "feat: description of change"

# 4. Push to GitHub
git push origin main
```

### Branching (for agent work)

Agents use feature branches per root issue:

```bash
# Create branch for a new feature
git checkout -b feature/IRO-XXX

# Work on it, commit...
git add . && git commit -m "feat: ..."

# Push branch
git push origin feature/IRO-XXX

# Create PR
gh pr create --base main --title "Feature: ..."

# After review, merge via GitHub UI or:
gh pr merge <number> --squash
```

### Merging a Branch to Main

```bash
# Option 1: Via GitHub (recommended)
gh pr create --base main
# Then merge in GitHub UI

# Option 2: Local merge
git checkout main
git pull origin main
git merge feature/IRO-XXX
git push origin main
git branch -d feature/IRO-XXX
```

---

## 5. Releasing a New Version

### Pre-release Checklist

1. All changes committed and pushed to `main`
2. Release notes file created

### Steps

```bash
cd ~/fidelios

# 1. Make sure everything is committed
git status  # Should be clean

# 2. Create release notes
# File: releases/v0.0.XX.md (see existing files for format)

# 3. Commit release notes
git add releases/v0.0.XX.md
git commit -m "docs: add v0.0.XX release notes"
git push origin main

# 4. Run release (default: patch bump)
bash scripts/release.sh

# This automatically:
# - Runs typecheck + tests + build
# - Bumps version in all packages
# - Publishes to npm
# - Creates git tag
# - Creates GitHub Release

# 5. Update local production install
npm install -g fidelios@latest

# 6. Restart production server with new version
fidelios-restart
```

### Release Options

```bash
bash scripts/release.sh                  # Patch: 0.0.19 -> 0.0.20
bash scripts/release.sh --bump minor     # Minor: 0.0.19 -> 0.1.0
bash scripts/release.sh --bump major     # Major: 0.0.19 -> 1.0.0
bash scripts/release.sh --dry-run        # Preview without publishing
bash scripts/release.sh --print-version  # Just print next version number
```

---

## 6. Emergency Procedures

### Everything is Broken, Start Fresh

```bash
# 1. Kill everything
fidelios-killall

# 2. Wait 3 seconds
sleep 3

# 3. Start production
fidelios-start

# 4. Verify
fidelios-status
curl -s http://localhost:3100/api/health | python3 -m json.tool
```

### Port 3100 Occupied by Unknown Process

```bash
# Find what's using it
lsof -i:3100

# Kill it
lsof -ti:3100 | xargs kill -9

# Then start what you need
fidelios-start   # or pnpm dev:once
```

### Database Backup / Restore

```bash
# Manual backup
cd ~/fidelios && pnpm db:backup

# Backups are at:
ls -la ~/.fidelios/instances/default/data/backups/
```

---

## 7. Architecture Quick Reference

```
~/fidelios/                    # Source code (git repo)
~/.fidelios/                   # Runtime data (NOT in git)
  instances/default/
    config.json                # Server configuration
    db/                        # Embedded PostgreSQL data
    data/backups/              # Database backups
    fidelios.log               # Production server log
    workspaces/*/HEARTBEAT.md  # Agent instructions
```

**Port map:**
- `3100` — FideliOS server (API + UI)
- `54329` — Embedded PostgreSQL (internal, auto-managed)

**Key URLs:**
- `http://localhost:3100` — FideliOS UI
- `http://localhost:3100/api/health` — Health check endpoint
