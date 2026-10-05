-- Sage's database (Cloudflare D1)

-- Every answer Sage can give: the starting 987, plus the ones written each night.
-- status: live (in use), pending (waiting for your approval), retired, rejected
CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  q TEXT NOT NULL,
  v TEXT NOT NULL,
  t TEXT NOT NULL,
  b TEXT,                 -- for Sage's answers: the blend it was written in
  src TEXT NOT NULL,      -- seed or grown
  status TEXT NOT NULL DEFAULT 'live',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS answers_q ON answers(q);
CREATE INDEX IF NOT EXISTS answers_status ON answers(status);

-- One rating per answer per browser. ip is a salted hash, never the address itself.
CREATE TABLE IF NOT EXISTS ratings (
  answer_id TEXT NOT NULL,
  visitor TEXT NOT NULL,
  v TEXT NOT NULL,
  stars INTEGER NOT NULL,
  ip TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (answer_id, visitor)
);
CREATE INDEX IF NOT EXISTS ratings_ip_at ON ratings(ip, at);

-- Questions visitors typed, and Sage's answers.
CREATE TABLE IF NOT EXISTS asks (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  q TEXT NOT NULL,
  a TEXT,
  b TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS asks_ip_at ON asks(ip, at);
CREATE INDEX IF NOT EXISTS asks_at ON asks(at);

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);

-- The questioners: one rolling conversation between Sage and Anti-Sage, shared by
-- everyone watching. Each row is one turn: who spoke, the question they answered (q),
-- their answer (a) and the question they asked back (nq). A dialogue starts from one
-- of the work's own questions; seq orders every turn ever written.
CREATE TABLE IF NOT EXISTS talk_turns (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  dialogue_id TEXT NOT NULL,
  n INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  b TEXT,
  q TEXT NOT NULL,
  a TEXT NOT NULL,
  nq TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS talk_turns_dialogue ON talk_turns(dialogue_id, n);
CREATE INDEX IF NOT EXISTS talk_turns_at ON talk_turns(at);

-- The creed: what Sage currently believes, one row per version (lines is a JSON list).
CREATE TABLE IF NOT EXISTS creeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lines TEXT NOT NULL,
  label TEXT,
  at INTEGER NOT NULL
);
