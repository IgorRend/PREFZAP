import { prisma, globalPrisma, tenantStorage } from './db';
import { createTenantPrisma } from './prisma-tenant';
import { emitToTenant } from './socket';
import { SettingsService } from '../modules/settings/settings.service';
import { AuditService } from '../modules/audit/audit.service';

const AUTO_CLOSE_INTERVAL_MS = 5 * 60 * 1000;    // 5 minutes
const NPS_EXPIRATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const SLA_CHECK_INTERVAL_MS = 60 * 1000;           // 1 minute

// ─── Auto-Close Inactive Tickets ─────────────────────────
/**
 * FIXED: Eliminated N+1 by fetching tickets with their last message in a
 * single JOIN query using Prisma's include + orderBy + take.
 */
async function autoCloseInactiveTickets() {
    try {
        const activeTenants = await globalPrisma.tenant.findMany({ where: { isActive: true } });
        for (const tenant of activeTenants) {
            const tenantPrisma = createTenantPrisma(tenant.id);
            await tenantStorage.run({ tenantId: tenant.id, prisma: tenantPrisma }, async () => {
                const settings = await SettingsService.get(tenant.id);
                if (!settings.autoCloseMinutes || settings.autoCloseMinutes <= 0) return;

                const cutoff = new Date(Date.now() - settings.autoCloseMinutes * 60 * 1000);

                // Single query: get OPEN tickets with their last message included
                const tickets = await prisma.ticket.findMany({
                    where: {
                        status: 'OPEN',
                        updatedAt: { lt: cutoff },
                    },
                    include: {
                        messages: {
                            orderBy: { createdAt: 'desc' },
                            take: 1, // Only last message — no N+1
                        },
                    },
                });

                const toClose = tickets.filter(t => {
                    const lastMsg = t.messages[0];
                    return !lastMsg || new Date(lastMsg.createdAt).getTime() < cutoff.getTime();
                });

                if (toClose.length === 0) return;

                const ids = toClose.map(t => t.id);

                // Single batch update — no per-ticket loop
                await prisma.ticket.updateMany({
                    where: { id: { in: ids } },
                    data: { status: 'CLOSED', closedAt: new Date() },
                });

                // Batch-insert system messages
                await prisma.message.createMany({
                    data: ids.map(ticketId => ({
                        ticketId,
                        body: '⏰ Atendimento encerrado automaticamente por inatividade.',
                        origin: 'SYSTEM',
                    })),
                });

                // Emit scoped to tenant room
                for (const ticket of toClose) {
                    emitToTenant(ticket.tenantId, 'ticket:updated', { ...ticket, messages: undefined, status: 'CLOSED', closedAt: new Date() });
                    console.log(`[AutoClose] Ticket ${ticket.protocol} closed after ${settings.autoCloseMinutes}min inactivity`);
                }
            });
        }
    } catch (error) {
        console.error('[AutoClose] Error:', error);
        AuditService.log({ action: 'AUTO_CLOSE_ERROR', entity: 'System', newValue: { error: String(error) } });
    }
}

// ─── Expire NPS Pending Tickets ──────────────────────────
async function expireNpsPending() {
    try {
        const activeTenants = await globalPrisma.tenant.findMany({ where: { isActive: true } });
        for (const tenant of activeTenants) {
            const tenantPrisma = createTenantPrisma(tenant.id);
            await tenantStorage.run({ tenantId: tenant.id, prisma: tenantPrisma }, async () => {
                const settings = await SettingsService.get(tenant.id);
                const hours = settings.npsExpirationHours || 24;
                const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

                const tickets = await prisma.ticket.findMany({
                    where: { status: 'PENDING_NPS', updatedAt: { lt: cutoff } },
                    select: { id: true, protocol: true, tenantId: true },
                });

                if (tickets.length === 0) return;
                const ids = tickets.map(t => t.id);

                await prisma.ticket.updateMany({
                    where: { id: { in: ids } },
                    data: { status: 'CLOSED', closedAt: new Date() },
                });

                await prisma.message.createMany({
                    data: ids.map(ticketId => ({
                        ticketId,
                        body: '⏰ Pesquisa NPS expirada. Atendimento encerrado.',
                        origin: 'SYSTEM',
                    })),
                });

                for (const ticket of tickets) {
                    emitToTenant(ticket.tenantId, 'ticket:updated', { id: ticket.id, status: 'CLOSED', closedAt: new Date() });
                    console.log(`[NpsExpiry] Ticket ${ticket.protocol} closed – NPS expired after ${hours}h`);
                }
            });
        }
    } catch (error) {
        console.error('[NpsExpiry] Error:', error);
    }
}

// ─── SLA Breach Check ─────────────────────────────────────
async function checkSlaBreaches() {
    try {
        const activeTenants = await globalPrisma.tenant.findMany({ where: { isActive: true } });
        for (const tenant of activeTenants) {
            const tenantPrisma = createTenantPrisma(tenant.id);
            await tenantStorage.run({ tenantId: tenant.id, prisma: tenantPrisma }, async () => {
                const settings = await SettingsService.get(tenant.id);
                if (!settings.slaAlertMinutes || settings.slaAlertMinutes <= 0) return;

                const cutoff = new Date(Date.now() - settings.slaAlertMinutes * 60 * 1000);

                const tickets = await prisma.ticket.findMany({
                    where: { status: 'QUEUE', createdAt: { lt: cutoff } },
                    select: { id: true, protocol: true, createdAt: true, tenantId: true },
                });

                if (tickets.length > 0) {
                    // Group by tenant for scoped emission
                    const byTenant = new Map<string, string[]>();
                    for (const t of tickets) {
                        const arr = byTenant.get(t.tenantId) || [];
                        arr.push(t.id);
                        byTenant.set(t.tenantId, arr);
                    }
                    for (const [tid, ids] of byTenant) {
                        emitToTenant(tid, 'ticket:sla-breach', ids);
                    }
                }
            });
        }
    } catch (error) {
        console.error('[SLA] Error:', error);
    }
}

// ─── Cron Lifecycle ───────────────────────────────────────

let autoCloseTimer: ReturnType<typeof setInterval> | null = null;
let npsExpiryTimer: ReturnType<typeof setInterval> | null = null;
let slaTimer: ReturnType<typeof setInterval> | null = null;

export function startAutomationsCron() {
    console.log('[Automations] Starting crons (auto-close: 5min, NPS expiry: 15min, SLA: 1min)');

    autoCloseTimer = setInterval(autoCloseInactiveTickets, AUTO_CLOSE_INTERVAL_MS);
    npsExpiryTimer = setInterval(expireNpsPending, NPS_EXPIRATION_INTERVAL_MS);
    slaTimer = setInterval(checkSlaBreaches, SLA_CHECK_INTERVAL_MS);

    // Run once immediately on startup
    autoCloseInactiveTickets();
    expireNpsPending();
    checkSlaBreaches();
}

export function stopAutomationsCron() {
    if (autoCloseTimer) { clearInterval(autoCloseTimer); autoCloseTimer = null; }
    if (npsExpiryTimer) { clearInterval(npsExpiryTimer); npsExpiryTimer = null; }
    if (slaTimer) { clearInterval(slaTimer); slaTimer = null; }
    console.log('[Automations] Crons stopped');
}
