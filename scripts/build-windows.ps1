$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "=== Fetching JRE ===" -ForegroundColor Cyan
$jreDir = Join-Path $PSScriptRoot ".." "jre"
New-Item -ItemType Directory -Force -Path $jreDir | Out-Null

$url = "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse"
$archive = Join-Path $jreDir "temurin-21.zip"

Write-Host "Downloading Temurin JRE 21 for Windows..."
Invoke-WebRequest -Uri $url -OutFile $archive

Write-Host "Extracting..."
Expand-Archive -Path $archive -DestinationPath $jreDir -Force
Remove-Item $archive

Write-Host "=== Building BlockDev for Windows ===" -ForegroundColor Cyan
electrobun build --env=stable --targets=win-x64

Write-Host "=== Done ===" -ForegroundColor Green
