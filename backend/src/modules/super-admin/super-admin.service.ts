import { prisma } from '../../server';
import bcrypt from 'bcryptjs';
import { StorageService } from '../../lib/storage.service';
import { sendWelcomeEmail } from '../../lib/mailer';

export class SuperAdminService {
    // ─── Tenant CRUD ──────────────────────────────────────────────────

    /** List all tenants with user/ticket counts */
    static async listTenants() {
        const tenants = await prisma.tenant.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { users: true, tickets: true, connections: true },
                },
            },
        });
        return tenants;
    }

    /** Get a single tenant */
    static async getTenant(id: string) {
        return prisma.tenant.findUnique({
            where: { id },
            include: {
                _count: { select: { users: true, tickets: true, connections: true } },
            },
        });
    }

    /**
     * Provision a new tenant from scratch:
     * 1. Creates the Tenant row
     * 2. Creates default AccountSettings
     * 3. Creates first ADMIN user and sends welcome email
     */
    static async provisionTenant(data: {
        name: string;
        domain?: string;
        businessNiche?: string;
        activeModules?: string[];
        logoUrl?: string;
        adminName: string;
        adminEmail: string;
        adminPassword?: string;
    }) {
        // Step 1: Create tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: data.name,
                domain: data.domain || null,
                businessNiche: data.businessNiche || 'generic',
                activeModules: JSON.stringify(data.activeModules || [
                    'ticketing', 'bot_flow', 'analytics', 'internal_chat',
                    'nps', 'automations', 'hsm_templates', 'bulk_import',
                ]),
                logoUrl: data.logoUrl || null,
            },
        });

        // Step 2: Create default AccountSettings
        await prisma.accountSettings.create({
            data: { tenantId: tenant.id },
        });

        // Step 3: Create first admin user
        const rawPassword = data.adminPassword || this._generatePassword();
        const hashedPassword = await bcrypt.hash(rawPassword, 12);

        const adminUser = await prisma.user.create({
            data: {
                name: data.adminName,
                email: data.adminEmail,
                password: hashedPassword,
                role: 'ADMIN',
                tenantId: tenant.id,
            },
        });

        // Step 4: Send welcome email (non-blocking)
        sendWelcomeEmail(data.adminEmail, data.adminName, rawPassword, true).catch(err => {
            console.error(`[SuperAdmin] Failed to send welcome email to ${data.adminEmail}:`, err);
        });

        console.log(`[SuperAdmin] ✅ Provisioned tenant "${tenant.name}" (${tenant.id}) with admin ${data.adminEmail}`);

        return { tenant, adminUser, adminEmail: data.adminEmail, temporaryPassword: rawPassword };
    }

    /** Create / provision a new tenant (legacy — without auto admin) */
    static async createTenant(data: {
        name: string;
        domain?: string;
        businessNiche?: string;
        activeModules?: string[];
        logoUrl?: string;
    }) {
        const tenant = await prisma.tenant.create({
            data: {
                name: data.name,
                domain: data.domain || null,
                businessNiche: data.businessNiche || 'generic',
                activeModules: JSON.stringify(data.activeModules || [
                    'ticketing', 'bot_flow', 'analytics', 'internal_chat',
                    'nps', 'automations', 'hsm_templates', 'bulk_import',
                ]),
                logoUrl: data.logoUrl || null,
            },
        });
        // Always create AccountSettings
        await prisma.accountSettings.create({ data: { tenantId: tenant.id } });
        return tenant;
    }

    /** Update tenant config */
    static async updateTenant(id: string, data: {
        name?: string;
        domain?: string;
        businessNiche?: string;
        activeModules?: string[];
        logoUrl?: string;
        isActive?: boolean;
    }) {
        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.domain !== undefined) updateData.domain = data.domain || null;
        if (data.businessNiche !== undefined) updateData.businessNiche = data.businessNiche;
        if (data.activeModules !== undefined) updateData.activeModules = JSON.stringify(data.activeModules);
        if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;

        return prisma.tenant.update({ where: { id }, data: updateData });
    }

    /** Soft-delete: deactivate tenant (users can no longer log in) */
    static async deactivateTenant(id: string) {
        return prisma.tenant.update({
            where: { id },
            data: { isActive: false },
        });
    }

    /**
     * Hard-delete a tenant: removes ALL database records and file storage.
     * This is irreversible. Use with extreme caution.
     * Order: tickets/messages → contacts → users → connections → settings → botflows → tenant
     */
    static async hardDeleteTenant(id: string) {
        const tenant = await prisma.tenant.findUnique({ where: { id } });
        if (!tenant) throw new Error('Tenant não encontrado');

        console.log(`[SuperAdmin] ⚠️  Hard-deleting tenant "${tenant.name}" (${id})...`);

        // 1. Delete messages (via tickets cascade — but do explicitly for safety)
        const tickets = await prisma.ticket.findMany({ where: { tenantId: id }, select: { id: true } });
        if (tickets.length > 0) {
            await prisma.message.deleteMany({
                where: { ticketId: { in: tickets.map(t => t.id) } },
            });
        }

        // 2. Delete tickets + related (cascade on tags, kanban)
        await prisma.ticket.deleteMany({ where: { tenantId: id } });

        // 3. Delete contacts
        await prisma.contact.deleteMany({ where: { tenantId: id } });

        // 4. Delete users + departments
        await prisma.userDepartment.deleteMany({
            where: { user: { tenantId: id } },
        });
        await prisma.user.deleteMany({ where: { tenantId: id } });
        await prisma.department.deleteMany({ where: { tenantId: id } });

        // 5. Delete connections, bot flows, settings, templates, etc.
        await prisma.whatsAppConnection.deleteMany({ where: { tenantId: id } });
        await prisma.botFlow.deleteMany({ where: { tenantId: id } });
        await prisma.accountSettings.deleteMany({ where: { tenantId: id } });
        await prisma.hsmTemplate.deleteMany({ where: { tenantId: id } });
        await prisma.quickReply.deleteMany({ where: { tenantId: id } });
        await prisma.tag.deleteMany({ where: { tenantId: id } });
        await prisma.kanbanBoard.deleteMany({ where: { tenantId: id } });
        await prisma.webWidget.deleteMany({ where: { tenantId: id } });
        await prisma.internalRoom.deleteMany({ where: { tenantId: id } });
        await prisma.npsRating.deleteMany({ where: { tenantId: id } });
        await prisma.auditLog.deleteMany({ where: { tenantId: id } });

        // 6. Delete the tenant row itself
        await prisma.tenant.delete({ where: { id } });

        // 7. Purge all tenant files from disk
        await StorageService.deleteTenantStorage(id);

        console.log(`[SuperAdmin] ✅ Hard-delete complete for tenant "${tenant.name}"`);
        return { deleted: true, tenantName: tenant.name };
    }

    // ─── Global Metrics ───────────────────────────────────────────────

    /**
     * Aggregate platform-wide metrics for the Super Admin dashboard.
     */
    static async getGlobalMetrics() {
        const [
            totalTenants,
            activeTenants,
            totalUsers,
            totalTickets,
            openTickets,
            totalMessages,
            totalConnections,
        ] = await Promise.all([
            prisma.tenant.count(),
            prisma.tenant.count({ where: { isActive: true } }),
            prisma.user.count(),
            prisma.ticket.count(),
            prisma.ticket.count({ where: { status: { in: ['OPEN', 'QUEUE', 'BOT'] } } }),
            prisma.message.count(),
            prisma.whatsAppConnection.count(),
        ]);

        // Per-tenant breakdown
        const perTenant = await prisma.tenant.findMany({
            select: {
                id: true,
                name: true,
                isActive: true,
                createdAt: true,
                _count: {
                    select: { users: true, tickets: true, connections: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Storage usage per tenant
        const storageUsage: Record<string, number> = {};
        for (const t of perTenant) {
            storageUsage[t.id] = await StorageService.getTenantStorageBytes(t.id);
        }

        return {
            summary: {
                totalTenants,
                activeTenants,
                inactiveTenants: totalTenants - activeTenants,
                totalUsers,
                totalTickets,
                openTickets,
                totalMessages,
                totalConnections,
            },
            perTenant: perTenant.map(t => ({
                id: t.id,
                name: t.name,
                isActive: t.isActive,
                createdAt: t.createdAt,
                users: t._count.users,
                tickets: t._count.tickets,
                connections: t._count.connections,
                storageMB: +(storageUsage[t.id] / 1024 / 1024).toFixed(2),
            })),
        };
    }

    /** Get tenant config for the current session */
    static async getCurrentTenantConfig(tenantId?: string) {
        const where = tenantId ? { id: tenantId } : { isActive: true };
        const tenant = await prisma.tenant.findFirst({ where });
        if (!tenant) {
            return {
                businessNiche: 'generic',
                activeModules: ['ticketing', 'bot_flow', 'analytics', 'internal_chat', 'nps', 'automations', 'hsm_templates', 'bulk_import'],
            };
        }
        return {
            businessNiche: tenant.businessNiche,
            activeModules: JSON.parse(tenant.activeModules || '[]'),
            logoUrl: tenant.logoUrl,
            name: tenant.name,
        };
    }

    // ─── Helpers ──────────────────────────────────────────────────────

    private static _generatePassword(length = 12): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
        const { randomBytes } = require('crypto');
        const bytes = randomBytes(length);
        return Array.from(bytes as Uint8Array, (b: number) => chars[b % chars.length]).join('');
    }
}
