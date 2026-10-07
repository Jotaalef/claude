import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';
import { NICHES, nicheById } from './niches.js';
import { ALL_PLATFORMS, LIVE_CONNECTORS } from './connectors/index.js';
import { collectAll, isDemoMode } from './collector.js';
import { getTrends, getFavorites, setFavorite, getHistory } from './store.js';

const STATIC = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export function createApp(db, config, { fetchImpl } = {}) {
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    try {
      if (req.method === 'GET' && STATIC[p]) {
        const file = STATIC[p];
        const body = await readFile(path.join(ROOT, 'public', file));
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] });
        return res.end(body);
      }

      if (req.method === 'GET' && p === '/api/meta') {
        return json(res, 200, {
          demoMode: isDemoMode(config),
          regionCode: config.regionCode,
          collectIntervalMinutes: config.collectIntervalMinutes,
          retentionDays: config.retentionDays,
          niches: NICHES.map(({ id, label }) => ({ id, label })),
          platforms: ALL_PLATFORMS.map((c) => ({
            id: c.id, label: c.label, docs: c.docs, requiredEnv: c.requiredEnv,
            implemented: LIVE_CONNECTORS.includes(c), ...c.status(config),
          })),
        });
      }

      if (req.method === 'GET' && p === '/api/trends') {
        const niche = url.searchParams.get('niche');
        if (!nicheById(niche)) return json(res, 400, { error: 'Nicho inválido.' });
        return json(res, 200, getTrends(db, {
          niche,
          platform: url.searchParams.get('platform') || 'all',
          sort: url.searchParams.get('sort') === 'views' ? 'views' : 'growth',
          isDemo: isDemoMode(config),
        }));
      }

      if (req.method === 'POST' && p === '/api/collect') {
        const r = await collectAll(db, config, { fetchImpl });
        return json(res, 200, r);
      }

      if (req.method === 'GET' && p === '/api/favorites') return json(res, 200, { items: getFavorites(db) });

      const fav = p.match(/^\/api\/favorites\/(.+)$/);
      if (fav && (req.method === 'POST' || req.method === 'DELETE')) {
        const ok = setFavorite(db, decodeURIComponent(fav[1]), req.method === 'POST');
        return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Item não encontrado.' });
      }

      const hist = p.match(/^\/api\/items\/(.+)\/history$/);
      if (hist && req.method === 'GET') {
        const h = getHistory(db, decodeURIComponent(hist[1]));
        return h ? json(res, 200, h) : json(res, 404, { error: 'Item não encontrado.' });
      }

      json(res, 404, { error: 'Não encontrado.' });
    } catch (e) {
      console.error(e);
      json(res, 500, { error: e.message });
    }
  };
}
