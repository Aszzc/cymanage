export async function getDb(env) {
  if (!env.DB) throw Object.assign(new Error('DB 资源尚未绑定'), { status: 503, code: 'BINDING_MISSING' });
  return env.DB;
}
