# Learner data protection and production operations

Implemented 27 October 2026. This guide supplements [staging configuration](STAGING_AND_SECURITY.md).

## Upload and storage controls

Files stay in private SQL tables, behind institutional membership, academic allocation and role checks. There are no public document URLs. Downloads require current authorisation and use attachment responses with no-store headers. SQL transport must use a trusted TLS certificate; deployed startup now also refuses a database without encryption at rest. Provision and escrow TDE/recovery keys through the database administrator before deployment.

Every paper, memorandum and script is scanned before persistence or model processing. Staging uses a digest-pinned private ClamAV service and persistent signature storage. An infected file, scanner error, timeout or unavailable scanner rejects the whole upload. Development and the isolated Testing environment may omit the scanner; staging/production may not. ClamAV requires working signature updates and adequate memory. Antivirus scanning reduces risk; it does not establish document safety by itself.

Existing signature/type and size checks remain: PDF/PNG/JPEG, 10 MB per file, 59 MB file total, 1–30 candidate scripts. Two simultaneous upload requests per API instance bound memory pressure. SQL application locks serialise tenant quota checks and insertion. `TENANT_STORAGE_QUOTA_BYTES` defaults to 10 GiB of original document bytes per institution; training text, audit data and database overhead also need capacity monitoring. Increase capacity only after measuring the database and backup costs.

Rendering rejects more than 100 PDF pages, more than 25 million pixels per page/image and more than 100 million rendered PDF pixels in total. AI container memory and CPU limits provide an additional boundary. The training studio remains private.

## Retention and appeals

An institution administrator opens **Learner data protection**. The retention period comes from **Institution management → Settings**, ranges from 30–3650 days, and must be approved by the institution. There is no automatic default expiry and no unattended deletion job.

The screen previews the 200 oldest batches. Only a fully approved batch beyond its retention period is eligible. Script and training-label activity count toward the period. Open work cannot be silently deleted. An appeal/investigation hold blocks expiry. Hold and training-export decisions require a reason or case reference; do not enter learner names or answers there.

Deletion requires the displayed preview token and the exact confirmation **DELETE EXPIRED BATCH**. The server rechecks the policy, hold, activity and revisions under the tenant storage lock. It deletes the batch's paper, memorandum, scripts, result/review history and linked training examples from active storage in one transaction. A metadata event records who acted, the batch reference and the time. Institution setup, learner registry, legacy submissions and unrelated academic records are retained. Broad learner-identity erasure is not part of this release.

Keep the purge-event ledger outside database backups under restricted access. Before opening a restored database to users, reconcile all retention purges since that backup and reapply them. Restoring old backups must not silently resurrect expired scripts. The institution must define backup expiry and how legal holds affect it; this cannot be inferred from a marking retention period.

Training export is blocked until an administrator explicitly records institutional authorisation for the batch. This is additional to independent verification of each training label. Authorisation can be revoked. Exported answers still require a human privacy review and appropriate de-identification: a candidate identifier hash does not remove names written inside an answer. Record the approved purpose, dataset custodian and permitted scope outside the application as well.

Audit action metadata is preserved. Sensitive upload, review, training and administration input objects are excluded from audit parameter copies; academic review evidence remains in the protected academic record until retention deletion.

## Backup, restore and keys

SQL contains the documents as well as results. Back up the database, transaction log as appropriate, encryption certificates/private keys, data-protection keys and the current recovery/purge ledger. Keep encrypted off-host copies with access restricted to recovery operators. A Docker volume is not a backup. Match the schedule and geography to the institution's approved recovery and privacy requirements.

`scripts/Backup-Sql.ps1` uses a separately authorised DBA/backup identity, trusted TLS, AES-256 backup encryption, COPY_ONLY, checksums and RESTORE VERIFYONLY. Supply the SQL server's backup path and an existing master backup certificate. Supply SQL credentials privately through `SQLCMDPASSWORD` or integrated authentication, never a command-line password. Use a unique backup and evidence filename for every run. Escrow the backup certificate and private key separately; a backup without recoverable keys is unusable.

`scripts/Test-SqlRestore.ps1` exercises `deploy/sql/RestoreDrill.sql` on SQL Server 2022. Run it on an isolated recovery host with the necessary decryption keys. It chooses a fresh `ProsperaRestoreCheck_<GUID>` target, refuses overwrite, restores with checksums, runs DBCC CHECKDB and checks the application schema, then removes only its own disposable database. Evidence is written only on success. Production data is sensitive even in a temporary restore; isolate that host and its storage.

The local automated test performed a real backup, checksum verification, restore and integrity check using synthetic data. It also compares restored document hashes. This is software evidence, not proof that your future host's off-site recovery or encrypted-key recovery works. Repeat an encrypted restore drill there before release and regularly afterwards.

## Monitoring and incident response

- `/api/health/live`: process liveness; `/api/health`: database connectivity.
- `/api/operations/metrics`: database availability, process counters, mail delivery failures, script status counts and oldest pending age. It requires the separate `X-Prospera-Monitor-Key` credential from the mounted `MONITOR_KEY_FILE`; use at least 32 random characters. It returns no candidate identifiers, emails, answers or filenames. Process counters reset at restart; collect them in the monitoring service.
- Run `scripts/Check-Production.ps1` from the chosen scheduler. It validates HTTPS, queue age, failed scripts, recent encrypted backup evidence and recent successful restore evidence. Nonzero exits must alert a nominated operator. The default thresholds are engineering placeholders: 15-minute queue age, 24-hour backup age and 30-day restore-drill age.
- Also configure the host's CPU/memory/disk/SQL capacity alerts, ClamAV signature-update alerts, certificate expiry, HTTP error/latency rates and mail-failure deltas. Do not label the untrained model as an infrastructure outage: it must abstain until an approved model is deployed.

For a failed release, stop admitting new uploads, retain the queue and evidence, and restore service using the last validated application/configuration combination. Do not automatically run destructive migration Down methods. Rehearse database recovery and compatibility on an isolated restored copy before choosing rollback or roll-forward. Rotate exposed credentials and preserve access logs during an incident.

The hosting operator must activate schedules, off-host storage, alerts and a named on-call owner. These services have not been provisioned while hosting remains undecided.
