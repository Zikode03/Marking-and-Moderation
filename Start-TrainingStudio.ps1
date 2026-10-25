param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$studioPython = Join-Path $PSScriptRoot '.local/model-venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $studioPython)) {
    throw 'Create the model environment and install ai_service/requirements.txt first. See ai_training/START_HERE.md.'
}
$studioLogs = Join-Path $PSScriptRoot '.local/training-studio-services'
New-Item -ItemType Directory -Force -Path $studioLogs | Out-Null
function Get-StudioResponse([string]$Address) {
    $studioRequestArgs = @{ Uri = $Address; Headers = @{ Origin = 'http://localhost:5173' }; TimeoutSec = 5; UseBasicParsing = $true }
    if ($PSVersionTable.PSVersion.Major -ge 7) { $studioRequestArgs.NoProxy = $true }
    try { return Invoke-WebRequest @studioRequestArgs } catch { return $null }
}
$service = Get-StudioResponse 'http://127.0.0.1:8001/studio/session'
if (-not $service) {
    Start-Process -FilePath $studioPython -ArgumentList @('-m','uvicorn','ai_service.studio:app','--host','127.0.0.1','--port','8001') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $studioLogs 'trainer.log') -RedirectStandardError (Join-Path $studioLogs 'trainer.err') | Out-Null
}
$page = Get-StudioResponse 'http://localhost:5173/training'
if (-not $page) {
    $studioNode = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $studioNode -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $studioLogs 'frontend.log') -RedirectStandardError (Join-Path $studioLogs 'frontend.err') | Out-Null
}
$studioReady = $false
for ($attempt = 0; $attempt -lt 25; $attempt++) {
    $service = Get-StudioResponse 'http://127.0.0.1:8001/studio/session'
    $page = Get-StudioResponse 'http://localhost:5173/training'
    if ($service -and $page) { $studioReady = $true; break }
    Start-Sleep -Milliseconds 400
}
if (-not $studioReady) { throw "The studio did not start. See logs in $studioLogs. Ports 5173 and 8001 must be available." }
Write-Output 'Model Studio: http://localhost:5173/training'
Write-Output 'Training mode is active. This service does not mark academic scripts.'
if (-not $NoBrowser) { Start-Process 'http://localhost:5173/training' -WindowStyle Normal }
