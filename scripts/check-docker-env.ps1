param(
  [string]$EnvmentDir = $(if ($env:ENVMENT_DIR) { $env:ENVMENT_DIR } else { "E:\envment" }),
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$composeFile = Join-Path $repoRoot "infra\docker\docker-compose.prod.yml"
$envExampleFile = Join-Path $repoRoot ".env.example"
$envFile = Join-Path $repoRoot ".env"
$hardErrors = 0
$warnings = 0

function Step($message) {
  Write-Host "[check] $message"
}

function Ok($message) {
  Write-Host "[ok] $message"
}

function Warn($message) {
  $script:warnings += 1
  Write-Warning $message
}

function FailCheck($message) {
  $script:hardErrors += 1
  Write-Host "[error] $message"
}

Step "Repository: $repoRoot"
Step "ENVMENT_DIR: $EnvmentDir"

if (-not (Test-Path $EnvmentDir)) {
  New-Item -ItemType Directory -Force -Path $EnvmentDir | Out-Null
  Ok "Created ENVMENT_DIR"
} else {
  Ok "ENVMENT_DIR exists"
}

$requiredDirs = @(
  "npm-cache",
  "pip-cache",
  "prisma-engines",
  "postgres-data",
  "redis-data",
  "advivid-data",
  "advivid-uploads",
  "advivid-rendered"
)

foreach ($dir in $requiredDirs) {
  $path = Join-Path $EnvmentDir $dir
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}
Ok "Required ENVMENT_DIR subdirectories are ready"

if (-not (Test-Path $envFile)) {
  Warn ".env is missing. Copy .env.example to .env before starting the production stack."
} else {
  Ok ".env exists"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  FailCheck "Docker CLI is not installed or not available in PATH."
} else {
  Ok "Docker CLI is available"

  $dockerRoot = ""
  try {
    $dockerRoot = docker info --format '{{.DockerRootDir}}' 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($dockerRoot)) {
      FailCheck "Docker Engine is not running. Start Docker Desktop before launching the production stack."
    } else {
      Ok "Docker Engine is running. DockerRootDir=$dockerRoot"
    }
  } catch {
    FailCheck "Docker Engine check failed: $($_.Exception.Message)"
  }

  try {
    docker compose --env-file $envExampleFile -f $composeFile config --quiet
    if ($LASTEXITCODE -ne 0) {
      FailCheck "Production Compose file did not validate."
    } else {
      Ok "Production Compose file validates"
    }
  } catch {
    FailCheck "Compose validation failed: $($_.Exception.Message)"
  }
}

$defaultDockerDesktopVhd = Join-Path $env:LOCALAPPDATA "Docker\wsl\data\ext4.vhdx"
if (Test-Path $defaultDockerDesktopVhd) {
  Warn "Docker Desktop default WSL disk exists at $defaultDockerDesktopVhd. If Docker image/data downloads must stay on E:, move Docker Desktop's disk image location before pulling images."
}

if ($hardErrors -gt 0) {
  Write-Host "[summary] hardErrors=$hardErrors warnings=$warnings"
  if ($Strict) {
    exit 1
  }
} else {
  Write-Host "[summary] hardErrors=0 warnings=$warnings"
}
