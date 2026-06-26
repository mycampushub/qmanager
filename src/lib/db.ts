import { PrismaClient } from '@prisma/client'
import { getPlatformDb, getTenantDb } from './tenant-db'
import { AsyncLocalStorage } from 'async_hooks'

export const tenantStorage = new AsyncLocalStorage<string | null>()

export function withTenantCtx<T>(tenantId: string | null, fn: () => T): T {
  return tenantStorage.run(tenantId, fn)
}

function resolveClient(): PrismaClient {
  const tenantId = tenantStorage.getStore()
  if (tenantId) {
    return getTenantDb(tenantId)
  }
  return getPlatformDb()
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop: keyof PrismaClient) {
    return resolveClient()[prop]
  },
})
