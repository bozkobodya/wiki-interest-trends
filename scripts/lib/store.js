// Local SQLite cache (built-in node:sqlite, no native deps).
//
// * daily page-view counts per (project, article, agent) plus the date ranges already fetched,
//   so follow-up questions with a longer or shifted period download only the missing days;
// * small JSON responses (title resolution, redirects, search) with a TTL.
// Past page-view counts never change, so they are cached forever.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { addDays } from './dates.js';

export const DEFAULT_PATH = join(process.env.WIKITREND_CACHE || join(homedir(), '.cache', 'wikitrend'), 'cache.sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS daily (
  project TEXT, article TEXT, agent TEXT, day TEXT, views INTEGER,
  PRIMARY KEY (project, article, agent, day)
);
CREATE TABLE IF NOT EXISTS coverage (project TEXT, article TEXT, agent TEXT, start TEXT, end TEXT);
CREATE INDEX IF NOT EXISTS coverage_key ON coverage (project, article, agent);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT, created REAL);
`;

export class Store {
  constructor(path = DEFAULT_PATH) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    // several agents/processes may share the cache
    this.db.exec('PRAGMA busy_timeout = 15000; PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  // ---- key/value JSON -------------------------------------------------------
  kvGet(key, ttlDays = 30) {
    const row = this.db.prepare('SELECT value, created FROM kv WHERE key=?').get(key);
    if (!row || Date.now() / 1000 - row.created > ttlDays * 86400) return null;
    return JSON.parse(row.value);
  }

  kvPut(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?,?)').run(key, JSON.stringify(value), Date.now() / 1000);
  }

  // ---- daily series ------------------------------------------------------------
  /** Sub-ranges [start, end] (ISO dates, inclusive) not fetched yet. */
  missingRanges(project, article, agent, start, end) {
    const rows = this.db
      .prepare('SELECT start, end FROM coverage WHERE project=? AND article=? AND agent=? ORDER BY start')
      .all(project, article, agent);
    const gaps = [];
    let cursor = start;
    for (const { start: s, end: e } of rows) {
      if (e < cursor) continue;
      if (s > end) break;
      if (s > cursor) gaps.push([cursor, addDays(s, -1) < end ? addDays(s, -1) : end]);
      const next = addDays(e, 1);
      if (next > cursor) cursor = next;
      if (cursor > end) break;
    }
    if (cursor <= end) gaps.push([cursor, end]);
    return gaps;
  }

  saveDaily(project, article, agent, start, end, values) {
    const ins = this.db.prepare('INSERT OR REPLACE INTO daily VALUES (?,?,?,?,?)');
    this.db.exec('BEGIN');
    try {
      for (const [d, v] of Object.entries(values)) ins.run(project, article, agent, d, v);
      this.db.prepare('INSERT INTO coverage VALUES (?,?,?,?,?)').run(project, article, agent, start, end);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  loadDaily(project, article, agent, start, end) {
    const rows = this.db
      .prepare('SELECT day, views FROM daily WHERE project=? AND article=? AND agent=? AND day BETWEEN ? AND ?')
      .all(project, article, agent, start, end);
    return Object.fromEntries(rows.map((r) => [r.day, r.views]));
  }

  stats() {
    const q = (sql) => Object.values(this.db.prepare(sql).get())[0];
    return {
      path: this.path,
      size_mb: +(statSync(this.path).size / 1e6).toFixed(2),
      series: q("SELECT COUNT(DISTINCT project||'|'||article||'|'||agent) FROM daily"),
      daily_rows: q('SELECT COUNT(*) FROM daily'),
      kv_entries: q('SELECT COUNT(*) FROM kv'),
    };
  }

  clear() {
    this.db.exec('DELETE FROM daily; DELETE FROM coverage; DELETE FROM kv; VACUUM;');
  }
}
