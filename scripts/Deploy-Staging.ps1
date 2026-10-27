param([string]$EnvironmentFile = '.env.staging')
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $EnvironmentFile)) { throw "Copy .env.staging.example to $EnvironmentFile and configure it first." }
$settings = @{}
foreach ($line in Get-Content -LiteralPath $EnvironmentFile) { if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2].Trim().Trim('"') } }
$frontendExpected = $settings['FRONTEND_REF']
if ($frontendExpected -notmatch '^[a-fA-F0-9]{40}$' -or (git rev-parse HEAD) -ne $frontendExpected) { throw 'Frontend checkout must match a full reviewed FRONTEND_REF.' }
if (git status --porcelain) { throw 'Frontend checkout has uncommitted changes.' }
$backendPath = (Resolve-Path -LiteralPath $settings['BACKEND_CONTEXT']).Path
$expected = $settings['BACKEND_REF']
if ($expected -notmatch '^[a-fA-F0-9]{40}$') { throw 'BACKEND_REF must be a full reviewed commit SHA.' }
$actual = git -C $backendPath rev-parse HEAD
if ($actual -ne $expected) { throw 'Backend checkout does not match BACKEND_REF.' }
if (git -C $backendPath status --porcelain) { throw 'Backend checkout has uncommitted changes.' }
$composeArgs = @('compose', '--env-file', $EnvironmentFile, '-f', 'compose.staging.yml')
& docker @composeArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staging configuration validation failed.' }
& docker @composeArgs --profile tools build
if ($LASTEXITCODE -ne 0) { throw 'Image build failed.' }
& docker @composeArgs --profile tools run --rm dbmigrator
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; API has not been started.' }
& docker @composeArgs up -d
if ($LASTEXITCODE -ne 0) { throw 'Staging startup failed.' }
Write-Host "Staging started at https://$($settings['APP_DOMAIN']). Run the documented HTTPS and OpenAPI smoke checks."
