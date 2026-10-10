const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { categories: [], brochures: [], stats: {}, records: [], movement: 'receive', selectedMovements: new Map(), bookPage: 1, bookView: localStorage.getItem('cymanage-book-view') === 'table' ? 'table' : 'card', bookPageSize: { card: 12, table: 30 }, movementPage: 1, movementPageSize: window.matchMedia('(max-width: 700px)').matches ? 16 : 40, recordPage: 1, recordPages: 1, pendingCover: null, confirmAction: null };
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

function initPrettySelects() {
  const selectors = ['#categoryFilter', '#stockFilter', '#bookSort', '#reportCategory', '#movementCategory', '#recordBrochure', '#recordType', '#brochureCategory'];
  const widgets = [];
  const closeMenus = (except) => widgets.forEach((widget) => { if (widget !== except) widget.close(); });

  for (const selector of selectors) {
    const select = $(selector);
    if (!select || select.dataset.prettySelect) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'pretty-select';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'pretty-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || '选择');
    const menu = document.createElement('div');
    menu.className = 'pretty-select-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    menu.id = `pretty-menu-${select.id}`;
    trigger.setAttribute('aria-controls', menu.id);
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'pretty-select-search';
    const searchLabel = select.id === 'recordBrochure' ? '宣传册' : '分类';
    search.placeholder = `搜索${searchLabel}…`;
    search.setAttribute('aria-label', `搜索${searchLabel}`);
    search.hidden = select.options.length <= 8;
    const options = document.createElement('div');
    options.className = 'pretty-select-options';
    menu.append(search, options);
    select.before(wrapper);
    wrapper.append(select, trigger);
    const dialog = select.closest('dialog');
    if (dialog) {
      menu.classList.add('pretty-select-menu--dialog');
      dialog.append(menu);
    } else wrapper.append(menu);
    select.classList.add('pretty-select-native');
    wrapper.dataset.selectId = select.id;
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.dataset.prettySelect = 'true';

    const widget = {
      wrapper,
      trigger,
      menu,
      search,
      options,
      select,
      close() {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        wrapper.classList.remove('open');
        wrapper.classList.remove('invalid');
      },
      sync() {
        const searchLabel = select.id === 'recordBrochure' ? '宣传册' : '分类';
        search.hidden = select.options.length <= 8;
        search.placeholder = `搜索${searchLabel}…`;
        search.setAttribute('aria-label', `搜索${searchLabel}`);
        const selected = select.selectedOptions[0];
        const selectedLabel = selected?.textContent?.trim() || '请选择';
        const label = document.createElement('span');
        label.className = 'pretty-select-label';
        label.textContent = selectedLabel;
        trigger.replaceChildren(label);
        trigger.setAttribute('aria-label', `${select.getAttribute('aria-label') || '选择'}：${selectedLabel}`);
        options.replaceChildren();
        [...select.options].forEach((nativeOption) => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'pretty-select-option';
          option.textContent = nativeOption.textContent.trim();
          option.dataset.value = nativeOption.value;
          option.setAttribute('role', 'option');
          option.setAttribute('aria-selected', String(nativeOption.selected));
          option.disabled = nativeOption.disabled;
          option.hidden = Boolean(search.value.trim()) && !nativeOption.textContent.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());
          option.addEventListener('click', () => {
            select.value = nativeOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            widget.sync();
            widget.close();
            trigger.focus();
          });
          options.append(option);
        });
      }
    };
    widgets.push(widget);
    trigger.addEventListener('click', () => {
      const opening = menu.hidden;
      closeMenus(widget);
      if (!opening) return widget.close();
      widget.sync();
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      wrapper.classList.add('open');
      const rect = trigger.getBoundingClientRect();
      const mobileNavSpace = dialog ? 16 : window.matchMedia('(max-width: 760px)').matches ? 88 : 16;
      const footerTop = dialog?.querySelector('footer')?.getBoundingClientRect().top;
      const below = Math.min(window.innerHeight - rect.bottom - mobileNavSpace, Number.isFinite(footerTop) ? footerTop - rect.bottom - 16 : Infinity);
      const above = rect.top - 16;
      const opensUp = below < 180 && above > below + 48;
      wrapper.classList.toggle('opens-up', opensUp);
      const available = opensUp ? above : below;
      menu.style.setProperty('--pretty-options-height', `${Math.max(88, Math.min(290, available - (search.hidden ? 28 : 76)))}px`);
      if (dialog) {
        menu.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - rect.width - 10))}px`;
        menu.style.width = `${Math.min(rect.width, window.innerWidth - 20)}px`;
        menu.style.top = opensUp ? 'auto' : `${rect.bottom + 7}px`;
        menu.style.bottom = opensUp ? `${window.innerHeight - rect.top + 7}px` : 'auto';
      }
      if (!search.hidden) search.focus();
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); trigger.click(); }
    });
    search.addEventListener('input', () => widget.sync());
    search.addEventListener('keydown', (event) => { if (event.key === 'Escape') { widget.close(); trigger.focus(); } });
    menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') { widget.close(); trigger.focus(); } });
    select.addEventListener('change', () => widget.sync());
    select.addEventListener('invalid', (event) => { event.preventDefault(); wrapper.classList.add('invalid'); trigger.focus(); });
    trigger.addEventListener('focus', () => wrapper.classList.remove('invalid'));
    new MutationObserver(() => widget.sync()).observe(select, { childList: true, subtree: true, characterData: true });
    widget.sync();
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.pretty-select,.pretty-select-menu')) closeMenus();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenus(); });
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const coverUrl = (book) => book.cover_key ? `/api/covers/${encodeURIComponent(book.cover_key)}` : book.cover_url || '';
const palette = (id) => [['#0ea5e9','#2563eb'],['#8b5cf6','#e84e9a'],['#10b981','#06b6d4'],['#f59e0b','#ef4444'],['#6366f1','#22d3ee']][id % 5];
const activeBooks = () => state.brochures.filter((book) => !book.archived_at);
const storedInteger = (key, fallback) => { const stored = localStorage.getItem(key); if (stored === null || stored.trim() === '') return fallback; const value = Number(stored); return Number.isInteger(value) && value >= 0 && value <= 999999 ? value : fallback; };
const inventorySettings = () => ({ threshold: storedInteger('cymanage-report-threshold', 30), target: Math.max(1, storedInteger('cymanage-report-target', 50)) });

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
  const { threshold } = inventorySettings();
  const lowCount = activeBooks().filter((book) => book.stock < threshold).length;
  $('[data-stat="low_count"]').textContent = lowCount;
  $('#lowStockCaption').textContent = `库存低于 ${threshold} 份`;
  const categoryOptions = state.categories.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  const currentCategory = $('#categoryFilter').value;
  $('#categoryFilter').innerHTML = `<option value="">全部分类</option>${categoryOptions}`;
  $('#categoryFilter').value = currentCategory;
  const reportCategory = $('#reportCategory').value;
  $('#reportCategory').innerHTML = `<option value="">全部分类</option>${categoryOptions}`;
  $('#reportCategory').value = reportCategory;
  $('#brochureCategory').innerHTML = `<option value="">请选择分类</option>${categoryOptions}`;
  const currentMovementCategory = $('#movementCategory').value, currentRecordBook = $('#recordBrochure').value;
  $('#movementCategory').innerHTML = `<option value="">全部分类</option>${categoryOptions}`; $('#movementCategory').value = currentMovementCategory;
  $('#recordBrochure').innerHTML = `<option value="">全部宣传册</option>${state.brochures.map((book) => `<option value="${book.id}">${escapeHtml(book.name)}</option>`).join('')}`; $('#recordBrochure').value = currentRecordBook;
  for (const id of state.selectedMovements.keys()) if (!activeBooks().some((book) => book.id === id)) state.selectedMovements.delete(id);
  renderBooks(); renderCategories(); renderMovementBooks(); renderInventoryReport();
}

function renderBooks() {
  const query = $('#search').value.trim().toLowerCase(), category = $('#categoryFilter').value, stock = $('#stockFilter').value, archived = $('#showArchived').checked;
  const threshold = inventorySettings().threshold;
  const books = state.brochures.filter((book) => Boolean(book.archived_at) === archived && (!query || book.name.toLowerCase().includes(query)) && (!category || String(book.category_id) === category) && (!stock || (stock === 'low' ? book.stock < threshold : book.stock >= threshold)));
  const sort = $('#bookSort').value;
  books.sort((a, b) => sort === 'stock-asc' ? a.stock - b.stock || a.name.localeCompare(b.name, 'zh-CN') : sort === 'stock-desc' ? b.stock - a.stock || a.name.localeCompare(b.name, 'zh-CN') : a.name.localeCompare(b.name, 'zh-CN'));
  const pageSize = state.bookPageSize[state.bookView];
  const pageCount = Math.max(1, Math.ceil(books.length / pageSize));
  state.bookPage = Math.min(state.bookPage, pageCount);
  const start = (state.bookPage - 1) * pageSize, pageBooks = books.slice(start, start + pageSize);
  $('#brochureGrid').classList.toggle('hidden', state.bookView !== 'card');
  $('#bookTableWrap').classList.toggle('hidden', state.bookView !== 'table');
  $$('[data-book-view]').forEach((button) => { button.classList.toggle('active', button.dataset.bookView === state.bookView); button.setAttribute('aria-pressed', String(button.dataset.bookView === state.bookView)); });
  $('#brochureGrid').innerHTML = pageBooks.map((book) => {
    const [c1,c2] = palette(book.id), image = coverUrl(book), badge = book.archived_at ? '<span class="badge archived">已归档</span>' : book.stock < threshold ? '<span class="badge low">库存紧张</span>' : '';
    const iconButton = (action, label) => `<button data-action="${action}" data-id="${book.id}" title="${label}" aria-label="${label}">${icons[action]}</button>`;
    const actions = book.archived_at ? iconButton('restore','恢复宣传册') : iconButton('edit','编辑资料')+iconButton('archive','归档宣传册');
    return `<article class="book-card glass ${book.archived_at ? 'archived' : ''}" data-book-id="${book.id}" tabindex="0" role="button" aria-label="打开${escapeHtml(book.name)}快捷操作" style="--c1:${c1};--c2:${c2}">${badge}<div class="cover">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(book.name)}封面" loading="lazy" onerror="this.remove()">` : ''}<span class="cover-label">BROCHURE</span><strong class="cover-title">${escapeHtml(book.name)}</strong><span class="cover-category">${escapeHtml(book.category)}</span></div><div class="book-body"><div class="book-meta"><div class="stock ${book.stock < threshold ? 'low' : ''}"><strong>${book.stock}</strong> <span>份可用</span></div><div class="card-actions">${actions}</div></div></div></article>`;
  }).join('') || '<div class="empty glass">没有符合条件的宣传册</div>';
  $('#bookTableBody').innerHTML = pageBooks.map((book) => {
    const status = book.archived_at ? '<span class="badge archived">已归档</span>' : book.stock < threshold ? '<span class="badge low">库存紧张</span>' : '<span class="badge healthy">库存充足</span>';
    const actions = book.archived_at ? '<button data-action="restore" data-id="' + book.id + '">恢复</button>' : '<button data-action="edit" data-id="' + book.id + '">编辑</button><button class="delete" data-action="archive" data-id="' + book.id + '">归档</button>';
    return `<tr data-book-id="${book.id}"><td><strong>${escapeHtml(book.name)}</strong></td><td>${escapeHtml(book.category)}</td><td><strong class="${book.stock < threshold ? 'stock-low' : ''}">${book.stock}</strong> 份</td><td>${status}</td><td class="table-actions">${actions}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">没有符合条件的宣传册</td></tr>';
  $('#bookPagination').classList.toggle('hidden', books.length === 0);
  $('#bookPageControls').classList.toggle('hidden', pageCount <= 1);
  $('#bookPageInfo').textContent = books.length ? `显示 ${start + 1}–${Math.min(start + pageSize, books.length)} 项，共 ${books.length} 项 · 第 ${state.bookPage}/${pageCount} 页` : '共 0 项';
  $('#bookPrevPage').disabled = state.bookPage <= 1;
  $('#bookNextPage').disabled = state.bookPage >= pageCount;
}

function renderInventoryReport() {
  const { threshold, target } = inventorySettings();
  const categoryId = $('#reportCategory').value;
  const books = activeBooks().filter((book) => !categoryId || String(book.category_id) === categoryId);
  const categories = state.categories.filter((item) => !categoryId || String(item.id) === categoryId);
  const low = books.filter((book) => book.stock < threshold).sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, 'zh-CN'));
  $('#reportStats').innerHTML = `<article class="stat glass"><span>在册彩页</span><strong>${books.length}</strong></article><article class="stat glass"><span>库存总量</span><strong>${books.reduce((sum, book) => sum + book.stock, 0)}</strong></article><article class="stat warning glass"><span>低库存</span><strong>${low.length}</strong></article><article class="stat glass"><span>建议补货总数</span><strong>${low.reduce((sum, book) => sum + Math.max(0, target - book.stock), 0)}</strong></article>`;
  $('#categoryReportBody').innerHTML = categories.map((item) => {
    const group = books.filter((book) => book.category_id === item.id);
    return `<tr><td>${escapeHtml(item.name)}</td><td>${group.length}</td><td>${group.reduce((sum, book) => sum + book.stock, 0)}</td><td>${group.filter((book) => book.stock < threshold).length}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="empty">暂无分类数据</td></tr>';
  $('#restockCount').textContent = `（${low.length} 种）`;
  $('#restockReportBody').innerHTML = low.map((book) => `<tr><td>${escapeHtml(book.name)}</td><td>${escapeHtml(book.category)}</td><td>${book.stock}</td><td><strong>${Math.max(0, target - book.stock)}</strong></td></tr>`).join('') || '<tr><td colspan="4" class="empty">当前没有需要补货的彩页</td></tr>';
}

function renderSelectedMovements() {
  const selectedBooks = activeBooks().filter((book) => state.selectedMovements.has(book.id));
  $('#selectedMovementPanel').classList.toggle('hidden', selectedBooks.length === 0);
  $('#selectedMovementList').innerHTML = selectedBooks.map((book) => `<div class="selected-movement"><span>${escapeHtml(book.name)} <small data-selected-quantity="${book.id}">${state.selectedMovements.get(book.id) || 0} 份</small></span><button type="button" data-remove-selected="${book.id}" aria-label="移除${escapeHtml(book.name)}">移除</button></div>`).join('');
}

function renderCategories() {
  $('#categoryList').innerHTML = state.categories.map((category) => `<div class="category-row"><input value="${escapeHtml(category.name)}" maxlength="40" aria-label="分类名称"><button data-category-save="${category.id}">保存</button><button class="delete" data-category-delete="${category.id}">删除</button></div>`).join('') || '<div class="empty">暂无分类</div>';
}

function showPage(name) {
  $$('.page,.nav-item').forEach((item) => item.classList.remove('active'));
  $(`#${name}`).classList.add('active'); $(`[data-page="${name}"]`).classList.add('active');
  if (name === 'records') loadRecords();
  if (name === 'inventoryReport') renderInventoryReport();
  history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function visibleMovementBooks() {
  const query = $('#movementSearch').value.trim().toLocaleLowerCase(), category = $('#movementCategory').value;
  return activeBooks().filter((book) => (!query || book.name.toLocaleLowerCase().includes(query)) && (!category || String(book.category_id) === category));
}

function currentMovementBooks() {
  const books = visibleMovementBooks();
  const start = (state.movementPage - 1) * state.movementPageSize;
  return books.slice(start, start + state.movementPageSize);
}

function renderMovementBooks() {
  const books = visibleMovementBooks(), pageCount = Math.max(1, Math.ceil(books.length / state.movementPageSize));
  state.movementPage = Math.min(state.movementPage, pageCount);
  const start = (state.movementPage - 1) * state.movementPageSize, pageBooks = books.slice(start, start + state.movementPageSize);
  $('#movementBooks').innerHTML = pageBooks.map((book) => {
    const selected = state.selectedMovements.has(book.id), quantity = state.selectedMovements.get(book.id) ?? 1;
    const selectionDisabled = !selected && state.selectedMovements.size >= 200;
    return `<div class="batch-book-choice"><label class="batch-book-toggle"><input type="checkbox" data-movement-select="${book.id}" ${selected ? 'checked' : ''} ${selectionDisabled ? 'disabled' : ''} aria-label="选择${escapeHtml(book.name)}"><span class="batch-book-info"><strong>${escapeHtml(book.name)}</strong><small>${escapeHtml(book.category)} · 当前库存 ${book.stock} 份</small></span></label><input class="batch-book-quantity" type="number" min="1" max="999999" inputmode="numeric" value="${quantity}" data-movement-quantity="${book.id}" aria-label="${escapeHtml(book.name)}登记数量" ${selected ? '' : 'disabled'}></div>`;
  }).join('') || '<div class="batch-empty">没有符合条件的宣传册</div>';
  const selectedCount = state.selectedMovements.size;
  const allVisibleSelected = pageBooks.length > 0 && pageBooks.every((book) => state.selectedMovements.has(book.id));
  $('#selectVisible').checked = allVisibleSelected;
  $('#selectVisible').indeterminate = !allVisibleSelected && pageBooks.some((book) => state.selectedMovements.has(book.id));
  $('#selectVisible').disabled = pageBooks.length === 0;
  $('#selectVisibleLabel').textContent = `全选本页 ${pageBooks.length} 种`;
  $('#selectionCount').textContent = `已选 ${selectedCount} 种`;
  $('#jumpToSelected').classList.toggle('hidden', selectedCount === 0);
  $('#movementPagination').classList.toggle('hidden', books.length <= state.movementPageSize);
  $('#movementPageInfo').textContent = `显示 ${start + 1}–${Math.min(start + state.movementPageSize, books.length)} 项，共 ${books.length} 项 · 第 ${state.movementPage}/${pageCount} 页`;
  $('#movementPrevPage').disabled = state.movementPage <= 1;
  $('#movementNextPage').disabled = state.movementPage >= pageCount;
  renderSelectedMovements();
  updateBatchSummary();
}

function updateBatchSummary() {
  const selected = activeBooks().filter((book) => state.selectedMovements.has(book.id));
  const total = selected.reduce((sum, book) => sum + (Number(state.selectedMovements.get(book.id)) || 0), 0);
  const insufficient = state.movement === 'receive' ? selected.filter((book) => Number(state.selectedMovements.get(book.id)) > book.stock) : [];
  const invalidQuantity = selected.filter((book) => !Number.isInteger(Number(state.selectedMovements.get(book.id))) || Number(state.selectedMovements.get(book.id)) < 1 || Number(state.selectedMovements.get(book.id)) > 999999);
  $('#batchError').textContent = selected.length > 200 ? '一次最多登记 200 种，请取消部分选择后再提交' : insufficient.length ? `库存不足：${insufficient.map((book) => `${book.name}（最多 ${book.stock} 份）`).join('、')}` : invalidQuantity.length ? '请为已选宣传册填写 1 至 999999 的整数数量' : '';
  $('#batchSummary').textContent = selected.length ? `已选 ${selected.length} 种，共 ${total} 份` : '请选择宣传册并填写数量';
  $('#submitBatch').disabled = !selected.length || selected.length > 200 || Boolean(insufficient.length) || Boolean(invalidQuantity.length);
}

function updateBatchSelectionControls() {
  const books = currentMovementBooks();
  const allVisibleSelected = books.length > 0 && books.every((book) => state.selectedMovements.has(book.id));
  $('#selectVisible').checked = allVisibleSelected;
  $('#selectVisible').indeterminate = !allVisibleSelected && books.some((book) => state.selectedMovements.has(book.id));
  $('#selectVisible').disabled = books.length === 0;
  $('#selectVisibleLabel').textContent = `全选本页 ${books.length} 种`;
  $('#selectionCount').textContent = `已选 ${state.selectedMovements.size} 种`;
  $('#jumpToSelected').classList.toggle('hidden', state.selectedMovements.size === 0);
  updateBatchSummary();
}

function recordParams() {
  const params = new URLSearchParams({ page: state.recordPage });
  if ($('#recordPerson').value.trim()) params.set('person', $('#recordPerson').value.trim());
  if ($('#recordBrochure').value) params.set('brochureId', $('#recordBrochure').value);
  if ($('#recordType').value) params.set('type', $('#recordType').value);
  if ($('#recordFrom').value) params.set('from', $('#recordFrom').value);
  if ($('#recordTo').value) params.set('to', $('#recordTo').value);
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
    if (card) return `<article class="record-card"><header class="record-card-head"><span class="type-pill type-${record.movement_type}">${typeLabels[record.movement_type]}</span><time>${time}</time></header><div class="record-card-main"><h3 title="${escapeHtml(record.brochure)}">${escapeHtml(record.brochure)}</h3><strong class="record-delta ${record.delta > 0 ? 'positive' : 'negative'}">${record.delta > 0 ? '+' : ''}${record.delta} 份</strong></div><div class="record-card-meta"><p><span>登记人</span><b>${escapeHtml(record.person)}</b></p><p><span>原因</span><span class="record-reason">${escapeHtml(reason)}</span></p></div>${canReverse ? `<button class="reverse-btn" data-action="reverse" data-id="${record.id}">撤销此记录 <span aria-hidden="true">›</span></button>` : ''}</article>`;
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
['#search','#categoryFilter','#stockFilter','#showArchived'].forEach((selector) => { const filterBooks = () => { state.bookPage = 1; renderBooks(); }; $(selector).addEventListener('input', filterBooks); $(selector).addEventListener('change', filterBooks); });
$('#bookSort').onchange = () => { state.bookPage = 1; renderBooks(); };
$$('[data-book-view]').forEach((button) => button.onclick = () => { state.bookView = button.dataset.bookView; state.bookPage = 1; localStorage.setItem('cymanage-book-view', state.bookView); renderBooks(); });
$('#bookPrevPage').onclick = () => { if (state.bookPage > 1) { state.bookPage--; renderBooks(); } };
$('#bookNextPage').onclick = () => { state.bookPage++; renderBooks(); $('#manage').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('#reportCategory').onchange = renderInventoryReport;
const commitThreshold = () => {
  const value = Number($('#reportThreshold').value);
  if ($('#reportThreshold').value === '') return;
  if (!Number.isInteger(value) || value < 0 || value > 999999) { $('#reportThreshold').value = inventorySettings().threshold; return; }
  localStorage.setItem('cymanage-report-threshold', value);
  renderBooks(); renderInventoryReport();
  $('[data-stat="low_count"]').textContent = activeBooks().filter((book) => book.stock < value).length;
  $('#lowStockCaption').textContent = `库存低于 ${value} 份`;
};
let thresholdTimer;
$('#reportThreshold').oninput = () => { clearTimeout(thresholdTimer); thresholdTimer = setTimeout(commitThreshold, 450); };
$('#reportThreshold').onchange = () => { clearTimeout(thresholdTimer); commitThreshold(); };
const commitTarget = () => {
  const value = Number($('#reportTarget').value);
  if ($('#reportTarget').value === '') return;
  if (!Number.isInteger(value) || value < 1 || value > 999999) { $('#reportTarget').value = inventorySettings().target; return; }
  localStorage.setItem('cymanage-report-target', value); renderInventoryReport();
};
let targetTimer;
$('#reportTarget').oninput = () => { clearTimeout(targetTimer); targetTimer = setTimeout(commitTarget, 450); };
$('#reportTarget').onchange = () => { clearTimeout(targetTimer); commitTarget(); };
$('#exportRestockCsv').onclick = () => {
  const { threshold, target } = inventorySettings(), categoryId = $('#reportCategory').value;
  const rows = activeBooks().filter((book) => book.stock < threshold && (!categoryId || String(book.category_id) === categoryId)).sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, 'zh-CN'));
  const cell = (value) => { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  const lines = [['彩页名称','分类','当前库存','建议补货数量','库存阈值','补货目标'], ...rows.map((book) => [book.name, book.category, book.stock, Math.max(0, target - book.stock), threshold, target])].map((row) => row.map(cell).join(','));
  const url = URL.createObjectURL(new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `彩页补货清单-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$$('[data-movement]').forEach((button) => button.onclick = () => { state.movement = button.dataset.movement; $$('[data-movement]').forEach((item) => item.classList.toggle('active', item === button)); updateBatchSummary(); });
$('#person').addEventListener('input', updateBatchSummary);
$('#movementSearch').oninput = () => { state.movementPage = 1; renderMovementBooks(); };
$('#movementCategory').onchange = () => { state.movementPage = 1; renderMovementBooks(); };
$('#movementPrevPage').onclick = () => { if (state.movementPage > 1) { state.movementPage--; renderMovementBooks(); } };
$('#movementNextPage').onclick = () => { state.movementPage++; renderMovementBooks(); };
$('#selectedMovementList').onclick = (event) => {
  const button = event.target.closest('[data-remove-selected]');
  if (!button) return;
  state.selectedMovements.delete(Number(button.dataset.removeSelected));
  renderMovementBooks();
};
$('#jumpToSelected').onclick = () => {
  const panel = $('#selectedMovementPanel');
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  panel.focus({ preventScroll: true });
};
$('#selectVisible').onchange = () => {
  const books = currentMovementBooks();
  const newSelectionCount = books.filter((book) => !state.selectedMovements.has(book.id)).length;
  if ($('#selectVisible').checked && state.selectedMovements.size + newSelectionCount > 200) { $('#selectVisible').checked = false; $('#batchError').textContent = `批量登记最多 200 种，目前已选 ${state.selectedMovements.size} 种，本页还需 ${newSelectionCount} 个名额。请移除部分已选宣传册后再选。`; updateBatchSelectionControls(); return; }
  for (const book of books) {
    if ($('#selectVisible').checked) { if (!state.selectedMovements.has(book.id)) state.selectedMovements.set(book.id, 1); }
    else state.selectedMovements.delete(book.id);
  }
  renderMovementBooks();
};
$('#movementBooks').addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-movement-select]');
  if (!checkbox) return;
  const id = Number(checkbox.dataset.movementSelect);
  const quantity = $('#movementBooks').querySelector(`[data-movement-quantity="${id}"]`);
  if (checkbox.checked) state.selectedMovements.set(id, Number(quantity.value) || 1);
  else state.selectedMovements.delete(id);
  quantity.disabled = !checkbox.checked;
  updateBatchSelectionControls(); renderSelectedMovements();
});
$('#movementBooks').addEventListener('input', (event) => {
  const input = event.target.closest('[data-movement-quantity]');
  if (!input) return;
  const id = Number(input.dataset.movementQuantity), checked = state.selectedMovements.has(id);
  if (checked) state.selectedMovements.set(id, input.value === '' ? '' : Number(input.value));
  updateBatchSummary();
  const selectedQuantity = $(`[data-selected-quantity="${id}"]`);
  if (selectedQuantity) selectedQuantity.textContent = `${input.value || 0} 份`;
});
$('#applyBatchQuantity').onclick = () => {
  const quantity = Number($('#batchQuantity').value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999999) { $('#batchError').textContent = '统一数量需为 1 至 999999 的整数'; return; }
  for (const id of state.selectedMovements.keys()) state.selectedMovements.set(id, quantity);
  for (const [id, value] of state.selectedMovements) {
    const input = $('#movementBooks').querySelector(`[data-movement-quantity="${id}"]`);
    if (input) input.value = value;
  }
  updateBatchSummary(); renderSelectedMovements();
};
$('#coverFile').onchange = (event) => event.target.files[0] && chooseCover(event.target.files[0]);
['dragenter','dragover'].forEach((name) => $('#dropzone').addEventListener(name, (event) => { event.preventDefault(); $('#dropzone').classList.add('drag'); }));
['dragleave','drop'].forEach((name) => $('#dropzone').addEventListener(name, (event) => { event.preventDefault(); $('#dropzone').classList.remove('drag'); }));
$('#dropzone').addEventListener('drop', (event) => event.dataTransfer.files[0] && chooseCover(event.dataTransfer.files[0]));

function handleBookListClick(event, allowQuickOpen) {
  const button = event.target.closest('[data-action]'), card = event.target.closest('[data-book-id]');
  if (!card) return;
  const book = state.brochures.find((item) => item.id === Number(card.dataset.bookId));
  if (!book) return;
  if (!button) { if (allowQuickOpen) openQuickDialog(book); return; }
  event.stopPropagation();
  $('#quickDialog').dataset.bookId = book.id;
  if (button.dataset.action === 'adjust') openAdjust(book);
  if (button.dataset.action === 'edit') openBookDialog(book);
  if (button.dataset.action === 'archive') confirmAction({ title:'归档宣传册', text:`归档“${book.name}”后将不再出现在领取列表，历史记录会完整保留。`, action: async () => api(`/api/brochures/${book.id}`, { method:'DELETE' }) });
  if (button.dataset.action === 'restore') confirmAction({ title:'恢复宣传册', text:`确认恢复“${book.name}”？`, action: async () => api(`/api/brochures/${book.id}/restore`, { method:'POST' }) });
}
$('#brochureGrid').addEventListener('click', (event) => handleBookListClick(event, true));
$('#bookTableBody').addEventListener('click', (event) => handleBookListClick(event, false));
$('#brochureGrid').addEventListener('keydown',(event)=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('[data-action]')){event.preventDefault();const card=event.target.closest('[data-book-id]');const book=state.brochures.find((item)=>item.id===Number(card?.dataset.bookId));if(book)openQuickDialog(book);}});
$('#quickDialog').addEventListener('click',(event)=>{const button=event.target.closest('[data-quick]');if(!button)return;const book=state.brochures.find((item)=>item.id===Number($('#quickDialog').dataset.bookId));if(!book)return;if(button.dataset.quick==='receive'||button.dataset.quick==='return')openQuickMovement(button.dataset.quick);if(button.dataset.quick==='adjust')openAdjust(book);if(button.dataset.quick==='edit'){$('#quickDialog').close();openBookDialog(book);}});
$('#quickBack').onclick=()=>{$('#quickMovementForm').classList.add('hidden');$('#quickActions').classList.remove('hidden');};$('#quickQuantity').oninput=updateQuickExpected;
$('#adjustBack').onclick=()=>returnToQuick($('#adjustDialog'));$('#editBack').onclick=()=>returnToQuick($('#brochureDialog'));
$('#quickMovementForm').onsubmit=async(event)=>{event.preventDefault();const form=event.currentTarget;setBusy(form,true,'正在提交…');try{const bookId=Number($('#quickDialog').dataset.bookId),person=$('#quickPerson').value,movement=$('#quickDialog').dataset.movement;await api('/api/movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brochureId:bookId,person,type:movement,quantity:Number($('#quickQuantity').value)})});localStorage.setItem('cymanage-person',person);$('#quickDialog').close();await loadSummary(false);toast(movement==='receive'?'领用登记成功':'归还登记成功');}catch(error){toast(error.message,'error');}finally{setBusy(form,false);}};

$('#brochureForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; let uploadedCoverKey; setBusy(form, true, '正在保存…'); try { const id = $('#brochureId').value; uploadedCoverKey = await uploadCover(); const payload = { name:$('#brochureName').value, categoryId:Number($('#brochureCategory').value) }; if (!id) payload.stock = Number($('#brochureStock').value); if (uploadedCoverKey !== undefined) payload.coverKey = uploadedCoverKey; await api(id ? `/api/brochures/${id}` : '/api/brochures', { method:id ? 'PATCH':'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) }); $('#brochureDialog').close(); await loadSummary(false); toast(id ? '宣传册已更新':'宣传册已添加'); } catch (error) { if (uploadedCoverKey && error.status >= 400 && error.status < 500) { try { await api(`/api/covers/${encodeURIComponent(uploadedCoverKey)}`, { method:'DELETE' }); } catch {} } toast(error.message,'error'); } finally { setBusy(form,false); } };
$('#movementForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form,true,'正在登记…'); try { const payload = { person:$('#person').value.trim(), type:state.movement, items:[...state.selectedMovements].map(([brochureId,quantity])=>({brochureId,quantity})) }; await api('/api/movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); localStorage.setItem('cymanage-person',payload.person); state.selectedMovements.clear(); state.movementPage=1; $('#movementSearch').value=''; $('#movementCategory').value=''; renderMovementBooks(); await loadSummary(false); toast(state.movement==='receive'?'批量出库登记成功':'批量入库登记成功'); } catch(error){ $('#batchError').textContent=error.message;toast(error.message,'error'); } finally{setBusy(form,false);} };
$('#adjustForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form,true,'正在调整…'); try { const person=$('#adjustPerson').value; await api('/api/movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brochureId:Number($('#adjustBrochureId').value),person,type:'adjust',actualStock:Number($('#actualStock').value),reason:$('#adjustReason').value})}); localStorage.setItem('cymanage-person',person); $('#adjustDialog').close(); await loadSummary(false); toast('盘点库存已更新'); } catch(error){toast(error.message,'error');} finally{setBusy(form,false);} };
$('#categoryForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form,true,'添加中…'); try { await api('/api/categories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#categoryName').value})}); form.reset(); await loadSummary(false); toast('分类已添加'); } catch(error){toast(error.message,'error');} finally{setBusy(form,false);} };
$('#categoryList').onclick = async (event) => { const save=event.target.closest('[data-category-save]'),remove=event.target.closest('[data-category-delete]'); try { if(save){await api(`/api/categories/${save.dataset.categorySave}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:save.parentElement.querySelector('input').value})});await loadSummary(false);toast('分类已更新');} if(remove) confirmAction({title:'删除分类',text:'仅未被任何宣传册使用的分类可以删除。',action:async()=>api(`/api/categories/${remove.dataset.categoryDelete}`,{method:'DELETE'})}); } catch(error){toast(error.message,'error');} };
$('#records').addEventListener('click',(event)=>{const button=event.target.closest('[data-action="reverse"]');if(!button)return;confirmAction({title:'撤销库存记录',text:'撤销会自动生成一条反向流水，并回滚对应库存。',reason:true,person:true,action:async()=>api(`/api/movements/${button.dataset.id}/reverse`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({person:$('#confirmPerson').value,reason:$('#confirmReason').value})})});});
$('#confirmForm').onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; setBusy(form,true,'处理中…'); try { await state.confirmAction?.(); $('#confirmDialog').close(); await loadSummary(false); if($('#records').classList.contains('active'))await loadRecords(); toast('操作成功'); } catch(error){toast(error.message,'error');} finally{setBusy(form,false);} };
let recordTimer; ['#recordPerson','#recordBrochure','#recordType','#recordFrom','#recordTo'].forEach((selector)=>{const fn=()=>{clearTimeout(recordTimer);recordTimer=setTimeout(()=>{state.recordPage=1;loadRecords();},250)};$(selector).oninput=fn;$(selector).onchange=fn;});
$('#prevPage').onclick=()=>{if(state.recordPage>1){state.recordPage--;loadRecords();}};$('#nextPage').onclick=()=>{if(state.recordPage<state.recordPages){state.recordPage++;loadRecords();}};$('#exportCsv').onclick=()=>{const params=recordParams();params.delete('page');location.href=`/api/export?${params}`;};
$('#person').value=localStorage.getItem('cymanage-person')||'';
const savedInventorySettings = inventorySettings();
initPrettySelects();
$('#reportThreshold').value = savedInventorySettings.threshold;
$('#reportTarget').value = savedInventorySettings.target;
const initialPage=['manage','register','records','inventoryReport'].includes(location.hash.slice(1))?location.hash.slice(1):'manage';showPage(initialPage);loadSummary();
window.matchMedia('(max-width: 700px)').addEventListener('change', (event) => { state.movementPageSize = event.matches ? 16 : 40; state.movementPage = 1; renderMovementBooks(); });
