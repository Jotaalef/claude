import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { collectAll } from '../src/collector.js';
import { computeGrowth, sortItems, getTrends } from '../src/store.js';
import { toItem } from '../src/connectors/youtube.js';
import { nicheById } from '../src/niches.js';

const baseConfig = { youtubeApiKey: 'TEST', regionCode: 'BR', forceDemo: false, retentionDays: 30 };

// Respostas no formato da YouTube Data API v3. Views crescem a cada chamada.
function fakeYouTube() {
  let round = 0;
  const calls = [];
  const video = (id, views, extra = {}) => ({
    id,
    snippet: { title: `Vídeo ${id}`, channelTitle: 'Canal', publishedAt: '2026-10-07T10:00:00Z', thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
    statistics: { viewCount: String(views), likeCount: '10', commentCount: '2', ...extra },
  });
  const impl = async (url) => {
    const u = new URL(url);
    calls.push(u);
    let body;
    if (u.pathname.endsWith('/search')) {
      body = { items: [{ id: { videoId: 'a' } }, { id: { videoId: 'b' } }] };
    } else if (u.searchParams.get('chart') === 'mostPopular') {
      round++;
      body = { items: [video('m1', 1000 * round), video('m2', 5000 + 100 * round)] };
    } else {
      // Vídeo "b" tem curtidas ocultas e comentários desativados: campos ausentes.
      body = { items: [video('a', 100), { ...video('b', 200), statistics: { viewCount: '200' } }] };
    }
    return { ok: true, status: 200, json: async () => body };
  };
  return { impl, calls };
}

test('métricas ausentes viram null, nunca zero', () => {
  const it = toItem({ id: 'x', snippet: {}, statistics: { viewCount: '5' } });
  assert.equal(it.metrics.views, 5);
  assert.equal(it.metrics.likes, null);
  assert.equal(it.metrics.comments, null);
  assert.equal(it.metrics.shares, null);
  assert.equal(it.url, 'https://www.youtube.com/watch?v=x');
});

test('crescimento entre coletas', () => {
  const g = computeGrowth({ collected_at: '2026-10-07T12:00:00Z', views: 3000 }, { collected_at: '2026-10-07T10:00:00Z', views: 1000 });
  assert.equal(g.status, 'ok');
  assert.equal(g.viewsPerHour, 1000);
  assert.equal(g.pct, 200);
  assert.equal(computeGrowth({ collected_at: 'x', views: 1 }, null).status, 'first');
  assert.equal(computeGrowth({ collected_at: '2026-10-07T12:00:00Z', views: null }, { collected_at: '2026-10-07T10:00:00Z', views: 5 }).viewsPerHour, null);
});

test('ordenação coloca métricas ausentes no fim', () => {
  const mk = (id, vph, views) => ({ id, growth: { viewsPerHour: vph }, metrics: { views } });
  const r = sortItems([mk('a', null, 9), mk('b', 5, 1), mk('c', 50, 1)], 'growth').map((i) => i.id);
  assert.deepEqual(r, ['c', 'b', 'a']);
});

test('coleta real (YouTube simulado): chart para música, busca para humor, histórico e crescimento', async () => {
  const db = openDb(':memory:');
  const yt = fakeYouTube();
  const t1 = new Date('2026-10-07T10:00:00Z');
  const t2 = new Date('2026-10-07T12:00:00Z');
  const r1 = await collectAll(db, baseConfig, { niches: [nicheById('musica'), nicheById('humor')], fetchImpl: yt.impl, now: t1 });
  assert.equal(r1.demoMode, false);
  assert.ok(r1.results.every((r) => r.ok), JSON.stringify(r1.results));
  const search = yt.calls.find((u) => u.pathname.endsWith('/search'));
  assert.equal(search.searchParams.get('videoCategoryId'), '23');
  assert.equal(search.searchParams.get('order'), 'viewCount');

  let musica = getTrends(db, { niche: 'musica', sort: 'growth', isDemo: false });
  assert.equal(musica.items.length, 2);
  assert.ok(musica.items.every((i) => i.growth.status === 'first'));

  await collectAll(db, baseConfig, { niches: [nicheById('musica')], fetchImpl: yt.impl, now: t2 });
  musica = getTrends(db, { niche: 'musica', sort: 'growth', isDemo: false });
  // m1: 1000 → 2000 em 2h = 500/h; m2: 5100 → 5200 = 50/h
  assert.deepEqual(musica.items.map((i) => [i.id, i.growth.viewsPerHour]), [['youtube:m1', 500], ['youtube:m2', 50]]);
  assert.equal(musica.lastUpdate, t2.toISOString());
  assert.match(musica.sources[0].method, /mais populares/);

  const humor = getTrends(db, { niche: 'humor', sort: 'views', isDemo: false });
  const b = humor.items.find((i) => i.id === 'youtube:b');
  assert.equal(b.metrics.likes, null);
  assert.equal(b.metrics.comments, null);
});

test('erro da API é registrado sem quebrar outros nichos', async () => {
  const db = openDb(':memory:');
  const failing = async () => ({ ok: false, status: 403, statusText: 'Forbidden', json: async () => ({ error: { message: 'quotaExceeded' } }) });
  const r = await collectAll(db, baseConfig, { niches: [nicheById('musica')], fetchImpl: failing });
  assert.equal(r.results[0].ok, false);
  const t = getTrends(db, { niche: 'musica', sort: 'growth', isDemo: false });
  assert.equal(t.items.length, 0);
  assert.equal(t.lastAttempt.status, 'error');
  assert.match(t.lastAttempt.message, /quotaExceeded/);
});

test('API HTTP em modo demonstrativo: tendências, favoritos e histórico', async () => {
  const db = openDb(':memory:');
  const config = { ...baseConfig, youtubeApiKey: '' };
  const server = http.createServer(createApp(db, config));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p, o) => fetch(base + p, o).then(async (r) => ({ status: r.status, body: await r.json() }));
  try {
    const meta = await get('/api/meta');
    assert.equal(meta.body.demoMode, true);
    assert.deepEqual(meta.body.niches.map((n) => n.id), ['humor', 'musica', 'entretenimento']);
    assert.deepEqual(meta.body.platforms.map((p) => p.id), ['youtube', 'x', 'instagram', 'tiktok', 'kwai']);

    await get('/api/collect', { method: 'POST' });
    const t = await get('/api/trends?niche=humor');
    assert.ok(t.body.items.length > 0);
    assert.ok(t.body.items.every((i) => i.isDemo && i.title.startsWith('[DEMO]') && i.url === null));
    const kwai = t.body.items.find((i) => i.platform === 'kwai');
    assert.equal(kwai.metrics.comments, null);

    const id = t.body.items[0].id;
    assert.equal((await get(`/api/favorites/${encodeURIComponent(id)}`, { method: 'POST' })).status, 200);
    const favs = await get('/api/favorites');
    assert.deepEqual(favs.body.items.map((i) => i.id), [id]);
    await get(`/api/favorites/${encodeURIComponent(id)}`, { method: 'DELETE' });
    assert.equal((await get('/api/favorites')).body.items.length, 0);

    const h = await get(`/api/items/${encodeURIComponent(id)}/history`);
    assert.equal(h.body.snapshots.length, 1);
    assert.equal((await get('/api/trends?niche=xyz')).status, 400);
    assert.equal((await fetch(base + '/')).status, 200);
  } finally {
    server.close();
  }
});
