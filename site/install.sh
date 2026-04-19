#!/usr/bin/env bash
# FideliOS zero-knowledge macOS installer
# Usage: curl -fsSL https://fidelios.nl/install.sh | bash -s -- --yes
#        curl -fsSL https://fidelios.nl/install.sh | bash        (non-interactive: auto-proceeds)
# Note: deliberately NOT using `set -u` — nvm.sh and Homebrew's shellenv
#       rely on unset variables and would crash us mid-install.
set -eo pipefail

# ── Arg parsing ──────────────────────────────────────────────────────────────
YES=false
SERVICE_CHOICE=""   # "" = ask; "yes" = install service; "no" = skip service
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=true ;;
    --service) SERVICE_CHOICE=yes ;;
    --no-service) SERVICE_CHOICE=no ;;
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

# ── Step 1b: Shell check ─────────────────────────────────────────────────────
# Warn if the default shell is bash — zsh is recommended on macOS 10.15+
if [[ "$SHELL" == */bash ]]; then
  warn "Your default shell is bash."
  echo ""
  echo -e "  zsh is recommended on modern macOS (Apple set it as the default since 10.15)."
  echo -e "  FideliOS and Claude Code work best in zsh."
  echo ""
  echo -e "  To switch:  ${BOLD}chsh -s /bin/zsh${RESET}"
  echo -e "  Then open a new terminal window and re-run this installer."
  echo ""
fi

# ── Step 2: Homebrew ──────────────────────────────────────────────────────────
header "🍺 Checking Homebrew…"
if command -v brew &>/dev/null; then
  success "Homebrew already installed ($(brew --version | head -1))"
else
  warn "Homebrew is not installed."
  echo ""
  echo -e "  Homebrew is the macOS package manager used to install tools on macOS."
  echo -e "  ${DIM}See https://brew.sh for more info.${RESET}"
  echo ""
  if ask "Install Homebrew now?"; then
    info "Installing Homebrew…"
    # Redirect stdin from /dev/tty so Homebrew sees a real TTY and sudo can prompt
    # for a password even when this script is piped through curl.
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/tty || {
      warn "Homebrew installation failed — continuing without it."
      echo ""
      echo -e "  ${DIM}Common reasons: not enough disk space (Xcode CLT needs ~10 GB), sudo denied.${RESET}"
      echo -e "  ${DIM}Node.js will be installed via nvm instead (no sudo, no extra disk space).${RESET}"
      echo ""
    }
    # Add brew to PATH for this session if install succeeded
    if [[ -f /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
      success "Homebrew installed"
    elif [[ -f /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
      success "Homebrew installed"
    fi
  else
    warn "Skipping Homebrew."
    echo ""
  fi
fi

# ── Step 3: Node.js ───────────────────────────────────────────────────────────
header "📦 Checking Node.js…"

INSTALLED_NODE_VIA_NVM=false

# Helper: load nvm into the current shell session if available
_load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
}

# Write nvm-loader into the user's shell rc files so a fresh terminal session
# can reach node + globally-installed fidelios. nvm's own installer writes to
# ~/.bashrc only, which zsh (the default shell on modern macOS) doesn't read.
_persist_nvm_to_shell_rc() {
  local nvm_block
  nvm_block='
# Added by FideliOS installer — load nvm so node + fidelios are on PATH
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"'
  for profile in "$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    # Only touch zsh rc when user's shell is zsh (avoid polluting bash-only setups
    # with zsh-only files we just created — and vice versa).
    case "$profile" in
      *zshrc|*zprofile) [[ "$SHELL" == */zsh ]] || continue ;;
      *bashrc|*bash_profile) [[ "$SHELL" == */bash ]] || continue ;;
    esac
    [ -e "$profile" ] || touch "$profile"
    if ! grep -qF 'NVM_DIR=' "$profile" 2>/dev/null; then
      printf '%s\n' "$nvm_block" >> "$profile"
      info "Added nvm loader to $profile"
      PATH_UPDATED=true
    fi
  done
}

if command -v node &>/dev/null; then
  NODE_VERSION="$(node --version)"
  success "Node.js already installed ($NODE_VERSION)"
else
  warn "Node.js is not installed."
  echo ""
  echo -e "  Node.js is required to run the FideliOS CLI."
  echo -e "  FideliOS installs Node.js via ${BOLD}nvm${RESET}${DIM} (Node Version Manager), which keeps"
  echo -e "  global packages in your home directory — no sudo required.${RESET}"
  echo ""
  if ! ask "Install Node.js via nvm?"; then
    error "Node.js is required. Aborting."
    exit 1
  fi

  # Install nvm if not present
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    info "Installing nvm…"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  else
    info "nvm already present — skipping nvm install"
  fi

  _load_nvm

  if ! command -v nvm &>/dev/null; then
    error "nvm failed to load. Please open a new terminal and re-run the installer."
    exit 1
  fi

  info "Installing Node.js LTS…"
  nvm install --lts
  nvm use --lts
  success "Node.js installed ($(node --version))"
  INSTALLED_NODE_VIA_NVM=true
fi

# ── Step 4: FideliOS CLI ──────────────────────────────────────────────────────
header "🤖 Installing FideliOS CLI…"

# Ensure npm global prefix is user-writable (Homebrew Node sets it to a root-owned dir).
# If not writable, redirect npm globals to ~/.npm-global and persist the PATH update.
PATH_UPDATED=false
NPM_PREFIX="$(npm config get prefix 2>/dev/null || true)"
if [ -n "$NPM_PREFIX" ] && [ ! -w "$NPM_PREFIX" ]; then
  warn "npm global prefix '${NPM_PREFIX}' is not user-writable."
  info "Configuring user-local npm prefix at ~/.npm-global…"
  mkdir -p "$HOME/.npm-global"
  npm config set prefix "$HOME/.npm-global"
  export PATH="$HOME/.npm-global/bin:$PATH"

  # Persist to shell profile(s) so the PATH survives after this session
  NPM_PATH_LINE='export PATH="$HOME/.npm-global/bin:$PATH"'
  for profile in "$HOME/.zprofile" "$HOME/.bash_profile"; do
    if [ -f "$profile" ] || [[ "$profile" == *zprofile* && "$SHELL" == */zsh ]]; then
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

if command -v fidelios &>/dev/null; then
  CURRENT_VERSION="$(fidelios --version 2>/dev/null || echo 'unknown')"
  info "Updating FideliOS CLI (current: $CURRENT_VERSION)…"
else
  info "Installing FideliOS CLI…"
fi
npm install -g fidelios@latest
NEW_VERSION="$(fidelios --version 2>/dev/null || echo 'installed')"
success "FideliOS CLI ready ($NEW_VERSION)"

# If we installed Node via nvm, persist the nvm loader into the user's shell
# rc so `fidelios` resolves in fresh terminal sessions. (nvm's own installer
# writes to ~/.bashrc only; zsh — default shell on modern macOS — ignores
# that, so without this block users get `command not found: fidelios` after
# reopening Terminal.)
if $INSTALLED_NODE_VIA_NVM; then
  _persist_nvm_to_shell_rc
fi

# ── Step 5: Onboarding ────────────────────────────────────────────────────────
header "🚀 Starting FideliOS setup…"
echo ""
if $INTERACTIVE; then
  echo -e "  ${DIM}Running interactive setup wizard…${RESET}"
  echo ""
  fidelios onboard
else
  # Non-interactive (curl | bash): create a quickstart config so `fidelios run`
  # works out of the box. Users can re-run `fidelios onboard` later to customise.
  info "Non-interactive mode: running 'fidelios onboard --yes' with quickstart defaults."
  echo ""
  fidelios onboard --yes || warn "fidelios onboard --yes exited non-zero — re-run manually in an interactive shell."
fi

# ── Step 6: Keep running in the background? ──────────────────────────────────
header "🔁 Should FideliOS keep running on its own?"
echo ""
echo -e "  ${DIM}Without this, FideliOS stops the moment you:${RESET}"
echo -e "     • ${DIM}close this Terminal window${RESET}"
echo -e "     • ${DIM}restart or shut down your Mac${RESET}"
echo -e "     • ${DIM}close your laptop lid / let your Mac sleep${RESET}"
echo ""
echo -e "  ${DIM}If we set it up, your AI agents keep working 24/7 in the${RESET}"
echo -e "  ${DIM}background. You don't have to open Terminal again.${RESET}"
echo ""
echo -e "  ${DIM}(You can change this later — see the link at the end.)${RESET}"
echo ""

INSTALL_SERVICE=false
if [[ "$SERVICE_CHOICE" == "yes" ]]; then
  INSTALL_SERVICE=true
elif [[ "$SERVICE_CHOICE" == "no" ]]; then
  INSTALL_SERVICE=false
elif $YES; then
  INSTALL_SERVICE=true
  info "--yes → setting up auto-start"
elif $INTERACTIVE; then
  if ask "Keep FideliOS running automatically, even after you close Terminal or restart?"; then
    INSTALL_SERVICE=true
  fi
else
  # Non-interactive pipe install, no explicit flag → skip by default so we
  # don't auto-register launchd without clear consent.
  INSTALL_SERVICE=false
fi

if $INSTALL_SERVICE; then
  info "Setting up auto-start…"
  if fidelios service install; then
    success "Done — FideliOS will start on its own when you turn your Mac on."
    echo -e "  ${DIM}No need to keep Terminal open anymore.${RESET}"
  else
    warn "Auto-start setup failed. You can retry later with: fidelios service install"
  fi
else
  echo -e "  ${YELLOW}${BOLD}  ⚠${RESET} Skipped — FideliOS will stop when you close this Terminal."
  echo -e "  ${DIM}Every time you want to use it, you'll need to open Terminal and type:${RESET}"
  echo -e "     ${BOLD}fidelios run${RESET}"
  echo ""
  echo -e "  ${DIM}To make it run automatically later (recommended), open this page:${RESET}"
  echo -e "     ${BOLD}https://docs.fidelios.nl/start/keep-running${RESET}"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✔ FideliOS installation complete!${RESET}"
echo ""
if $PATH_UPDATED; then
  warn "PATH updated — reload your shell first, then complete setup:"
  echo ""
  echo -e "     ${BOLD}source ~/.zprofile${RESET}   ${DIM}# or open a new terminal window${RESET}"
  echo ""
  echo -e "  Then run:"
  echo -e "     ${BOLD}fidelios onboard${RESET}"
elif ! $INTERACTIVE; then
  echo -e "  ${DIM}Next steps:${RESET}"
  echo -e "     ${BOLD}fidelios onboard${RESET}   ${DIM}# complete setup in your terminal${RESET}"
else
  echo -e "  ${DIM}Run ${RESET}${BOLD}fidelios --help${RESET}${DIM} to get started.${RESET}"
fi
echo ""
