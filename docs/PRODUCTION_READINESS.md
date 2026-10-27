# Production completion audit

Audit date: 27 October 2026 (Africa/Johannesburg).

## Target

Finish and verify the non-model application so that the remaining AI work is data collection, training, independent evaluation and approved deployment. This is not yet a production-readiness certificate. Training completion alone cannot establish marking reliability.

The release scope is existing paper + approved memorandum + candidate scripts -> provisional marking -> educator review -> independent moderation -> approval -> reporting. Assessment authoring remains disabled. This milestone does not require adding admissions, finance, billing or an LMS.

## Working foundation

The repositories include school/institution workspaces, role and allocation checks, institution/learner records, invitations, document version policies, script queues, review/moderation/approval, reports, audit records, and local training tools. Most recent full runs passed 79 frontend tests, 53 backend tests and 4 new training-data tests. A fresh npm audit on the audit date reported zero known dependency advisories; this does not certify the entire stack or deployment.

## Release gates

| Priority | Work | Evidence / current gap | Definition of done |
| --- | --- | --- | --- |
| P0 | Supported runtime and ABP upgrade | Backend uses net9.0, ABP 9.3.6, EF 9.0.10 and .NET 9 images. .NET 9 support ends 10 November 2026. | Migrate through the official ABP/.NET migration guidance to a supported compatible stack; compile, migrate a restored database and run regressions. |
| P0 | Reproducible deployment | Compose builds the API from ignored `.local/backend`; the frontend defaults to localhost:5080; nginx has no supplied SPA/reverse-proxy configuration. | A clean checkout of documented repository versions builds and deploys. Domain URLs, HTTPS, API routing, invitation deep links, proxy upload limits and production origin/host settings are verified. |
| P0 | Production database and identities | Compose uses SQL Developer, the sa login, bootstrap environment values and automatic schema initialization. | Use an appropriate production SQL edition/service and restricted runtime identity; separate the migration identity, run migrations as a release step and remove normal-start bootstrap provisioning. |
| P0 | Account lifecycle | Login/refresh/lockout and invitations exist; no complete password recovery or MFA enrolment/recovery UI was found. Browser refresh tokens remain in sessionStorage. | Password reset, credential changes, invitation delivery/expiry, admin MFA, sign-out/revocation, session expiry and disabled-account behavior are implemented and tested. Review the production session/token design. Preserve existing user accounts during any Identity/OpenIddict migration. |
| P0 | Email delivery | Sales SMTP code and recipient exist; outgoing credentials are not configured or live-tested. | A configured mail provider accepts real sales, invitation and recovery messages; failures are visible and retryable, without duplicate sends or false success. Secrets stay server-side. |
| P0 | Privacy and learner data lifecycle | Scripts, memorandums and audit snapshots contain sensitive academic information. No verified production retention/deletion/backup policy was found. | Document and implement data access, notices, retention, deletion/anonymisation, training-data authorisation and incident processes; obtain the institution's privacy/legal review, including children where relevant. |
| P0 | Document storage and upload protection | Paper, memo and script files are SQL byte arrays. Current validation and size bounds exist; production capacity and malware scanning are unverified. | Choose and test an encrypted, tenant-scoped storage design. SQL storage may remain if capacity and recovery are proven; otherwise use private object storage. Enforce quotas, scanning/quarantine, safe PDF processing, access controls and configurable proxy limits. |
| P0 | Restore and disaster recovery | Local SQL/data-protection volumes exist; no verified automated backup-and-restore drill was found. | Scheduled protected backups cover database, documents, keys and necessary configuration; restore them into a clean environment and verify login, script access and approved results. Define recovery targets and rollback steps. |
| P1 | Queue reliability and capacity | SQL-backed atomic claims and interrupted-job recovery already exist. One periodic worker handles work serially; Python inference uses a process lock. | Test worker restart, timeout, duplicate requests and concurrent workers. Add bounded concurrency, leases/heartbeats, retry policy and operational queue controls as needed. Demonstrate capacity against an agreed marking-volume target. A new queue technology is not automatically required. |
| P1 | Academic workflow acceptance | Core workflow tests exist, but tests do not replace acceptance by actual academic staff. | Teachers, lecturers, professors, moderators and approvers complete representative tasks. Verify page/memo mismatch, unreadable scans, missing pages, duplicate candidates, alternate methods, returns, conflicting changes, reopened results and approved-only exports. |
| P1 | Training/production separation | `/training` is reachable before normal workspace authentication. Its service is intentionally local-only and the client hardcodes 127.0.0.1:8001. | Keep training in a private research environment, or implement explicit authorised, tenant-scoped production access. Do not expose local training controls as an ordinary public feature. |
| P1 | Monitoring and release automation | Health checks and tests exist; no checked-in CI workflows, deployment automation or production alert configuration were found. | CI builds both repositories, runs regression and security checks, publishes versioned images, validates migrations and deploys to staging. Monitor API failures, queue age, failed scripts, storage, backups and mail delivery. A rollback runbook is exercised. |
| P1 | Browser, usability and accessibility acceptance | Component and local browser checks exist, including educator layouts and sticky navigation. | Persistent browser tests run in CI across roles and practical screen sizes; keyboard/screen-reader, loading/error/retry, download/print and deep-link behavior pass. |
| P1 | AI integration contract independent of real weights | Result validation, model readiness, scope metadata, checksums, packaging and academic approval tooling exist. | Test the full upload-to-approved-result flow using an explicitly test-only model fixture. Verify abstention, unsupported language/layout, service outage and model rollback. Never enable the test model for live marking. |

## Important model-scope limit

`ai_training/START_HERE.md` and `ai_training/runtime.py` describe a reviewed fixed-answer-booklet layout pipeline. The system is not currently a demonstrated universal reader of arbitrary handwriting, free-form layouts, diagrams, equations or every academic subject. All 11 written-language codes being selectable does not establish accuracy in those languages.

Before training, complete the staff workflow for confirming the uploaded paper/memorandum question inventory, mark scheme and supported answer regions. This is preparation of an existing assessment, not assessment authoring. Either launch with an explicit supported-layout scope or implement and evaluate the additional segmentation/layout/math/diagram capabilities required by a broader promise.

## AI work that necessarily remains after software completion

1. Obtain appropriately authorised, de-identified scans with independently verified transcripts, memo mappings and question-level marks.
2. Freeze representative training/validation/test partitions, keeping learners, scripts and related papers from leaking between splits.
3. Train the handwriting and rubric-scoring components from scratch.
4. Independently evaluate reading errors, mark errors, uncertainty/abstention, fairness by supported scope and throughput. Define acceptance thresholds before examining held-out results.
5. Approve only the subject, grade/module, language and layout combinations actually validated; retain human review and moderation.
6. Deploy a versioned package, perform a limited pilot and monitor failures. Passing the software tests is not academic approval.

## Recommended execution order

1. Supported framework/runtime, reproducible deployment and configuration.
2. Account lifecycle, email and privacy/storage controls.
3. Reliable jobs, backup/restore and observability.
4. Complete academic workflow acceptance, browser automation and model-contract tests.
5. Independent security/operational review and staging handover; then model training and its academic release gates.

External decisions/credentials still needed: hosting/domain and region, production SQL/storage choice, mail sending credentials, expected institutions/scripts/peak concurrency, backup recovery targets and nominated academic/privacy approvers. These do not need to block repository-level engineering work, but must be settled before production acceptance.

## Primary references

- Microsoft .NET support: https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core
- ABP 10 migration: https://abp.io/docs/latest/release-info/migration-guides/abp-10-0
- SQL Server 2022 licensing: https://www.microsoft.com/licensing/docs/documents/download/SQL_Server_2022_Licensing_guide%20%281%29.pdf
- Information Regulator guidance on children's information: https://www.inforegulator.org.za/wp-content/uploads/2020/07/GuidanceNote-Processing-PersonalInformation-Children-20210628-1.pdf

## Phase 1-3 implementation update

Repository implementation now includes the supported .NET 10/ABP stack, staging deployment/secret configuration, protected refresh cookies, account recovery/MFA/revocation, invitation email and OpenAPI/CI checks. See STAGING_AND_SECURITY.md for the exact scope and required external activation steps. The table above records the original audit, not a claim that a live deployment has been provisioned.

## Phase 4–6 implementation update

The repositories now include fail-closed private malware scanning, tenant document quotas and upload concurrency control, required encrypted production SQL storage, retention previews/holds/confirmed expiry deletion, explicit training-export authorisation, protected operational diagnostics, encrypted backup and isolated restore scripts, and broader CI/browser/security regressions. Actual synthetic-data backup/restore and real ClamAV EICAR checks passed locally. See DATA_PROTECTION_AND_OPERATIONS.md and EDUCATOR_ACCEPTANCE.md. Hosting schedules/alerts, real encrypted off-host recovery, load testing, independent security review and educator sign-off still require the selected deployment and responsible people. Broad learner-identity erasure was not added.
