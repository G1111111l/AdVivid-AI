param(
  [switch]$SkipText,
  [switch]$ShowTextResponse
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $repoRoot ".env"

function Read-DotEnv($path) {
  $values = @{}
  if (-not (Test-Path $path)) {
    throw "Missing .env file: $path"
  }

  foreach ($line in Get-Content $path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
      continue
    }

    $index = $trimmed.IndexOf("=")
    $name = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim()
    $values[$name] = $value
  }

  return $values
}

function Require-Env($values, $name) {
  $value = $values[$name]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required env value: $name"
  }
  return $value
}

function Mask-Len($value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    return "set=false len=0"
  }
  return "set=true len=$($value.Length)"
}

$envValues = Read-DotEnv $envFile
$baseUrl = $envValues["ARK_BASE_URL"]
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
  $baseUrl = "https://ark.cn-beijing.volces.com/api/v3"
}
$baseUrl = $baseUrl.TrimEnd("/")

$apiKey = Require-Env $envValues "ARK_API_KEY"
$textEndpoint = Require-Env $envValues "ARK_TEXT_ENDPOINT"
$videoEndpoint = Require-Env $envValues "ARK_VIDEO_ENDPOINT"

Write-Host "[ark] baseUrl=$baseUrl"
Write-Host "[ark] ARK_API_KEY $(Mask-Len $apiKey)"
Write-Host "[ark] ARK_TEXT_ENDPOINT $(Mask-Len $textEndpoint)"
Write-Host "[ark] ARK_VIDEO_ENDPOINT $(Mask-Len $videoEndpoint)"

if ($SkipText) {
  Write-Host "[ark] skipped text model request"
  exit 0
}

$body = @{
  model = $textEndpoint
  messages = @(
    @{
      role = "system"
      content = "You are a strict JSON-only assistant for e-commerce short video scripts."
    },
    @{
      role = "user"
      content = "Return only a JSON object with fields ok=true, title='portable cold brew cup', sceneCount=5. Do not explain."
    }
  )
  temperature = 0.1
  response_format = @{
    type = "json_object"
  }
} | ConvertTo-Json -Depth 8

try {
  $response = Invoke-RestMethod `
    -Uri "$baseUrl/chat/completions" `
    -Method Post `
    -Headers @{
      Authorization = "Bearer $apiKey"
      "Content-Type" = "application/json"
    } `
    -Body $body `
    -TimeoutSec 90

  $content = $response.choices[0].message.content
  if ([string]::IsNullOrWhiteSpace($content)) {
    throw "Text model returned empty content."
  }

  $parsed = $content | ConvertFrom-Json
  Write-Host "[ark] text model request succeeded"
  if ($ShowTextResponse) {
    $parsed | ConvertTo-Json -Depth 8
  }
} catch {
  Write-Host "[ark] text model request failed"
  Write-Host $_.Exception.Message
  exit 1
}

Write-Host "[ark] video endpoint is configured. To create a real Seedance task, run:"
Write-Host "python apps/agent-python/scripts/test_seedance_video.py --wait-seconds 420 --poll-seconds 8"
