/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
    console.log('🌱 Seeding database...');

    // ── Step 0a: Create MASTER tenant (for super-admin users) ──────────
    const masterTenant = await prisma.tenant.upsert({
        where: { id: 'master-tenant' },
        update: {},
        create: {
            id: 'master-tenant',
            name: 'Platform Master',
            businessNiche: 'generic',
            activeModules: JSON.stringify([]),
        },
    });

    // ── Step 0b: Create SUPER ADMIN user (isSuperAdmin = true) ─────────
    const superAdminPassword = await bcrypt.hash('superadmin123', 12);
    await prisma.user.upsert({
        where: { email: 'superadmin@platform.local' },
        update: {},
        create: {
            name: 'Super Admin',
            email: 'superadmin@platform.local',
            password: superAdminPassword,
            role: 'ADMIN',
            isSuperAdmin: true,
            tenantId: masterTenant.id,
        },
    });
    console.log('✅ Super admin created: superadmin@platform.local / superadmin123');

    // ── Step 0c: Create default Tenant ─────────────────────────────────
    const tenant = await prisma.tenant.upsert({
        where: { id: 'default-tenant' },
        update: {},
        create: {
            id: 'default-tenant',
            name: 'Prefeitura Municipal',
            businessNiche: 'public_sector',
            activeModules: JSON.stringify([
                'ticketing', 'bot_flow', 'analytics', 'internal_chat',
                'nps', 'automations', 'hsm_templates', 'bulk_import',
            ]),
        },
    });
    console.log('✅ Default tenant created:', tenant.name);

    const tenantId = tenant.id;


    // ── Step 1: Create admin user ─────────────────────────────
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@whatsapp-saas.com' },
        update: {},
        create: {
            name: 'Administrador',
            email: 'admin@whatsapp-saas.com',
            password: adminPassword,
            role: 'ADMIN',
            tenantId,
        },
    });
    console.log('✅ Admin user created:', admin.email);

    // ── Step 2: Create agent users ────────────────────────────
    const agentPassword = await bcrypt.hash('agent123', 12);
    const agent1 = await prisma.user.upsert({
        where: { email: 'atendente1@whatsapp-saas.com' },
        update: {},
        create: {
            name: 'Atendente 1',
            email: 'atendente1@whatsapp-saas.com',
            password: agentPassword,
            role: 'AGENT',
            tenantId,
        },
    });

    const agent2 = await prisma.user.upsert({
        where: { email: 'atendente2@whatsapp-saas.com' },
        update: {},
        create: {
            name: 'Atendente 2',
            email: 'atendente2@whatsapp-saas.com',
            password: agentPassword,
            role: 'AGENT',
            tenantId,
        },
    });
    console.log('✅ Agent users created');

    // ── Step 3: Create departments ────────────────────────────
    // Use findFirst + create instead of upsert since unique is now compound
    async function upsertDepartment(name: string) {
        const existing = await prisma.department.findFirst({
            where: { tenantId, name },
        });
        if (existing) return existing;
        return prisma.department.create({
            data: { name, tenantId },
        });
    }

    const suporte = await upsertDepartment('Suporte');
    const vendas = await upsertDepartment('Vendas');
    const financeiro = await upsertDepartment('Financeiro');
    console.log('✅ Departments created');

    // ── Step 4: Link users to departments ─────────────────────
    const links = [
        { userId: admin.id, departmentId: suporte.id },
        { userId: admin.id, departmentId: vendas.id },
        { userId: admin.id, departmentId: financeiro.id },
        { userId: agent1.id, departmentId: suporte.id },
        { userId: agent1.id, departmentId: vendas.id },
        { userId: agent2.id, departmentId: suporte.id },
        { userId: agent2.id, departmentId: financeiro.id },
    ];

    for (const link of links) {
        const existing = await prisma.userDepartment.findUnique({
            where: { userId_departmentId: { userId: link.userId, departmentId: link.departmentId } },
        });
        if (!existing) {
            await prisma.userDepartment.create({ data: link });
        }
    }
    console.log('✅ User-Department links created');

    // ── Step 5: Create default AccountSettings ────────────────
    const existingSettings = await prisma.accountSettings.findFirst({
        where: { tenantId },
    });
    if (!existingSettings) {
        await prisma.accountSettings.create({
            data: { tenantId },
        });
    }
    console.log('✅ Account settings created');

    // ── Step 6: Create a sample bot flow ──────────────────────
    const sampleFlow = await prisma.botFlow.upsert({
        where: { id: 'sample-flow-1' },
        update: {},
        create: {
            id: 'sample-flow-1',
            name: 'Fluxo Principal',
            isActive: true,
            tenantId,
            nodes: JSON.stringify([
                {
                    id: 'node-1',
                    type: 'botStep',
                    position: { x: 250, y: 50 },
                    data: {
                        label: 'Boas-vindas',
                        isStart: true,
                        message: 'Olá! 👋 Bem-vindo ao nosso atendimento. Como posso ajudá-lo?\n\n1️⃣ Suporte Técnico\n2️⃣ Vendas\n3️⃣ Financeiro',
                        conditions: [
                            { id: 'c1', matchType: 'specific', values: '1, suporte, um', action: 'department', targetId: suporte.id },
                            { id: 'c2', matchType: 'specific', values: '2, vendas, dois', action: 'department', targetId: vendas.id },
                            { id: 'c3', matchType: 'specific', values: '3, financeiro, tres, três', action: 'department', targetId: financeiro.id },
                        ],
                    },
                },
            ]),
            edges: JSON.stringify([]),
            globalConfig: JSON.stringify({
                greetingMessage: 'Em instantes um de nossos atendentes irá lhe ajudar. 😊',
                invalidResponseMessage: 'Desculpe, não entendi. Por favor, digite 1, 2 ou 3.',
                maxRetries: 3,
                maxRetriesAction: 'route',
                maxRetriesTargetType: 'department',
                maxRetriesTargetId: suporte.id,
                autoDistribute: 'BALANCE',
                timeoutMinutes: 5,
                timeoutAction: 'close',
            }),
        },
    });
    console.log('✅ Sample bot flow created:', sampleFlow.name);

    console.log('\n🎉 Seed completed!');
    console.log('');
    console.log('🔑 SUPER ADMIN (platform-wide):');
    console.log('   📧 superadmin@platform.local / superadmin123');
    console.log('');
    console.log('🏢 Tenant:', tenant.name, `(${tenant.id})`);
    console.log('   📧 Admin:  admin@whatsapp-saas.com / admin123');
    console.log('   📧 Agent:  atendente1@whatsapp-saas.com / agent123');
}

seed()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
