#!/usr/bin/env bash
# FideliOS zero-knowledge macOS installer
# Usage: curl -fsSL https://fidelios.nl/install.sh | bash -s -- --yes
#        curl -fsSL https://fidelios.nl/install.sh | bash        (non-interactive: auto-proceeds)
set -euo pipefail

# ── Arg parsing ──────────────────────────────────────────────────────────────
YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=true ;;
  esac
done

# ── Interactive detection ────────────────────────────────────────────────────
# When piped through curl, stdin is the script itself — not a TTY.
# We detect this and auto-proceed (or skip prompts with --yes).
if [ -t 0 ]; then
  INTERACTIVE=true
else
  INTERACTIVE=false
fi

# ── Colors ──────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  RESET='\033[0m'
else
  BOLD='' DIM='' RED='' GREEN='' YELLOW='' CYAN='' RESET=''
fi

# ── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}${BOLD}  →${RESET} $*"; }
success() { echo -e "${GREEN}${BOLD}  ✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}${BOLD}  ⚠${RESET} $*"; }
error()   { echo -e "${RED}${BOLD}  ✖${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }
ask()     {
  local prompt="$1"
  local answer
  if $YES; then
    echo -e "${CYAN}${BOLD}  ?${RESET} ${prompt} ${DIM}[y/N]${RESET} ${DIM}--yes${RESET} y"
    return 0
  fi
  if ! $INTERACTIVE; then
    echo -e "${CYAN}${BOLD}  ?${RESET} ${prompt} ${DIM}[y/N]${RESET} ${DIM}(non-interactive, auto-proceeding)${RESET} y"
    return 0
  fi
  echo -en "${CYAN}${BOLD}  ?${RESET} ${prompt} ${DIM}[y/N]${RESET} "
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

# ── Trap ─────────────────────────────────────────────────────────────────────
trap 'echo -e "\n${RED}${BOLD}Installation cancelled.${RESET}"; exit 130' INT

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}  ┌─────────────────────────────────────┐${RESET}"
echo -e "${BOLD}${CYAN}  │        FideliOS Installer           │${RESET}"
echo -e "${BOLD}${CYAN}  └─────────────────────────────────────┘${RESET}"
echo ""

# ── Step 1: macOS check ───────────────────────────────────────────────────────
header "🔍 Checking platform…"
if [[ "$(uname)" != "Darwin" ]]; then
  error "FideliOS installer only supports macOS."
  echo ""
  echo -e "  For Linux, use Docker:"
  echo -e "  ${DIM}curl -fsSL https://raw.githubusercontent.com/fideliosai/fidelios/main/site/install-linux.sh | bash${RESET}"
  echo ""
  exit 1
fi
success "macOS detected ($(sw_vers -productVersion))"

# ── Step 2: Homebrew ──────────────────────────────────────────────────────────
header "🍺 Checking Homebrew…"
if command -v brew &>/dev/null; then
  success "Homebrew already installed ($(brew --version | head -1))"
else
  warn "Homebrew is not installed."
  echo ""
  echo -e "  Homebrew is the macOS package manager used to install Node.js."
  echo -e "  ${DIM}See https://brew.sh for more info.${RESET}"
  echo ""
  if ! ask "Install Homebrew now?"; then
    error "Homebrew is required. Aborting."
    exit 1
  fi
  info "Installing Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for Apple Silicon
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  success "Homebrew installed"
fi

# ── Step 3: Node.js ───────────────────────────────────────────────────────────
header "📦 Checking Node.js…"
if command -v node &>/dev/null; then
  NODE_VERSION="$(node --version)"
  success "Node.js already installed ($NODE_VERSION)"
else
  warn "Node.js is not installed."
  echo ""
  echo -e "  Node.js is required to run the FideliOS CLI."
  echo ""
  if ! ask "Install Node.js via Homebrew?"; then
    error "Node.js is required. Aborting."
    exit 1
  fi
  info "Installing Node.js…"
  brew install node
  success "Node.js installed ($(node --version))"
fi

# ── Step 4: FideliOS CLI ──────────────────────────────────────────────────────
header "🤖 Installing FideliOS CLI…"
if command -v fidelios &>/dev/null; then
  CURRENT_VERSION="$(fidelios --version 2>/dev/null || echo 'unknown')"
  info "Updating FideliOS CLI (current: $CURRENT_VERSION)…"
else
  info "Installing FideliOS CLI…"
fi
npm install -g fidelios@latest
NEW_VERSION="$(fidelios --version 2>/dev/null || echo 'installed')"
success "FideliOS CLI ready ($NEW_VERSION)"

# ── Step 5: Onboarding ────────────────────────────────────────────────────────
header "🚀 Starting FideliOS setup…"
echo ""
if $INTERACTIVE; then
  echo -e "  ${DIM}Running interactive setup wizard…${RESET}"
  echo ""
  fidelios onboard
else
  warn "Non-interactive mode: skipping setup wizard."
  echo ""
  echo -e "  Run ${BOLD}fidelios onboard${RESET} in your terminal to complete setup."
  echo ""
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✔ FideliOS installation complete!${RESET}"
echo ""
echo -e "  ${DIM}Run ${RESET}${BOLD}fidelios --help${RESET}${DIM} to get started.${RESET}"
echo ""
