# ABP backend architecture

The backend is a layered ABP 10.7.0 application on .NET 10. Package versions are pinned in Directory.Build.props. Business HTTP routes remain compatible with the existing React client.

## Solution layout

| Project | Responsibility |
| --- | --- |
| ProsperaAssess.Domain.Shared | Value objects, audit snapshots, language catalog, localisation resource |
| ProsperaAssess.Domain | BasicAggregateRoot entities, marking workflow invariants, Identity/AI infrastructure ports |
| ProsperaAssess.Application.Contracts | Application-service interfaces, input/output DTOs, permission definitions |
| ProsperaAssess.Application | ApplicationService implementations, repository queries through ABP AsyncExecuter, orchestration and initial permission seeding |
| ProsperaAssess.EntityFrameworkCore | AbpDbContext, SQL Server mappings, EF migrations, repositories, account-store and permission-management adapters |
| ProsperaAssess.HttpApi | Thin AbpController actions, multipart parsing and legacy HTTP response mapping |
| ProsperaAssess.HttpApi.Host | Composition root, middleware, bearer-session integration, local AI HTTP client and ABP periodic-worker hosting |
| ProsperaAssess.DbMigrator | Explicit migration and IDataSeeder executable |

Domain does not reference Application or EF Core. Application does not reference EntityFrameworkCore or HttpApi. HttpApi depends on Application.Contracts, not Application or EntityFrameworkCore. Tests enforce these assembly boundaries.

## Framework integration

- Business services derive from ApplicationService and implement IApplicationService contracts. Permissions are checked by ABP interceptors even when services are called without HTTP controllers.
- Persistent permission definitions use a PermissionDefinitionProvider and ABP permission grants. Role/user management providers bridge the retained account store. Initial role grants have a persistent seed checkpoint; restarting or reseeding does not restore revoked grants.
- AssessDb derives from AbpDbContext and is registered through AddAbpDbContext with default repositories. Application queries use IRepository and IAsyncQueryableExecuter. SQL-specific atomic queue claiming is isolated in a custom EF repository.
- ABP units of work manage transactions. Identity account creation and teaching allocations enlist in the same transaction; tests verify that both roll back together.
- Aggregate methods enforce marking ranges, independent human moderation and approval locking. Submission marking state and AI result state have protected setters. Existing audit/revision concurrency tokens remain mapped, and ABP concurrency exceptions are handled as conflicts.
- ABP application auditing persists alongside the academic mark history. Password/refresh-token/upload/training DTOs are excluded from parameter logging. Uploaded bytes and learner answer content are not intentionally copied into request-audit parameters.
- The marking poller uses AsyncPeriodicBackgroundWorkerBase and a cancellation-aware application processor. SQL compare-and-set claims and revisions protect against duplicate workers; interrupted jobs retain the existing retry behaviour.
- Localisation uses an embedded ABP JSON resource. The framework clock is configured for UTC.

The application contracts include a JSON response DTO for the existing public API shapes and file metadata. This compatibility adapter preserves frontend routes and responses; domain entities are not returned across application-service boundaries. New APIs should use dedicated feature DTOs rather than expanding the compatibility response.

## Existing authentication and organisation boundaries

The installed ASP.NET Core Identity store, string user IDs, password hashes, roles, bearer/refresh tokens and .NET user-secret ID are deliberately retained. They live behind an infrastructure adapter; business services use IStaffIdentityService rather than UserManager or Identity EF types. Login/refresh endpoints remain a host-level protocol adapter.

This solution does not install the separate ABP Account/Identity/OpenIddict administration modules or convert users into a new identity database. ABP framework integration does not require replacing an existing authentication provider. Such a conversion would be a separate account/data migration, not a prerequisite for the layered business architecture.

SchoolId is the existing organisation resource scope, including institution faculties/modules. Account allocations and leadership access enforce it. It is not silently reinterpreted as ABP TenantId, and the sign-in organisation choice does not switch tenants. Native ABP tenant provisioning/tenant administration is not claimed by this refactor.

## Schema migrations

Production startup no longer calls EnsureCreated or applies handwritten schema patches. The EntityFrameworkCore project owns EF migrations and a model snapshot.

The baseline adopts the installed legacy tables without deleting/recreating them, provisions missing tables/indexes, adds the previously optional academic/language columns, and introduces ABP auditing and permission tables. A second migration adds the permission-seed checkpoint. A regression test creates a legacy schema, preserves an account password hash and assessment, applies migrations twice, and verifies the records remain intact.

The adoption baseline is deliberately forward-only. Its Down method refuses to drop installed user tables. Restore a verified pre-upgrade backup if rollback of the first adoption is required. Future schema changes should be ordinary reviewed EF migrations; do not edit an already-applied baseline.

Run from the repository root:

```powershell
dotnet restore ProsperaAssess.sln
dotnet run --project backend/ProsperaAssess.DbMigrator
dotnet run --project backend/ProsperaAssess.HttpApi.Host
```

Both executables retain the existing local user-secret ID. Production should supply ConnectionStrings__Default through deployment configuration. Explicit environment variables override local secrets.

Debug/development startup may migrate and seed locally using Database:Initialize. Release defaults to verification only; deploy DbMigrator before starting the host. Database:Initialize=true in the local Docker Compose setup is a development convenience, not a recommendation for production deployment.

The HTTP host keeps the executable assembly name ProsperaAssess.Api for compatibility. Its project is now ProsperaAssess.HttpApi.Host. Reopen the solution and select that project as the Visual Studio startup project after updating.

## AI state

The local proprietary AI service and its file contract remain separate from the .NET framework layers. No trained model exists yet. Uploading papers, approved memorandums and scripts, language metadata, review annotations, moderation and training-example collection remain available. This architecture refactor does not create handwriting-recognition weights or establish multilingual marking accuracy.

## Verification

The regression suite includes legacy client behaviour, allocation/organisation access, file handling, marking/moderation/approval, concurrency, direct service authorization, grant revocation persistence, aggregate invariants, cross-store rollback, audit-parameter filtering and legacy database adoption. Tests create/drop only uniquely named ProsperaAssess_Test_* databases.

Architecture references: [ABP entities](https://abp.io/docs/9.3/framework/architecture/domain-driven-design/entities), [EF Core integration](https://abp.io/docs/9.3/framework/data/entity-framework-core), [unit of work](https://abp.io/docs/9.3/framework/architecture/domain-driven-design/unit-of-work), [authorization](https://abp.io/docs/9.3/framework/fundamentals/authorization).

The host pins the previous project-root data-protection discriminator when started from the renamed HttpApi.Host directory, preserving the installed token protection purposes. Deployments with an explicitly configured older discriminator can set Authentication:DataProtectionApplicationName. Docker's existing /app content root and persisted key volume remain unchanged.

The framework/runtime upgrade retains the installed identity store. See STAGING_AND_SECURITY.md for account recovery, MFA, cookies, revocation and OpenAPI verification.
