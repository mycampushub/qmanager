import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth';

const db = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  // Clean existing data (order matters for FKs)
  await db.auditLog.deleteMany();
  await db.pushSubscription.deleteMany();
  await db.transaction.deleteMany();
  await db.serviceLog.deleteMany();
  await db.usageLedger.deleteMany();
  await db.ticket.deleteMany();
  await db.queue.deleteMany();
  await db.staffUser.deleteMany();
  await db.tenant.deleteMany();
  await db.planLimit.deleteMany();
  await db.platformAdmin.deleteMany();
  await db.masterTenant.deleteMany();

  // Plan Limits
  await db.planLimit.createMany({
    data: [
      { planTier: 'FREE', maxQueues: 2, maxStaff: 3, maxTicketsPerDay: 50, priceMonthlyCents: 0 },
      { planTier: 'PRO', maxQueues: 10, maxStaff: 15, maxTicketsPerDay: 500, priceMonthlyCents: 50000 },
      { planTier: 'ENTERPRISE', maxQueues: 50, maxStaff: 100, maxTicketsPerDay: 5000, priceMonthlyCents: 200000 },
    ],
  });
  console.log('✅ Plan limits created');

  // 1. Platform Admin (bcrypt)
  const admin = await db.platformAdmin.create({
    data: {
      email: 'admin@yourqueueapp.com',
      name: 'System Admin',
      passwordHash: await hashPassword('admin123'),
    },
  });
  console.log('✅ Platform Admin created (bcrypt)');

  // 2. Master Tenant
  const masterTenant = await db.masterTenant.create({
    data: { corporateName: 'CityHealth Medical Group', billingStatus: 'ACTIVE' },
  });

  // 3. Standard Tenants
  const tenantsData = [
    {
      name: 'QuickBite Restaurant',
      planTier: 'PRO',
      walletBalance: 100000,
      brandingConfig: JSON.stringify({ primaryColor: '#059669', secondaryColor: '#34d399', logoText: 'QB', welcomeMessage: 'Welcome to QuickBite!' }),
      welcomeMessage: 'Welcome to QuickBite! Fresh food, fast service.',
    },
    {
      name: 'GreenBank Branch',
      planTier: 'PRO',
      walletBalance: 200000,
      brandingConfig: JSON.stringify({ primaryColor: '#0d9488', secondaryColor: '#5eead4', logoText: 'GB', welcomeMessage: 'Welcome to GreenBank.' }),
      welcomeMessage: 'Welcome to GreenBank Branch.',
    },
  ];

  const standardTenants: Awaited<ReturnType<typeof db.tenant.create>>[] = [];
  for (const t of tenantsData) {
    standardTenants.push(await db.tenant.create({ data: t }));
  }

  // 4. Sub-Tenants
  const subTenantsData = [
    {
      name: 'CityHealth - Downtown Clinic',
      masterTenantId: masterTenant.id,
      planTier: 'ENTERPRISE' as const,
      walletBalance: 500000,
      brandingConfig: JSON.stringify({ primaryColor: '#7c3aed', secondaryColor: '#a78bfa', logoText: 'CH', welcomeMessage: 'Welcome to CityHealth Downtown.' }),
      welcomeMessage: 'CityHealth Downtown - Serving your health needs.',
    },
    {
      name: 'CityHealth - Uptown Clinic',
      masterTenantId: masterTenant.id,
      planTier: 'ENTERPRISE' as const,
      walletBalance: 500000,
      brandingConfig: JSON.stringify({ primaryColor: '#7c3aed', secondaryColor: '#a78bfa', logoText: 'CH', welcomeMessage: 'Welcome to CityHealth Uptown.' }),
      welcomeMessage: 'CityHealth Uptown - Quality care, closer to you.',
    },
  ];

  const subTenants: Awaited<ReturnType<typeof db.tenant.create>>[] = [];
  for (const t of subTenantsData) {
    subTenants.push(await db.tenant.create({ data: t }));
  }

  const allTenants = [...standardTenants, ...subTenants];
  console.log(`✅ ${allTenants.length} Tenants created`);

  // 5. Staff Users (bcrypt)
  const staffUsers: { tenantId: string; manager: Awaited<ReturnType<typeof db.staffUser.create>>; agents: Awaited<ReturnType<typeof db.staffUser.create>>[] }[] = [];
  for (const tenant of allTenants) {
    const slug = tenant.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const manager = await db.staffUser.create({
      data: { tenantId: tenant.id, email: `manager@${slug}.com`, name: `${tenant.name.split(' ')[0]} Manager`, passwordHash: await hashPassword('manager123'), role: 'MANAGER' },
    });
    const agent1 = await db.staffUser.create({
      data: { tenantId: tenant.id, email: `agent1@${slug}.com`, name: 'Agent One', passwordHash: await hashPassword('agent123'), role: 'AGENT' },
    });
    const agent2 = await db.staffUser.create({
      data: { tenantId: tenant.id, email: `agent2@${slug}.com`, name: 'Agent Two', passwordHash: await hashPassword('agent123'), role: 'AGENT' },
    });
    staffUsers.push({ tenantId: tenant.id, manager, agents: [agent1, agent2] });
  }
  console.log(`✅ ${staffUsers.length * 3} Staff Users created (bcrypt)`);

  // 6. Queues
  const queueConfigs = [
    [{ name: 'General Queue', prefix: 'A', defaultServiceTimeSec: 300 }, { name: 'VIP Queue', prefix: 'V', defaultServiceTimeSec: 240 }],
    [{ name: 'Deposits', prefix: 'D', defaultServiceTimeSec: 300 }, { name: 'Withdrawals', prefix: 'W', defaultServiceTimeSec: 180 }, { name: 'Customer Service', prefix: 'C', defaultServiceTimeSec: 600 }],
    [{ name: 'General Consultation', prefix: 'G', defaultServiceTimeSec: 900 }, { name: 'Lab Tests', prefix: 'L', defaultServiceTimeSec: 300 }],
    [{ name: 'General Consultation', prefix: 'G', defaultServiceTimeSec: 900 }, { name: 'Lab Tests', prefix: 'L', defaultServiceTimeSec: 300 }, { name: 'Pharmacy', prefix: 'P', defaultServiceTimeSec: 180 }],
  ];

  const allQueues: { queue: Awaited<ReturnType<typeof db.queue.create>>; tenantId: string }[] = [];
  for (let i = 0; i < allTenants.length; i++) {
    for (const config of queueConfigs[i]) {
      const queue = await db.queue.create({
        data: { tenantId: allTenants[i].id, name: config.name, prefix: config.prefix, defaultServiceTimeSec: config.defaultServiceTimeSec, currentSerial: 5, nowServingSerial: 3 },
      });
      allQueues.push({ queue, tenantId: allTenants[i].id });
    }
  }
  console.log(`✅ ${allQueues.length} Queues created`);

  // 7. Sample tickets with service logs
  const names = ['Rahim Ahmed', 'Fatima Begum', 'Karim Hossain', 'Nasreen Akter', 'Tanvir Islam', 'Sadia Rahman', 'Mizanur Rahman', 'Ayesha Siddika', 'Jahangir Alam', 'Sharmin Sultana', 'Imran Khan', 'Nusrat Jahan'];
  let ticketCount = 0;

  for (const { queue, tenantId } of allQueues) {
    const staff = staffUsers.find(s => s.tenantId === tenantId);

    for (let i = 1; i <= queue.nowServingSerial; i++) {
      const ticket = await db.ticket.create({
        data: {
          tenantId, queueId: queue.id, serialNumber: i, status: 'COMPLETED',
          customerName: names[ticketCount % names.length],
          customerPhone: `+8801${Math.floor(100000000 + Math.random() * 900000000)}`,
          createdAt: new Date(Date.now() - (queue.nowServingSerial - i + 1) * 300000),
          servedAt: new Date(Date.now() - (queue.nowServingSerial - i) * 300000),
          completedAt: new Date(Date.now() - (queue.nowServingSerial - i) * 300000 + 240000),
          servedByAgent: staff?.agents[0]?.id,
        },
      });

      const duration = 180 + Math.floor(Math.random() * 120);
      await db.serviceLog.create({
        data: { tenantId, queueId: queue.id, ticketId: ticket.id, agentId: staff?.agents[0]?.id, durationSeconds: duration },
      });
      await db.usageLedger.create({ data: { tenantId, ticketId: ticket.id, costCents: 100 } });
      await db.transaction.create({
        data: { tenantId, type: 'TICKET_CHARGE', amountCents: -100, description: `Ticket ${queue.prefix}-${String(i).padStart(3, '0')}` },
      });
      ticketCount++;
    }

    // Waiting + serving tickets
    for (let i = queue.nowServingSerial + 1; i <= queue.currentSerial; i++) {
      const isServing = i === queue.nowServingSerial + 1;
      const ticket = await db.ticket.create({
        data: {
          tenantId, queueId: queue.id, serialNumber: i,
          status: isServing ? 'SERVING' : 'WAITING',
          customerName: names[ticketCount % names.length],
          customerPhone: `+8801${Math.floor(100000000 + Math.random() * 900000000)}`,
          createdAt: new Date(Date.now() - (queue.currentSerial - i) * 60000),
          servedAt: isServing ? new Date() : null,
          servedByAgent: isServing ? staff?.agents[0]?.id : null,
        },
      });
      await db.usageLedger.create({ data: { tenantId, ticketId: ticket.id, costCents: 100 } });
      await db.transaction.create({
        data: { tenantId, type: 'TICKET_CHARGE', amountCents: -100, description: `Ticket ${queue.prefix}-${String(i).padStart(3, '0')}` },
      });
      ticketCount++;
    }
  }

  // Seed wallet transactions for existing tenants
  for (const t of allTenants) {
    await db.transaction.create({
      data: { tenantId: t.id, type: 'TOP_UP', amountCents: t.walletBalance, description: 'Initial wallet balance' },
    });
  }

  console.log(`✅ ${ticketCount} Tickets created with logs & transactions`);
  console.log('\n🎉 Seeding complete!');
  console.log('\n📋 Demo Credentials:');
  console.log('  Platform Admin: admin@yourqueueapp.com / admin123');
  console.log('  Manager (QuickBite): manager@quickbiterestaurant.com / manager123');
  console.log('  Agent (QuickBite): agent1@quickbiterestaurant.com / agent123');
  console.log('  Manager (GreenBank): manager@greenbankbranch.com / manager123');
  console.log('  Manager (CityHealth): manager@cityhealthdowntownclinic.com / manager123');
}

seed().catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); }).finally(async () => { await db.$disconnect(); });