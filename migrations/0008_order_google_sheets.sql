CREATE TABLE IF NOT EXISTS seiko_google_connections (
 business_id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL,
 account_email TEXT NOT NULL, connected_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seiko_google_oauth_states (
 state TEXT PRIMARY KEY, actor_id TEXT NOT NULL, verifier TEXT NOT NULL,
 expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE IF NOT EXISTS seiko_order_sheets (
 order_id TEXT PRIMARY KEY, spreadsheet_id TEXT, spreadsheet_url TEXT, people_sheet_id INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'creating', synced_at TEXT, checked_at TEXT,
 error TEXT, lease_token TEXT, lease_until TEXT, created_by TEXT NOT NULL
);
