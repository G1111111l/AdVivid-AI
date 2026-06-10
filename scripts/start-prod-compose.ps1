param(
  [switch]$AllowDockerDefaultDataRoot
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $repoRoot ".env"
$composeFile = Join-Path $repoRoot "infra\docker\docker-compose.prod.yml"
$checkScript = Join-Path $PSScriptRoot "check-docker-env.ps1"

if (-not (Test-Path $envFile)) {
  throw "Missing .env. Copy .env.example to .env and fill private values before starting."
}

& $checkScript -Strict
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$defaultDockerDesktopVhd = Join-Path $env:LOCALAPPDATA "Docker\wsl\data\ext4.vhdx"
if ((Test-Path $defaultDockerDesktopVhd) -and -not $AllowDockerDefaultDataRoot) {
  throw "Docker Desktop may still store image layers on the default disk: $defaultDockerDesktopVhd. Move Docker Desktop's disk image location to E:\envment, or rerun with -AllowDockerDefaultDataRoot if you accept the current location."
}

Set-Location $repoRoot
docker compose --env-file $envFile -f $composeFile up --build -d

Write-Host ""
Write-Host "Production demo stack requested."
Write-Host "Web: http://localhost"
Write-Host "API: http://localhost/api/health"
