param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..")
$pluginDir = Resolve-Path (Join-Path $root "plugin")
$distDir = Join-Path $root "dist"

if (-not $OutputPath) {
    $OutputPath = Join-Path $distDir "SpreadsheetAIAgent.plugin"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null

$tempZip = Join-Path ([IO.Path]::GetTempPath()) "SpreadsheetAIAgent.zip"
if (Test-Path $tempZip) {
    Remove-Item -Force $tempZip
}

Compress-Archive -Path (Join-Path $pluginDir "*") -DestinationPath $tempZip -Force
Copy-Item -Path $tempZip -Destination $OutputPath -Force

Write-Host "Plugin package created: $OutputPath"
