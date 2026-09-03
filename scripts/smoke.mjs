const base = process.env.CYMANAGE_URL || 'http://127.0.0.1:8788';
const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  const body = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  if (!response.ok) throw Object.assign(new Error(body.error || String(body)), { status: response.status, body });
  return body;
};
const post = (path, body, method = 'POST') => request(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const suffix = Date.now();
const category = await post('/api/categories', { name: `测试分类-${suffix}` });
const brochure = await post('/api/brochures', { name: `测试宣传册-${suffix}`, categoryId: category.id, stock: 3 });
const concurrent = await Promise.allSettled([
  post('/api/movements', { brochureId: brochure.id, person: '并发甲', type: 'receive', quantity: 2 }),
  post('/api/movements', { brochureId: brochure.id, person: '并发乙', type: 'receive', quantity: 2 }),
]);
assert(concurrent.filter((result) => result.status === 'fulfilled').length === 1, '并发领取必须仅成功一次');
assert(concurrent.filter((result) => result.status === 'rejected' && result.reason.status === 409).length === 1, '超领请求必须返回 409');
const summaryAfterReceive = await request('/api/summary');
assert(summaryAfterReceive.brochures.find((item) => item.id === brochure.id).stock === 1, '并发领取后库存应为 1');
const adjustment = await post('/api/movements', { brochureId: brochure.id, person: '盘点员', type: 'adjust', actualStock: 5, reason: '自动测试盘点' });
await post(`/api/movements/${adjustment.id}/reverse`, { person: '复核员', reason: '自动测试撤销' });
const summaryAfterReverse = await request('/api/summary');
assert(summaryAfterReverse.brochures.find((item) => item.id === brochure.id).stock === 1, '撤销盘点后应恢复原库存');
await request(`/api/brochures/${brochure.id}`, { method: 'DELETE' });
assert((await request('/api/summary')).brochures.find((item) => item.id === brochure.id).archived_at, '归档状态应生效');
await request(`/api/brochures/${brochure.id}/restore`, { method: 'POST' });
assert(!(await request('/api/summary')).brochures.find((item) => item.id === brochure.id).archived_at, '恢复状态应生效');
const records = await request(`/api/movements?page=1&brochureId=${brochure.id}`);
assert(records.total >= 3 && records.records.length <= 20, '记录分页结果不正确');
const csvResponse = await fetch(`${base}/api/export?brochureId=${brochure.id}`);
const csvBytes = new Uint8Array(await csvResponse.arrayBuffer());
const csv = new TextDecoder().decode(csvBytes);
assert(csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf, 'CSV 缺少 UTF-8 BOM');
assert(csvResponse.headers.get('content-type')?.includes('text/csv') && csv.includes('宣传册'), 'CSV 响应头或内容不正确');
console.log('Smoke test passed: concurrency, adjustment, reversal, archive, pagination and CSV.');
