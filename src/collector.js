import { NICHES } from './niches.js';
import { LIVE_CONNECTORS, demo } from './connectors/index.js';
import { startCollection, saveCollection, failCollection, purgeOld } from './store.js';

export function isDemoMode(config) {
  return config.forceDemo || !LIVE_CONNECTORS.some((c) => c.status(config).state === 'active');
}

let running = null;

// Executa uma coleta para os nichos pedidos. Coletas simultâneas são unificadas.
export function collectAll(db, config, { niches = NICHES, fetchImpl, now } = {}) {
  if (running) return running;
  running = (async () => {
    const demoMode = isDemoMode(config);
    const connectors = demoMode ? [demo] : LIVE_CONNECTORS.filter((c) => c.status(config).state === 'active');
    const results = [];
    for (const niche of niches) {
      for (const conn of connectors) {
        const id = startCollection(db, { platform: conn.id, niche: niche.id, isDemo: demoMode, at: now });
        try {
          const out = await conn.collect(niche, { config, fetchImpl, now });
          if (!out) {
            failCollection(db, id, 'Nicho não configurado para esta fonte.');
            continue;
          }
          saveCollection(db, id, { ...out, isDemo: demoMode, defaultPlatform: conn.id, at: now });
          results.push({ niche: niche.id, platform: conn.id, ok: true, count: out.items.length });
        } catch (e) {
          failCollection(db, id, e.message);
          results.push({ niche: niche.id, platform: conn.id, ok: false, error: e.message });
        }
      }
    }
    purgeOld(db, config.retentionDays, now);
    return { demoMode, results };
  })().finally(() => { running = null; });
  return running;
}
