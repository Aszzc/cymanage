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
