const $ = (s) => document.querySelector(s);
const state = { meta: null, tab: 'humor', platform: 'all', sort: 'growth' };
const STATE_LABEL = {
  active: 'Ativa (dados reais)', demo: 'Demonstrativo', needs_credentials: 'Falta credencial',
  paid: 'Paga — aguardando aprovação', needs_review: 'Requer aprovação da Meta', unavailable: 'Sem API oficial viável',
};

const nf = new Intl.NumberFormat('pt-BR');
const cf = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const dt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Métrica ausente nunca vira zero: mostra "não disponível".
const metric = (label, v) => `<span>${label}: ${v == null ? '<i class="na">não disponível</i>' : `<b title="${nf.format(v)}">${cf.format(v)}</b>`}</span>`;
const platformLabel = (id) => (id === 'demo' ? 'Fonte demonstrativa' : state.meta?.platforms.find((p) => p.id === id)?.label || id);

function ago(iso) {
  if (!iso) return '';
  const h = (Date.now() - Date.parse(iso)) / 3600e3;
  return h < 1 ? `há ${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `há ${Math.round(h)} h` : `há ${Math.round(h / 24)} dias`;
}

function growthHtml(g) {
  if (g.status === 'first') return '<span class="na">crescimento: aguardando 2ª coleta</span>';
  if (g.status === 'unavailable') return '<span class="na">crescimento: não disponível</span>';
  const sign = g.viewsDelta >= 0 ? '+' : '';
  const pct = g.pct == null ? '' : Math.abs(g.pct) < 0.1 ? ' (<0,1%)' : ` (${sign}${g.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`;
  return `<span class="growth" title="${sign}${nf.format(g.viewsDelta)} visualizações em ${g.hours.toFixed(1)} h">${sign}${cf.format(g.viewsPerHour)} views/h${pct}</span>`;
}

function card(it, showRank = true) {
  const link = it.url
    ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>`
    : `${esc(it.title)} <span class="na">(sem link — item demonstrativo)</span>`;
  const thumb = it.thumbnail ? `<img class="thumb" src="${esc(it.thumbnail)}" alt="" loading="lazy">` : `<div class="thumb">${it.isDemo ? 'DEMO' : 'sem imagem'}</div>`;
  return `<li class="card">
    <div class="rank">${showRank ? it.rank : '★'}</div>
    ${thumb}
    <div>
      <p class="title">${link}</p>
      <div class="meta">
        <span class="badge">${esc(platformLabel(it.platform))}</span>
        ${it.isDemo ? '<span class="badge demo">DEMONSTRATIVO</span>' : ''}
        <span>${esc(it.author)}</span>
        ${it.publishedAt ? `<span>publicado ${ago(it.publishedAt)}</span>` : ''}
        <span>coletado ${dt(it.collectedAt)}</span>
      </div>
      <div class="metrics">
        ${metric('Visualizações', it.metrics.views)}
        ${metric('Curtidas', it.metrics.likes)}
        ${metric('Comentários', it.metrics.comments)}
        ${metric('Compartilhamentos', it.metrics.shares)}
        ${growthHtml(it.growth)}
      </div>
    </div>
    <div class="side">
      <button class="icon-btn ${it.favorite ? 'on' : ''}" data-fav="${esc(it.id)}" data-on="${it.favorite ? 1 : 0}">${it.favorite ? '★ Favorito' : '☆ Favoritar'}</button>
      <button class="icon-btn" data-hist="${esc(it.id)}">Histórico</button>
    </div>
  </li>`;
}

async function api(path, opts) {
  const r = await fetch(path, opts);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || r.statusText);
  return body;
}

function renderTabs() {
  const tabs = [...state.meta.niches, { id: 'favoritos', label: '★ Favoritos' }];
  $('#tabs').innerHTML = tabs.map((t) => `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === state.tab}">${esc(t.label)}</button>`).join('');
}

function renderPlatforms() {
  $('#platforms').innerHTML = state.meta.platforms.map((p) => `<li>
    <b>${esc(p.label)}</b> — <span class="state">${STATE_LABEL[p.state] || p.state}</span><br>
    ${esc(p.note)} <a href="${esc(p.docs)}" target="_blank" rel="noopener">documentação</a>
    ${p.requiredEnv?.length ? `<br><span class="na">Credenciais: ${p.requiredEnv.map((e) => `<code>${esc(e)}</code>`).join(', ')}</span>` : ''}
  </li>`).join('');
}

async function load() {
  $('#error').hidden = true;
  const fav = state.tab === 'favoritos';
  $('#toolbar').hidden = fav;
  try {
    if (fav) {
      const { items } = await api('/api/favorites');
      $('#sample-note').innerHTML = 'Favoritos mostram a última coleta de cada item. Dados com mais de 30 dias são apagados (política do YouTube), inclusive favoritos que não reaparecerem nas coletas.';
      $('#list').innerHTML = items.map((i) => card(i, false)).join('');
      $('#empty').hidden = items.length > 0;
      $('#empty').textContent = 'Nenhum favorito ainda.';
      return;
    }
    const q = new URLSearchParams({ niche: state.tab, platform: state.platform, sort: state.sort });
    const d = await api(`/api/trends?${q}`);
    const sel = $('#platform');
    const keep = state.platform;
    sel.innerHTML = '<option value="all">Todas na amostra</option>' + d.platformsInSample.map((p) => `<option value="${p}">${esc(platformLabel(p))}</option>`).join('');
    sel.value = d.platformsInSample.includes(keep) ? keep : 'all';

    $('#updated').textContent = `Última atualização: ${dt(d.lastUpdate)}`;
    const sortTxt = state.sort === 'views' ? 'visualizações totais' : 'visualizações ganhas por hora entre as duas últimas coletas';
    $('#sample-note').innerHTML = `<b>Sobre este ranking:</b> as posições refletem apenas a <b>amostra monitorada</b> (${d.sampleSize} itens), ordenada por ${sortTxt}. Não representam tudo o que está em alta na plataforma.
      <ul>${d.sources.map((s) => `<li>${esc(platformLabel(s.platform))}: ${esc(s.method)} — coletado em ${dt(s.collectedAt)}</li>`).join('')}</ul>`;
    if (d.lastAttempt?.status === 'error') {
      $('#error').hidden = false;
      $('#error').textContent = `A última coleta falhou (${dt(d.lastAttempt.started_at)}): ${d.lastAttempt.message}`;
    }
    $('#list').innerHTML = d.items.map((i) => card(i)).join('');
    $('#empty').hidden = d.items.length > 0;
    $('#empty').textContent = 'Nenhum dado coletado ainda para este nicho. Clique em "Coletar agora".';
  } catch (e) {
    $('#error').hidden = false;
    $('#error').textContent = `Erro: ${e.message}`;
  }
}

function sparkline(values) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), w = 300, h = 60;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - 4 - ((x - min) / (max - min || 1)) * (h - 8)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Evolução de visualizações"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts}"/></svg>`;
}

async function showHistory(id) {
  const d = await api(`/api/items/${encodeURIComponent(id)}/history`);
  $('#history-title').textContent = d.item.title + (d.item.isDemo ? ' (DEMONSTRATIVO)' : '');
  const n = (x) => (x == null ? '<i class="na">n/d</i>' : nf.format(x));
  $('#history-body').innerHTML = `${sparkline(d.snapshots.map((s) => s.views))}
    <table><thead><tr><th>Coleta</th><th>Posição na fonte</th><th>Visualizações</th><th>Curtidas</th><th>Comentários</th></tr></thead>
    <tbody>${d.snapshots.map((s) => `<tr><td>${dt(s.collected_at)}</td><td>${s.position}</td><td>${n(s.views)}</td><td>${n(s.likes)}</td><td>${n(s.comments)}</td></tr>`).join('')}</tbody></table>`;
  $('#history').showModal();
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.tab) { state.tab = t.dataset.tab; renderTabs(); load(); }
  if (t.dataset.fav) {
    await api(`/api/favorites/${encodeURIComponent(t.dataset.fav)}`, { method: t.dataset.on === '1' ? 'DELETE' : 'POST' });
    load();
  }
  if (t.dataset.hist) showHistory(t.dataset.hist);
});
$('#platform').addEventListener('change', (e) => { state.platform = e.target.value; load(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; load(); });
$('#collect').addEventListener('click', async () => {
  const b = $('#collect');
  b.disabled = true; b.textContent = 'Coletando…';
  try { await api('/api/collect', { method: 'POST' }); await load(); }
  catch (e) { $('#error').hidden = false; $('#error').textContent = `Erro: ${e.message}`; }
  finally { b.disabled = false; b.textContent = 'Coletar agora'; }
});

state.meta = await api('/api/meta');
$('#demo-banner').hidden = !state.meta.demoMode;
renderTabs();
renderPlatforms();
load();
