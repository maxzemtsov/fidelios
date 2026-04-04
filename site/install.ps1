#Requires -Version 5.1
# FideliOS Windows Docker installer
# Usage: iwr -useb https://fidelios.nl/install.ps1 | iex
$ErrorActionPreference = "Stop"

$IMAGE     = "ghcr.io/maxzemtsov/fidelios:latest"
$CONTAINER = "fidelios"
$PORT      = 3100
$DOCKER_WAIT_TIMEOUT = 120  # seconds

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Info    { param([string]$Msg) Write-Host "  -> $Msg" -ForegroundColor Cyan }
function Write-Success { param([string]$Msg) Write-Host "  OK $Msg" -ForegroundColor Green }
function Write-Warn    { param([string]$Msg) Write-Host "  !! $Msg" -ForegroundColor Yellow }
function Write-Err     { param([string]$Msg) Write-Host "  XX $Msg" -ForegroundColor Red }
function Write-Header  { param([string]$Msg) Write-Host "`n$Msg" -ForegroundColor White }

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +-------------------------------------+" -ForegroundColor Cyan
Write-Host "  |    FideliOS Windows Installer       |" -ForegroundColor Cyan
Write-Host "  +-------------------------------------+" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Check / install Docker Desktop ────────────────────────────────────
Write-Header "Checking Docker Desktop..."
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue

if ($dockerCmd) {
    Write-Success "Docker already installed ($((docker --version) -replace '\n',''))"
} else {
    Write-Warn "Docker Desktop not found."
    Write-Info "Downloading Docker Desktop installer..."

    $installerUrl  = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
    $installerPath = "$env:TEMP\DockerDesktopInstaller.exe"

    try {
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
    } catch {
        Write-Err "Failed to download Docker Desktop: $_"
        exit 1
    }

    Write-Info "Launching Docker Desktop installer — please follow the prompts..."
    Start-Process -FilePath $installerPath -ArgumentList "install", "--quiet" -Wait

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        # Reload PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("Path", "User")
    }

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Err "Docker was installed but 'docker' is not on PATH yet. Please restart your terminal and re-run this script."
        exit 1
    }

    Write-Success "Docker Desktop installed"
}

# ── Step 2: Wait for Docker daemon ────────────────────────────────────────────
Write-Header "Waiting for Docker daemon..."
$elapsed = 0
while ($true) {
    $result = docker info 2>&1
    if ($LASTEXITCODE -eq 0) { break }

    if ($elapsed -ge $DOCKER_WAIT_TIMEOUT) {
        Write-Err "Docker daemon did not start within ${DOCKER_WAIT_TIMEOUT}s."
        Write-Err "Please start Docker Desktop manually and re-run this script."
        exit 1
    }

    Write-Info "Waiting... (${elapsed}s elapsed)"
    Start-Sleep -Seconds 5
    $elapsed += 5
}
Write-Success "Docker daemon is ready"

# ── Step 3: Remove existing container (idempotent) ────────────────────────────
Write-Header "Preparing container..."
$existing = docker ps -a --filter "name=^${CONTAINER}$" --format "{{.Names}}" 2>&1
if ($existing -match "^${CONTAINER}$") {
    Write-Warn "Existing '$CONTAINER' container found — removing..."
    docker stop $CONTAINER 2>&1 | Out-Null
    docker rm   $CONTAINER 2>&1 | Out-Null
    Write-Success "Removed existing container"
}

# ── Step 4: Pull image ────────────────────────────────────────────────────────
Write-Header "Pulling FideliOS image..."
docker pull $IMAGE
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to pull image '$IMAGE'"
    exit 1
}
Write-Success "Image ready"

# ── Step 5: Run container ─────────────────────────────────────────────────────
Write-Header "Starting FideliOS..."
docker run -d `
    -p "${PORT}:${PORT}" `
    --name $CONTAINER `
    --restart unless-stopped `
    $IMAGE

if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to start container"
    exit 1
}
Write-Success "Container '$CONTAINER' started"

# ── Step 6: Open browser ──────────────────────────────────────────────────────
$URL = "http://localhost:$PORT"
Write-Info "Opening browser at $URL..."
Start-Process $URL

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  FideliOS is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  Open $URL in your browser to get started." -ForegroundColor DarkGray
Write-Host "  Stop:  docker stop $CONTAINER" -ForegroundColor DarkGray
Write-Host "  Logs:  docker logs -f $CONTAINER" -ForegroundColor DarkGray
Write-Host ""
