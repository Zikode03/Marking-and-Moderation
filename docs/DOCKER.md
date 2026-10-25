# Local Docker stack

Clone the backend into the ignored build-context directory if it is not already present:

```powershell
git clone https://github.com/Zikode03/Marking-and-Moderation-backend.git .local/backend
```

Create your ignored `.env.docker` with the required SQL and bootstrap settings, then start from the frontend repository root:

```powershell
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
```

- Frontend: http://localhost:5173
- API health: http://localhost:5080/api/health
- SQL Server: `localhost,14332`, database `ProsperaAssess`, SQL authentication user `sa`. Enable Trust server certificate in your SQL client.
- Initial staff login: `admin@prospera.local`. Its password is `BOOTSTRAP_PASSWORD` in the ignored `.env.docker` file. SQL password is `SQL_SA_PASSWORD` in that file.

The backend is maintained in the separate `Marking-and-Moderation-backend` repository. Its checkout at `.local/backend` is the Docker API build context. The layered ABP solution uses `ProsperaAssess.HttpApi.Host` as its entry point. Keep this checkout current with the backend main branch before rebuilding.

SQL Server uses Developer edition for local development. Data and API token encryption keys persist in Docker named volumes. Stop with `docker compose --env-file .env.docker down`; do not add `-v` unless you intend to delete the stored data and keys.

Only loopback ports are exposed. The frontend talks to the API, and the API talks to SQL Server over the Compose network. The API creates its database and initial administrator on first startup. The private `ai` service is built from the frontend repository's `Dockerfile.ai` and serves the local marking contract; it remains unavailable for marking without a trained, academically approved package. The browser training studio is a separate local service; start it with `./Start-TrainingStudio.ps1`. See [Model Studio](../ai_training/STUDIO.md).
