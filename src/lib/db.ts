// =============================================================================
// QueueFlow — Cloudflare D1 Database Client
//
// Uses the Cloudflare D1 binding via @opennextjs/cloudflare's getCloudflareContext().
// Exposes the standard D1 async API: .prepare().bind().first() / .all() / .run() / .batch()
// =============================================================================

import { getCloudflareContext } from '@opennextjs/cloudflare';

// ─── D1-compatible types (mirrors Cloudflare D1 API surface we use) ──────────

export interface D1ResultMeta {
  changes: number;
  last_row_id: number;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta?: D1ResultMeta;
}

/** Result of .prepare().bind() — has the actual query execution methods. */
export interface D1PreparedStatement {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<{ meta: D1ResultMeta }>;
  raw<T = unknown[]>(): Promise<D1Result<T>>;
}

/** Result of .prepare() — has .bind() method. Also has convenience methods. */
export interface D1PreparedQuery {
  bind(...params: unknown[]): D1PreparedStatement;
  /** Convenience: .all() without explicit .bind() */
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  /** Convenience: .first() without explicit .bind() */
  first<T = Record<string, unknown>>(): Promise<T | null>;
  /** Convenience: .run() without explicit .bind() */
  run(): Promise<{ meta: D1ResultMeta }>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedQuery;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  dump(): Promise<ArrayBuffer>;
}

// ─── R2 types (minimal surface we use) ───────────────────────────────────────

export interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | ReadableStream, options?: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface R2Object {
  body: ReadableStream;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

// ─── KV types ────────────────────────────────────────────────────────────────

export interface KVNamespace {
  get<T = unknown>(key: string, type?: string): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the D1 database from the current Cloudflare request context.
 * Must be called within a request handler (API route, server component, etc.)
 */
export async function getD1FromEnv(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB as unknown as D1Database;
}

/**
 * Get the R2 storage bucket from the current Cloudflare request context.
 */
export async function getR2FromEnv(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.STORAGE as unknown as R2Bucket;
}

/**
 * Get the KV namespace from the current Cloudflare request context.
 */
export async function getKVFromEnv(): Promise<KVNamespace> {
  const { env } = await getCloudflareContext({ async: true });
  return env.RATE_LIMIT_KV as unknown as KVNamespace;
}