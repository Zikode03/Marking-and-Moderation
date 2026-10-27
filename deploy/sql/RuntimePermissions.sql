-- Run as a DBA in the already migrated production database.
-- Provision the SQL login or managed identity through your hosting secret system first.
-- This script deliberately contains no password and does not create or drop a database.
SET XACT_ABORT ON;
IF DB_NAME() IN ('master', 'model', 'msdb', 'tempdb') THROW 51000, 'Select the Prospera application database first.', 1;
IF CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) LIKE '%Developer%' THROW 51000, 'Developer edition is for development only.', 1;
IF SUSER_ID(N'prospera_runtime') IS NULL THROW 51000, 'Have the DBA create the prospera_runtime login first.', 1;
IF DATABASE_PRINCIPAL_ID(N'prospera_runtime') IS NULL CREATE USER [prospera_runtime] FOR LOGIN [prospera_runtime];
ALTER ROLE [db_datareader] ADD MEMBER [prospera_runtime];
ALTER ROLE [db_datawriter] ADD MEMBER [prospera_runtime];
IF IS_ROLEMEMBER('db_owner','prospera_runtime') = 1 THROW 51000, 'Remove db_owner membership from the runtime identity.', 1;
-- Supply a different, deployment-only connection for DbMigrator.
