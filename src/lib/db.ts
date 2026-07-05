// =============================================================================
// QueueFlow — Database Client (Dual-mode: Cloudflare D1 + Local SQLite)
//
// Defines a simplified D1-compatible interface that the codebase uses.
// Runtime detection picks Cloudflare D1 or local better-sqlite3.
// =============================================================================

// ─── Simplified D1-compatible types (what the codebase actually uses) ──────

export interface D1Meta {
  changes: number;
  last_row_id: number;
  [key: string]: unknown;
}

export interface D1Result<T = unknown> {
  results: T[];
  meta?: D1Meta;
}

export type BoundStatement = D1PreparedStatement;

export interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement;
  first<T = unknown>(): T | null;
  all<T = unknown>(): D1Result<T>;
  run(): D1Result<never> & { meta: D1Meta };
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

// ─── Environment detection ────────────────────────────────────────────────

let _useLocalDb: boolean | undefined;

function isLocalDev(): boolean {
  if (_useLocalDb !== undefined) return _useLocalDb;
  try {
    require.resolve('better-sqlite3');
    _useLocalDb = true;
  } catch {
    _useLocalDb = false;
  }
  return _useLocalDb;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function getD1FromEnv(): Promise<D1Database> {
  if (isLocalDev()) {
    const { getLocalD1 } = await import('./db-local');
    return getLocalD1();
  }
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const { env } = await getCloudflareContext({ async: true });
  // env.DB is the real Cloudflare D1Database — satisfies our interface
  return env.DB as unknown as D1Database;
}