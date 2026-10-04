CREATE TABLE erp_label_records (
 business_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL,
 document_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
 updated_by_email TEXT NOT NULL, PRIMARY KEY(business_id,collection,id)
);
CREATE TABLE erp_label_history (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,
 collection TEXT NOT NULL, entity_id TEXT NOT NULL, version INTEGER NOT NULL,
 action TEXT NOT NULL, actor_email TEXT NOT NULL, at TEXT NOT NULL,
 before_json TEXT, after_json TEXT NOT NULL
);
CREATE INDEX erp_label_history_entity ON erp_label_history(business_id,collection,entity_id,sequence);
CREATE TRIGGER erp_label_records_history_insert AFTER INSERT ON erp_label_records BEGIN
 INSERT INTO erp_label_history(business_id,collection,entity_id,version,action,actor_email,at,before_json,after_json)
 VALUES(NEW.business_id,NEW.collection,NEW.id,NEW.version,'insert',NEW.updated_by_email,NEW.updated_at,NULL,NEW.document_json);
END;
CREATE TRIGGER erp_label_records_history_update AFTER UPDATE ON erp_label_records BEGIN
 INSERT INTO erp_label_history(business_id,collection,entity_id,version,action,actor_email,at,before_json,after_json)
 VALUES(NEW.business_id,NEW.collection,NEW.id,NEW.version,CASE WHEN NEW.deleted=1 THEN 'delete' ELSE 'update' END,NEW.updated_by_email,NEW.updated_at,OLD.document_json,NEW.document_json);
END;
CREATE TRIGGER erp_label_history_no_update BEFORE UPDATE ON erp_label_history BEGIN SELECT RAISE(ABORT,'Label audit history is immutable'); END;
CREATE TRIGGER erp_label_history_no_delete BEFORE DELETE ON erp_label_history BEGIN SELECT RAISE(ABORT,'Label audit history is immutable'); END;
