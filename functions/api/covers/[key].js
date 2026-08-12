import { fail, handleError } from '../../_lib/http.js';

export async function onRequestGet({ env, params, request }) {
  try {
    if (!env.COVERS) return fail('封面存储不可用', 503, 'COVERS_UNAVAILABLE');
    if (!/^[a-f0-9-]+\.(webp|jpg|png)$/i.test(params.key)) return fail('无效的封面地址', 400);
    const object = await env.COVERS.get(params.key, { onlyIf: request.headers });
    if (!object) return fail('封面不存在', 404);
    if (!object.body) return new Response(null, { status: 304, headers: { etag: object.httpEtag } });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(object.body, { headers });
  } catch (error) { return handleError(error); }
}
