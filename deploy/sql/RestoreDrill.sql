-- SQL Server 2022 restore drill. Target must be new, uniquely named, and disposable.
SET XACT_ABORT ON;
IF N'$(RestoreName)' NOT LIKE N'ProsperaRestoreCheck[_]%' THROW 51000,'Unsafe restore target.',1;
IF DB_ID(N'$(RestoreName)') IS NOT NULL THROW 51000,'Restore target already exists; refusing to overwrite it.',1;
CREATE TABLE #files(LogicalName nvarchar(128),PhysicalName nvarchar(260),Type char(1),FileGroupName nvarchar(128),Size numeric(20,0),MaxSize numeric(20,0),FileId bigint,CreateLSN numeric(25,0),DropLSN numeric(25,0),UniqueId uniqueidentifier,ReadOnlyLSN numeric(25,0),ReadWriteLSN numeric(25,0),BackupSizeInBytes bigint,SourceBlockSize int,FileGroupId int,LogGroupGUID uniqueidentifier,DifferentialBaseLSN numeric(25,0),DifferentialBaseGUID uniqueidentifier,IsReadOnly bit,IsPresent bit,TDEThumbprint varbinary(32),SnapshotURL nvarchar(360));
INSERT #files EXEC(N'RESTORE FILELISTONLY FROM DISK=N''$(BackupPath)''');
IF EXISTS(SELECT 1 FROM #files WHERE Type NOT IN('D','L')) THROW 51000,'Restore drill supports ordinary data/log files; ask the DBA to map other storage types.',1;
DECLARE @moves nvarchar(max)=N'',@logical nvarchar(128),@type char(1),@id bigint;
DECLARE file_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT LogicalName,Type,FileId FROM #files;
OPEN file_cursor;FETCH NEXT FROM file_cursor INTO @logical,@type,@id;
WHILE @@FETCH_STATUS=0 BEGIN
 SET @moves+=N', MOVE N'''+REPLACE(@logical,'''','''''')+N''' TO N''$(DataDirectory)$(RestoreName)_'+CONVERT(nvarchar(20),@id)+CASE WHEN @type='L' THEN N'.ldf''' ELSE N'.mdf''' END;
 FETCH NEXT FROM file_cursor INTO @logical,@type,@id;
END;
CLOSE file_cursor;DEALLOCATE file_cursor;
BEGIN TRY
 EXEC(N'RESTORE DATABASE [$(RestoreName)] FROM DISK=N''$(BackupPath)'' WITH CHECKSUM,RECOVERY'+@moves);
 DBCC CHECKDB ([$(RestoreName)]) WITH NO_INFOMSGS;
 EXEC(N'USE [$(RestoreName)]; IF OBJECT_ID(''dbo.AiScripts'') IS NULL OR OBJECT_ID(''dbo.AspNetUsers'') IS NULL THROW 51000,''Restored database does not match the application schema.'',1;');
 ALTER DATABASE [$(RestoreName)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
 DROP DATABASE [$(RestoreName)];
END TRY
BEGIN CATCH
 IF DB_ID(N'$(RestoreName)') IS NOT NULL BEGIN ALTER DATABASE [$(RestoreName)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;DROP DATABASE [$(RestoreName)];END;
 THROW;
END CATCH;
SELECT SYSUTCDATETIME() AS RestoreCheckedAt;
