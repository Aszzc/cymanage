import { getDb } from '../../_lib/db.js';
import { handleError, integer, json, readJson, text } from '../../_lib/http.js';

export async function onRequestPatch({ request, env, params }) {
  try {
    const db = await getDb(env), id = integer(params.id, '宣传册', 1), body = await readJson(request);
    const current = await db.prepare('SELECT * FROM brochures WHERE id=?').bind(id).first();
    if (!current) return json({ error: '宣传册不存在' }, 404);
    const name = text(body.name, '宣传册名称', 80), categoryId = integer(body.categoryId, '分类', 1);
    const coverKey = body.coverKey === undefined ? current.cover_key : text(body.coverKey, '封面', 200, false) || null;
    await db.prepare('UPDATE brochures SET name=?,category_id=?,cover_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(name, categoryId, coverKey, id).run();
    if (current.cover_key && current.cover_key !== coverKey) {
      await db.prepare('DELETE FROM brochure_covers WHERE key=?').bind(current.cover_key).run();
    }
    return json({ ok: true });
  } catch (error) { return handleError(error); }
}

export async function onRequestDelete({ env, params }) {
  try {
    const db = await getDb(env), id = integer(params.id, '宣传册', 1);
    const result = await db.prepare('UPDATE brochures SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived_at IS NULL').bind(id).run();
    if (!result.meta.changes) return json({ error: '宣传册不存在或已归档' }, 404);
    return json({ ok: true });
  } catch (error) { return handleError(error); }
}
