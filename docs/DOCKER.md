# Docker environments

## Local development

Clone the frontend and backend into sibling directories. The backend context defaults to `../Marking-and-Moderation-backend`; override `BACKEND_CONTEXT` in `.env.docker` if needed. No ignored source mirror is required.

The existing local SQL Server 2022 Developer container is for development and tests only. Its data volume is not replaced by these changes.

```powershell
docker compose --env-file .env.docker --profile tools run --rm dbmigrator
docker compose --env-file .env.docker up -d --build
```

## Staging / production preparation

Use the separate `compose.staging.yml`; do not promote the development Compose file. See [STAGING_AND_SECURITY.md](STAGING_AND_SECURITY.md) for the HTTPS gateway, secrets, production SQL, version checks, explicit migrations and smoke checks.
