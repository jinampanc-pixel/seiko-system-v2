-- Separate persisted registers, backed by the document's saved tax mode.
-- Existing IDs, numbering, history and payment references are preserved.
CREATE INDEX IF NOT EXISTS seiko_billing_document_tax_mode
ON seiko_billing_documents(json_extract(data, '$.taxMode'));

CREATE VIEW IF NOT EXISTS seiko_billing_gst_documents AS
SELECT * FROM seiko_billing_documents WHERE json_extract(data, '$.taxMode') = 'gst';

CREATE VIEW IF NOT EXISTS seiko_billing_non_gst_documents AS
SELECT * FROM seiko_billing_documents WHERE json_extract(data, '$.taxMode') = 'non_gst';
