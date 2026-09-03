import { getDb } from '../../_lib/db.js';
import { handleError, json, readJson, text } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  try {
    const db = await getDb(env), body = await readJson(request), name = text(body.name, '分类名称', 40);
    const result = await db.prepare('INSERT INTO categories(name) VALUES(?)').bind(name).run();
    return json({ ok: true, id: result.meta.last_row_id }, 201);
  } catch (error) { return handleError(error); }
}
