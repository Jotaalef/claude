import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,            -- "<plataforma>:<id externo>"
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT,
  author TEXT,
  url TEXT,
  thumbnail TEXT,
  published_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  niche TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,           -- running | ok | error
  method TEXT,                    -- descrição da amostra coletada
  item_count INTEGER,
  message TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS snapshots (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  collected_at TEXT NOT NULL,
  position INTEGER NOT NULL,      -- posição retornada pela fonte
  views INTEGER,                  -- NULL = métrica não disponível (nunca 0 por ausência)
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  PRIMARY KEY (collection_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_snap_item ON snapshots(item_id, collected_at);
CREATE TABLE IF NOT EXISTS favorites (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
