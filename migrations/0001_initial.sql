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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brochure_id INTEGER NOT NULL REFERENCES brochures(id),
  person TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('receive', 'return')),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO categories (id, name) VALUES (1, '产品宣传册'), (2, '行业解决方案');
INSERT OR IGNORE INTO brochures (name, category_id, stock) VALUES
  ('企业品牌宣传册', 1, 18), ('智能制造解决方案', 2, 2), ('云服务产品手册', 1, 8);
