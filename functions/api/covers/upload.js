import { getDb } from '../../_lib/db.js';
import { fail, handleError, json } from '../../_lib/http.js';

const allowed = new Set(['image/webp', 'image/jpeg', 'image/png']);

export async function onRequestPost({ request, env }) {
  try {
    const db = await getDb(env);
    const form = await request.formData(), file = form.get('file');
    if (!(file instanceof File)) return fail('请选择封面图片');
    if (!allowed.has(file.type)) return fail('封面仅支持 JPG、PNG 或 WebP');
    if (file.size > 350 * 1024) return fail('压缩后的封面不能超过 350KB');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp';
    const key = `${crypto.randomUUID()}.${extension}`;
    await db.prepare('INSERT INTO brochure_covers(key,data,content_type) VALUES(?,?,?)')
      .bind(key, await file.arrayBuffer(), file.type).run();
    return json({ key, url: `/api/covers/${key}` }, 201);
  } catch (error) { return handleError(error); }
}
