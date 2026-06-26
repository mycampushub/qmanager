import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

let _templateDbPath: string | null = null

export function setTemplateDbPath(p: string) {
  _templateDbPath = p
}

function getOrCreateDbDir(sub: string): string {
  const dir = path.join(process.cwd(), 'db', sub)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getPlatformDbPath(): string {
  return path.join(getOrCreateDbDir('main'), 'queueflow.db')
}

function getTenantDbPath(tenantId: string): string {
  return path.join(getOrCreateDbDir('tenants'), `${tenantId}.db`)
}

function databaseExists(dbPath: string): boolean {
  return fs.existsSync(dbPath)
}

function copyTemplateTo(targetPath: string) {
  if (!_templateDbPath) {
    throw new Error(
      '[TenantDB] Template database path not set. Call setTemplateDbPath() first or run scripts/setup-dbs.ts'
    )
  }
  if (!fs.existsSync(_templateDbPath)) {
    throw new Error(
      `[TenantDB] Template database not found at ${_templateDbPath}. Run scripts/setup-dbs.ts first.`
    )
  }
  const dir = path.dirname(targetPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.copyFileSync(_templateDbPath, targetPath)
}

const PRISMA_LOG: { log: { emit: 'event'; level: 'query' }[] } | { log: { emit: 'stdout'; level: 'error' }[] } =
  process.env.NODE_ENV === 'development'
    ? { log: [{ emit: 'event', level: 'query' }] as const }
    : { log: [{ emit: 'stdout', level: 'error' }] as const }

function createClient(dbPath: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
    ...PRISMA_LOG,
  })
}

let _platformClient: PrismaClient | null = null

function getOrCreatePlatformClient(): PrismaClient {
  if (!_platformClient) {
    const dbPath = getPlatformDbPath()
    _platformClient = createClient(dbPath)
  }
  return _platformClient
}

const _tenantClientCache = new Map<string, PrismaClient>()

export async function registerTenantDatabase(
  tenantId: string,
  tenantData?: { name: string; planTier: string; walletBalance: number }
) {
  const dbPath = getTenantDbPath(tenantId)
  if (databaseExists(dbPath)) return
  copyTemplateTo(dbPath)
  if (tenantData) {
    const client = getTenantDb(tenantId)
    await client.tenant.create({
      data: {
        id: tenantId,
        name: tenantData.name,
        planTier: tenantData.planTier,
        walletBalance: tenantData.walletBalance,
      },
    })
  }
}

export function getPlatformDb(): PrismaClient {
  return getOrCreatePlatformClient()
}

export function getTenantDb(tenantId: string): PrismaClient {
  const dbPath = getTenantDbPath(tenantId)
  if (!databaseExists(dbPath)) {
    registerTenantDatabase(tenantId)
  }
  let client = _tenantClientCache.get(tenantId)
  if (!client) {
    client = createClient(dbPath)
    _tenantClientCache.set(tenantId, client)
  }
  return client
}

export function closeAll(): Promise<unknown> {
  const promises: Promise<void>[] = []
  if (_platformClient) {
    promises.push(_platformClient.$disconnect())
  }
  for (const client of _tenantClientCache.values()) {
    promises.push(client.$disconnect())
  }
  _tenantClientCache.clear()
  _platformClient = null
  return Promise.all(promises)
}
