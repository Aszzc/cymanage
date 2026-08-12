const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (message, status = 400) => json({ error: message }, status);

async function ensureSchema(db) {
  await db.batch([
    db.prepare(
      'CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
    ),
    db.prepare(
      'CREATE TABLE IF NOT EXISTS brochures (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, category_id INTEGER NOT NULL REFERENCES categories(id), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), cover_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS operations (id INTEGER PRIMARY KEY AUTOINCREMENT, brochure_id INTEGER NOT NULL REFERENCES brochures(id), person TEXT NOT NULL, operation_type TEXT NOT NULL CHECK(operation_type IN ('receive', 'return')), quantity INTEGER NOT NULL CHECK(quantity > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ),
    db.prepare("INSERT OR IGNORE INTO categories (id, name) VALUES (1, '\u4ea7\u54c1\u5ba3\u4f20\u518c')"),
    db.prepare("INSERT OR IGNORE INTO categories (id, name) VALUES (2, '\u884c\u4e1a\u89e3\u51b3\u65b9\u6848')"),
  ]);
  const columns = await db.prepare('PRAGMA table_info(brochures)').all();
  if (!columns.results.some((column) => column.name === 'cover_url')) {
    await db.prepare('ALTER TABLE brochures ADD COLUMN cover_url TEXT').run();
  }
}

export async function onRequestGet({ env }) {
  const db = env.DB;
  if (!db) return fail('\u0044\u0031 \u6570\u636e\u5e93\u672a\u7ed1\u5b9a\uff0c\u8bf7\u5728 \u0050\u0061\u0067\u0065\u0073 \u91cc\u7ed1\u5b9a \u0044\u0042', 500);
  await ensureSchema(db);

  const [categories, brochures, records] = await Promise.all([
    db.prepare('SELECT * FROM categories ORDER BY name').all(),
    db
      .prepare(
        'SELECT b.id,b.name,b.stock,b.cover_url,b.category_id,c.name category FROM brochures b JOIN categories c ON c.id=b.category_id ORDER BY b.name'
      )
      .all(),
    db
      .prepare(
        'SELECT o.id,o.person,o.operation_type,o.quantity,o.created_at,b.name brochure FROM operations o JOIN brochures b ON b.id=o.brochure_id ORDER BY o.id DESC'
      )
      .all(),
  ]);

  return json({
    categories: categories.results,
    brochures: brochures.results,
    records: records.results,
  });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return fail('\u0044\u0031 \u6570\u636e\u5e93\u672a\u7ed1\u5b9a\uff0c\u8bf7\u5728 \u0050\u0061\u0067\u0065\u0073 \u91cc\u7ed1\u5b9a \u0044\u0042', 500);
  await ensureSchema(db);

  const body = await request.json();

  try {
    if (body.action === 'category') {
      const name = String(body.name || '').trim();
      if (!name) return fail('\u8bf7\u8f93\u5165\u5206\u7c7b\u540d\u79f0');
      await db.prepare('INSERT INTO categories(name) VALUES(?)').bind(name).run();
    } else if (body.action === 'deleteCategory') {
      const used = await db.prepare('SELECT 1 FROM brochures WHERE category_id=?').bind(body.id).first();
      if (used) return fail('\u8be5\u5206\u7c7b\u4e0b\u4ecd\u6709\u5ba3\u4f20\u518c\uff0c\u65e0\u6cd5\u5220\u9664');
      await db.prepare('DELETE FROM categories WHERE id=?').bind(body.id).run();
    } else if (body.action === 'brochure') {
      const name = String(body.name || '').trim();
      const stock = Number(body.stock);
      if (!name || !body.categoryId || !Number.isInteger(stock) || stock < 0) {
        return fail('\u8bf7\u5b8c\u6574\u586b\u5199\u5ba3\u4f20\u518c\u4fe1\u606f');
      }
      await db
        .prepare('INSERT INTO brochures(name,category_id,stock,cover_url) VALUES(?,?,?,?)')
        .bind(name, body.categoryId, stock, String(body.coverUrl || '').trim() || null)
        .run();
    } else if (body.action === 'deleteBrochure') {
      await db.prepare('DELETE FROM operations WHERE brochure_id=?').bind(body.id).run();
      await db.prepare('DELETE FROM brochures WHERE id=?').bind(body.id).run();
    } else if (body.action === 'operation') {
      const person = String(body.person || '').trim();
      const qty = Number(body.quantity);
      if (!person || !body.brochureId || !Number.isInteger(qty) || qty < 1) {
        return fail('\u8bf7\u5b8c\u6574\u586b\u5199\u767b\u8bb0\u4fe1\u606f');
      }

      const brochure = await db.prepare('SELECT stock FROM brochures WHERE id=?').bind(body.brochureId).first();
      if (!brochure) return fail('\u5ba3\u4f20\u518c\u4e0d\u5b58\u5728', 404);
      if (body.type === 'receive' && qty > brochure.stock) {
        return fail(`\u5e93\u5b58\u4e0d\u8db3\uff0c\u5f53\u524d\u4ec5\u5269 ${brochure.stock} \u4efd`);
      }

      const delta = body.type === 'receive' ? -qty : qty;
      await db.batch([
        db.prepare('UPDATE brochures SET stock=stock+? WHERE id=?').bind(delta, body.brochureId),
        db
          .prepare('INSERT INTO operations(brochure_id,person,operation_type,quantity) VALUES(?,?,?,?)')
          .bind(body.brochureId, person, body.type, qty),
      ]);
    } else {
      return fail('\u672a\u77e5\u64cd\u4f5c');
    }

    return json({ ok: true });
  } catch (error) {
    const message = error?.message?.includes('UNIQUE') ? '\u540d\u79f0\u5df2\u5b58\u5728' : '\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5';
    return fail(message);
  }
}
