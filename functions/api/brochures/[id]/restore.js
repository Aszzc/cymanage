import { getDb } from '../../../_lib/db.js';
import { handleError, integer, json } from '../../../_lib/http.js';

export async function onRequestPost({ env, params }) {
  try {
    const db = await getDb(env), id = integer(params.id, '宣传册', 1);
    const result = await db.prepare('UPDATE brochures SET archived_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived_at IS NOT NULL').bind(id).run();
    if (!result.meta.changes) return json({ error: '宣传册不存在或未归档' }, 404);
    return json({ ok: true });
  } catch (error) { return handleError(error); }
}
