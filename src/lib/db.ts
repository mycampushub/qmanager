// =============================================================================
// QueueFlow — Database Client (Local SQLite, D1-compatible API)
//
// Provides a Cloudflare D1-compatible API backed by better-sqlite3 for
// local development. All methods match the D1 interface so that API routes
// can be written once and work both locally and on Cloudflare Workers.
//
// Usage in API routes:
//   import { getD1FromEnv } from '@/lib/db';
//   const d1 = await getD1FromEnv();
//   const row = await d1.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
// =============================================================================

import Database from 'better-sqlite3';
import path from 'path';

// Re-export D1-compatible types
export type D1Database = D1DatabaseImpl;
export type BoundStatement = D1PreparedStatement;
export type D1Result<T = unknown> = { results: T[] };

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

// D1PreparedStatement — wraps better-sqlite3 prepared statement with .bind() chaining
class D1PreparedStatement {
  private stmt: Database.Statement;
  private params: unknown[] = [];

  constructor(db: Database.Database, sql: string) {
    this.stmt = db.prepare(sql);
  }

  bind(...params: unknown[]): D1PreparedStatement {
    this.params = params;
    return this;
  }

  first<T = unknown>(): T | null {
    try {
      const row = this.stmt.get(...this.params) as T | undefined;
      return row ?? null;
    } catch (err) {
      console.error('[D1Adapter] first() error:', err);
      throw err;
    }
  }

  all<T = unknown>(): { results: T[] } {
    try {
      const rows = this.stmt.all(...this.params) as T[];
      return { results: rows };
    } catch (err) {
      console.error('[D1Adapter] all() error:', err);
      throw err;
    }
  }

  run(): { meta: { changes: number; last_row_id: number } } {
    try {
      const result = this.stmt.run(...this.params);
      return {
        meta: {
          changes: result.changes,
          last_row_id: result.lastInsertRowid as number,
        },
      };
    } catch (err) {
      console.error('[D1Adapter] run() error:', err);
      throw err;
    }
  }
}

// D1Database — the main database interface
class D1DatabaseImpl {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  prepare(sql: string): D1PreparedStatement {
    return new D1PreparedStatement(this.db, sql);
  }

  batch(statements: D1PreparedStatement[]): void {
    const transaction = this.db.transaction(() => {
      for (const stmt of statements) {
        // Each statement is already bound, we need to execute it
        // Access the internal stmt and params
        const prepared = stmt as unknown as { stmt: Database.Statement; params: unknown[] };
        const sql = prepared.stmt.source;
        this.db.prepare(sql).run(...prepared.params);
      }
    });
    transaction();
  }
}

// Public API — returns a D1-compatible database instance
export async function getD1FromEnv(): Promise<D1Database> {
  const db = getDb();
  return new D1DatabaseImpl(db);
}