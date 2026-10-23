-- Serialize billing reconciliation per order across different review bases.
-- Financial documents and the lock claim are written in the same D1 batch.
CREATE TABLE IF NOT EXISTS seiko_order_billing_locks (
  order_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  token TEXT NOT NULL
);
