CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brochures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  cover_url TEXT,
  cover_key TEXT,
  archived_at TEXT,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brochure_id INTEGER NOT NULL REFERENCES brochures(id),
  person TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('receive','return','adjust','reverse')),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  delta INTEGER NOT NULL CHECK(delta != 0),
  reason TEXT,
  reversal_of INTEGER UNIQUE REFERENCES stock_movements(id),
  legacy_id INTEGER UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brochure_covers (
  key TEXT PRIMARY KEY,
  data BLOB NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS movement_stock_guard BEFORE INSERT ON stock_movements
WHEN NEW.legacy_id IS NULL AND NEW.delta < 0
  AND COALESCE((SELECT stock FROM brochures WHERE id=NEW.brochure_id),-1) + NEW.delta < 0
BEGIN SELECT RAISE(ABORT,'INSUFFICIENT_STOCK'); END;

CREATE TRIGGER IF NOT EXISTS movement_apply_stock AFTER INSERT ON stock_movements
WHEN NEW.legacy_id IS NULL
BEGIN
  UPDATE brochures SET stock=stock+NEW.delta,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.brochure_id;
END;

CREATE INDEX IF NOT EXISTS idx_brochures_archived ON brochures(archived_at);
CREATE INDEX IF NOT EXISTS idx_brochures_category ON brochures(category_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_movements_brochure ON stock_movements(brochure_id);
CREATE INDEX IF NOT EXISTS idx_movements_person ON stock_movements(person);
CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(movement_type);

INSERT OR IGNORE INTO categories(id,name) VALUES(1,'产品宣传册'),(2,'行业解决方案');
INSERT OR IGNORE INTO schema_migrations(version) VALUES(1),(2),(3);
