# Phases 1–3 verification

Verified locally on 27 October 2026. Hosting and domain selection remain open.

- Frontend production build and 80 unit tests passed.
- Five browser tests passed: landing layout, password recovery, reset deep links, MFA login and enrollment.
- All 73 backend integration/configuration tests passed, including the ABP upgrade migration/model consistency check.
- Account integration checks cover recovery token replay, credential changes, session revocation, MFA/recovery codes, lost authenticator replacement, administrator enrollment restrictions and deployed refresh-cookie protections.
- The actual generated OpenAPI document was fetched by integration tests and independently validated with `openapi-spec-validator` 0.9.0. Local references, operation IDs and authentication metadata are checked.
- Frontend, backend and CPU AI Docker images built. The AI image imports its hash-locked dependencies and confirms that no trained model is ready.
- Staging and bootstrap Compose configurations validate. Deployment PowerShell scripts parse successfully.
- A temporary local Caddy/nginx stack passed HTTPS, API/OpenAPI proxy, SPA deep-link, HSTS and CSP checks. The API in this transport test was a fixture; this does not establish a live staging deployment.
- NuGet transitive advisory audit and npm audit reported no vulnerabilities at verification time.

Database tests use uniquely named disposable databases. The existing development database was not migrated. The ABP 10.7 schema migration is included for the explicit release migration step.

Real SMTP delivery, a publicly trusted staging certificate, restricted staging SQL credentials and operational acceptance must still be checked on the chosen host. See [the staging guide](STAGING_AND_SECURITY.md).
