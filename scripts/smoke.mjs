import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.CYMANAGE_URL || 'http://127.0.0.1:8788';
const baseUrl = new URL(base);
if (!['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname)) {
  throw new Error('冒烟测试只允许连接本地服务，避免写入云端数据库');
}
const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  const body = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  if (!response.ok) throw Object.assign(new Error(body.error || String(body)), { status: response.status, body });
  return body;
};
const post = (path, body, method = 'POST') => request(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const suffix = Date.now();
const fixtureCategory = `测试分类-${suffix}`;
const fixtureBrochures = [`测试宣传册-${suffix}`, `批量测试宣传册-${suffix}`, `封面引用测试-${suffix}`, `封面共用测试-${suffix}`];
const uploadedCoverKeys = [];

async function cleanupFixtures() {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const names = fixtureBrochures.map(quote).join(',');
  const keys = (uploadedCoverKeys.length ? uploadedCoverKeys : ['']).map(quote).join(',');
  const statements = [
    `DELETE FROM stock_movements WHERE brochure_id IN (SELECT id FROM brochures WHERE name IN (${names}))`,
    `DELETE FROM brochures WHERE name IN (${names})`,
    `DELETE FROM brochure_covers WHERE key IN (${keys}) AND NOT EXISTS (SELECT 1 FROM brochures WHERE cover_key=brochure_covers.key)`,
    `DELETE FROM categories WHERE name=${quote(fixtureCategory)} AND NOT EXISTS (SELECT 1 FROM brochures WHERE category_id=categories.id)`,
  ];
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const cli = resolve(root, 'node_modules/wrangler/wrangler-dist/cli.js');
  for (const sql of statements) {
    const args = [cli, 'd1', 'execute', 'cymanage', '--local', '--command', sql];
    if (process.env.CYMANAGE_PERSIST_TO) args.push('--persist-to', resolve(process.env.CYMANAGE_PERSIST_TO));
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`清理本地冒烟测试数据失败：${result.stderr || result.stdout || result.error}`);
  }
}

try {
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
const secondBrochure = await post('/api/brochures', { name: `批量测试宣传册-${suffix}`, categoryId: category.id, stock: 5 });
await post('/api/movements', { items: [{ brochureId: brochure.id, quantity: 1 }, { brochureId: secondBrochure.id, quantity: 2 }], person: '批量登记员', type: 'receive' });
let batchSummary = await request('/api/summary');
assert(batchSummary.brochures.find((item) => item.id === brochure.id).stock === 0 && batchSummary.brochures.find((item) => item.id === secondBrochure.id).stock === 3, '批量出库应分别扣减库存');
await post('/api/movements', { items: [{ brochureId: brochure.id, quantity: 1 }, { brochureId: secondBrochure.id, quantity: 2 }], person: '批量登记员', type: 'return' });
batchSummary = await request('/api/summary');
assert(batchSummary.brochures.find((item) => item.id === brochure.id).stock === 1 && batchSummary.brochures.find((item) => item.id === secondBrochure.id).stock === 5, '批量入库应分别增加库存');
const failedBatch = await Promise.allSettled([post('/api/movements', { items: [{ brochureId: brochure.id, quantity: 2 }, { brochureId: secondBrochure.id, quantity: 2 }], person: '批量登记员', type: 'receive' })]);
assert(failedBatch[0].status === 'rejected' && failedBatch[0].reason.status === 409, '库存不足的批量出库应返回 409');
batchSummary = await request('/api/summary');
assert(batchSummary.brochures.find((item) => item.id === brochure.id).stock === 1 && batchSummary.brochures.find((item) => item.id === secondBrochure.id).stock === 5, '批量出库失败时不得产生部分库存变化');
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
const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]));
const beijingToday = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
const datedRecords = await request(`/api/movements?page=1&brochureId=${brochure.id}&from=${beijingToday}&to=${beijingToday}`);
assert(datedRecords.total >= 3, '北京时间当天的记录筛选结果不正确');
const reversedDates = await Promise.allSettled([request('/api/movements?page=1&from=2026-10-10&to=2026-10-09')]);
assert(reversedDates[0].status === 'rejected' && reversedDates[0].reason.status === 400, '开始日期晚于结束日期时必须报错');
const coverForm = new FormData();
coverForm.append('file', new Blob(['test-image'], { type: 'image/webp' }), 'test.webp');
const uploadedCoverResponse = await fetch(`${base}/api/covers/upload`, { method: 'POST', body: coverForm });
assert(uploadedCoverResponse.ok, '测试封面上传失败');
const uploadedCover = await uploadedCoverResponse.json();
uploadedCoverKeys.push(uploadedCover.key);
const coverBrochure = await post('/api/brochures', { name: `封面引用测试-${suffix}`, categoryId: category.id, stock: 0, coverKey: uploadedCover.key });
await post('/api/brochures', { name: `封面共用测试-${suffix}`, categoryId: category.id, stock: 0, coverKey: uploadedCover.key });
const referencedCoverDelete = await Promise.allSettled([request(`/api/covers/${uploadedCover.key}`, { method: 'DELETE' })]);
assert(referencedCoverDelete[0].status === 'rejected' && referencedCoverDelete[0].reason.status === 409, '已引用的封面必须拒绝删除');
assert(coverBrochure.id, '引用封面的宣传册未创建');
const replacementCoverForm = new FormData();
replacementCoverForm.append('file', new Blob(['replacement-image'], { type: 'image/webp' }), 'replacement.webp');
const replacementCoverResponse = await fetch(`${base}/api/covers/upload`, { method: 'POST', body: replacementCoverForm });
assert(replacementCoverResponse.ok, '替换封面上传失败');
const replacementCover = await replacementCoverResponse.json();
uploadedCoverKeys.push(replacementCover.key);
await post(`/api/brochures/${coverBrochure.id}`, { name: `封面引用测试-${suffix}`, categoryId: category.id, coverKey: replacementCover.key }, 'PATCH');
const sharedCoverAfterEdit = await fetch(`${base}/api/covers/${uploadedCover.key}`);
assert(sharedCoverAfterEdit.ok, '更换一本宣传册封面时不能删除其他宣传册仍引用的封面');
const orphanCoverForm = new FormData();
orphanCoverForm.append('file', new Blob(['orphan-image'], { type: 'image/webp' }), 'orphan.webp');
const orphanCoverResponse = await fetch(`${base}/api/covers/upload`, { method: 'POST', body: orphanCoverForm });
const orphanCover = await orphanCoverResponse.json();
uploadedCoverKeys.push(orphanCover.key);
await request(`/api/covers/${orphanCover.key}`, { method: 'DELETE' });
assert((await Promise.allSettled([request(`/api/covers/${orphanCover.key}`)]))[0].status === 'rejected', '未引用的封面应可清理');
const csvResponse = await fetch(`${base}/api/export?brochureId=${brochure.id}&from=${beijingToday}&to=${beijingToday}`);
const csvBytes = new Uint8Array(await csvResponse.arrayBuffer());
const csv = new TextDecoder().decode(csvBytes);
assert(csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf, 'CSV 缺少 UTF-8 BOM');
assert(csvResponse.headers.get('content-type')?.includes('text/csv') && csv.includes('宣传册'), 'CSV 响应头或内容不正确');
assert(csv.includes(`测试宣传册-${suffix}`), 'CSV 日期范围与操作记录筛选结果不一致');
console.log('Smoke test passed: concurrency, batch rollback, shared-cover protection, adjustment, reversal, archive, pagination and CSV.');
} finally {
  await cleanupFixtures();
}
