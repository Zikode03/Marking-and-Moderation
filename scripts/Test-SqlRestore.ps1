param(
 [Parameter(Mandatory)][string]$Server,
 [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9_./\\:-]+$')][string]$BackupPath,
 [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9_./\\:-]+[\\/]$')][string]$DataDirectory,
 [string]$Username,
 [Parameter(Mandatory)][string]$EvidenceFile
)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $EvidenceFile){throw 'Use a new evidence filename for each restore drill.'}
$target='ProsperaRestoreCheck_'+[Guid]::NewGuid().ToString('N')
$authentication=if($Username){@('-U',$Username)}else{@('-E')}
$script=Join-Path $PSScriptRoot '../deploy/sql/RestoreDrill.sql'
& sqlcmd -S $Server @authentication -N -b -i $script -v "RestoreName=$target" "BackupPath=$BackupPath" "DataDirectory=$DataDirectory"
if($LASTEXITCODE -ne 0){throw 'Restore drill failed. Inspect SQL output before any production release.'}
@{checkedAt=[DateTimeOffset]::UtcNow.ToString('o');restored=$true;integrityCheck=$true;schemaCheck=$true;targetRemoved=$true} | ConvertTo-Json | Set-Content -LiteralPath $EvidenceFile
Write-Host 'Restore, integrity and schema checks passed; the uniquely named drill database was removed.'
