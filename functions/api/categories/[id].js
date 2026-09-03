import { getDb } from '../../_lib/db.js';
import { handleError, integer, json, readJson, text } from '../../_lib/http.js';

export async function onRequestPatch({ request, env, params }) {
  try {
    const db = await getDb(env), id = integer(params.id, '分类', 1), body = await readJson(request), name = text(body.name, '分类名称', 40);
    const result = await db.prepare('UPDATE categories SET name=? WHERE id=?').bind(name, id).run();
    if (!result.meta.changes) return json({ error: '分类不存在' }, 404);
    return json({ ok: true });
  } catch (error) { return handleError(error); }
}

export async function onRequestDelete({ env, params }) {
  try {
    const db = await getDb(env), id = integer(params.id, '分类', 1);
    const used = await db.prepare('SELECT COUNT(*) count FROM brochures WHERE category_id=?').bind(id).first();
    if (used.count) return json({ error: `该分类下仍有 ${used.count} 本宣传册，无法删除` }, 409);
    await db.prepare('DELETE FROM categories WHERE id=?').bind(id).run();
    return json({ ok: true });
  } catch (error) { return handleError(error); }
}
