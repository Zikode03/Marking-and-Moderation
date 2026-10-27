# Phases 4–6 verification

Verified locally on 27 October 2026. No real learner records were deleted and the existing application database was not migrated.

| Boundary | Evidence |
| --- | --- |
| Administrator UI → protection API | Browser test exercises appeal hold, release, typed deletion confirmation and refreshed preview; backend integration tests exercise the real services/database |
| Upload → storage | Quota and scanner failure produce no saved batch; two concurrent identical uploads create exactly one batch |
| Data lifecycle | Active work, appeal holds and changed retention policies block deletion; expired approved batch deletion removes linked training examples and preserves a metadata event |
| Academic workflow | Actual API regression checks upload → test-only marking transport → teacher review → HOD return/review/moderation → approval → approved-only export; unallocated/cross-institution access and stale revisions rejected |
| Antivirus | Pinned real ClamAV container accepted clean synthetic bytes and rejected harmless standard EICAR content; TCP adapter tests cover explicit clean, infected, error and missing-scanner outcomes |
| Recovery | Synthetic SQL COPY_ONLY/CHECKSUM backup, restore into unique database, DBCC CHECKDB and restored document SHA-256 comparison passed; checked-in restore SQL also passed an actual synthetic-backup drill |
| Operations | Separate monitoring credential required; diagnostics expose no candidate identifiers or secrets; Compose and PowerShell configurations validate |
| API contract | Actual generated OpenAPI fetched by tests and independently validated with openapi-spec-validator 0.9.0 after final backend edits |

The initial full backend run passed 85 cases. Final targeted runs verified the subsequent configuration, monitoring, binary restore and concurrency edits: **87 distinct backend cases passed across these runs**, with no failures. The frontend passed **80 unit tests**, **six browser tests** and its production build. Five Python academic-scope/render-budget tests passed. Frontend, API and AI Docker image builds passed; no trained model was enabled.

The browser acceptance flow uses synthetic API fixtures; the database/service integration suite independently checks the corresponding real boundaries. This is not a claim that a live multi-user staging environment has passed educator acceptance.

Still to execute on the chosen host: real encrypted off-host restore/key recovery, backup/alert scheduling, production-scale load tests, independent penetration testing and educator/privacy/operational sign-off. Broad learner-identity erasure needs separate authorisation and was not implemented.

Primary implementation references: [ClamAV stream protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [SQL backup/restore checksums](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/enable-or-disable-backup-checksums-during-backup-or-restore-sql-server).
