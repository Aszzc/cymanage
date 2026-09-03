import { getDb } from '../../_lib/db.js';
import { handleError, integer, json, readJson, text } from '../../_lib/http.js';

export async function onRequestGet({ env, request }) {
  try {
    const db = await getDb(env), url = new URL(request.url);
    const page = integer(url.searchParams.get('page') || 1, '页码', 1, 100000), size = 20;
    const person = text(url.searchParams.get('person'), '姓名', 50, false), brochureId = Number(url.searchParams.get('brochureId') || 0), type = url.searchParams.get('type') || '';
    const where = [], binds = [];
    if (person) { where.push('m.person LIKE ?'); binds.push(`%${person}%`); }
    if (brochureId) { where.push('m.brochure_id=?'); binds.push(brochureId); }
    if (type) { if (!['receive','return','adjust','reverse'].includes(type)) throw new Error('无效的操作类型'); where.push('m.movement_type=?'); binds.push(type); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await db.prepare(`SELECT COUNT(*) count FROM stock_movements m ${clause}`).bind(...binds).first();
    const rows = await db.prepare(`SELECT m.*,b.name brochure,original.id original_id,
      (SELECT id FROM stock_movements reversal WHERE reversal.reversal_of=m.id) reversed_by
      FROM stock_movements m JOIN brochures b ON b.id=m.brochure_id
      LEFT JOIN stock_movements original ON original.id=m.reversal_of
      ${clause} ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`).bind(...binds, size, (page-1)*size).all();
    return json({ records: rows.results, page, pages: Math.max(1, Math.ceil(count.count/size)), total: count.count });
  } catch (error) { return handleError(error); }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = await getDb(env), body = await readJson(request), brochureId = integer(body.brochureId, '宣传册', 1);
    const person = text(body.person, '登记人姓名', 50), movementType = String(body.type || '');
    const brochure = await db.prepare('SELECT stock,archived_at FROM brochures WHERE id=?').bind(brochureId).first();
    if (!brochure || brochure.archived_at) throw new Error('宣传册不存在或已归档');
    let quantity, delta, reason = null;
    if (movementType === 'receive' || movementType === 'return') {
      quantity = integer(body.quantity, '数量', 1); delta = movementType === 'receive' ? -quantity : quantity;
    } else if (movementType === 'adjust') {
      const actual = integer(body.actualStock, '实际库存'); reason = text(body.reason, '调整原因', 200);
      delta = actual - brochure.stock; if (!delta) throw new Error('实际库存与当前库存一致，无需调整'); quantity = Math.abs(delta);
    } else throw new Error('无效的操作类型');
    const result = await db.prepare('INSERT INTO stock_movements(brochure_id,person,movement_type,quantity,delta,reason) VALUES(?,?,?,?,?,?)')
      .bind(brochureId, person, movementType, quantity, delta, reason).run();
    return json({ ok: true, id: result.meta.last_row_id, stock: brochure.stock + delta }, 201);
  } catch (error) { return handleError(error); }
}
