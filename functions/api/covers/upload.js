import { fail, handleError, json } from '../../_lib/http.js';

const allowed = new Set(['image/webp', 'image/jpeg', 'image/png']);

export async function onRequestPost({ request, env }) {
  try {
    if (!env.COVERS) return fail('封面存储尚未绑定，请先配置 COVERS R2', 503, 'COVERS_UNAVAILABLE');
    const form = await request.formData(), file = form.get('file');
    if (!(file instanceof File)) return fail('请选择封面图片');
    if (!allowed.has(file.type)) return fail('封面仅支持 JPG、PNG 或 WebP');
    if (file.size > 600 * 1024) return fail('压缩后的封面不能超过 600KB');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp';
    const key = `${crypto.randomUUID()}.${extension}`;
    await env.COVERS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
    });
    return json({ key, url: `/api/covers/${key}` }, 201);
  } catch (error) { return handleError(error); }
}
