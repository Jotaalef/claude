import { tx } from './db.js';

const nowIso = (d = new Date()) => d.toISOString();

export function startCollection(db, { platform, niche, isDemo, at }) {
  const r = db
    .prepare('INSERT INTO collections (platform, niche, started_at, status, is_demo) VALUES (?, ?, ?, ?, ?)')
    .run(platform, niche, nowIso(at), 'running', isDemo ? 1 : 0);
  return Number(r.lastInsertRowid);
}

export function failCollection(db, id, message) {
  db.prepare("UPDATE collections SET status='error', finished_at=?, message=? WHERE id=?").run(nowIso(), message, id);
}

export function saveCollection(db, collectionId, { method, items, isDemo, defaultPlatform, at }) {
  const ts = nowIso(at);
  const upsertItem = db.prepare(`
    INSERT INTO items (id, platform, external_id, title, author, url, thumbnail, published_at, is_demo, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, author=excluded.author, url=excluded.url,
      thumbnail=excluded.thumbnail, published_at=excluded.published_at, last_seen=excluded.last_seen`);
  const insSnap = db.prepare(`
    INSERT OR REPLACE INTO snapshots (collection_id, item_id, collected_at, position, views, likes, comments, shares)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  tx(db, () => {
    items.forEach((it, i) => {
      const platform = it.platform || defaultPlatform;
      const itemId = `${platform}:${it.externalId}`;
      upsertItem.run(itemId, platform, it.externalId, it.title, it.author, it.url, it.thumbnail, it.publishedAt,
        isDemo ? 1 : 0, ts, ts);
      const m = it.metrics || {};
      insSnap.run(collectionId, itemId, ts, i + 1, m.views ?? null, m.likes ?? null, m.comments ?? null, m.shares ?? null);
    });
    db.prepare("UPDATE collections SET status='ok', finished_at=?, method=?, item_count=? WHERE id=?")
      .run(ts, method, items.length, collectionId);
  });
}

// Remove dados com mais de `days` dias (política de armazenamento do YouTube).
export function purgeOld(db, days, now = new Date()) {
  const cutoff = nowIso(new Date(now.getTime() - days * 86400e3));
  tx(db, () => {
    db.prepare('DELETE FROM collections WHERE started_at < ?').run(cutoff);
    db.prepare('DELETE FROM items WHERE id NOT IN (SELECT DISTINCT item_id FROM snapshots)').run();
  });
}

// Última coleta bem-sucedida de cada fonte para o nicho.
function latestCollections(db, niche, isDemo) {
  return db.prepare(`
    SELECT c.* FROM collections c
    WHERE c.niche = ? AND c.is_demo = ? AND c.status = 'ok'
      AND c.id = (SELECT MAX(id) FROM collections c2
                  WHERE c2.niche = c.niche AND c2.platform = c.platform AND c2.is_demo = c.is_demo AND c2.status = 'ok')
  `).all(niche, isDemo ? 1 : 0);
}

export function lastAttempt(db, niche, isDemo) {
  return db.prepare('SELECT * FROM collections WHERE niche = ? AND is_demo = ? ORDER BY id DESC LIMIT 1')
    .get(niche, isDemo ? 1 : 0) ?? null;
}

// Crescimento entre a coleta atual e a anterior em que o item apareceu.
// Retorna null quando não há coleta anterior ou quando a métrica não está disponível.
export function computeGrowth(cur, prev) {
  if (!prev) return { status: 'first', viewsPerHour: null, viewsDelta: null, pct: null, hours: null, since: null };
  const hours = (Date.parse(cur.collected_at) - Date.parse(prev.collected_at)) / 3600e3;
  if (cur.views == null || prev.views == null || hours <= 0) {
    return { status: 'unavailable', viewsPerHour: null, viewsDelta: null, pct: null, hours, since: prev.collected_at };
  }
  const delta = cur.views - prev.views;
  return {
    status: 'ok',
    viewsDelta: delta,
    viewsPerHour: delta / hours,
    pct: prev.views > 0 ? (delta / prev.views) * 100 : null,
    hours,
    since: prev.collected_at,
  };
}

const ITEM_SELECT = `
  SELECT i.*, s.collected_at, s.position, s.views, s.likes, s.comments, s.shares, s.collection_id,
    (SELECT 1 FROM favorites f WHERE f.item_id = i.id) AS favorite
  FROM snapshots s JOIN items i ON i.id = s.item_id`;

function previousSnapshot(db, itemId, before) {
  return db.prepare(`SELECT * FROM snapshots WHERE item_id = ? AND collected_at < ? ORDER BY collected_at DESC LIMIT 1`)
    .get(itemId, before) ?? null;
}

function shape(db, row) {
  return {
    id: row.id,
    platform: row.platform,
    title: row.title,
    author: row.author,
    url: row.url,
    thumbnail: row.thumbnail,
    publishedAt: row.published_at,
    isDemo: !!row.is_demo,
    favorite: !!row.favorite,
    collectedAt: row.collected_at,
    sourcePosition: row.position,
    metrics: { views: row.views, likes: row.likes, comments: row.comments, shares: row.shares },
    growth: computeGrowth(row, previousSnapshot(db, row.id, row.collected_at)),
  };
}

export function sortItems(items, sort) {
  const key = sort === 'views' ? (i) => i.metrics.views : (i) => i.growth.viewsPerHour;
  // Métricas ausentes vão para o fim; desempate pelas visualizações.
  return [...items].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka == null && kb == null) return (b.metrics.views ?? -1) - (a.metrics.views ?? -1);
    if (ka == null) return 1;
    if (kb == null) return -1;
    return kb - ka;
  });
}

export function getTrends(db, { niche, platform, sort, isDemo }) {
  const cols = latestCollections(db, niche, isDemo);
  let items = [];
  for (const c of cols) {
    const rows = db.prepare(`${ITEM_SELECT} WHERE s.collection_id = ?`).all(c.id);
    items.push(...rows.map((r) => shape(db, r)));
  }
  const platforms = [...new Set(items.map((i) => i.platform))];
  if (platform && platform !== 'all') items = items.filter((i) => i.platform === platform);
  items = sortItems(items, sort).map((it, idx) => ({ ...it, rank: idx + 1 }));
  return {
    niche,
    items,
    sampleSize: items.length,
    platformsInSample: platforms,
    sources: cols.map((c) => ({ platform: c.platform, method: c.method, collectedAt: c.finished_at, itemCount: c.item_count })),
    lastUpdate: cols.reduce((a, c) => (!a || c.finished_at > a ? c.finished_at : a), null),
    lastAttempt: lastAttempt(db, niche, isDemo),
  };
}

export function getFavorites(db) {
  const rows = db.prepare(`
    SELECT i.*, s.collected_at, s.position, s.views, s.likes, s.comments, s.shares, s.collection_id, 1 AS favorite
    FROM favorites f JOIN items i ON i.id = f.item_id
    JOIN snapshots s ON s.item_id = i.id
      AND s.collected_at = (SELECT MAX(collected_at) FROM snapshots WHERE item_id = i.id)
    ORDER BY f.created_at DESC`).all();
  return rows.map((r) => shape(db, r));
}

export function setFavorite(db, itemId, on) {
  if (!db.prepare('SELECT 1 FROM items WHERE id = ?').get(itemId)) return false;
  if (on) db.prepare('INSERT OR IGNORE INTO favorites (item_id, created_at) VALUES (?, ?)').run(itemId, nowIso());
  else db.prepare('DELETE FROM favorites WHERE item_id = ?').run(itemId);
  return true;
}

export function getHistory(db, itemId) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item) return null;
  const snaps = db.prepare(`
    SELECT s.collected_at, s.position, s.views, s.likes, s.comments, s.shares, c.niche
    FROM snapshots s JOIN collections c ON c.id = s.collection_id
    WHERE s.item_id = ? ORDER BY s.collected_at`).all(itemId);
  return { item: { id: item.id, title: item.title, platform: item.platform, isDemo: !!item.is_demo }, snapshots: snaps };
}
