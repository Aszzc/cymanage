import { getDb } from '../../../_lib/db.js';
import { handleError, integer, json, readJson, text } from '../../../_lib/http.js';

export async function onRequestPost({ request, env, params }) {
  try {
    const db = await getDb(env), id = integer(params.id, '记录', 1), body = await readJson(request);
    const person = text(body.person, '操作人', 50), reason = text(body.reason, '撤销原因', 200);
    const original = await db.prepare('SELECT * FROM stock_movements WHERE id=?').bind(id).first();
    if (!original) return json({ error: '原记录不存在' }, 404);
    if (original.movement_type === 'reverse') throw new Error('撤销记录不能再次撤销');
    const result = await db.prepare(`INSERT INTO stock_movements(brochure_id,person,movement_type,quantity,delta,reason,reversal_of)
      VALUES(?,?,'reverse',?,?,?,?)`).bind(original.brochure_id, person, Math.abs(original.delta), -original.delta, reason, id).run();
    return json({ ok: true, id: result.meta.last_row_id }, 201);
  } catch (error) { return handleError(error); }
}
