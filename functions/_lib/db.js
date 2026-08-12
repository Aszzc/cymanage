const columnExists = async (db, table, column) => {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all();
  return result.results.some((item) => item.name === column);
};

const addColumn = async (db, table, definition) => {
  const name = definition.split(/\s+/)[0];
  if (await columnExists(db, table, name)) return;
  try { await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run(); }
  catch (error) { if (!error?.message?.toLowerCase().includes('duplicate column')) throw error; }
};

async function migrateV1(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    db.prepare('CREATE TABLE IF NOT EXISTS brochures (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, category_id INTEGER NOT NULL REFERENCES categories(id), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), cover_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
    db.prepare("INSERT OR IGNORE INTO categories(id,name) VALUES(1,'产品宣传册')"),
    db.prepare("INSERT OR IGNORE INTO categories(id,name) VALUES(2,'行业解决方案')"),
  ]);
  await addColumn(db, 'brochures', 'cover_key TEXT');
  await addColumn(db, 'brochures', 'archived_at TEXT');
  await addColumn(db, 'brochures', 'updated_at TEXT');

  await db.prepare(`CREATE TABLE IF NOT EXISTS stock_movements (
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
  )`).run();

  const legacy = await db.prepare("SELECT 1 found FROM sqlite_master WHERE type='table' AND name='operations'").first();
  if (legacy) {
    await db.prepare(`INSERT OR IGNORE INTO stock_movements(brochure_id,person,movement_type,quantity,delta,reason,legacy_id,created_at)
      SELECT brochure_id,person,operation_type,quantity,
        CASE WHEN operation_type='receive' THEN -quantity ELSE quantity END,
        '历史数据迁移',id,created_at FROM operations`).run();
  }

  await db.batch([
    db.prepare('DROP TRIGGER IF EXISTS movement_stock_guard'),
    db.prepare('DROP TRIGGER IF EXISTS movement_apply_stock'),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS movement_stock_guard BEFORE INSERT ON stock_movements
      WHEN NEW.legacy_id IS NULL AND NEW.delta < 0 AND COALESCE((SELECT stock FROM brochures WHERE id=NEW.brochure_id),-1) + NEW.delta < 0
      BEGIN SELECT RAISE(ABORT,'INSUFFICIENT_STOCK'); END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS movement_apply_stock AFTER INSERT ON stock_movements
      WHEN NEW.legacy_id IS NULL
      BEGIN UPDATE brochures SET stock=stock+NEW.delta,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.brochure_id; END`),
  ]);
}

async function migrateV2(db) {
  await db.batch([
    db.prepare('CREATE INDEX IF NOT EXISTS idx_brochures_archived ON brochures(archived_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_brochures_category ON brochures(category_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at DESC,id DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_movements_brochure ON stock_movements(brochure_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_movements_person ON stock_movements(person)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(movement_type)'),
  ]);
}

async function migrateV3(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS brochure_covers (
    key TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    content_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function getDb(env) {
  if (!env.DB) throw Object.assign(new Error('DB 资源尚未绑定'), { status: 503, code: 'BINDING_MISSING' });
  const db = env.DB;
  await db.prepare('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  const applied = new Set((await db.prepare('SELECT version FROM schema_migrations').all()).results.map((row) => row.version));
  if (!applied.has(1)) {
    await migrateV1(db);
    await db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(1)').run();
  }
  if (!applied.has(2)) {
    await migrateV2(db);
    await db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(2)').run();
  }
  if (!applied.has(3)) {
    await migrateV3(db);
    await db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES(3)').run();
  }
  return db;
}
