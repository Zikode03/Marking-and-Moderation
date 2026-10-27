param([Parameter(Mandatory)][string]$Origin)
$ErrorActionPreference = 'Stop'
if ($Origin -notmatch '^https://') { throw 'Use the HTTPS staging origin.' }
$health = Invoke-RestMethod "$($Origin.TrimEnd('/'))/api/health"
if ($health.status -ne 'ok') { throw 'API/database health check failed.' }
$schema = Invoke-RestMethod "$($Origin.TrimEnd('/'))/openapi/v1.json"
if (!$schema.paths.'/api/account/security' -or !$schema.paths.'/api/account/password/reset') { throw 'OpenAPI is missing account routes.' }
foreach ($route in @('/forgot-password','/reset-password','/accept-invitation')) {
  $response = Invoke-WebRequest "$($Origin.TrimEnd('/'))$route"
  if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'id="root"') { throw "SPA deep link failed: $route" }
}
Write-Host 'HTTPS, API/database health, OpenAPI and SPA route checks passed.'
