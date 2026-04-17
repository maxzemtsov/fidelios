#!/usr/bin/env bash
# FideliOS zero-knowledge Linux installer
# Usage: curl -fsSL https://fidelios.nl/install-linux.sh | bash
#        curl -fsSL https://fidelios.nl/install-linux.sh | bash -s -- --yes
set -euo pipefail

# ── Arg parsing ──────────────────────────────────────────────────────────────
YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=true ;;
  esac
done

# ── Interactive detection ────────────────────────────────────────────────────
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
  if $YES || ! $INTERACTIVE; then
    echo -e "${CYAN}${BOLD}  ?${RESET} ${prompt} ${DIM}[y/N] auto-yes${RESET}"
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
echo -e "${BOLD}${CYAN}  │      FideliOS Linux Installer       │${RESET}"
echo -e "${BOLD}${CYAN}  └─────────────────────────────────────┘${RESET}"
echo ""

# ── Step 1: Platform check ───────────────────────────────────────────────────
header "🔍 Checking platform…"
if [[ "$(uname)" != "Linux" ]]; then
  error "This installer only supports Linux."
  echo ""
  echo -e "  For macOS:  ${DIM}curl -fsSL https://fidelios.nl/install.sh | bash${RESET}"
  echo -e "  For Windows:${DIM} iwr -useb https://fidelios.nl/install.ps1 | iex${RESET}"
  echo ""
  exit 1
fi
DISTRO_NAME="$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-Linux}")"
success "$DISTRO_NAME detected"

# ── Step 2: Node.js ──────────────────────────────────────────────────────────
header "📦 Checking Node.js…"

_load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
}

check_node_major() {
  command -v node >/dev/null 2>&1 || return 1
  local ver
  ver="$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)"
  [[ -n "$ver" && "$ver" -ge 20 ]]
}

if check_node_major; then
  success "Node.js $(node --version) already installed"
else
  warn "Node.js 20+ not found."
  echo ""
  echo -e "  FideliOS installs Node.js via ${BOLD}nvm${RESET}${DIM} (Node Version Manager) into your"
  echo -e "  home directory — no sudo required, no system-wide changes.${RESET}"
  echo ""
  if ! ask "Install Node.js via nvm?"; then
    error "Node.js is required. Aborting."
    exit 1
  fi

  # curl is required for the nvm installer; many server images have it missing
  if ! command -v curl >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      info "Installing curl via apt-get…"
      sudo apt-get update -qq
      sudo apt-get install -y -qq curl ca-certificates
    elif command -v dnf >/dev/null 2>&1; then
      info "Installing curl via dnf…"
      sudo dnf install -y -q curl ca-certificates
    elif command -v yum >/dev/null 2>&1; then
      info "Installing curl via yum…"
      sudo yum install -y -q curl ca-certificates
    else
      error "curl is required. Install it with your package manager and re-run."
      exit 1
    fi
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    info "Installing nvm…"
    curl -fsSL -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  else
    info "nvm already present — skipping nvm install"
  fi

  _load_nvm

  if ! command -v nvm >/dev/null 2>&1; then
    error "nvm failed to load. Open a new terminal and re-run the installer."
    exit 1
  fi

  info "Installing Node.js LTS…"
  nvm install --lts
  nvm use --lts
  success "Node.js installed ($(node --version))"
fi

# ── Step 3: FideliOS CLI ─────────────────────────────────────────────────────
header "🤖 Installing FideliOS CLI…"

# Ensure npm global prefix is user-writable (distro-packaged Node sets it to /usr).
PATH_UPDATED=false
NPM_PREFIX="$(npm config get prefix 2>/dev/null || true)"
if [ -n "$NPM_PREFIX" ] && [ ! -w "$NPM_PREFIX" ]; then
  warn "npm global prefix '${NPM_PREFIX}' is not user-writable."
  info "Configuring user-local npm prefix at ~/.npm-global…"
  mkdir -p "$HOME/.npm-global"
  npm config set prefix "$HOME/.npm-global"
  export PATH="$HOME/.npm-global/bin:$PATH"

  NPM_PATH_LINE='export PATH="$HOME/.npm-global/bin:$PATH"'
  for profile in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$profile" ]; then
      if ! grep -qF '.npm-global/bin' "$profile" 2>/dev/null; then
        echo "" >> "$profile"
        echo "# Added by FideliOS installer" >> "$profile"
        echo "$NPM_PATH_LINE" >> "$profile"
        info "Added npm-global PATH to $profile"
        PATH_UPDATED=true
      fi
    fi
  done
  success "npm prefix updated — global packages will install to ~/.npm-global"
fi

if command -v fidelios >/dev/null 2>&1; then
  info "Updating FideliOS CLI (current: $(fidelios --version 2>/dev/null || echo 'unknown'))…"
else
  info "Installing FideliOS CLI…"
fi
npm install -g fidelios@latest
success "FideliOS CLI ready ($(fidelios --version 2>/dev/null || echo 'installed'))"

# ── Step 4: Onboarding ───────────────────────────────────────────────────────
header "🚀 Starting FideliOS setup…"
echo ""
if $INTERACTIVE; then
  echo -e "  ${DIM}Running interactive setup wizard…${RESET}"
  echo ""
  fidelios onboard
else
  info "Non-interactive mode: running 'fidelios onboard --yes' with quickstart defaults."
  echo ""
  fidelios onboard --yes || warn "fidelios onboard --yes exited non-zero — re-run manually in an interactive shell."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✔ FideliOS installation complete!${RESET}"
echo ""
if $PATH_UPDATED; then
  warn "PATH updated — reload your shell first:"
  echo ""
  echo -e "     ${BOLD}source ~/.profile${RESET}   ${DIM}# or open a new terminal${RESET}"
  echo ""
  echo -e "  Then start FideliOS:"
  echo -e "     ${BOLD}fidelios run${RESET}"
else
  echo -e "  Start FideliOS with: ${BOLD}fidelios run${RESET}"
  echo -e "  Then open:           ${BOLD}http://127.0.0.1:3100${RESET}"
fi
echo ""
echo -e "  To keep it running after you close the terminal:"
echo -e "     ${BOLD}fidelios service install${RESET}   ${DIM}# systemd user unit${RESET}"
echo ""
