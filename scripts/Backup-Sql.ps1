param(
 [Parameter(Mandatory)][string]$Server,
 [Parameter(Mandatory)][ValidatePattern('^[A-Za-z][A-Za-z0-9_]{0,100}$')][string]$Database,
 [Parameter(Mandatory)][ValidatePattern('^[A-Za-z][A-Za-z0-9_]{0,100}$')][string]$Certificate,
 [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9_./\\:-]+$')][string]$BackupPath,
 [string]$Username,
 [Parameter(Mandatory)][string]$EvidenceFile
)
$ErrorActionPreference='Stop'
if($Database -in @('master','model','msdb','tempdb')) {throw 'Select an application database.'}
if(Test-Path -LiteralPath $EvidenceFile) {throw 'Use a new evidence filename for each backup run.'}
# SQLCMDPASSWORD must be supplied privately by the scheduler; it is never a CLI argument.
$authentication=if($Username){@('-U',$Username)}else{@('-E')}
$script=Join-Path $PSScriptRoot '../deploy/sql/BackupEncrypted.sql'
& sqlcmd -S $Server @authentication -N -b -i $script -v "Database=$Database" "Certificate=$Certificate" "BackupPath=$BackupPath"
if($LASTEXITCODE -ne 0){throw 'Encrypted backup or checksum verification failed.'}
@{checkedAt=[DateTimeOffset]::UtcNow.ToString('o');database=$Database;encrypted=$true;checksum=$true;verified=$true;restoreTested=$false} | ConvertTo-Json | Set-Content -LiteralPath $EvidenceFile
Write-Host 'Encrypted backup verified. Copy it and its recovery keys to protected off-host storage; run the separate restore acceptance drill.'
