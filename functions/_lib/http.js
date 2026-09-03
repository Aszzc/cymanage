export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

export const fail = (message, status = 400, code = 'BAD_REQUEST') =>
  json({ error: message, code }, status);

export async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('请求格式必须为 JSON'), { status: 415, code: 'INVALID_CONTENT_TYPE' });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('请求内容不是有效的 JSON'), { status: 400, code: 'INVALID_JSON' });
  }
}

export const text = (value, name, max = 100, required = true) => {
  const result = String(value ?? '').trim();
  if (required && !result) throw new Error(`请填写${name}`);
  if (result.length > max) throw new Error(`${name}不能超过 ${max} 个字符`);
  return result;
};

export const integer = (value, name, min = 0, max = 999999) => {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new Error(`${name}必须是 ${min} 至 ${max} 之间的整数`);
  }
  return result;
};

export function handleError(error) {
  console.error(error);
  if (error?.message?.includes('INSUFFICIENT_STOCK')) return fail('库存不足，请刷新后重试', 409, 'INSUFFICIENT_STOCK');
  if (error?.message?.includes('UNIQUE')) return fail('名称已存在或该记录已撤销', 409, 'CONFLICT');
  if (error?.message?.includes('FOREIGN KEY')) return fail('关联的数据不存在', 409, 'INVALID_REFERENCE');
  return fail(error?.message || '服务器处理失败，请稍后重试', error?.status || 400, error?.code || 'BAD_REQUEST');
}

export function requireBindings(env, names = ['DB']) {
  for (const name of names) {
    if (!env[name]) throw Object.assign(new Error(`${name} 资源尚未绑定`), { status: 503, code: 'BINDING_MISSING' });
  }
}
