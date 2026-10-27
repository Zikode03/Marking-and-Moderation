param([Parameter(Mandatory)][uri]$Origin,[Parameter(Mandatory)][string]$MonitorKeyFile,[Parameter(Mandatory)][string]$BackupEvidenceFile,[Parameter(Mandatory)][string]$RestoreEvidenceFile,[int]$MaximumRestoreAgeDays=30,[int]$MaximumQueueAgeSeconds=900,[int]$MaximumBackupAgeHours=24)
$ErrorActionPreference='Stop'
if($Origin.Scheme -ne 'https'){throw 'Monitoring requires HTTPS.'}
$key=(Get-Content -Raw -LiteralPath $MonitorKeyFile).Trim()
if($key.Length -lt 32){throw 'Monitoring key is not configured.'}
$metrics=Invoke-RestMethod -Uri ($Origin.AbsoluteUri.TrimEnd('/')+'/api/operations/metrics') -Headers @{'X-Prospera-Monitor-Key'=$key} -TimeoutSec 20
$issues=@()
if($metrics.oldestPendingSeconds -gt $MaximumQueueAgeSeconds){$issues+='Marking queue is overdue.'}
if(@($metrics.scripts | Where-Object {$_.status -eq 'Failed' -and $_.count -gt 0}).Count){$issues+='Failed scripts require review.'}
if(!(Test-Path -LiteralPath $BackupEvidenceFile)){$issues+='Backup evidence is missing.'}else{
 $backup=Get-Content -Raw -LiteralPath $BackupEvidenceFile | ConvertFrom-Json
 if(!$backup.verified -or !$backup.encrypted -or ([DateTimeOffset]::UtcNow-[DateTimeOffset]$backup.checkedAt).TotalHours -gt $MaximumBackupAgeHours){$issues+='Encrypted verified backup is stale or incomplete.'}
}
if(!(Test-Path -LiteralPath $RestoreEvidenceFile)){$issues+='Restore drill evidence is missing.'}else{
 $restore=Get-Content -Raw -LiteralPath $RestoreEvidenceFile | ConvertFrom-Json
 if(!$restore.restored -or !$restore.integrityCheck -or ([DateTimeOffset]::UtcNow-[DateTimeOffset]$restore.checkedAt).TotalDays -gt $MaximumRestoreAgeDays){$issues+='Restore drill is stale or incomplete.'}
}
# Scheduler/monitoring service should route nonzero exits to the on-call channel.
if($issues.Count){throw ($issues -join ' ')}
Write-Host 'Production checks passed: API, queue and recent encrypted backup evidence.'
