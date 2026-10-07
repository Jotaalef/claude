import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  youtubeApiKey: env.YOUTUBE_API_KEY || '',
  regionCode: env.REGION_CODE || 'BR',
  collectIntervalMinutes: Number(env.COLLECT_INTERVAL_MINUTES ?? 60),
  forceDemo: env.DEMO === '1' || env.DEMO === 'true',
  dbPath: env.DB_PATH || path.join(ROOT, 'data', 'radar.db'),
  // Política do YouTube: estatísticas não autorizadas não podem ficar guardadas por mais de 30 dias.
  retentionDays: 30,
};
