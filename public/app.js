const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { categories: [], brochures: [], stats: {}, records: [], movement: 'receive', selectedMovements: new Map(), recordPage: 1, recordPages: 1, pendingCover: null, confirmAction: null };
const typeLabels = { receive: '领取', return: '归还', adjust: '盘点调整', reverse: '撤销' };
const icons = {
  register: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"/></svg>',
  adjust: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M10 14v6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20ZM14 7l3 3"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4V7Zm-1-3h18v3H3V4Zm6 8h6"/></svg>',
  restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2L4 8m0-5v5h5"/></svg>'
};

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
  if (!response.ok) throw Object.assign(new Error(body?.error || '请求失败，请稍后重试'), { status: response.status, code: body?.code });
  return body;
}

function setBusy(form, busy, text = '处理中…') {
  const button = form.querySelector('button[type="submit"],button:not([type])');
  if (!button) return;
  if (busy) { button.dataset.label = button.textContent; button.textContent = text; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; delete button.dataset.label; }
}

function resetFormButton(form) {
  const button = form.querySelector('button[type="submit"],button:not([type])');
  if (!button) return;
  button.disabled = false;
  button.textContent = button.dataset.label || button.textContent;
  delete button.dataset.label;
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
  const currentMovementCategory = $('#movementCategory').value, currentRecordBook = $('#recordBrochure').value;
  $('#movementCategory').innerHTML = `<option value="">全部分类</option>${categoryOptions}`; $('#movementCategory').value = currentMovementCategory;
  $('#recordBrochure').innerHTML = `<option value="">全部宣传册</option>${state.brochures.map((book) => `<option value="${book.id}">${escapeHtml(book.name)}</option>`).join('')}`; $('#recordBrochure').value = currentRecordBook;
  for (const id of state.selectedMovements.keys()) if (!activeBooks().some((book) => book.id === id)) state.selectedMovements.delete(id);
  renderBooks(); renderCategories(); renderMovementBooks();
}

function renderBooks() {
  const query = $('#search').value.trim().toLowerCase(), category = $('#categoryFilter').value, stock = $('#stockFilter').value, archived = $('#showArchived').checked;
  const books = state.brochures.filter((book) => Boolean(book.archived_at) === archived && (!query || book.name.toLowerCase().includes(query)) && (!category || String(book.category_id) === category) && (!stock || (stock === 'low' ? book.stock < 3 : book.stock >= 3)));
  $('#brochureGrid').innerHTML = books.map((book) => {
    const [c1,c2] = palette(book.id), image = coverUrl(book), badge = book.archived_at ? '<span class="badge archived">已归档</span>' : book.stock < 3 ? '<span class="badge low">库存紧张</span>' : '';
    const iconButton = (action, label) => `<button data-action="${action}" data-id="${book.id}" title="${label}" aria-label="${label}">${icons[action]}</button>`;
    const actions = book.archived_at ? iconButton('restore','恢复宣传册') : iconButton('edit','编辑资料')+iconButton('archive','归档宣传册');
    return `<article class="book-card glass ${book.archived_at ? 'archived' : ''}" data-book-id="${book.id}" tabindex="0" role="button" aria-label="打开${escapeHtml(book.name)}快捷操作" style="--c1:${c1};--c2:${c2}">${badge}<div class="cover">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(book.name)}封面" loading="lazy" onerror="this.remove()">` : ''}<span class="cover-label">BROCHURE</span><strong class="cover-title">${escapeHtml(book.name)}</strong><span class="cover-category">${escapeHtml(book.category)}</span></div><div class="book-body"><div class="book-meta"><div class="stock ${book.stock < 3 ? 'low' : ''}"><strong>${book.stock}</strong> <span>份可用</span></div><div class="card-actions">${actions}</div></div></div></article>`;
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

function visibleMovementBooks() {
  const query = $('#movementSearch').value.trim().toLocaleLowerCase(), category = $('#movementCategory').value;
  return activeBooks().filter((book) => (!query || book.name.toLocaleLowerCase().includes(query)) && (!category || String(book.category_id) === category));
}

function renderMovementBooks() {
  const books = visibleMovementBooks();
  $('#movementBooks').innerHTML = books.map((book) => {
    const selected = state.selectedMovements.has(book.id), quantity = state.selectedMovements.get(book.id) ?? 1;
    return `<div class="batch-book-choice"><label class="batch-book-toggle"><input type="checkbox" data-movement-select="${book.id}" ${selected ? 'checked' : ''} aria-label="选择${escapeHtml(book.name)}"><span class="batch-book-info"><strong>${escapeHtml(book.name)}</strong><small>${escapeHtml(book.category)} · 当前库存 ${book.stock} 份</small></span></label><input class="batch-book-quantity" type="number" min="1" max="999999" inputmode="numeric" value="${quantity}" data-movement-quantity="${book.id}" aria-label="${escapeHtml(book.name)}登记数量" ${selected ? '' : 'disabled'}></div>`;
  }).join('') || '<div class="batch-empty">没有符合条件的宣传册</div>';
  const selectedCount = state.selectedMovements.size;
  const allVisibleSelected = books.length > 0 && books.every((book) => state.selectedMovements.has(book.id));
  $('#selectVisible').checked = allVisibleSelected;
  $('#selectVisible').indeterminate = !allVisibleSelected && books.some((book) => state.selectedMovements.has(book.id));
  $('#selectionCount').textContent = `已选 ${selectedCount} 种`;
  updateBatchSummary();
}

function updateBatchSummary() {
  const selected = activeBooks().filter((book) => state.selectedMovements.has(book.id));
  const total = selected.reduce((sum, book) => sum + (Number(state.selectedMovements.get(book.id)) || 0), 0);
  const insufficient = state.movement === 'receive' ? selected.filter((book) => Number(state.selectedMovements.get(book.id)) > book.stock) : [];
  const invalidQuantity = selected.filter((book) => !Number.isInteger(Number(state.selectedMovements.get(book.id))) || Number(state.selectedMovements.get(book.id)) < 1 || Number(state.selectedMovements.get(book.id)) > 999999);
  $('#batchError').textContent = insufficient.length ? `库存不足：${insufficient.map((book) => `${book.name}（最多 ${book.stock} 份）`).join('、')}` : invalidQuantity.length ? '请为已选宣传册填写 1 至 999999 的整数数量' : '';
  $('#batchSummary').textContent = selected.length ? `已选 ${selected.length} 种，共 ${total} 份` : '请选择宣传册并填写数量';
  $('#submitBatch').disabled = !selected.length || Boolean(insufficient.length) || Boolean(invalidQuantity.length);
}

function updateBatchSelectionControls() {
  const books = visibleMovementBooks();
  const allVisibleSelected = books.length > 0 && books.every((book) => state.selectedMovements.has(book.id));
  $('#selectVisible').checked = allVisibleSelected;
  $('#selectVisible').indeterminate = !allVisibleSelected && books.some((book) => state.selectedMovements.has(book.id));
  $('#selectionCount').textContent = `已选 ${state.selectedMovements.size} 种`;
  updateBatchSummary();
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
  $('#brochureForm').reset(); resetFormButton($('#brochureForm')); state.pendingCover = null; $('#coverPreview').classList.remove('visible'); $('#dropHint').classList.remove('hidden');
  $('#brochureId').value = book?.id || ''; $('#brochureDialogTitle').textContent = book ? '编辑宣传册' : '新增宣传册'; $('#brochureDialogHint').textContent = book ? 'EDIT BROCHURE' : 'NEW BROCHURE';
  $('#initialStockField').classList.toggle('hidden', Boolean(book)); $('#brochureStock').required = !book;
  $('#editBack').classList.toggle('hidden', !book || $('#quickDialog').dataset.bookId !== String(book.id));
  if (book) { $('#brochureName').value = book.name; $('#brochureCategory').value = book.category_id; const url = coverUrl(book); if (url) { $('#coverPreview').src = url; $('#coverPreview').classList.add('visible'); $('#dropHint').classList.add('hidden'); } }
  $('#brochureDialog').showModal(); setTimeout(() => $('#brochureName').focus(), 20);
}

function openQuickDialog(book) {
  if (book.archived_at) return;
  $('#quickDialog').dataset.bookId = book.id;
  $('#quickBookName').textContent = book.name;
  $('#quickBookStock').textContent = `${book.stock} 份`;
  $('#quickActions').classList.remove('hidden'); $('#quickMovementForm').classList.add('hidden');
  $('#quickDialog').showModal();
}

function openQuickMovement(movement) {
  $('#quickDialog').dataset.movement = movement;
  $('#quickActions').classList.add('hidden'); $('#quickMovementForm').classList.remove('hidden');
  resetFormButton($('#quickMovementForm'));
  $('#quickModeTitle').textContent = movement === 'receive' ? '领用登记' : '归还登记';
  $('#quickModeHint').textContent = movement === 'receive' ? '登记领出数量' : '登记归还数量';
  $('#quickModeIcon').textContent = movement === 'receive' ? '↗' : '↙';
  $('#quickPerson').value = localStorage.getItem('cymanage-person') || '';
  $('#quickQuantity').value = 1; updateQuickExpected(); setTimeout(() => $('#quickPerson').focus(), 30);
}

function updateQuickExpected() {
  const book = state.brochures.find((item) => item.id === Number($('#quickDialog').dataset.bookId));
  if (!book) return; const quantity = Number($('#quickQuantity').value || 0), movement = $('#quickDialog').dataset.movement;
  const expected = book.stock + (movement === 'receive' ? -quantity : quantity), invalid = movement === 'receive' && expected < 0;
  $('#quickExpected').textContent = `${expected} 份`; $('#quickError').textContent = invalid ? `库存不足，最多可领取 ${book.stock} 份` : '';
  $('#quickMovementForm button[type="submit"]').disabled = invalid;
}

function openAdjust(book) {
  $('#quickDialog').close(); $('#adjustBrochureId').value = book.id; $('#adjustBookName').textContent = `${book.name} · 当前库存 ${book.stock} 份`; $('#actualStock').value = book.stock; $('#adjustPerson').value = localStorage.getItem('cymanage-person') || ''; resetFormButton($('#adjustForm')); $('#adjustDialog').showModal();
}

function returnToQuick(dialog) {
  const book = state.brochures.find((item) => item.id === Number($('#quickDialog').dataset.bookId));
  dialog.close(); if (book) openQuickDialog(book);
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
$$('[data-movement]').forEach((button) => button.onclick = () => { state.movement = button.dataset.movement; $$('[data-movement]').forEach((item) => item.classList.toggle('active', item === button)); updateBatchSummary(); });
$('#person').addEventListener('input', updateBatchSummary);
$('#movementSearch').oninput = renderMovementBooks;
$('#movementCategory').onchange = renderMovementBooks;
$('#selectVisible').onchange = () => { for (const book of visibleMovementBooks()) { const checkbox = $('#movementBooks').querySelector(`[data-movement-select="${book.id}"]`), quantity = $('#movementBooks').querySelector(`[data-movement-quantity="${book.id}"]`); if ($('#selectVisible').checked) { if (!state.selectedMovements.has(book.id)) state.selectedMovements.set(book.id, 1); checkbox.checked = true; quantity.value = state.selectedMovements.get(book.id); quantity.disabled = false; } else { state.selectedMovements.delete(book.id); checkbox.checked = false; quantity.disabled = true; } } updateBatchSelectionControls(); };
$('#movementBooks').addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-movement-select]');
  if (!checkbox) return;
  const id = Number(checkbox.dataset.movementSelect);
  const quantity = $('#movementBooks').querySelector(`[data-movement-quantity="${id}"]`);
  if (checkbox.checked) state.selectedMovements.set(id, Number(quantity.value) || 1);
  else state.selectedMovements.delete(id);
  quantity.disabled = !checkbox.checked;
  updateBatchSelectionControls();
});
$('#movementBooks').addEventListener('input', (event) => {
  const input = event.target.closest('[data-movement-quantity]');
  if (!input) return;
  const id = Number(input.dataset.movementQuantity), checked = state.selectedMovements.has(id);
  if (checked) state.selectedMovements.set(id, input.value === '' ? '' : Number(input.value));
  updateBatchSummary();
});
$('#applyBatchQuantity').onclick = () => {
  const quantity = Number($('#batchQuantity').value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999999) { $('#batchError').textContent = '统一数量需为 1 至 999999 的整数'; return; }
  for (const id of state.selectedMovements.keys()) state.selectedMovements.set(id, quantity);
  for (const [id, value] of state.selectedMovements) {
    const input = $('#movementBooks').querySelector(`[data-movement-quantity="${id}"]`);
    if (input) input.value = value;
  }
  updateBatchSummary();
};
$('#coverFile').onchange = (event) => event.target.files[0] && chooseCover(event.target.files[0]);
['dragenter','dragover'].forEach((name) => $('#dropzone').addEventListener(name, (event) => { event.preventDefault(); $('#dropzone').classList.add('drag'); }));
['dragleave','drop'].forEach((name) => $('#dropzone').addEventListener(name, (event) => { event.preventDefault(); $('#dropzone').classList.remove('drag'); }));
$('#dropzone').addEventListener('drop', (event) => event.dataTransfer.files[0] && chooseCover(event.dataTransfer.files[0]));

$('#brochureGrid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]'), card = event.target.closest('[data-book-id]');
  if (!card) return; const book = state.brochures.find((item) => item.id === Number(card.dataset.bookId));
  if (!button) return openQuickDialog(book);
  event.stopPropagation();
  $('#quickDialog').dataset.bookId = book.id;
  if (button.dataset.action === 'register') openQuickDialog(book);
  if (button.dataset.action === 'adjust') openAdjust(book);
  if (button.dataset.action === 'edit') openBookDialog(book);
  if (button.dataset.action === 'archive') confirmAction({ title:'归档宣传册', text:`归档“${book.name}”后将不再出现在领取列表，历史记录会完整保留。`, action: async () => api(`/api/brochures/${book.id}`, { method:'DELETE' }) });
  if (button.dataset.action === 'restore') confirmAction({ title:'恢复宣传册', text:`确认恢复“${book.name}”？`, action: async () => api(`/api/brochures/${book.id}/restore`, { method:'POST' }) });
});
$('#brochureGrid').addEventListener('keydown',(event)=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('[data-action]')){event.preventDefault();const card=event.target.closest('[data-book-id]');const book=state.brochures.find((item)=>item.id===Number(card?.dataset.bookId));if(book)openQuickDialog(book);}});
$('#quickDialog').addEventListener('click',(event)=>{const button=event.target.closest('[data-quick]');if(!button)return;const book=state.brochures.find((item)=>item.id===Number($('#quickDialog').dataset.bookId));if(!book)return;if(button.dataset.quick==='receive'||button.dataset.quick==='return')openQuickMovement(button.dataset.quick);if(button.dataset.quick==='adjust')openAdjust(book);if(button.dataset.quick==='edit'){$('#quickDialog').close();openBookDialog(book);}});
$('#quickBack').onclick=()=>{$('#quickMovementForm').classList.add('hidden');$('#quickActions').classList.remove('hidden');};$('#quickQuantity').oninput=updateQuickExpected;
$('#adjustBack').onclick=()=>returnToQuick($('#adjustDialog'));$('#editBack').onclick=()=>returnToQuick($('#brochureDialog'));
$('#quickMovementForm').onsubmit=async(event)=>{event.preventDefault();const form=event.currentTarget;setBusy(form,true,'正在提交…');try{const bookId=Number($('#quickDialog').dataset.bookId),person=$('#quickPerson').value,movement=$('#quickDialog').dataset.movement;await api('/api/movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brochureId:bookId,person,type:movement,quantity:Number($('#quickQuantity').value)})});localStorage.setItem('cymanage-person',person);$('#quickDialog').close();await loadSummary(false);toast(movement==='receive'?'领用登记成功':'归还登记成功');}catch(error){toast(error.message,'error');}finally{setBusy(form,false);}};

$('#brochureForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; let uploadedCoverKey; setBusy(form, true, '正在保存…'); try { const id = $('#brochureId').value; uploadedCoverKey = await uploadCover(); const payload = { name:$('#brochureName').value, categoryId:Number($('#brochureCategory').value) }; if (!id) payload.stock = Number($('#brochureStock').value); if (uploadedCoverKey !== undefined) payload.coverKey = uploadedCoverKey; await api(id ? `/api/brochures/${id}` : '/api/brochures', { method:id ? 'PATCH':'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) }); $('#brochureDialog').close(); await loadSummary(false); toast(id ? '宣传册已更新':'宣传册已添加'); } catch (error) { if (uploadedCoverKey && error.status >= 400 && error.status < 500) { try { await api(`/api/covers/${encodeURIComponent(uploadedCoverKey)}`, { method:'DELETE' }); } catch {} } toast(error.message,'error'); } finally { setBusy(form,false); } };
$('#movementForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form,true,'正在登记…'); try { const payload = { person:$('#person').value.trim(), type:state.movement, items:[...state.selectedMovements].map(([brochureId,quantity])=>({brochureId,quantity})) }; await api('/api/movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); localStorage.setItem('cymanage-person',payload.person); state.selectedMovements.clear(); $('#movementSearch').value=''; $('#movementCategory').value=''; renderMovementBooks(); await loadSummary(false); toast(state.movement==='receive'?'批量出库登记成功':'批量入库登记成功'); } catch(error){ $('#batchError').textContent=error.message;toast(error.message,'error'); } finally{setBusy(form,false);} };
$('#adjustForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form,true,'正在调整…'); try { const person=$('#adjustPerson').value; await api('/api/movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brochureId:Number($('#adjustBrochureId').value),person,type:'adjust',actualStock:Number($('#actualStock').value),reason:$('#adjustReason').value})}); localStorage.setItem('cymanage-person',person); $('#adjustDialog').close(); await loadSummary(false); toast('盘点库存已更新'); } catch(error){toast(error.message,'error');} finally{setBusy(form,false);} };
$('#categoryForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form,true,'添加中…'); try { await api('/api/categories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#categoryName').value})}); form.reset(); await loadSummary(false); toast('分类已添加'); } catch(error){toast(error.message,'error');} finally{setBusy(form,false);} };
$('#categoryList').onclick = async (event) => { const save=event.target.closest('[data-category-save]'),remove=event.target.closest('[data-category-delete]'); try { if(save){await api(`/api/categories/${save.dataset.categorySave}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:save.parentElement.querySelector('input').value})});await loadSummary(false);toast('分类已更新');} if(remove) confirmAction({title:'删除分类',text:'仅未被任何宣传册使用的分类可以删除。',action:async()=>api(`/api/categories/${remove.dataset.categoryDelete}`,{method:'DELETE'})}); } catch(error){toast(error.message,'error');} };
$('#records').addEventListener('click',(event)=>{const button=event.target.closest('[data-action="reverse"]');if(!button)return;confirmAction({title:'撤销库存记录',text:'撤销会自动生成一条反向流水，并回滚对应库存。',reason:true,person:true,action:async()=>api(`/api/movements/${button.dataset.id}/reverse`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({person:$('#confirmPerson').value,reason:$('#confirmReason').value})})});});
$('#confirmForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form,true,'处理中…'); try { await state.confirmAction?.(); $('#confirmDialog').close(); await loadSummary(false); if($('#records').classList.contains('active'))await loadRecords(); toast('操作成功'); } catch(error){toast(error.message,'error');} finally{setBusy(form,false);} };
let recordTimer; ['#recordPerson','#recordBrochure','#recordType'].forEach((selector)=>{const fn=()=>{clearTimeout(recordTimer);recordTimer=setTimeout(()=>{state.recordPage=1;loadRecords();},250)};$(selector).oninput=fn;$(selector).onchange=fn;});
$('#prevPage').onclick=()=>{if(state.recordPage>1){state.recordPage--;loadRecords();}};$('#nextPage').onclick=()=>{if(state.recordPage<state.recordPages){state.recordPage++;loadRecords();}};$('#exportCsv').onclick=()=>{const params=recordParams();params.delete('page');location.href=`/api/export?${params}`;};
$('#person').value=localStorage.getItem('cymanage-person')||'';
const initialPage=['manage','register','records'].includes(location.hash.slice(1))?location.hash.slice(1):'manage';showPage(initialPage);loadSummary();
