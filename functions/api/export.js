import { getDb } from '../_lib/db.js';
import { handleError } from '../_lib/http.js';

const safe = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export async function onRequestGet({ env, request }) {
  try {
    const db = await getDb(env), url = new URL(request.url);
    const person = String(url.searchParams.get('person') || '').trim().slice(0, 50);
    const brochureId = Number(url.searchParams.get('brochureId') || 0), type = url.searchParams.get('type') || '';
    const where = [], binds = [];
    if (person) { where.push('m.person LIKE ?'); binds.push(`%${person}%`); }
    if (brochureId) { where.push('m.brochure_id=?'); binds.push(brochureId); }
    if (type) {
      if (!['receive','return','adjust','reverse'].includes(type)) throw new Error('无效的操作类型');
      where.push('m.movement_type=?'); binds.push(type);
    }
    const rows = await db.prepare(`SELECT m.created_at,m.person,b.name brochure,m.movement_type,m.quantity,m.delta,m.reason,m.reversal_of
      FROM stock_movements m JOIN brochures b ON b.id=m.brochure_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.created_at DESC,m.id DESC`).bind(...binds).all();
    const labels = { receive: '领取', return: '归还', adjust: '盘点调整', reverse: '撤销' };
    const lines = ['时间,姓名,宣传册,操作类型,数量,库存变化,原因,撤销原记录', ...rows.results.map((row) =>
      [row.created_at, row.person, row.brochure, labels[row.movement_type], row.quantity, row.delta, row.reason, row.reversal_of].map(safe).join(','))];
    return new Response(`\ufeff${lines.join('\r\n')}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="brochure-records-${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  } catch (error) { return handleError(error); }
}
