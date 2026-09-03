import { getDb } from '../_lib/db.js';
import { handleError, json } from '../_lib/http.js';

export async function onRequestGet({ env }) {
  try {
    const db = await getDb(env);
    const [categories, brochures, stats] = await Promise.all([
      db.prepare('SELECT id,name FROM categories ORDER BY name').all(),
      db.prepare(`SELECT b.id,b.name,b.stock,b.category_id,b.cover_key,b.cover_url,b.archived_at,c.name category
        FROM brochures b JOIN categories c ON c.id=b.category_id ORDER BY b.archived_at IS NOT NULL,b.name`).all(),
      db.prepare(`SELECT
        (SELECT COUNT(*) FROM brochures WHERE archived_at IS NULL) brochure_count,
        (SELECT COALESCE(SUM(stock),0) FROM brochures WHERE archived_at IS NULL) total_stock,
        (SELECT COUNT(*) FROM brochures WHERE archived_at IS NULL AND stock<3) low_count,
        (SELECT COUNT(*) FROM stock_movements WHERE date(created_at,'+8 hours')=date('now','+8 hours')) today_count`).first(),
    ]);
    return json({ categories: categories.results, brochures: brochures.results, stats });
  } catch (error) { return handleError(error); }
}
