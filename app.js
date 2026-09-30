function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map((h, i) => i === 0 ? h.replace(/^\uFEFF/, '') : h);
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}

async function loadCSV(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} 加载失败：${response.status}`);
  return parseCSV(await response.text());
}

function formatNumber(value) { return new Intl.NumberFormat('zh-CN').format(Number(value)); }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function createPager({ rows, pageSize, body, pageLabel, prev, next, renderRow }) {
  let page = 1;
  function render() {
    const pageCount = Math.max(1, Math.ceil(rows().length / pageSize));
    page = Math.min(page, pageCount);
    const start = (page - 1) * pageSize;
    body.innerHTML = rows().slice(start, start + pageSize).map((item, i) => renderRow(item, start + i)).join('');
    pageLabel.textContent = `第 ${page} / ${pageCount} 页 · 共 ${rows().length} 条`;
    prev.disabled = page <= 1; next.disabled = page >= pageCount;
  }
  prev.addEventListener('click', () => { page--; render(); });
  next.addEventListener('click', () => { page++; render(); });
  return { render, reset() { page = 1; render(); } };
}

async function initBooks() {
  const data = await loadCSV('books.csv');
  let filtered = data;
  const search = document.querySelector('#bookSearch');
  const rating = document.querySelector('#ratingFilter');
  const pager = createPager({
    rows: () => filtered, pageSize: 20,
    body: document.querySelector('#booksBody'), pageLabel: document.querySelector('#bookPage'),
    prev: document.querySelector('#bookPrev'), next: document.querySelector('#bookNext'),
    renderRow: (b, i) => `<tr><td>${i + 1}</td><td class="title-cell">${escapeHTML(b.title)}</td><td>£${Number(b.price_gbp).toFixed(2)}</td><td><span class="stars">${'★'.repeat(Number(b.rating))}${'☆'.repeat(5 - Number(b.rating))}</span></td><td>${escapeHTML(b.stock)}</td><td><a href="${escapeHTML(b.detail_url)}" target="_blank" rel="noopener">打开 ↗</a></td></tr>`
  });
  function apply() {
    const q = search.value.trim().toLowerCase();
    filtered = data.filter(x => (!q || x.title.toLowerCase().includes(q)) && (!rating.value || x.rating === rating.value));
    pager.reset();
  }
  search.addEventListener('input', apply); rating.addEventListener('change', apply);
  document.querySelector('#booksSummary').textContent = `已载入 ${formatNumber(data.length)} 条；每页 20 条，可搜索与筛选。`;
  pager.render();
}

async function initPopulation() {
  const data = await loadCSV('population_clean.csv');
  const sorted = [...data].sort((a, b) => Number(b.population) - Number(a.population));
  const top10 = sorted.slice(0, 10);
  const max = Number(top10[0].population);
  document.querySelector('#populationChart').innerHTML = top10.map(x => `<div class="bar-row"><span>${escapeHTML(x.country)}</span><div class="bar-track"><div class="bar-fill" style="width:${(Number(x.population) / max * 100).toFixed(1)}%"></div></div><b>${(Number(x.population) / 1e8).toFixed(1)}亿</b></div>`).join('');
  document.querySelector('#populationTop10').innerHTML = top10.map((x, i) => `<tr><td>${i + 1}</td><td>${escapeHTML(x.country)}</td><td>${formatNumber(x.population)}</td><td>${x.world_share_pct ? `${x.world_share_pct}%` : '—'}</td></tr>`).join('');
  let filtered = data;
  const search = document.querySelector('#populationSearch');
  const pager = createPager({
    rows: () => filtered, pageSize: 20,
    body: document.querySelector('#populationBody'), pageLabel: document.querySelector('#populationPage'),
    prev: document.querySelector('#populationPrev'), next: document.querySelector('#populationNext'),
    renderRow: (x, i) => `<tr><td>${i + 1}</td><td>${escapeHTML(x.country)}</td><td>${formatNumber(x.population)}</td><td>${x.world_share_pct ? `${x.world_share_pct}%` : '—'}</td></tr>`
  });
  search.addEventListener('input', () => { const q = search.value.trim().toLowerCase(); filtered = data.filter(x => x.country.toLowerCase().includes(q)); pager.reset(); });
  document.querySelector('#populationSummary').textContent = `已载入 ${data.length} 条并完成类型化；每页 20 条。`;
  pager.render();
}

async function initQuotes() {
  const data = await loadCSV('quotes.csv');
  let filtered = data;
  const search = document.querySelector('#quoteSearch');
  const pager = createPager({
    rows: () => filtered, pageSize: 12,
    body: document.querySelector('#quoteWall'), pageLabel: document.querySelector('#quotePage'),
    prev: document.querySelector('#quotePrev'), next: document.querySelector('#quoteNext'),
    renderRow: x => `<article class="quote-card"><p>${escapeHTML(x.quote)}</p><span>— ${escapeHTML(x.author)}</span></article>`
  });
  search.addEventListener('input', () => { const q = search.value.trim().toLowerCase(); filtered = data.filter(x => `${x.quote} ${x.author}`.toLowerCase().includes(q)); pager.reset(); });
  document.querySelector('#quotesSummary').textContent = `已载入 ${data.length} 条，来自 ${new Set(data.map(x => x.author)).size} 位作者；每页 12 条。`;
  pager.render();
}

Promise.all([initBooks(), initPopulation(), initQuotes()]).catch(error => {
  console.error(error);
  document.querySelectorAll('.data-panel').forEach(panel => {
    if (!panel.querySelector('.error')) panel.insertAdjacentHTML('afterbegin', `<p class="error">数据载入失败：${escapeHTML(error.message)}</p>`);
  });
});
