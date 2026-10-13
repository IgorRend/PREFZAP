import { prisma, globalPrisma, tenantStorage } from './db';
import { createTenantPrisma } from './prisma-tenant';
import { whatsappClient } from './whatsapp';
import { SettingsService } from '../modules/settings/settings.service';

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_HOURS = 24;
const PROMPT_WINDOW_MIN = 22 * 60 + 50; // 22h50m in minutes
const PROMPT_WINDOW_MAX = 23 * 60 + 10; // 23h10m in minutes

/**
 * Auto-renewal cron: checks open tickets approaching 23h since last contact
 * message and sends a reminder if autoRenewWindowPrompt is enabled.
 */
async function checkWindowRenewals() {
    try {
        const activeTenants = await globalPrisma.tenant.findMany({ where: { isActive: true } });
        for (const tenant of activeTenants) {
            const tenantPrisma = createTenantPrisma(tenant.id);
            await tenantStorage.run({ tenantId: tenant.id, prisma: tenantPrisma }, async () => {
                const settings = await SettingsService.get(tenant.id);

                if (!settings.autoRenewWindowPrompt) {
                    return; // Feature disabled
                }

                // Find open tickets with lastContactMessageAt between 22h50m and 23h10m ago
                const now = new Date();
                const minAgo = new Date(now.getTime() - PROMPT_WINDOW_MAX * 60 * 1000);
                const maxAgo = new Date(now.getTime() - PROMPT_WINDOW_MIN * 60 * 1000);

                const tickets = await prisma.ticket.findMany({
                    where: {
                        status: { in: ['OPEN', 'QUEUE', 'BOT'] },
                        lastContactMessageAt: {
                            gte: minAgo,
                            lte: maxAgo,
                        },
                    },
                    include: { contact: true },
                });

                for (const ticket of tickets) {
                    try {
                        const promptMessage =
                            '⏰ Olá! Sua janela de atendimento está prestes a expirar. ' +
                            'Responda esta mensagem para que possamos continuar te atendendo.';

                        await whatsappClient.sendTextMessage(ticket.contact.phone, promptMessage);

                        // Create system message for audit
                        await prisma.message.create({
                            data: {
                                ticketId: ticket.id,
                                body: '🔄 Lembrete automático de renovação de janela enviado.',
                                origin: 'SYSTEM',
                            },
                        });

                        console.log(`[WindowCron] Renewal prompt sent for ticket ${ticket.protocol}`);
                    } catch (error) {
                        console.error(`[WindowCron] Failed to send prompt for ticket ${ticket.id}:`, error);
                    }
                }
            });
        }
    } catch (error) {
        console.error('[WindowCron] Error checking window renewals:', error);
    }
}

let cronInterval: ReturnType<typeof setInterval> | null = null;

export function startWindowRenewalCron() {
    if (cronInterval) return;
    console.log('[WindowCron] Starting window renewal check (every 15 min)');
    cronInterval = setInterval(checkWindowRenewals, CHECK_INTERVAL_MS);
    // Run once immediately
    checkWindowRenewals();
}

export function stopWindowRenewalCron() {
    if (cronInterval) {
        clearInterval(cronInterval);
        cronInterval = null;
        console.log('[WindowCron] Window renewal cron stopped');
    }
}
