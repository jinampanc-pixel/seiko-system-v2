-- Additive assistant state only. No existing business rows are changed.
CREATE TABLE IF NOT EXISTS erp_assistant_messages (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, business_id TEXT NOT NULL, user_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')),
 content TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS erp_assistant_conversation ON erp_assistant_messages(business_id,user_id,conversation_id,created_at);
CREATE TABLE IF NOT EXISTS erp_assistant_proposals (
 id TEXT PRIMARY KEY, business_id TEXT NOT NULL, user_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL, tool TEXT NOT NULL, payload TEXT NOT NULL,
 review TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', result TEXT,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS erp_assistant_memories (
 id TEXT PRIMARY KEY, business_id TEXT NOT NULL, user_id TEXT NOT NULL,
 content TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS erp_assistant_memory_owner ON erp_assistant_memories(business_id,user_id);
CREATE TABLE IF NOT EXISTS erp_assistant_budget (
 day TEXT PRIMARY KEY, reserved_neurons INTEGER NOT NULL DEFAULT 0
);
