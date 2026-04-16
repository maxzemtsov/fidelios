#Requires -Version 5.1
# FideliOS zero-knowledge Windows installer
# Usage: iwr -useb https://fidelios.nl/install.ps1 | iex
#        iwr -useb https://fidelios.nl/install.ps1 | iex; fidelios onboard
$ErrorActionPreference = "Stop"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Info    { param([string]$Msg) Write-Host "  -> $Msg" -ForegroundColor Cyan }
function Write-Success { param([string]$Msg) Write-Host "  OK $Msg" -ForegroundColor Green }
function Write-Warn    { param([string]$Msg) Write-Host "  !! $Msg" -ForegroundColor Yellow }
function Write-Err     { param([string]$Msg) Write-Host "  XX $Msg" -ForegroundColor Red }
function Write-Header  { param([string]$Msg) Write-Host "`n$Msg" -ForegroundColor White }

function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($machinePath -and $userPath) {
        $env:Path = "$machinePath;$userPath"
    } elseif ($machinePath) {
        $env:Path = $machinePath
    } elseif ($userPath) {
        $env:Path = $userPath
    }
}

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +-------------------------------------+" -ForegroundColor Cyan
Write-Host "  |    FideliOS Windows Installer       |" -ForegroundColor Cyan
Write-Host "  +-------------------------------------+" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Check / install Node.js ───────────────────────────────────────────
Write-Header "Checking Node.js..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue

if ($nodeCmd) {
    $nodeVersion = & node --version 2>$null
    Write-Success "Node.js already installed ($nodeVersion)"
} else {
    Write-Warn "Node.js not found. Installing..."

    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        Write-Info "Installing Node.js LTS via winget..."
        try {
            & winget install --id OpenJS.NodeJS.LTS --silent `
                --accept-package-agreements --accept-source-agreements | Out-Null
        } catch {
            Write-Warn "winget install returned an error: $_"
        }
        Refresh-Path
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Info "winget unavailable or failed — falling back to nvm-windows."
        $nvmInstallerUrl  = "https://github.com/coreybutler/nvm-windows/releases/latest/download/nvm-setup.exe"
        $nvmInstallerPath = Join-Path $env:TEMP "nvm-setup.exe"
        Invoke-WebRequest -Uri $nvmInstallerUrl -OutFile $nvmInstallerPath -UseBasicParsing
        Write-Info "Running nvm-windows installer (follow the prompts)..."
        Start-Process -FilePath $nvmInstallerPath -ArgumentList "/SILENT" -Wait
        Refresh-Path
        if (Get-Command nvm -ErrorAction SilentlyContinue) {
            & nvm install lts
            & nvm use lts
        }
    }

    Refresh-Path
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Err "Node.js is still not on PATH after installation. Open a new PowerShell window and re-run this script."
        Write-Err "Manual install: https://nodejs.org/en/download"
        exit 1
    }
    Write-Success "Node.js installed ($((& node --version).Trim()))"
}

# ── Step 2: Install the FideliOS CLI globally ─────────────────────────────────
Write-Header "Installing FideliOS CLI..."
$existing = Get-Command fidelios -ErrorAction SilentlyContinue
if ($existing) {
    $currentVersion = & fidelios --version 2>$null
    Write-Info "Updating FideliOS CLI (current: $currentVersion)..."
} else {
    Write-Info "Installing FideliOS CLI..."
}

& npm install -g fidelios@latest
if ($LASTEXITCODE -ne 0) {
    Write-Err "npm install -g fidelios@latest failed. If you see EACCES/permission errors, run 'npm config set prefix %USERPROFILE%\.npm-global' and re-run this script."
    exit 1
}
Refresh-Path

$newVersion = & fidelios --version 2>$null
if (-not $newVersion) {
    Write-Err "fidelios command not on PATH after install. Open a new PowerShell window and run 'fidelios --version'."
    exit 1
}
Write-Success "FideliOS CLI ready ($newVersion)"

# ── Step 3: Setup wizard (interactive only) ───────────────────────────────────
$INTERACTIVE = [Environment]::UserInteractive -and $Host.UI.RawUI -ne $null -and -not $env:NONINTERACTIVE
Write-Header "Starting FideliOS setup..."
if ($INTERACTIVE) {
    Write-Info "Running interactive setup wizard..."
    Write-Host ""
    & fidelios onboard
} else {
    Write-Warn "Non-interactive shell detected — skipping the setup wizard."
    Write-Host ""
    Write-Host "  Next step (run in a real PowerShell window):" -ForegroundColor DarkGray
    Write-Host "     fidelios onboard" -ForegroundColor White
    Write-Host ""
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  OK FideliOS installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Start FideliOS with: " -NoNewline -ForegroundColor DarkGray
Write-Host "fidelios run" -ForegroundColor White
Write-Host "  Then open:            " -NoNewline -ForegroundColor DarkGray
Write-Host "http://127.0.0.1:3100" -ForegroundColor White
Write-Host ""
Write-Host "  To run in the background at login, use Task Scheduler or nssm." -ForegroundColor DarkGray
Write-Host "  Native 'fidelios service install' on Windows is coming soon." -ForegroundColor DarkGray
Write-Host ""
