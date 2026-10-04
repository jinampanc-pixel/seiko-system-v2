CREATE TABLE erp_backup_operations (
 id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL,
 actor_email TEXT NOT NULL, at TEXT NOT NULL, checksum TEXT NOT NULL,
 details_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status='verified')
);
CREATE TRIGGER erp_backup_operations_no_update BEFORE UPDATE ON erp_backup_operations BEGIN SELECT RAISE(ABORT,'Backup operations are immutable'); END;
CREATE TRIGGER erp_backup_operations_no_delete BEFORE DELETE ON erp_backup_operations BEGIN SELECT RAISE(ABORT,'Backup operations are immutable'); END;
