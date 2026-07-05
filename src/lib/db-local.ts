// =============================================================================
// QueueFlow — Local SQLite D1-Compatible Adapter
//
// Used when running locally (not on Cloudflare Workers).
// Provides the full D1 API surface via better-sqlite3.
// =============================================================================

import Database from 'better-sqlite3';
import path from 'path';
import type { D1Database, D1Result, D1PreparedStatement, D1Meta } from '@/lib/db';

// Singleton database instance
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.join(process.cwd(), 'db', 'queueflow.db');
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  return _db;
}

// LocalPreparedStatement — wraps better-sqlite3 with D1-compatible API
class LocalPreparedStatement {
  private stmt: Database.Statement;
  private params: unknown[] = [];

  constructor(db: Database.Database, sql: string) {
    this.stmt = db.prepare(sql);
  }

  bind(...params: unknown[]): LocalPreparedStatement {
    this.params = params;
    return this;
  }

  first<T = unknown>(): T | null {
    try {
      const row = this.stmt.get(...this.params) as T | undefined;
      return row ?? null;
    } catch (err) {
      console.error('[LocalDB] first() error:', err);
      throw err;
    }
  }

  all<T = unknown>(): D1Result<T> {
    try {
      const rows = this.stmt.all(...this.params) as T[];
      return { results: rows };
    } catch (err) {
      console.error('[LocalDB] all() error:', err);
      throw err;
    }
  }

  run(): D1Result<never> {
    try {
      const result = this.stmt.run(...this.params);
      const meta: D1Meta = {
        changes: result.changes,
        last_row_id: result.lastInsertRowid as number,
      };
      return { results: [], meta };
    } catch (err) {
      console.error('[LocalDB] run() error:', err);
      throw err;
    }
  }
}

// LocalD1Database — D1-compatible database backed by better-sqlite3
class LocalD1Database {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  prepare(sql: string): LocalPreparedStatement {
    return new LocalPreparedStatement(this.db, sql);
  }

  batch<T = unknown>(statements: LocalPreparedStatement[]): D1Result<T>[] {
    const results: D1Result<T>[] = [];
    const transaction = this.db.transaction(() => {
      for (const stmt of statements) {
        const internal = stmt as unknown as { stmt: Database.Statement; params: unknown[] };
        const sql = internal.stmt.source;
        const sqlUpper = sql.trimStart().toUpperCase();

        if (sqlUpper.startsWith('SELECT') || sqlUpper.startsWith('PRAGMA') || sqlUpper.startsWith('EXPLAIN')) {
          const rows = this.db.prepare(sql).all(...internal.params) as T[];
          results.push({ results: rows });
        } else {
          this.db.prepare(sql).run(...internal.params);
          results.push({ results: [] });
        }
      }
    });
    transaction();
    return results;
  }
}

export function getLocalD1(): D1Database {
  const db = getDb();
  return new LocalD1Database(db) as unknown as D1Database;
}