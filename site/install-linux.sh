#!/usr/bin/env bash
# FideliOS Linux Docker installer
# Usage: curl -fsSL https://fidelios.nl/install-linux.sh | bash
set -euo pipefail

IMAGE="ghcr.io/fideliosai/fidelios:latest"
CONTAINER="fidelios"
PORT=3100
DOCKER_WAIT_TIMEOUT=120

# ── Colors ───────────────────────────────────────────────────────────────────
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

info()    { echo -e "${CYAN}${BOLD}  →${RESET} $*"; }
success() { echo -e "${GREEN}${BOLD}  ✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}${BOLD}  ⚠${RESET} $*"; }
error()   { echo -e "${RED}${BOLD}  ✖${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

trap 'echo -e "\n${RED}${BOLD}Installation cancelled.${RESET}"; exit 130' INT

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}  ┌─────────────────────────────────────┐${RESET}"
echo -e "${BOLD}${CYAN}  │     FideliOS Linux Installer        │${RESET}"
echo -e "${BOLD}${CYAN}  └─────────────────────────────────────┘${RESET}"
echo ""

# ── Step 1: Platform check ───────────────────────────────────────────────────
header "🔍 Checking platform…"
if [[ "$(uname)" != "Linux" ]]; then
  error "This installer only supports Linux."
  echo ""
  echo -e "  For macOS, use: ${DIM}curl -fsSL https://raw.githubusercontent.com/fideliosai/fidelios/main/site/install.sh | bash${RESET}"
  echo -e "  For Windows, use: ${DIM}iwr -useb https://raw.githubusercontent.com/fideliosai/fidelios/main/site/install.ps1 | iex${RESET}"
  echo ""
  exit 1
fi
success "Linux detected"

# ── Step 2: Docker install ───────────────────────────────────────────────────
header "🐳 Checking Docker Engine…"
if command -v docker &>/dev/null && docker --version &>/dev/null; then
  success "Docker already installed ($(docker --version))"
else
  warn "Docker Engine not found — installing…"

  if command -v apt-get &>/dev/null; then
    info "Detected apt-based distro (Debian/Ubuntu)"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg lsb-release

    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  elif command -v dnf &>/dev/null; then
    info "Detected dnf-based distro (Fedora/RHEL/CentOS)"
    dnf -y install dnf-plugins-core
    dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
    dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  elif command -v yum &>/dev/null; then
    info "Detected yum-based distro (CentOS/RHEL)"
    yum install -y yum-utils
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  else
    error "Unsupported package manager. Please install Docker manually: https://docs.docker.com/engine/install/"
    exit 1
  fi

  success "Docker Engine installed ($(docker --version))"
fi

# ── Step 3: Start Docker service ─────────────────────────────────────────────
header "⚙️  Starting Docker service…"
if command -v systemctl &>/dev/null; then
  systemctl enable docker --quiet 2>/dev/null || true
  systemctl start docker 2>/dev/null || true
  success "Docker service enabled and started"
else
  warn "systemctl not available — attempting to start dockerd directly"
  if ! pgrep -x dockerd &>/dev/null; then
    dockerd &>/dev/null &
    disown
  fi
fi

# ── Step 4: Wait for Docker ──────────────────────────────────────────────────
header "⏳ Waiting for Docker daemon…"
elapsed=0
until docker info &>/dev/null 2>&1; do
  if [ "$elapsed" -ge "$DOCKER_WAIT_TIMEOUT" ]; then
    error "Docker daemon did not start within ${DOCKER_WAIT_TIMEOUT}s. Please check your Docker installation."
    exit 1
  fi
  info "Waiting… (${elapsed}s elapsed)"
  sleep 5
  elapsed=$((elapsed + 5))
done
success "Docker daemon is ready"

# ── Step 5: Remove existing container (idempotent) ───────────────────────────
header "🧹 Preparing container…"
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  warn "Existing '${CONTAINER}' container found — removing…"
  docker stop "${CONTAINER}" &>/dev/null || true
  docker rm "${CONTAINER}" &>/dev/null || true
  success "Removed existing container"
fi

# ── Step 6: Pull and run ─────────────────────────────────────────────────────
header "📦 Pulling FideliOS image…"
docker pull "${IMAGE}"
success "Image ready"

header "🚀 Starting FideliOS…"
docker run -d \
  -p "${PORT}:${PORT}" \
  --name "${CONTAINER}" \
  --restart unless-stopped \
  "${IMAGE}"
success "Container '${CONTAINER}' started"

# ── Step 7: Open browser ─────────────────────────────────────────────────────
URL="http://localhost:${PORT}"
if command -v xdg-open &>/dev/null; then
  info "Opening browser at ${URL}…"
  xdg-open "${URL}" &>/dev/null & disown
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✔ FideliOS is running!${RESET}"
echo ""
echo -e "  ${DIM}Open ${RESET}${BOLD}${URL}${RESET}${DIM} in your browser to get started.${RESET}"
echo -e "  ${DIM}Stop:   ${RESET}docker stop ${CONTAINER}"
echo -e "  ${DIM}Logs:   ${RESET}docker logs -f ${CONTAINER}"
echo ""
