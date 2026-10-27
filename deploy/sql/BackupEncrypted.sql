-- Execute with sqlcmd after validating variables in Backup-Sql.ps1.
SET XACT_ABORT ON;
IF DB_ID(N'$(Database)') IS NULL THROW 51000, 'Application database not found.', 1;
IF NOT EXISTS(SELECT 1 FROM master.sys.certificates WHERE name=N'$(Certificate)') THROW 51000, 'Provision and securely escrow the backup certificate and private key first.', 1;
BACKUP DATABASE [$(Database)] TO DISK=N'$(BackupPath)'
WITH COPY_ONLY, CHECKSUM, COMPRESSION,
ENCRYPTION(ALGORITHM=AES_256, SERVER CERTIFICATE=[$(Certificate)]);
RESTORE VERIFYONLY FROM DISK=N'$(BackupPath)' WITH CHECKSUM;
SELECT SYSUTCDATETIME() AS BackupVerifiedAt, N'$(Database)' AS DatabaseName;
