CREATE TRIGGER erp_output_activity_no_update BEFORE UPDATE ON erp_audit_events WHEN OLD.entity_type LIKE 'output-%' BEGIN SELECT RAISE(ABORT,'Output activity is immutable'); END;
CREATE TRIGGER erp_output_activity_no_delete BEFORE DELETE ON erp_audit_events WHEN OLD.entity_type LIKE 'output-%' BEGIN SELECT RAISE(ABORT,'Output activity is immutable'); END;
