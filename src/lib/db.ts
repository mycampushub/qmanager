/// <reference types="bun-types" />
// =============================================================================
// QueueFlow — Local SQLite Database Client (D1-compatible API)
//
// Replaces Cloudflare D1 with bun:sqlite for local development.
// Exposes the same async API: .prepare().bind().first() / .all() / .run() / .batch()
// =============================================================================

import { Database, type Statement as BunStatement } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'db', 'queueflow.db');

// Ensure db directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Singleton connection
let _db: Database | null = null;

function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');
    _db.exec('PRAGMA busy_timeout = 5000');
  }
  return _db!;
}

// ─── D1-compatible types ─────────────────────────────────────────────────────

export interface D1ResultMeta {
  changes: number;
  last_row_id: number;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
}

// Track SQL + params for batch support
interface BatchEntry {
  sql: string;
  params: unknown[];
}

// ─── Bound Statement (result of .prepare().bind()) ───────────────────────────

class BoundStatement {
  private stmt: BunStatement;
  private sql: string;
  private params: unknown[];
  // Expose for batch
  _sql: string;
  _params: unknown[];

  constructor(stmt: BunStatement, sql: string, params: unknown[]) {
    this.stmt = stmt;
    this.sql = sql;
    this.params = params;
    this._sql = sql;
    this._params = params;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    try {
      const row = this.stmt.get(...(this.params as any[])) as T | undefined;
      return (row !== undefined) ? row : null;
    } catch (err) {
      console.error(`[D1-Local] first() error:\n  SQL: ${this.sql}\n  Params:`, this.params, '\n  Error:', err);
      throw err;
    }
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    try {
      const rows = this.stmt.all(...(this.params as any[])) as T[];
      return { results: rows };
    } catch (err) {
      console.error(`[D1-Local] all() error:\n  SQL: ${this.sql}\n  Params:`, this.params, '\n  Error:', err);
      throw err;
    }
  }

  async run(): Promise<{ meta: D1ResultMeta }> {
    try {
      const result = this.stmt.run(...(this.params as any[]));
      return {
        meta: {
          changes: result.changes,
          last_row_id: Number(result.lastInsertRowid),
        },
      };
    } catch (err) {
      console.error(`[D1-Local] run() error:\n  SQL: ${this.sql}\n  Params:`, this.params, '\n  Error:', err);
      throw err;
    }
  }

  async raw<T = unknown[]>(): Promise<D1Result<T>> {
    try {
      // bun:sqlite doesn't have raw(), simulate with all()
      const rows = this.stmt.all(...(this.params as any[])) as T[];
      return { results: rows };
    } catch (err) {
      console.error(`[D1-Local] raw() error:\n  SQL: ${this.sql}\n  Error:`, err);
      throw err;
    }
  }
}

// ─── Prepared Statement (result of .prepare()) ───────────────────────────────

class PreparedStatement {
  private db: Database;
  private sql: string;

  constructor(db: Database, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...params: unknown[]): BoundStatement {
    const stmt = this.db.prepare(this.sql);
    return new BoundStatement(stmt, this.sql, params);
  }

  /** Convenience: call .all() without explicit .bind() (no params) */
  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.bind().all<T>();
  }

  /** Convenience: call .first() without explicit .bind() (no params) */
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return this.bind().first<T>();
  }

  /** Convenience: call .run() without explicit .bind() (no params) */
  async run(): Promise<{ meta: D1ResultMeta }> {
    return this.bind().run();
  }
}

// ─── Export BoundStatement for use in batch type annotations ────────────────
export type { BoundStatement };

// ─── D1-compatible Database wrapper ──────────────────────────────────────────

export interface D1Database {
  prepare<T = Record<string, unknown>>(sql: string): PreparedStatement;
  batch(statements: BoundStatement[]): Promise<D1Result[]>;
  dump(): Promise<ArrayBuffer>;
}

class D1LocalDatabase implements D1Database {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  prepare<T = Record<string, unknown>>(sql: string): PreparedStatement {
    return new PreparedStatement(this.db, sql);
  }

  async batch(statements: BoundStatement[]): Promise<D1Result[]> {
    const db = this.db;
    const entries: BatchEntry[] = statements.map(s => ({
      sql: s._sql,
      params: s._params,
    }));

    return db.transaction(() => {
      return entries.map(entry => {
        const rows = db.prepare(entry.sql).all(...(entry.params as any[]));
        return { results: rows as Record<string, unknown>[] };
      });
    })();
  }

  async dump(): Promise<ArrayBuffer> {
    // Not really needed for local dev, return empty
    return new ArrayBuffer(0);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getD1FromEnv(): Promise<D1Database> {
  return new D1LocalDatabase(getDb());
}

/** Direct access to the raw bun:sqlite database (for schema init, etc.) */
export function getRawDb(): Database {
  return getDb();
}