const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { categories: [], brochures: [], stats: {}, records: [], movement: 'receive', recordPage: 1, recordPages: 1, pendingCover: null, confirmAction: null };
const typeLabels = { receive: '领取', return: '归还', adjust: '盘点调整', reverse: '撤销' };

function toast(message, kind = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${kind === 'error' ? 'error' : ''}`;
  item.textContent = message;
  $('#toasts').append(item);
  setTimeout(() => item.remove(), 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || '请求失败，请稍后重试');
  return body;
}

function setBusy(form, busy, text = '处理中…') {
  const button = form.querySelector('button[type="submit"],button:not([type])');
  if (!button) return;
  if (busy) { button.dataset.label = button.textContent; button.textContent = text; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const coverUrl = (book) => book.cover_key ? `/api/covers/${encodeURIComponent(book.cover_key)}` : book.cover_url || '';
const palette = (id) => [['#0ea5e9','#2563eb'],['#8b5cf6','#e84e9a'],['#10b981','#06b6d4'],['#f59e0b','#ef4444'],['#6366f1','#22d3ee']][id % 5];
const activeBooks = () => state.brochures.filter((book) => !book.archived_at);

async function loadSummary(showLoader = true) {
  if (showLoader) { $('#loading').classList.remove('hidden'); $('#errorState').classList.add('hidden'); }
  try {
    const result = await api('/api/summary');
    Object.assign(state, result);
    renderSummary();
    $('#loading').classList.add('hidden');
  } catch (error) {
    $('#loading').classList.add('hidden'); $('#errorState').classList.remove('hidden'); $('#errorText').textContent = error.message;
  }
}

function renderSummary() {
  Object.entries(state.stats).forEach(([key, value]) => { const node = document.querySelector(`[data-stat="${key}"]`); if (node) node.textContent = value; });
  const categoryOptions = state.categories.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  const currentCategory = $('#categoryFilter').value;
  $('#categoryFilter').innerHTML = `<option value="">全部分类</option>${categoryOptions}`;
  $('#categoryFilter').value = currentCategory;
  $('#brochureCategory').innerHTML = `<option value="">请选择分类</option>${categoryOptions}`;
  const bookOptions = activeBooks().map((book) => `<option value="${book.id}">${escapeHtml(book.name)}（${book.stock}份）</option>`).join('');
  const currentMovementBook = $('#movementBrochure').value, currentRecordBook = $('#recordBrochure').value;
  $('#movementBrochure').innerHTML = `<option value="">请选择宣传册</option>${bookOptions}`; $('#movementBrochure').value = currentMovementBook;
  $('#recordBrochure').innerHTML = `<option value="">全部宣传册</option>${state.brochures.map((book) => `<option value="${book.id}">${escapeHtml(book.name)}</option>`).join('')}`; $('#recordBrochure').value = currentRecordBook;
  renderBooks(); renderCategories(); updateStockPreview();
}

function renderBooks() {
  const query = $('#search').value.trim().toLowerCase(), category = $('#categoryFilter').value, stock = $('#stockFilter').value, archived = $('#showArchived').checked;
  const books = state.brochures.filter((book) => Boolean(book.archived_at) === archived && (!query || book.name.toLowerCase().includes(query)) && (!category || String(book.category_id) === category) && (!stock || (stock === 'low' ? book.stock < 3 : book.stock >= 3)));
  $('#brochureGrid').innerHTML = books.map((book) => {
    const [c1,c2] = palette(book.id), image = coverUrl(book), badge = book.archived_at ? '<span class="badge archived">已归档</span>' : book.stock < 3 ? '<span class="badge low">库存紧张</span>' : '';
    const actions = book.archived_at ? `<button data-action="restore" data-id="${book.id}">恢复</button>` : `<button data-action="register" data-id="${book.id}">登记</button><button data-action="adjust" data-id="${book.id}">盘点</button><button data-action="edit" data-id="${book.id}">编辑</button><button data-action="archive" data-id="${book.id}">归档</button>`;
    return `<article class="book-card glass ${book.archived_at ? 'archived' : ''}" style="--c1:${c1};--c2:${c2}">${badge}<div class="cover">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(book.name)}封面" loading="lazy" onerror="this.remove()">` : ''}<span class="cover-label">BROCHURE</span><strong class="cover-title">${escapeHtml(book.name)}</strong></div><div class="book-body"><div class="book-category">${escapeHtml(book.category)}</div><div class="book-title">${escapeHtml(book.name)}</div><div class="book-meta"><div class="stock ${book.stock < 3 ? 'low' : ''}"><strong>${book.stock}</strong> <span>份可用</span></div><div class="card-actions">${actions}</div></div></div></article>`;
  }).join('') || '<div class="empty glass">没有符合条件的宣传册</div>';
}

function renderCategories() {
  $('#categoryList').innerHTML = state.categories.map((category) => `<div class="category-row"><input value="${escapeHtml(category.name)}" maxlength="40" aria-label="分类名称"><button data-category-save="${category.id}">保存</button><button class="delete" data-category-delete="${category.id}">删除</button></div>`).join('') || '<div class="empty">暂无分类</div>';
}

function showPage(name) {
  $$('.page,.nav-item').forEach((item) => item.classList.remove('active'));
  $(`#${name}`).classList.add('active'); $(`[data-page="${name}"]`).classList.add('active');
  if (name === 'records') loadRecords();
  history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStockPreview() {
  const book = state.brochures.find((item) => String(item.id) === $('#movementBrochure').value), quantity = Number($('#quantity').value || 0);
  if (!book) { $('#currentStock').textContent = '—'; $('#expectedStock').textContent = '—'; $('#stockStatus').textContent = '选择宣传册后显示库存'; $('#stockError').textContent = ''; return; }
  const expected = book.stock + (state.movement === 'receive' ? -quantity : quantity);
  $('#currentStock').textContent = `${book.stock} 份`; $('#expectedStock').textContent = `${expected} 份`;
  const invalid = state.movement === 'receive' && expected < 0;
  $('#stockError').textContent = invalid ? `库存不足，当前最多可领取 ${book.stock} 份` : '';
  $('#stockStatus').textContent = expected < 3 ? '操作后将处于库存紧张状态' : '库存数量正常';
  $('#movementForm button[type="submit"]').disabled = invalid;
}

function recordParams() {
  const params = new URLSearchParams({ page: state.recordPage });
  if ($('#recordPerson').value.trim()) params.set('person', $('#recordPerson').value.trim());
  if ($('#recordBrochure').value) params.set('brochureId', $('#recordBrochure').value);
  if ($('#recordType').value) params.set('type', $('#recordType').value);
  return params;
}

async function loadRecords() {
  try {
    const result = await api(`/api/movements?${recordParams()}`); state.records = result.records; state.recordPage = result.page; state.recordPages = result.pages;
    renderRecords(result.total);
  } catch (error) { toast(error.message, 'error'); }
}

function renderRecords(total) {
  const row = (record, card = false) => {
    const reason = record.reason || '—', time = new Date(`${record.created_at}Z`).toLocaleString('zh-CN'), canReverse = record.movement_type !== 'reverse' && !record.reversed_by;
    if (card) return `<article class="record-card"><header><span class="type-pill type-${record.movement_type}">${typeLabels[record.movement_type]}</span><small>${time}</small></header><h3>${escapeHtml(record.brochure)} · ${record.delta > 0 ? '+' : ''}${record.delta} 份</h3><p>登记人：${escapeHtml(record.person)}</p><p>原因：${escapeHtml(reason)}</p>${canReverse ? `<button class="reverse-btn" data-action="reverse" data-id="${record.id}">撤销此记录</button>` : ''}</article>`;
    return `<tr><td>${time}</td><td>${escapeHtml(record.person)}</td><td>${escapeHtml(record.brochure)}</td><td><span class="type-pill type-${record.movement_type}">${typeLabels[record.movement_type]}</span></td><td>${record.delta > 0 ? '+' : ''}${record.delta}</td><td>${escapeHtml(reason)}</td><td>${canReverse ? `<button class="reverse-btn" data-action="reverse" data-id="${record.id}">撤销</button>` : ''}</td></tr>`;
  };
  const emptyRow = '<tr><td colspan="7" class="empty">暂无匹配记录</td></tr>';
  $('#recordBody').innerHTML = state.records.length ? state.records.map((item) => row(item)).join('') : emptyRow;
  $('#recordCards').innerHTML = state.records.length ? state.records.map((item) => row(item, true)).join('') : '<div class="empty">暂无匹配记录</div>';
  $('#pageInfo').textContent = `第 ${state.recordPage} / ${state.recordPages} 页，共 ${total} 条`;
  $('#prevPage').disabled = state.recordPage <= 1; $('#nextPage').disabled = state.recordPage >= state.recordPages;
}

function openBookDialog(book = null) {
  $('#brochureForm').reset(); state.pendingCover = null; $('#coverPreview').classList.remove('visible'); $('#dropHint').classList.remove('hidden');
  $('#brochureId').value = book?.id || ''; $('#brochureDialogTitle').textContent = book ? '编辑宣传册' : '新增宣传册'; $('#brochureDialogHint').textContent = book ? 'EDIT BROCHURE' : 'NEW BROCHURE';
  $('#initialStockField').classList.toggle('hidden', Boolean(book)); $('#brochureStock').required = !book;
  if (book) { $('#brochureName').value = book.name; $('#brochureCategory').value = book.category_id; const url = coverUrl(book); if (url) { $('#coverPreview').src = url; $('#coverPreview').classList.add('visible'); $('#dropHint').classList.add('hidden'); } }
  $('#brochureDialog').showModal(); setTimeout(() => $('#brochureName').focus(), 20);
}

async function compressCover(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if (file.size > 8 * 1024 * 1024) throw new Error('原图不能超过 8MB');
  const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 540;
  const context = canvas.getContext('2d'), scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height), width = bitmap.width * scale, height = bitmap.height * scale;
  context.drawImage(bitmap, (canvas.width-width)/2, (canvas.height-height)/2, width, height); bitmap.close();
  let quality = .82, blob;
  do { blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality)); quality -= .1; } while (blob.size > 250 * 1024 && quality >= .42);
  if (!blob || blob.size > 350 * 1024) throw new Error('图片压缩失败，请换一张较小的图片');
  return new File([blob], 'cover.webp', { type: 'image/webp' });
}

async function chooseCover(file) {
  try { state.pendingCover = await compressCover(file); $('#coverPreview').src = URL.createObjectURL(state.pendingCover); $('#coverPreview').classList.add('visible'); $('#dropHint').classList.add('hidden'); }
  catch (error) { toast(error.message, 'error'); }
}

async function uploadCover() {
  if (!state.pendingCover) return undefined;
  const form = new FormData(); form.append('file', state.pendingCover);
  return (await api('/api/covers/upload', { method: 'POST', body: form })).key;
}

function confirmAction({ title, text, reason = false, person = false, action }) {
  $('#confirmTitle').textContent = title; $('#confirmText').textContent = text; $('#confirmReasonField').classList.toggle('hidden', !reason); $('#confirmPersonField').classList.toggle('hidden', !person);
  $('#confirmReason').required = reason; $('#confirmPerson').required = person; $('#confirmReason').value = ''; $('#confirmPerson').value = localStorage.getItem('cymanage-person') || '';
  state.confirmAction = action; $('#confirmDialog').showModal();
}

$$('.nav-item').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));
$$('[data-open]').forEach((button) => button.addEventListener('click', () => button.dataset.open === 'brochureDialog' ? openBookDialog() : $(`#${button.dataset.open}`).showModal()));
$$('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) event.preventDefault(); }));
$('#retry').onclick = () => loadSummary();
['#search','#categoryFilter','#stockFilter','#showArchived'].forEach((selector) => { $(selector).addEventListener('input', renderBooks); $(selector).addEventListener('change', renderBooks); });
$$('[data-movement]').forEach((button) => button.onclick = () => { state.movement = button.dataset.movement; $$('[data-movement]').forEach((item) => item.classList.toggle('active', item === button)); updateStockPreview(); });
$('#movementBrochure').onchange = updateStockPreview; $('#quantity').oninput = updateStockPreview; $$('[data-qty]').forEach((button) => button.onclick = () => { $('#quantity').value = button.dataset.qty; updateStockPreview(); });
$('#coverFile').onchange = (event) => event.target.files[0] && chooseCover(event.target.files[0]);
['dragenter','dragover'].forEach((name) => $('#dropzone').addEventListener(name, (event) => { event.preventDefault(); $('#dropzone').classList.add('drag'); }));
['dragleave','drop'].forEach((name) => $('#dropzone').addEventListener(name, (event) => { event.preventDefault(); $('#dropzone').classList.remove('drag'); }));
$('#dropzone').addEventListener('drop', (event) => event.dataTransfer.files[0] && chooseCover(event.dataTransfer.files[0]));

$('#brochureGrid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]'); if (!button) return; const book = state.brochures.find((item) => item.id === Number(button.dataset.id));
  if (button.dataset.action === 'register') { showPage('register'); $('#movementBrochure').value = book.id; updateStockPreview(); }
  if (button.dataset.action === 'adjust') { $('#adjustBrochureId').value = book.id; $('#adjustBookName').textContent = `${book.name} · 当前库存 ${book.stock} 份`; $('#actualStock').value = book.stock; $('#adjustPerson').value = localStorage.getItem('cymanage-person') || ''; $('#adjustDialog').showModal(); }
  if (button.dataset.action === 'edit') openBookDialog(book);
  if (button.dataset.action === 'archive') confirmAction({ title:'归档宣传册', text:`归档“${book.name}”后将不再出现在领取列表，历史记录会完整保留。`, action: async () => api(`/api/brochures/${book.id}`, { method:'DELETE' }) });
  if (button.dataset.action === 'restore') confirmAction({ title:'恢复宣传册', text:`确认恢复“${book.name}”？`, action: async () => api(`/api/brochures/${book.id}/restore`, { method:'POST' }) });
});

$('#brochureForm').onsubmit = async (event) => { event.preventDefault(); setBusy(event.currentTarget, true, '正在保存…'); try { const id = $('#brochureId').value, coverKey = await uploadCover(), payload = { name:$('#brochureName').value, categoryId:Number($('#brochureCategory').value) }; if (!id) payload.stock = Number($('#brochureStock').value); if (coverKey !== undefined) payload.coverKey = coverKey; await api(id ? `/api/brochures/${id}` : '/api/brochures', { method:id ? 'PATCH':'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) }); $('#brochureDialog').close(); await loadSummary(false); toast(id ? '宣传册已更新':'宣传册已添加'); } catch (error) { toast(error.message,'error'); } finally { setBusy(event.currentTarget,false); } };
$('#movementForm').onsubmit = async (event) => { event.preventDefault(); setBusy(event.currentTarget,true,'正在登记…'); try { const person=$('#person').value; await api('/api/movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brochureId:Number($('#movementBrochure').value),person,type:state.movement,quantity:Number($('#quantity').value)})}); localStorage.setItem('cymanage-person',person); $('#quantity').value=1; await loadSummary(false); toast('库存登记成功'); } catch(error){toast(error.message,'error');} finally{setBusy(event.currentTarget,false);} };
$('#adjustForm').onsubmit = async (event) => { event.preventDefault(); setBusy(event.currentTarget,true,'正在调整…'); try { const person=$('#adjustPerson').value; await api('/api/movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brochureId:Number($('#adjustBrochureId').value),person,type:'adjust',actualStock:Number($('#actualStock').value),reason:$('#adjustReason').value})}); localStorage.setItem('cymanage-person',person); $('#adjustDialog').close(); await loadSummary(false); toast('盘点库存已更新'); } catch(error){toast(error.message,'error');} finally{setBusy(event.currentTarget,false);} };
$('#categoryForm').onsubmit = async (event) => { event.preventDefault(); setBusy(event.currentTarget,true,'添加中…'); try { await api('/api/categories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#categoryName').value})}); event.currentTarget.reset(); await loadSummary(false); toast('分类已添加'); } catch(error){toast(error.message,'error');} finally{setBusy(event.currentTarget,false);} };
$('#categoryList').onclick = async (event) => { const save=event.target.closest('[data-category-save]'),remove=event.target.closest('[data-category-delete]'); try { if(save){await api(`/api/categories/${save.dataset.categorySave}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:save.parentElement.querySelector('input').value})});await loadSummary(false);toast('分类已更新');} if(remove) confirmAction({title:'删除分类',text:'仅未被任何宣传册使用的分类可以删除。',action:async()=>api(`/api/categories/${remove.dataset.categoryDelete}`,{method:'DELETE'})}); } catch(error){toast(error.message,'error');} };
$('#records').addEventListener('click',(event)=>{const button=event.target.closest('[data-action="reverse"]');if(!button)return;confirmAction({title:'撤销库存记录',text:'撤销会自动生成一条反向流水，并回滚对应库存。',reason:true,person:true,action:async()=>api(`/api/movements/${button.dataset.id}/reverse`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({person:$('#confirmPerson').value,reason:$('#confirmReason').value})})});});
$('#confirmForm').onsubmit = async (event) => { event.preventDefault(); setBusy(event.currentTarget,true,'处理中…'); try { await state.confirmAction?.(); $('#confirmDialog').close(); await loadSummary(false); if($('#records').classList.contains('active'))await loadRecords(); toast('操作成功'); } catch(error){toast(error.message,'error');} finally{setBusy(event.currentTarget,false);} };
let recordTimer; ['#recordPerson','#recordBrochure','#recordType'].forEach((selector)=>{const fn=()=>{clearTimeout(recordTimer);recordTimer=setTimeout(()=>{state.recordPage=1;loadRecords();},250)};$(selector).oninput=fn;$(selector).onchange=fn;});
$('#prevPage').onclick=()=>{if(state.recordPage>1){state.recordPage--;loadRecords();}};$('#nextPage').onclick=()=>{if(state.recordPage<state.recordPages){state.recordPage++;loadRecords();}};$('#exportCsv').onclick=()=>{const params=recordParams();params.delete('page');location.href=`/api/export?${params}`;};
$('#person').value=localStorage.getItem('cymanage-person')||'';
const initialPage=['manage','register','records'].includes(location.hash.slice(1))?location.hash.slice(1):'manage';showPage(initialPage);loadSummary();
