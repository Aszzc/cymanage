import { getDb } from '../../_lib/db.js';
import { fail, handleError } from '../../_lib/http.js';

export async function onRequestGet({ env, params }) {
  try {
    if (!/^[a-f0-9-]+\.(webp|jpg|png)$/i.test(params.key)) return fail('无效的封面地址', 400);
    const db = await getDb(env);
    const object = await db.prepare('SELECT data,content_type FROM brochure_covers WHERE key=?').bind(params.key).first();
    if (!object) return fail('封面不存在', 404);
    const bytes = object.data instanceof ArrayBuffer ? new Uint8Array(object.data) : Uint8Array.from(object.data);
    return new Response(bytes, { headers: {
      'content-type': object.content_type,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    } });
  } catch (error) { return handleError(error); }
}

export async function onRequestDelete({ env, params }) {
  try {
    if (!/^[a-f0-9-]+\.(webp|jpg|png)$/i.test(params.key)) return fail('无效的封面地址', 400);
    const db = await getDb(env);
    const result = await db.prepare(`DELETE FROM brochure_covers
      WHERE key=? AND NOT EXISTS (SELECT 1 FROM brochures WHERE cover_key=?)`).bind(params.key, params.key).run();
    if (!result.meta.changes) {
      const referenced = await db.prepare('SELECT 1 FROM brochures WHERE cover_key=? LIMIT 1').bind(params.key).first();
      if (referenced) return fail('封面已被宣传册使用，不能删除', 409, 'COVER_IN_USE');
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch (error) { return handleError(error); }
}
