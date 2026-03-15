$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..")
Set-Location $root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is required but was not found in PATH."
}

if (-not (Test-Path ".\backend\.env")) {
    Copy-Item ".\backend\.env.example" ".\backend\.env"
}

if (-not (Test-Path ".\.env")) {
    Copy-Item ".\.env.example" ".\.env"
}

function Test-PortInUse {
    param([int]$Port)
    try {
        $listening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
        return $listening.Count -gt 0
    } catch {
        # Fallback on environments where Get-NetTCPConnection is unavailable.
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        try {
            $listener.Start()
            return $false
        } catch {
            return $true
        } finally {
            $listener.Stop()
        }
    }
}

function Get-FreePort {
    param([int]$PreferredPort)
    $port = $PreferredPort
    while (Test-PortInUse -Port $port) {
        $port += 1
    }
    return $port
}

function Get-PortFromComposeEnv {
    param(
        [string]$FilePath,
        [string]$Key,
        [int]$DefaultPort
    )

    if (-not (Test-Path $FilePath)) {
        return $DefaultPort
    }

    $line = Get-Content $FilePath | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -Last 1
    if (-not $line) {
        return $DefaultPort
    }

    $value = ($line -replace "^\s*$Key\s*=\s*", "").Trim()
    $parsed = 0
    if ([int]::TryParse($value, [ref]$parsed) -and $parsed -gt 0 -and $parsed -lt 65536) {
        return $parsed
    }

    return $DefaultPort
}

$composeEnvPath = ".\.env"
$backendPort = if ($env:BACKEND_PORT) { [int]$env:BACKEND_PORT } else { Get-PortFromComposeEnv -FilePath $composeEnvPath -Key "BACKEND_PORT" -DefaultPort 8090 }
$onlyofficePort = if ($env:ONLYOFFICE_PORT) { [int]$env:ONLYOFFICE_PORT } else { Get-PortFromComposeEnv -FilePath $composeEnvPath -Key "ONLYOFFICE_PORT" -DefaultPort 8080 }

$resolvedBackendPort = Get-FreePort -PreferredPort $backendPort
$resolvedOnlyofficePort = Get-FreePort -PreferredPort $onlyofficePort

if ($resolvedBackendPort -ne $backendPort) {
    Write-Warning "Port $backendPort is in use. Using backend port $resolvedBackendPort."
}
if ($resolvedOnlyofficePort -ne $onlyofficePort) {
    Write-Warning "Port $onlyofficePort is in use. Using ONLYOFFICE port $resolvedOnlyofficePort."
}

$env:BACKEND_PORT = [string]$resolvedBackendPort
$env:ONLYOFFICE_PORT = [string]$resolvedOnlyofficePort

$runtimeConfigPath = ".\plugin\runtime-config.json"
$runtimeConfig = @{ backendUrl = ("http://localhost:{0}" -f $resolvedBackendPort) } | ConvertTo-Json
Set-Content -Path $runtimeConfigPath -Value $runtimeConfig

@(
    ".\onlyoffice-data\logs",
    ".\onlyoffice-data\data",
    ".\onlyoffice-data\lib",
    ".\onlyoffice-data\db"
) | ForEach-Object {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
}

Write-Host "Starting services (backend + ONLYOFFICE Docs)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed to start services."
}

$runningServices = docker compose ps --status running --services
if ($LASTEXITCODE -ne 0) {
    throw "docker compose is not in a healthy state after startup."
}

if (-not ($runningServices -contains "backend")) {
    throw "Backend service is not running."
}
if (-not ($runningServices -contains "onlyoffice")) {
    throw "ONLYOFFICE service is not running."
}

function Wait-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$ExpectedText = "",
        [int]$Attempts = 90,
        [int]$DelaySeconds = 2
    )

    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing
            $isExpected = (-not $ExpectedText) -or ($response.Content -match [regex]::Escape($ExpectedText))
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500 -and $isExpected) {
                Write-Host "$Name is ready: $Url"
                return
            }
        } catch {
            # Keep waiting.
        }
        Start-Sleep -Seconds $DelaySeconds
    }

    Write-Warning "$Name did not become ready in time: $Url"
}

Wait-Endpoint -Name "Backend" -Url ("http://localhost:{0}/api/health" -f $resolvedBackendPort) -ExpectedText "onlyoffice-spreadsheet-agent" -Attempts 45
Wait-Endpoint -Name "ONLYOFFICE Core" -Url ("http://localhost:{0}/healthcheck" -f $resolvedOnlyofficePort) -ExpectedText "true" -Attempts 180

Write-Host "Ensuring ONLYOFFICE example service is started..."
$exampleStarted = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
    $status = docker compose exec -T onlyoffice sh -lc "supervisorctl status ds:example 2>/dev/null || true"
    if ($status -match "RUNNING") {
        $exampleStarted = $true
        break
    }

    if ($status -match "STOPPED" -or $status -match "EXITED" -or $status -match "FATAL") {
        docker compose exec -T onlyoffice sh -lc "supervisorctl start ds:example >/dev/null 2>&1 || true" | Out-Null
    }

    Start-Sleep -Seconds 2
}

if (-not $exampleStarted) {
    throw "Failed to start ONLYOFFICE example service (ds:example)."
}

Wait-Endpoint -Name "ONLYOFFICE Example" -Url ("http://localhost:{0}/example/" -f $resolvedOnlyofficePort) -Attempts 90

Write-Host ""
Write-Host "Open these URLs:"
Write-Host ("- ONLYOFFICE example: http://localhost:{0}/example/" -f $resolvedOnlyofficePort)
Write-Host ("- Backend health:    http://localhost:{0}/api/health" -f $resolvedBackendPort)
Write-Host ""
Write-Host "In ONLYOFFICE, open a spreadsheet and launch plugin: Spreadsheet AI Agent"

Start-Process ("http://localhost:{0}/example/" -f $resolvedOnlyofficePort) | Out-Null
