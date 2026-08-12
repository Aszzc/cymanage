import type { APIRoute } from 'astro';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;
  const [categories, brochures, records] = await Promise.all([
    db.prepare('SELECT * FROM categories ORDER BY name').all(),
    db.prepare(`SELECT b.id,b.name,b.stock,b.category_id, c.name category FROM brochures b JOIN categories c ON c.id=b.category_id ORDER BY b.name`).all(),
    db.prepare(`SELECT o.id,o.person,o.operation_type,o.quantity,o.created_at,b.name brochure FROM operations o JOIN brochures b ON b.id=o.brochure_id ORDER BY o.id DESC`).all(),
  ]);
  return json({ categories: categories.results, brochures: brochures.results, records: records.results });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.runtime.env.DB;
  const body = await request.json();
  try {
    if (body.action === 'category') {
      if (!String(body.name || '').trim()) return fail('请输入分类名称');
      await db.prepare('INSERT INTO categories(name) VALUES(?)').bind(body.name.trim()).run();
    } else if (body.action === 'deleteCategory') {
      const used = await db.prepare('SELECT 1 FROM brochures WHERE category_id=?').bind(body.id).first();
      if (used) return fail('该分类下仍有宣传册，无法删除');
      await db.prepare('DELETE FROM categories WHERE id=?').bind(body.id).run();
    } else if (body.action === 'brochure') {
      if (!String(body.name || '').trim() || !body.categoryId || !Number.isInteger(Number(body.stock)) || Number(body.stock) < 0) return fail('请完整填写宣传册信息');
      await db.prepare('INSERT INTO brochures(name,category_id,stock) VALUES(?,?,?)').bind(body.name.trim(), body.categoryId, Number(body.stock)).run();
    } else if (body.action === 'deleteBrochure') {
      await db.prepare('DELETE FROM operations WHERE brochure_id=?').bind(body.id).run();
      await db.prepare('DELETE FROM brochures WHERE id=?').bind(body.id).run();
    } else if (body.action === 'operation') {
      const qty = Number(body.quantity);
      if (!String(body.person || '').trim() || !body.brochureId || !Number.isInteger(qty) || qty < 1) return fail('请完整填写登记信息');
      const brochure = await db.prepare('SELECT stock FROM brochures WHERE id=?').bind(body.brochureId).first<{stock:number}>();
      if (!brochure) return fail('宣传册不存在', 404);
      if (body.type === 'receive' && qty > brochure.stock) return fail(`库存不足，当前仅剩 ${brochure.stock} 份`);
      const delta = body.type === 'receive' ? -qty : qty;
      await db.batch([
        db.prepare('UPDATE brochures SET stock=stock+? WHERE id=?').bind(delta, body.brochureId),
        db.prepare('INSERT INTO operations(brochure_id,person,operation_type,quantity) VALUES(?,?,?,?)').bind(body.brochureId, body.person.trim(), body.type, qty),
      ]);
    } else return fail('未知操作');
    return json({ ok: true });
  } catch (e: any) { return fail(e.message?.includes('UNIQUE') ? '名称已存在' : '保存失败，请稍后重试'); }
};
