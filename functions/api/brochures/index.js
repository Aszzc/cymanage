import { getDb } from '../../_lib/db.js';
import { handleError, integer, json, readJson, text } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = await getDb(env), body = await readJson(request);
    const name = text(body.name, '宣传册名称', 80), categoryId = integer(body.categoryId, '分类', 1), stock = integer(body.stock, '初始库存');
    const category = await db.prepare('SELECT id FROM categories WHERE id=?').bind(categoryId).first();
    if (!category) throw new Error('所选分类不存在');
    const result = await db.prepare('INSERT INTO brochures(name,category_id,stock,cover_key,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)')
      .bind(name, categoryId, stock, text(body.coverKey, '封面', 200, false) || null).run();
    return json({ ok: true, id: result.meta.last_row_id }, 201);
  } catch (error) { return handleError(error); }
}
