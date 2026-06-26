import { getPlatformDb, getTenantDb } from './tenant-db'

export interface TenantAggregates {
  totalTickets: number
  totalTicketsToday: number
  completedToday: number
  totalRevenue: number
  totalQueues: number
}

export async function aggregateAcrossTenants(): Promise<TenantAggregates> {
  const platformDb = getPlatformDb()
  const tenants = await platformDb.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  let totalTickets = 0
  let totalTicketsToday = 0
  let completedToday = 0
  let totalRevenue = 0
  let totalQueues = 0

  for (const tenant of tenants) {
    try {
      const tdb = getTenantDb(tenant.id)
      const [tickets, ticketsToday, completed, revenue, queues] = await Promise.all([
        tdb.ticket.count(),
        tdb.ticket.count({ where: { createdAt: { gte: todayStart } } }),
        tdb.ticket.count({ where: { createdAt: { gte: todayStart }, status: 'COMPLETED' } }),
        tdb.usageLedger.aggregate({ _sum: { costCents: true } }),
        tdb.queue.count({ where: { isActive: true } }),
      ])
      totalTickets += tickets
      totalTicketsToday += ticketsToday
      completedToday += completed
      totalRevenue += revenue._sum.costCents || 0
      totalQueues += queues
    } catch {
      // skip tenant DB if inaccessible
    }
  }

  return { totalTickets, totalTicketsToday, completedToday, totalRevenue, totalQueues }
}
