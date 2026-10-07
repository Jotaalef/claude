import http from 'node:http';
import { config } from './src/config.js';
import { openDb } from './src/db.js';
import { createApp } from './src/app.js';
import { collectAll } from './src/collector.js';

const db = openDb(config.dbPath);
const app = createApp(db, config);

const server = http.createServer(app);
server.listen(config.port, async () => {
  console.log(`Radar de Trends em http://localhost:${config.port}`);
  const first = await collectAll(db, config);
  console.log(first.demoMode ? 'Modo DEMONSTRATIVO (DEMO=1 ou sem YOUTUBE_API_KEY).' : 'Modo real: YouTube Data API.');
  for (const r of first.results) console.log(` - ${r.niche}/${r.platform}: ${r.ok ? r.count + ' itens' : 'ERRO ' + r.error}`);
  if (config.collectIntervalMinutes > 0) {
    setInterval(() => collectAll(db, config).catch((e) => console.error(e)), config.collectIntervalMinutes * 60e3);
  }
});
