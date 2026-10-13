-- Order-specific report references must not transfer the complete billing ledger.
CREATE INDEX IF NOT EXISTS seiko_billing_document_order ON seiko_billing_documents(json_extract(data, '$.orderId'));
CREATE INDEX IF NOT EXISTS seiko_billing_payment_order ON seiko_billing_payments(json_extract(data, '$.orderId'));
