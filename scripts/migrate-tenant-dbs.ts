import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'
import { setTemplateDbPath, registerTenantDatabase, getTenantDb, getPlatformDb } from '../src/lib/tenant-db'

const ROOT = path.resolve(__dirname, '..')

async function main() {
  const sourceDbPath = path.join(ROOT, 'db', 'custom.db')
  if (!fs.existsSync(sourceDbPath)) {
    console.log('[Migrate] No source database found at db/custom.db. Nothing to migrate.')
    return
  }

  console.log(`[Migrate] Reading source database: ${sourceDbPath}`)

  const templatePath = path.join(ROOT, 'db', 'template.db')
  if (!fs.existsSync(templatePath)) {
    console.error('[Migrate] Template database not found at db/template.db.')
    console.error('[Migrate] Run `bun scripts/setup-dbs.ts` first.')
    process.exit(1)
  }

  setTemplateDbPath(templatePath)

  const source = new PrismaClient({
    datasources: { db: { url: `file:${sourceDbPath}` } },
  })

  try {
    // 1. Read platform-level data from source
    console.log('[Migrate] Reading PlatformAdmin records...')
    const platformAdmins = await source.platformAdmin.findMany()
    console.log(`  Found ${platformAdmins.length} platform admin(s)`)

    console.log('[Migrate] Reading MasterTenant records...')
    const masterTenants = await source.masterTenant.findMany()
    console.log(`  Found ${masterTenants.length} master tenant(s)`)

    console.log('[Migrate] Reading PlanLimit records...')
    const planLimits = await source.planLimit.findMany()
    console.log(`  Found ${planLimits.length} plan limit(s)`)

    console.log('[Migrate] Reading Tenant records...')
    const tenants = await source.tenant.findMany()
    console.log(`  Found ${tenants.length} tenant(s)`)

    console.log('[Migrate] Reading StaffUser records...')
    const staffUsers = await source.staffUser.findMany()
    console.log(`  Found ${staffUsers.length} staff user(s)`)

    // 2. Write platform data to main database
    console.log('[Migrate] Writing to main database...')
    const platformDb = getPlatformDb()

    for (const admin of platformAdmins) {
      await platformDb.platformAdmin.upsert({
        where: { id: admin.id },
        update: admin,
        create: admin,
      })
    }
    console.log(`  ${platformAdmins.length} platform admin(s) written`)

    for (const mt of masterTenants) {
      await platformDb.masterTenant.upsert({
        where: { id: mt.id },
        update: mt,
        create: mt,
      })
    }
    console.log(`  ${masterTenants.length} master tenant(s) written`)

    for (const pl of planLimits) {
      await platformDb.planLimit.upsert({
        where: { id: pl.id },
        update: pl,
        create: pl,
      })
    }
    console.log(`  ${planLimits.length} plan limit(s) written`)

    for (const t of tenants) {
      await platformDb.tenant.upsert({
        where: { id: t.id },
        update: t,
        create: t,
      })
    }
    console.log(`  ${tenants.length} tenant(s) written`)

    for (const su of staffUsers) {
      await platformDb.staffUser.upsert({
        where: { id: su.id },
        update: su,
        create: su,
      })
    }
    console.log(`  ${staffUsers.length} staff user(s) written`)

    // 3. For each tenant, create their database and copy their data
    for (const tenant of tenants) {
      console.log(`[Migrate] Creating database for tenant: ${tenant.id} (${tenant.name})`)
      await registerTenantDatabase(tenant.id)
      const tenantDb = getTenantDb(tenant.id)

      // Tenant record
      await tenantDb.tenant.upsert({
        where: { id: tenant.id },
        update: tenant,
        create: tenant,
      })

      // Staff users for this tenant
      const tenantStaff = staffUsers.filter((s) => s.tenantId === tenant.id)
      for (const staff of tenantStaff) {
        await tenantDb.staffUser.upsert({
          where: { id: staff.id },
          update: staff,
          create: staff,
        })
      }
      console.log(`  ${tenantStaff.length} staff user(s)`)

      // Queues
      const queues = await source.queue.findMany({ where: { tenantId: tenant.id } })
      for (const q of queues) {
        await tenantDb.queue.upsert({ where: { id: q.id }, update: q, create: q })
      }
      console.log(`  ${queues.length} queue(s)`)

      // Tickets
      const tickets = await source.ticket.findMany({ where: { tenantId: tenant.id } })
      for (const t of tickets) {
        await tenantDb.ticket.upsert({ where: { id: t.id }, update: t, create: t })
      }
      console.log(`  ${tickets.length} ticket(s)`)

      // Service Logs
      const serviceLogs = await source.serviceLog.findMany({ where: { tenantId: tenant.id } })
      for (const sl of serviceLogs) {
        await tenantDb.serviceLog.upsert({ where: { id: sl.id }, update: sl, create: sl })
      }
      console.log(`  ${serviceLogs.length} service log(s)`)

      // Usage Ledgers
      const usageLedgers = await source.usageLedger.findMany({ where: { tenantId: tenant.id } })
      for (const ul of usageLedgers) {
        await tenantDb.usageLedger.upsert({ where: { id: ul.id }, update: ul, create: ul })
      }
      console.log(`  ${usageLedgers.length} usage ledger(s)`)

      // Transactions
      const transactions = await source.transaction.findMany({ where: { tenantId: tenant.id } })
      for (const tx of transactions) {
        await tenantDb.transaction.upsert({ where: { id: tx.id }, update: tx, create: tx })
      }
      console.log(`  ${transactions.length} transaction(s)`)

      // Service Windows
      const serviceWindows = await source.serviceWindow.findMany({ where: { tenantId: tenant.id } })
      for (const sw of serviceWindows) {
        await tenantDb.serviceWindow.upsert({ where: { id: sw.id }, update: sw, create: sw })
      }
      console.log(`  ${serviceWindows.length} service window(s)`)

      // Feedbacks
      const feedbacks = await source.feedback.findMany({ where: { tenantId: tenant.id } })
      for (const fb of feedbacks) {
        await tenantDb.feedback.upsert({ where: { id: fb.id }, update: fb, create: fb })
      }
      console.log(`  ${feedbacks.length} feedback(s)`)

      // Appointments
      const appointments = await source.appointment.findMany({ where: { tenantId: tenant.id } })
      for (const apt of appointments) {
        await tenantDb.appointment.upsert({ where: { id: apt.id }, update: apt, create: apt })
      }
      console.log(`  ${appointments.length} appointment(s)`)

      // Webhooks
      const webhooks = await source.webhook.findMany({ where: { tenantId: tenant.id } })
      for (const wh of webhooks) {
        await tenantDb.webhook.upsert({ where: { id: wh.id }, update: wh, create: wh })
      }
      console.log(`  ${webhooks.length} webhook(s)`)

      // Customer Profiles
      const customerProfiles = await source.customerProfile.findMany({ where: { tenantId: tenant.id } })
      for (const cp of customerProfiles) {
        await tenantDb.customerProfile.upsert({ where: { id: cp.id }, update: cp, create: cp })
      }
      console.log(`  ${customerProfiles.length} customer profile(s)`)

      // Push Subscriptions
      const pushSubscriptions = await source.pushSubscription.findMany({ where: { tenantId: tenant.id } })
      for (const ps of pushSubscriptions) {
        await tenantDb.pushSubscription.upsert({ where: { id: ps.id }, update: ps, create: ps })
      }
      console.log(`  ${pushSubscriptions.length} push subscription(s)`)
    }

    // 4. Audit logs (all go to main database)
    console.log('[Migrate] Reading AuditLog records...')
    const auditLogs = await source.auditLog.findMany()
    for (const al of auditLogs) {
      await platformDb.auditLog.upsert({ where: { id: al.id }, update: al, create: al })
    }
    console.log(`  ${auditLogs.length} audit log(s) written`)

    console.log('')
    console.log('[Migrate] Migration complete!')
    Console.log(`  - ${platformAdmins.length} platform admins`)
    Console.log(`  - ${masterTenants.length} master tenants`)
    Console.log(`  - ${tenants.length} tenants migrated to per-tenant databases`)
  } finally {
    await source.$disconnect()
  }
}

main().catch((err) => {
  console.error('[Migrate] FAILED:', err)
  process.exit(1)
})
