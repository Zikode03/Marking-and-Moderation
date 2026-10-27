# Staging and account security: phases 1-3

This release prepares a reproducible staging stack and upgrades account security. It does not choose a hosting provider, buy a domain, change the running development SQL container, or configure a real SMTP password.

## What is implemented

- .NET 10, ABP 10.7.0 and EF Core 10.0.14; dependency lock files and locked Docker restores. The installed Identity tables, IDs and password hashes are retained. No destructive migration or database-engine replacement is performed.
- A separate staging Compose file with a Caddy HTTPS gateway, nginx same-origin API proxy and SPA deep-link fallback. Backend build inputs come from a real checkout, not an ignored mirror.
- Version preflight checks for both repository commits. API secrets are read from mounted files. The staging API runs as the unprivileged `app` user with a read-only filesystem, a temporary `/tmp`, and persistent data-protection keys.
- Explicit DbMigrator release step. The runtime refuses `sa`, trusted-server-certificate bypasses, automatic schema setup, bootstrap credentials, Developer/Evaluation SQL editions and sysadmin/db_owner runtime identities in staging/production.
- Password recovery and change, authenticator enrollment, MFA login, one-use recovery codes, code replacement, lost-authenticator replacement using a recovery code, MFA disabling for non-administrators, and revocation of all sessions.
- Required administrator MFA in staging. Before enrollment, an administrator can access their account setup and profile, but cannot manage institutional data.
- Secure/HttpOnly/SameSite=Strict refresh cookies in deployed environments, with an exact trusted-Origin check for login and refresh. Access tokens remain in memory; tab storage contains only the `cookie` marker, a non-secret account identifier and workspace selection. Development keeps the compatibility bearer-token flow. Cookie logout and security-stamp checks enforce credential/session changes. Sessions expire after eight hours; background refresh does not extend that deadline. Refresh also checks the account identifier to prevent cross-account tab confusion.
- Recovery, invitation and sales email use server-side SMTP configuration. Sending invitation email is an explicit action after creating the one-use invitation. Recovery responses do not disclose whether an account exists. Reset secrets are carried in URL fragments, cleared from the browser address and excluded from request-audit parameters.
- OpenAPI generation at `/openapi/v1.json`, authentication metadata, unique operation IDs, local-reference checks and independent specification validation. CI runs account/tenant/workflow tests and publishes the generated contract as an artifact.

## Prepare the environment

1. Use clean sibling frontend and backend checkouts. Commit/review the release first, then set `FRONTEND_REF` and `BACKEND_REF` to their full commit hashes in an ignored `.env.staging` copied from `.env.staging.example`.
2. Choose a hostname and point its DNS at the staging server. Open TCP 80 and 443 for the gateway. No SQL, API, training or inference port is published by the staging file.
3. Provision a separate staging database on an appropriately licensed SQL Server or managed SQL service. SQL Server 2022 remains a supported engine; an engine upgrade is not forced. Do not point staging at the development or live production database. Use trusted TLS certificates.
4. Supply two database identities: a release-only migration identity, and a restricted application identity. Have the DBA review `deploy/sql/RuntimePermissions.sql` for the SQL-login deployment. Managed identities may require host-specific provisioning. Back up and review schema changes before upgrading any existing real database.
5. Create the private secret files named by `API_DB_SECRET_FILE`, `MIGRATION_DB_SECRET_FILE` and `SMTP_PASSWORD_FILE`. Database files contain complete connection strings. Runtime SQL must use `Encrypt=True;TrustServerCertificate=False` and a restricted identity. Keep files outside Git; restrict host permissions while allowing the container's `app` user to read the mounted secret. Never place SMTP/database credentials in VITE variables.
6. Set the SMTP host, sender and username in the environment file. Mail uses TLS/STARTTLS, normally port 587. The sender must be authorised by your provider. Sales enquiries target prosperacore.tech@gmail.com. `Mail:*` is the shared configuration; legacy `SalesMail:*` remains a local compatibility fallback.
7. Ensure the staging subnet in Compose does not overlap your server's networks. Keep `ReverseProxy:KnownNetwork` matched to that application subnet. The gateway supplies forwarding headers; the API trusts only the configured proxy network.

## Fresh installation and first administrator

Migrate with the deployment identity, then have the DBA grant the runtime permissions. If there are no existing accounts, copy `.env.bootstrap.example` to ignored `.env.bootstrap`, set the first administrator and organisation GUID, and provide a strong initial password in a private file. Run the migration tool with the bootstrap overlay exactly once:

```powershell
docker compose --env-file .env.staging --env-file .env.bootstrap -f compose.staging.yml -f compose.bootstrap.yml --profile tools run --build --rm dbmigrator
```

Remove the bootstrap password file after secure handover. Never add bootstrap credentials to the API service. Existing installations do not need a new bootstrap account. The first administrator must enroll an authenticator and save recovery codes before managing the organisation.

## Deploy and verify

```powershell
./scripts/Deploy-Staging.ps1 -EnvironmentFile .env.staging
./scripts/Test-Staging.ps1 -Origin https://YOUR-STAGING-HOST
```

The deploy script rejects dirty or mismatched repository revisions, builds, runs migrations and starts the stack. Caddy obtains a publicly trusted certificate only after the domain and network are correctly configured. The smoke script does not bypass certificate verification.

Test invitations, recovery email, MFA enrollment/login, recovery-code reuse prevention, password changes, sign-out/revocation, and a representative academic workflow in staging. Email code tests use a test sender; a real inbox delivery still needs the provider settings. Persist and back up data-protection keys along with the database/document recovery plan. Key encryption at rest is a hosting responsibility; do not assume a Docker volume alone encrypts keys.

## Run repository checks

Frontend: `npm ci`, `npm test`, `npm run build`, then `npm run test:e2e` after installing Playwright Chromium. Set `PW_EXECUTABLE_PATH` to use an existing compatible browser locally.

Backend: `dotnet restore ProsperaAssess.sln --locked-mode`, `dotnet test ProsperaAssess.sln -c Release` with `PROSPERA_TEST_SQL` pointing at local test SQL. Tests create and drop only their uniquely named test databases. Set `PROSPERA_OPENAPI_OUTPUT` to export the generated schema and validate it with `python -m openapi_spec_validator <file>`.

Development SQL remains on its existing local port and volume. Do not use its Developer licence or the development Compose file as the production deployment.

## Boundaries

The domain, server, production SQL service/licence, SMTP credentials and real delivery checks are still external configuration. Backup/restore drills, capacity testing, broader privacy operations and model academic validation remain subsequent production acceptance gates. Session controls currently revoke all sessions; they do not provide a per-device session inventory. The local training studio is not exposed by this staging stack.

After rotating mounted credentials, restart the API so configuration is reloaded. Run deployment scripts from the frontend repository root.

Phases 4–6 add private ClamAV scanning, tenant document quotas, encrypted-database startup checks, retention/appeal controls and protected monitoring. Also provide `MONITOR_KEY_FILE` containing at least 32 random characters. The staging resource limits reserve up to 1 GiB for the API, 2 GiB for inference and 2 GiB for scanning, in addition to host/database overhead. Read [data protection and operations](DATA_PROTECTION_AND_OPERATIONS.md) and complete [educator acceptance](EDUCATOR_ACCEPTANCE.md) before release.

## Reproducible image dependencies

Base images are pinned by digest in `deploy/base-images.json`. Review updates generated by `python scripts/Update-BaseImagePins.py` before release. The AI runtime uses a hash-locked CPU dependency set for Linux AMD64 in `deploy/requirements.ai.lock`; regenerate it with `python scripts/Lock-AiRuntime.py` after installing uv. The image build imports the runtime and verifies that no trained model is ready. Dependency installation does not train a model.
